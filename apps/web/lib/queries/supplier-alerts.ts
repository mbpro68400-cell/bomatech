/**
 * Queries pour la table `supplier_alerts` (1.9 — Veille fournisseurs).
 *
 * En V1, l'INSERT n'a pas de policy RLS user-side : seul le cron P6 via
 * `getAdminClient()` (service_role) peut INSERT. SELECT/UPDATE/DELETE
 * suivent le pattern company-scoped par rôle (cf migration 0007).
 *
 * Convention V1 : `client?: SupabaseClient` optionnel en dernier argument,
 * erreurs rethrow avec contexte (pas de silent .data ?? []).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserClient } from "../supabase";
import type {
  SupplierAlert,
  SupplierAlertEventType,
  SupplierAlertSeverity,
} from "../engines/types";

function client(c?: SupabaseClient): SupabaseClient {
  return c ?? (getBrowserClient() as unknown as SupabaseClient);
}

export interface ListAlertsOpts {
  onlyUndismissed?: boolean;
  onlyCritical?: boolean;
  limit?: number;
}

export async function listAlertsForCompany(
  companyId: string,
  opts: ListAlertsOpts = {},
  c?: SupabaseClient,
): Promise<SupplierAlert[]> {
  let q = client(c)
    .from("supplier_alerts")
    .select("*")
    .eq("company_id", companyId);
  if (opts.onlyUndismissed) q = q.is("dismissed_at", null);
  if (opts.onlyCritical) q = q.eq("severity", "critical");
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(`listAlertsForCompany failed: ${error.message}`);
  return (data ?? []) as SupplierAlert[];
}

export async function listAlertsForSupplier(
  supplierId: string,
  c?: SupabaseClient,
): Promise<SupplierAlert[]> {
  const { data, error } = await client(c)
    .from("supplier_alerts")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAlertsForSupplier failed: ${error.message}`);
  return (data ?? []) as SupplierAlert[];
}

export interface InsertAlertInput {
  supplier_id: string;
  company_id: string;
  severity: SupplierAlertSeverity;
  event_type: SupplierAlertEventType;
  payload: Record<string, unknown>;
}

/**
 * INSERT batch d'alertes générées par l'engine supplier-diff.
 * Appelée par le cron P6 via `getAdminClient()` — la RLS bloque user-side.
 */
export async function insertAlerts(
  rows: InsertAlertInput[],
  c?: SupabaseClient,
): Promise<SupplierAlert[]> {
  if (rows.length === 0) return [];
  const { data, error } = await client(c)
    .from("supplier_alerts")
    .insert(rows)
    .select("*");
  if (error) throw new Error(`insertAlerts failed: ${error.message}`);
  return (data ?? []) as SupplierAlert[];
}

export async function dismissAlert(
  alertId: string,
  userId: string,
  c?: SupabaseClient,
): Promise<void> {
  const { error } = await client(c)
    .from("supplier_alerts")
    .update({
      dismissed_at: new Date().toISOString(),
      dismissed_by_user_id: userId,
    })
    .eq("id", alertId);
  if (error) throw new Error(`dismissAlert failed: ${error.message}`);
}

/**
 * Marque en batch un set d'alertes comme email envoyé. Idempotent.
 * Appelée par le cron P6 après l'envoi réussi du digest, hors transaction.
 */
export async function markEmailSent(
  alertIds: string[],
  sentAt: string,
  c?: SupabaseClient,
): Promise<void> {
  if (alertIds.length === 0) return;
  const { error } = await client(c)
    .from("supplier_alerts")
    .update({ email_sent_at: sentAt })
    .in("id", alertIds);
  if (error) throw new Error(`markEmailSent failed: ${error.message}`);
}

/**
 * Charge toutes les alertes critical en attente d'email, regroupées par company.
 * Helper du cron P6 pour construire un digest par destinataire.
 *
 * Ordre intra-company : `created_at ASC` (les plus anciennes en premier dans
 * le mail, pour cohérence narrative "voici ce qui s'est passé depuis hier").
 */
export async function listPendingCriticalAlertsByCompany(
  c?: SupabaseClient,
): Promise<Map<string, SupplierAlert[]>> {
  const { data, error } = await client(c)
    .from("supplier_alerts")
    .select("*")
    .eq("severity", "critical")
    .is("email_sent_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`listPendingCriticalAlertsByCompany failed: ${error.message}`);
  }
  const grouped = new Map<string, SupplierAlert[]>();
  for (const row of (data ?? []) as SupplierAlert[]) {
    const arr = grouped.get(row.company_id) ?? [];
    arr.push(row);
    grouped.set(row.company_id, arr);
  }
  return grouped;
}
