"use server";

/**
 * Server actions pour la page /suppliers/new (1.9 — P5b).
 *
 * 3 actions exposées au client :
 *   - searchPappersByName(query) — résultats nom (limit 10)
 *   - getPappersBySiren(siren)   — fiche complète d'une entreprise
 *   - addSupplier(raw)            — insert + premier snapshot + revalidate
 *
 * La clé Pappers reste server-only (server actions exécutent côté Node,
 * pas de leak browser). Erreurs Pappers mappées en codes typés que
 * le client peut afficher localisé.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "@/lib/supabase";
import {
  assertPappersBudget,
  createPappersClient,
  mapPappersToSnapshot,
} from "@/lib/external/pappers";
import {
  createSupplier,
  getSupplierBySiren,
  recordPollResult,
} from "@/lib/queries/suppliers";
import type {
  PappersEntrepriseRaw,
  PappersRechercheResultRaw,
} from "@/lib/external/pappers.types";

export type PappersErrorCode =
  | "not_found"
  | "quota_exceeded"
  | "server_error"
  | "invalid"
  | "unknown";

export type SearchByNameResult =
  | { ok: true; results: PappersRechercheResultRaw[] }
  | { ok: false; code: PappersErrorCode };

export type GetBySirenResult =
  | { ok: true; raw: PappersEntrepriseRaw }
  | { ok: false; code: PappersErrorCode };

export type AddSupplierResult =
  | { ok: true; id: string }
  | { ok: false; code: "duplicate"; existingId: string }
  | { ok: false; code: "unauthorized" | "unknown"; message?: string };

function mapPappersError(err: unknown): PappersErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("quota exceeded")) return "quota_exceeded";
  if (/Pappers 404/.test(msg)) return "not_found";
  if (/Pappers 4\d{2}/.test(msg)) return "invalid";
  if (/Pappers 5\d{2}/.test(msg)) return "server_error";
  return "unknown";
}

async function getCurrentCompanyIdServer(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return (data as { company_id: string } | null)?.company_id ?? null;
}

export async function searchPappersByName(
  query: string,
): Promise<SearchByNameResult> {
  try {
    await assertPappersBudget();
    const client = createPappersClient();
    const res = await client.searchByName(query, { limit: 10 });
    return { ok: true, results: res.resultats ?? [] };
  } catch (err) {
    return { ok: false, code: mapPappersError(err) };
  }
}

export async function getPappersBySiren(
  siren: string,
): Promise<GetBySirenResult> {
  try {
    await assertPappersBudget();
    const client = createPappersClient();
    const raw = await client.getBySiren(siren);
    return { ok: true, raw };
  } catch (err) {
    return { ok: false, code: mapPappersError(err) };
  }
}

export async function addSupplier(
  raw: PappersEntrepriseRaw,
): Promise<AddSupplierResult> {
  const supabase = (await getServerClient()) as unknown as SupabaseClient;
  const companyId = await getCurrentCompanyIdServer(supabase);
  if (!companyId) return { ok: false, code: "unauthorized" };

  const snapshot = mapPappersToSnapshot(raw);

  try {
    const supplier = await createSupplier(
      {
        company_id: companyId,
        name: snapshot.name,
        siren: snapshot.siren,
        legal_form: snapshot.legal_form,
        naf_code: snapshot.naf_code,
        registration_date: snapshot.registration_date,
        status: snapshot.status,
        dirigeants: snapshot.dirigeants,
      },
      supabase,
    );

    // Persiste le 1er snapshot complet + last_polled_at = now() en 1 UPDATE
    // (pattern P2b recordPollResult). Le diff au prochain poll utilisera
    // ce snapshot comme baseline → cf. supplier-diff test #1 (null→initial,
    // 0 alerte). Aucune alerte n'est générée à l'ajout, c'est attendu.
    await recordPollResult(
      supplier.id,
      snapshot,
      new Date().toISOString(),
      supabase,
    );

    revalidatePath("/suppliers");
    return { ok: true, id: supplier.id };
  } catch (err) {
    // PG unique_violation = 23505 sur (company_id, siren) → duplicate.
    const errCode = (err as { code?: string }).code;
    const errMsg = (err as Error).message ?? "";
    if (errCode === "23505" || errMsg.includes("23505")) {
      const existing = await getSupplierBySiren(
        companyId,
        snapshot.siren,
        supabase,
      ).catch(() => null);
      if (existing) {
        return { ok: false, code: "duplicate", existingId: existing.id };
      }
      // Cas improbable : conflit détecté mais row introuvable (RLS ou race).
      return {
        ok: false,
        code: "unknown",
        message: "Conflit détecté mais ressource introuvable",
      };
    }
    return { ok: false, code: "unknown", message: errMsg };
  }
}
