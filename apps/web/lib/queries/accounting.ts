/**
 * Queries pour les périodes comptables (Phase 1.7).
 *
 * Source DB : table `companies` (champs current_period_start, last_closing_date),
 * table `accounting_closures` (historique), RPC `close_period` (clôture atomique).
 *
 * V1 SCOPE NOTICE
 * ----------------
 * - Action de clôture irréversible en V1 (pas de réopen).
 * - L'auth de close_period est vérifiée DANS la fonction PG (owner/admin only),
 *   pas côté UI. Le bouton UI peut être visible pour tous mais l'appel RPC échouera
 *   pour les autres rôles avec 'Forbidden: only owner or admin can close a period'.
 *
 * CACHE INVALIDATION (lire avant de toucher closePeriod)
 * -------------------------------------------------------
 * Bomatech n'a pas de pg_notify ni de mécanisme de cache invalidation transversal
 * en V1. Après un close_period réussi, le cached `financial_states` côté DB
 * devient obsolète (les écritures viennent de basculer en is_closed_period=true,
 * elles ne participent plus aux calculs). On invalide EXPLICITEMENT en
 * supprimant les rows financial_states de la company → le prochain dashboard
 * load fera un recomputeFull from scratch sur les nouvelles données filtrées.
 * Le caller (UI) peut aussi forcer un router.refresh() ou window.location.reload()
 * pour rafraîchir le state React local.
 */

import { getBrowserClient } from "../supabase";
import type { AccountingClosure, Company } from "../engines/types";

export interface CompanyPeriod {
  current_period_start: string | null;
  last_closing_date: string | null;
}

export async function getCompanyPeriod(companyId: string): Promise<CompanyPeriod | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("companies")
    .select("current_period_start, last_closing_date")
    .eq("id", companyId)
    .single();
  if (error || !data) {
    console.error("Failed to load company period:", error?.message);
    return null;
  }
  return data as CompanyPeriod;
}

export async function getCompany(companyId: string): Promise<Company | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, current_period_start, last_closing_date")
    .eq("id", companyId)
    .single();
  if (error || !data) return null;
  return data as Company;
}

export async function listClosures(companyId: string): Promise<AccountingClosure[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("accounting_closures")
    .select("*")
    .eq("company_id", companyId)
    .order("period_end", { ascending: false });
  if (error || !data) {
    console.error("Failed to load closures:", error?.message);
    return [];
  }
  return data as AccountingClosure[];
}

export interface CloseResult {
  ok: boolean;
  closure: AccountingClosure | null;
  error: string | null;
}

/**
 * Atomically close an accounting period and invalidate the cached state.
 *
 * Flow:
 *   1. Call RPC close_period (auth check + insert closure + flag tx + flag invoices
 *      + update company state, all in one PG transaction).
 *   2. Invalidate the cached `financial_states` for the company so the next
 *      dashboard load recomputes from scratch. (Mag's explicit requirement —
 *      pas de pg_notify dans Bomatech V1, on invalide à la main.)
 *
 * The caller (UI) should additionally trigger a UI refresh (router.refresh
 * or window.location.reload) to re-fetch invoices/transactions which now
 * have updated is_closed_period flags.
 */
export async function closePeriod(
  companyId: string,
  periodEnd: string, // ISO YYYY-MM-DD
  notes?: string,
  periodStart?: string, // ISO YYYY-MM-DD — required for first closure (when company.current_period_start is NULL)
): Promise<CloseResult> {
  const supabase = getBrowserClient();

  // Step 1 — atomic RPC call (transactional in PL/pgSQL).
  // p_period_start is optional : the RPC v2 (migration 0005) resolves to
  // company.current_period_start if not supplied. For the first closure
  // (current_period_start === null), the caller MUST pass periodStart.
  const rpcArgs: Record<string, string | null> = {
    p_company_id: companyId,
    p_period_end: periodEnd,
    p_notes: notes ?? null,
  };
  if (periodStart) {
    rpcArgs.p_period_start = periodStart;
  }
  const { data, error } = await supabase.rpc("close_period", rpcArgs);
  if (error) {
    return { ok: false, closure: null, error: error.message };
  }

  // Step 2 — explicit cache invalidation (no pg_notify in Bomatech V1).
  // The cached financial_states for this company is now stale (the post-close
  // calc must exclude the just-flagged archived rows). Delete it so the next
  // dashboard load triggers a fresh recomputeFull.
  const { error: invErr } = await supabase
    .from("financial_states")
    .delete()
    .eq("company_id", companyId);
  if (invErr) {
    // Non-fatal : la clôture a réussi, juste le cache n'a pas été nettoyé.
    // Le dashboard recompute() de toute façon à chaque load.
    console.warn("Closure succeeded but financial_states cache invalidation failed:", invErr.message);
  }

  return { ok: true, closure: data as AccountingClosure, error: null };
}
