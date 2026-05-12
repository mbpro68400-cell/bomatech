/**
 * Queries pour la table `suppliers` (1.9 — Veille fournisseurs).
 *
 * Convention V1 :
 *  - Toutes les fonctions acceptent un `client?: SupabaseClient` optionnel
 *    en dernier argument. Default = browser client user-side (RLS). Le cron
 *    P6 passe explicitement `getAdminClient()` (service_role, bypass RLS).
 *  - Pas de silent .data ?? [] : toute erreur Supabase est rethrow avec
 *    contexte (le caller décide de catcher ou pas).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserClient } from "../supabase";
import type {
  Dirigeant,
  PappersSnapshot,
  Supplier,
  SupplierStatus,
} from "../engines/types";

function client(c?: SupabaseClient): SupabaseClient {
  return c ?? (getBrowserClient() as unknown as SupabaseClient);
}

export async function listSuppliers(
  companyId: string,
  c?: SupabaseClient,
): Promise<Supplier[]> {
  const { data, error } = await client(c)
    .from("suppliers")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw new Error(`listSuppliers failed: ${error.message}`);
  return (data ?? []) as Supplier[];
}

export async function getSupplier(
  id: string,
  c?: SupabaseClient,
): Promise<Supplier | null> {
  const { data, error } = await client(c)
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSupplier failed: ${error.message}`);
  return data as Supplier | null;
}

export interface CreateSupplierInput {
  company_id: string;
  name: string;
  siren: string;
  legal_form?: string | null;
  naf_code?: string | null;
  registration_date?: string | null;
  status?: SupplierStatus;
  dirigeants?: Dirigeant[];
  last_pappers_snapshot?: PappersSnapshot | null;
  last_polled_at?: string | null;
  notes?: string | null;
  created_by_user_id?: string | null;
}

export async function createSupplier(
  input: CreateSupplierInput,
  c?: SupabaseClient,
): Promise<Supplier> {
  const { data, error } = await client(c)
    .from("suppliers")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(`createSupplier failed: ${error.message}`);
  return data as Supplier;
}

/**
 * Persiste le résultat d'un poll Pappers : snapshot + timestamp en un UPDATE.
 *
 * Fusion volontaire de updateSnapshot + updateLastPolled : le cron P6 fait
 * toujours les deux ensemble dans la même transaction. Si V1.5 doit tracer
 * un poll échoué sans snapshot (Pappers 404/500), ajouter un
 * markPollAttempt(supplierId, polledAt) à ce moment-là.
 */
export async function recordPollResult(
  supplierId: string,
  snapshot: PappersSnapshot,
  polledAt: string,
  c?: SupabaseClient,
): Promise<void> {
  const { error } = await client(c)
    .from("suppliers")
    .update({
      last_pappers_snapshot: snapshot,
      last_polled_at: polledAt,
    })
    .eq("id", supplierId);
  if (error) throw new Error(`recordPollResult failed: ${error.message}`);
}

export async function deleteSupplier(
  id: string,
  c?: SupabaseClient,
): Promise<void> {
  const { error } = await client(c).from("suppliers").delete().eq("id", id);
  if (error) throw new Error(`deleteSupplier failed: ${error.message}`);
}

/**
 * Liste les emails à notifier pour un digest critical d'alertes fournisseurs.
 * Owner + admin uniquement (cf décision Q3 : accountants/viewers exclus de
 * l'email — ils gardent la visibilité in-app via la page /suppliers).
 *
 * Appelée par le cron P6 avec `getAdminClient()` pour bypass RLS. Côté user
 * (admin UI), fonctionne aussi mais limité aux companies dont l'user est
 * membre via la RLS de `company_members` et `profiles`.
 *
 * Implémenté en 2 round-trips (members puis profiles) plutôt qu'un JOIN
 * embedded Supabase, pour éviter les surprises sur les noms de relationship.
 */
export async function getNotifiableMemberEmails(
  companyId: string,
  c?: SupabaseClient,
): Promise<string[]> {
  const cli = client(c);

  const { data: members, error: e1 } = await cli
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .in("role", ["owner", "admin"]);
  if (e1) throw new Error(`getNotifiableMemberEmails (members): ${e1.message}`);

  const userIds = ((members ?? []) as Array<{ user_id: string }>).map(
    (m) => m.user_id,
  );
  if (userIds.length === 0) return [];

  const { data: profiles, error: e2 } = await cli
    .from("profiles")
    .select("email")
    .in("id", userIds);
  if (e2) throw new Error(`getNotifiableMemberEmails (profiles): ${e2.message}`);

  const emails = ((profiles ?? []) as Array<{ email: string | null }>)
    .map((p) => p.email)
    .filter((e): e is string => !!e);
  return Array.from(new Set(emails));
}
