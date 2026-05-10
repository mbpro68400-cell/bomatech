/**
 * Queries pour les factures émises.
 *
 * V1 simplification : paiement total uniquement. Voir migration 0002 pour le détail.
 * Les paiements partiels (table invoice_payments) sont prévus en V2.
 */

import { getBrowserClient } from "../supabase";
import type { Invoice, InvoiceStatus } from "../engines/types";

export type EffectiveStatus = "pending" | "paid" | "cancelled" | "overdue";

/**
 * 1.6.5 — Annule les relances `status='scheduled'` pour les factures qui
 * viennent de passer à `paid` ou `cancelled`. Ne touche pas aux 'sent'
 * (historique préservé) ni aux 'failed' (laissés tels quels pour debug).
 *
 * Best-effort : si l'update plante (RLS, FK, ...), on ne fait pas échouer
 * l'opération métier d'origine — la pire conséquence est une relance
 * envoyée tardivement par le cron du lendemain.
 */
async function cancelScheduledReminders(invoiceIds: string[]): Promise<void> {
  if (invoiceIds.length === 0) return;
  const supabase = getBrowserClient();
  await supabase
    .from("invoice_reminders")
    .update({ status: "cancelled" })
    .in("invoice_id", invoiceIds)
    .eq("status", "scheduled");
}

/** Compute the displayed status: 'overdue' is derived from pending+past-due. */
export function effectiveStatus(invoice: Invoice, todayIso?: string): EffectiveStatus {
  if (invoice.status !== "pending") return invoice.status;
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  return invoice.due_at < today ? "overdue" : "pending";
}

export async function listInvoices(
  companyId: string,
  limit = 500,
  opts: { includeClosed?: boolean } = {},
): Promise<Invoice[]> {
  const supabase = getBrowserClient();
  let q = supabase
    .from("invoices_emitted")
    .select("*")
    .eq("company_id", companyId);

  // Phase 1.7 : par défaut on n'inclut PAS les factures de période close.
  // L'archive (/archives) doit explicitement passer { includeClosed: true }.
  if (!opts.includeClosed) {
    q = q.eq("is_closed_period", false);
  }

  const { data, error } = await q
    .order("issued_at", { ascending: false })
    .order("due_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to load invoices:", error);
    return [];
  }
  return (data ?? []) as Invoice[];
}

export interface CreateInvoiceInput {
  company_id: string;
  number: string;
  client_name: string;
  client_email?: string | null;
  amount_ht_cents: number;
  amount_tva_cents: number;
  amount_ttc_cents: number;
  vat_rate: number | null;
  issued_at: string;
  due_at: string;
  description?: string | null;
  source?: "manual" | "csv" | "factur_x" | "pdf_ocr";
  source_file?: string | null;
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ invoice: Invoice | null; error: string | null }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices_emitted")
    .insert({ ...input, status: "pending" as InvoiceStatus })
    .select()
    .single();

  if (error) {
    return { invoice: null, error: error.message };
  }
  // Auto-trigger Phase 4 matching against existing transactions (silent — see ROADMAP).
  await runMatchingFor(input.company_id).catch(() => {});
  return { invoice: data as Invoice, error: null };
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  paidAt?: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getBrowserClient();
  const patch: Record<string, unknown> = { status };
  if (status === "paid") {
    patch.paid_at = paidAt ?? new Date().toISOString().slice(0, 10);
  } else if (status === "pending" || status === "cancelled") {
    patch.paid_at = null;
    patch.matched_transaction_id = null;
    patch.match_confidence = null;
  }
  const { error } = await supabase.from("invoices_emitted").update(patch).eq("id", id);
  if (!error && (status === "paid" || status === "cancelled")) {
    await cancelScheduledReminders([id]).catch(() => {});
  }
  return { ok: !error, error: error?.message ?? null };
}

export interface BulkInvoiceInput {
  number: string;
  client_name: string;
  client_email?: string | null;
  amount_ht_cents: number;
  amount_tva_cents: number;
  amount_ttc_cents: number;
  vat_rate: number | null;
  issued_at: string;
  due_at: string;
  description: string | null;
}

export async function bulkInsertInvoices(
  companyId: string,
  rows: BulkInvoiceInput[],
  source: "csv" | "factur_x" | "pdf_ocr" = "csv",
  sourceFile?: string,
): Promise<{ inserted: number; skipped: number; errors: string[]; archivedInserted: number; openInserted: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, errors: [], archivedInserted: 0, openInserted: 0 };

  const supabase = getBrowserClient();
  const errors: string[] = [];

  // Phase 1.7 : load last_closing_date once for the archived/open breakdown.
  const { data: companyRow } = await supabase
    .from("companies")
    .select("last_closing_date")
    .eq("id", companyId)
    .maybeSingle();
  const lastClosingDate = (companyRow as { last_closing_date: string | null } | null)?.last_closing_date ?? null;

  // Pre-check existing numbers for this company to avoid unique-violation noise
  const incomingNumbers = rows.map((r) => r.number);
  const existing = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < incomingNumbers.length; i += chunkSize) {
    const chunk = incomingNumbers.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("invoices_emitted")
      .select("number")
      .eq("company_id", companyId)
      .in("number", chunk);
    if (error) {
      errors.push(`Dedup check failed: ${error.message}`);
      continue;
    }
    for (const r of data ?? []) {
      if (r.number) existing.add(r.number);
    }
  }

  // Also dedupe INTRA-BATCH : a single ZIP can contain two PDFs that resolve
  // to the same `number` (e.g. parser regex glitch, filename fallback yielding
  // the same digit, or genuine accidental duplicates in the source archive).
  // Without this, a single statement-level INSERT crashes with a unique-violation
  // and we lose the entire batch.
  const seenInBatch = new Set<string>();
  const toInsert = rows.filter((r) => {
    if (existing.has(r.number)) return false;
    if (seenInBatch.has(r.number)) return false;
    seenInBatch.add(r.number);
    return true;
  });
  const skipped = rows.length - toInsert.length;

  if (toInsert.length === 0) return { inserted: 0, skipped, errors, archivedInserted: 0, openInserted: 0 };

  const payload = toInsert.map((r) => ({
    company_id: companyId,
    number: r.number,
    client_name: r.client_name,
    client_email: r.client_email ?? null,
    amount_ht_cents: r.amount_ht_cents,
    amount_tva_cents: r.amount_tva_cents,
    amount_ttc_cents: r.amount_ttc_cents,
    vat_rate: r.vat_rate,
    issued_at: r.issued_at,
    due_at: r.due_at,
    description: r.description,
    source,
    source_file: sourceFile ?? null,
    status: "pending" as const,
  }));

  // Use upsert with ignoreDuplicates so a residual race condition (or a row
  // we somehow missed in the dedup pass) does NOT abort the whole batch.
  // PG-level conflict on (company_id, number) is silently skipped and the
  // remaining rows go through.
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const { error, count } = await supabase
      .from("invoices_emitted")
      .upsert(batch, { onConflict: "company_id,number", ignoreDuplicates: true, count: "exact" });
    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  // Auto-trigger Phase 4 matching once per batch import (silent — see ROADMAP).
  if (inserted > 0) {
    await runMatchingFor(companyId).catch(() => {});
  }

  // Phase 1.7 breakdown : archived = issued_at <= last_closing_date.
  const archivedInserted = lastClosingDate
    ? toInsert.filter((r) => r.issued_at <= lastClosingDate).length
    : 0;
  const openInserted = toInsert.length - archivedInserted;

  return { inserted, skipped, errors, archivedInserted, openInserted };
}

export async function deleteInvoice(id: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getBrowserClient();
  const { error } = await supabase.from("invoices_emitted").delete().eq("id", id);
  return { ok: !error, error: error?.message ?? null };
}

// ---------- Phase 4 : rapprochement automatique ----------
//
// V1 SCOPE NOTICE
// ----------------
// V1 reste 1-to-1 only (1 facture ↔ 1 transaction max). Voir migration 0002.
// Les paiements partiels (table invoice_payments) sont prévus en V2.
//
// Sémantique imposée des trois branches du runMatchingFor (en mode 'auto') :
//   * score ≥ 0.90 ET |amountDelta| ≤ 1 %         → status='paid', paid_at=tx.date,
//                                                   matched_transaction_id, matched_at=now(),
//                                                   matched_by='auto', matched_user_id=NULL,
//                                                   match_confidence=score
//   * 0.60 ≤ score < 0.90 ET |amountDelta| ≤ 1 %  → status reste 'pending' (suggestion),
//                                                   matched_transaction_id, matched_at=now(),
//                                                   matched_by='auto', match_confidence=score,
//                                                   paid_at reste NULL
//   * score < 0.60 ou |amountDelta| > 1 %         → AUCUNE écriture en DB
//                                                   (anomalies in-memory only)
//
// Idempotence stricte : skip toute invoice avec matched_transaction_id != null.
// Re-traitement requiert dismissMatch / unmatchPaid explicite.

import { matchInvoices, type MatchResult, type MatchType } from "../engines/invoice-matching";
import type { Transaction } from "../engines/types";

export interface MatchSummary {
  auto: number;
  suggested: number;
  underpayment: number;
  overpayment: number;
  noCandidate: number;
}

export interface RunMatchingResult {
  summary: MatchSummary;
  anomalies: MatchResult[]; // underpayment + overpayment (in-memory only, never persisted)
  errors: string[];
}

export async function runMatchingFor(companyId: string): Promise<RunMatchingResult> {
  const supabase = getBrowserClient();
  const errors: string[] = [];

  // Load FULL invoice set (paid + pending + cancelled) so the engine can build
  // the "tx already attributed" set. The engine internally filters down to
  // "candidates" (pending + matched_transaction_id IS NULL — strict idempotence).
  // Phase 1.7 : on exclut les rows en période close (lecture seule, hors flow).
  const { data: invoices, error: invErr } = await supabase
    .from("invoices_emitted")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_closed_period", false);
  if (invErr || !invoices) {
    errors.push(`Load invoices failed: ${invErr?.message ?? "unknown"}`);
    return { summary: emptySummary(), anomalies: [], errors };
  }

  // Load all revenue transactions in the company (open period only)
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("company_id", companyId)
    .eq("kind", "revenue")
    .eq("is_closed_period", false)
    .order("date", { ascending: true })
    .limit(5000);
  if (txErr || !txs) {
    errors.push(`Load transactions failed: ${txErr?.message ?? "unknown"}`);
    return { summary: emptySummary(), anomalies: [], errors };
  }

  const results = matchInvoices(invoices as Invoice[], txs as Transaction[]);

  // Persist auto + suggested (audit fields set with matched_by='auto', matched_user_id=null)
  const nowIso = new Date().toISOString();
  const autoMatchedIds: string[] = []; // 1.6.5 : on cancel les reminders en batch après la boucle
  for (const r of results) {
    if (r.type === "auto" && r.transactionId) {
      const { error } = await supabase
        .from("invoices_emitted")
        .update({
          status: "paid" as const,
          paid_at: r.transactionDate ?? nowIso.slice(0, 10),
          matched_transaction_id: r.transactionId,
          match_confidence: r.score ?? null,
          matched_at: nowIso,
          matched_by: "auto",
          matched_user_id: null,
        })
        .eq("id", r.invoiceId);
      if (error) errors.push(`auto ${r.invoiceId}: ${error.message}`);
      else autoMatchedIds.push(r.invoiceId);
    } else if (r.type === "suggested" && r.transactionId) {
      const { error } = await supabase
        .from("invoices_emitted")
        .update({
          // status stays 'pending' (no paid_at write)
          matched_transaction_id: r.transactionId,
          match_confidence: r.score ?? null,
          matched_at: nowIso,
          matched_by: "auto",
          matched_user_id: null,
        })
        .eq("id", r.invoiceId);
      if (error) errors.push(`suggested ${r.invoiceId}: ${error.message}`);
    }
    // underpayment / overpayment / no_candidate : NO DB write (anomalies in-memory only)
  }

  // 1.6.5 : annule les relances scheduled des invoices passées à paid en auto
  if (autoMatchedIds.length > 0) {
    await cancelScheduledReminders(autoMatchedIds).catch(() => {});
  }

  const summary: MatchSummary = {
    auto: countType(results, "auto"),
    suggested: countType(results, "suggested"),
    underpayment: countType(results, "underpayment"),
    overpayment: countType(results, "overpayment"),
    noCandidate: countType(results, "no_candidate"),
  };
  const anomalies = results.filter((r) => r.type === "underpayment" || r.type === "overpayment");
  return { summary, anomalies, errors };
}

function emptySummary(): MatchSummary {
  return { auto: 0, suggested: 0, underpayment: 0, overpayment: 0, noCandidate: 0 };
}

function countType(results: MatchResult[], type: MatchType): number {
  return results.filter((r) => r.type === type).length;
}

/** User confirms a suggestion : status → 'paid', audit manual + user. */
export async function confirmSuggestion(
  invoiceId: string,
  userId: string | null,
  paidAt?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getBrowserClient();
  const { error } = await supabase
    .from("invoices_emitted")
    .update({
      status: "paid" as const,
      paid_at: paidAt ?? new Date().toISOString().slice(0, 10),
      matched_at: new Date().toISOString(),
      matched_by: "manual",
      matched_user_id: userId,
      // matched_transaction_id and match_confidence kept as-is from the suggestion
    })
    .eq("id", invoiceId);
  if (!error) {
    await cancelScheduledReminders([invoiceId]).catch(() => {});
  }
  return { ok: !error, error: error?.message ?? null };
}

/** User rejects a suggestion (zone 0.60–0.90) — invoice stays pending, match cleared. */
export async function dismissMatch(invoiceId: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getBrowserClient();
  const { error } = await supabase
    .from("invoices_emitted")
    .update({
      matched_transaction_id: null,
      match_confidence: null,
      matched_at: null,
      matched_by: null,
      matched_user_id: null,
    })
    .eq("id", invoiceId);
  return { ok: !error, error: error?.message ?? null };
}

/**
 * Phase 6 : rapprochement manuel multi-factures (1 transaction → N factures).
 *
 * V1 SCOPE NOTICE
 * ----------------
 * V1 toujours 1 facture ↔ 1 transaction au sens audit (matched_transaction_id
 * sur invoices). Mais on supporte N invoices pointant vers la MÊME transaction
 * (cas réel : 1 virement consolidé qui paye plusieurs factures).
 *
 * À l'inverse (1 facture ↔ N transactions = paiement partiel/échelonné), c'est
 * V2 via la table invoice_payments (voir migration 0002 + ROADMAP).
 *
 * Les N factures cochées passent toutes status='paid', matched_by='manual',
 * matched_transaction_id=tx.id, match_confidence=1.0. La validation de
 * l'écart (±1 %) est faite côté UI avant l'appel.
 */
export async function applyManualMultiMatch(
  invoiceIds: string[],
  transactionId: string,
  userId: string | null,
  paidAt: string,
): Promise<{ updated: number; error: string | null }> {
  if (invoiceIds.length === 0) return { updated: 0, error: null };
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices_emitted")
    .update({
      status: "paid" as const,
      paid_at: paidAt,
      matched_transaction_id: transactionId,
      match_confidence: 1.0,
      matched_at: new Date().toISOString(),
      matched_by: "manual",
      matched_user_id: userId,
    })
    .in("id", invoiceIds)
    .select("id");
  if (error) return { updated: 0, error: error.message };
  const ids = (data ?? []).map((d) => d.id);
  if (ids.length > 0) {
    await cancelScheduledReminders(ids).catch(() => {});
  }
  return { updated: ids.length, error: null };
}

/** User undoes an applied match on a paid invoice : full reset to pending. */
export async function unmatchPaid(invoiceId: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getBrowserClient();
  const { error } = await supabase
    .from("invoices_emitted")
    .update({
      status: "pending" as const,
      paid_at: null,
      matched_transaction_id: null,
      match_confidence: null,
      matched_at: null,
      matched_by: null,
      matched_user_id: null,
    })
    .eq("id", invoiceId);
  return { ok: !error, error: error?.message ?? null };
}

// ---------- 1.6.5 — Email client + relances ----------

/**
 * Récupère le dernier `client_email` connu pour un (company_id, client_name).
 * Utilisé pour pré-remplir le champ email lors de la saisie d'une nouvelle facture.
 * Retourne null si aucun email trouvé pour ce client.
 */
export async function getLastClientEmail(
  companyId: string,
  clientName: string,
): Promise<string | null> {
  if (!clientName.trim()) return null;
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices_emitted")
    .select("client_email")
    .eq("company_id", companyId)
    .eq("client_name", clientName.trim())
    .not("client_email", "is", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { client_email: string | null }).client_email;
}

/** Résumé d'état des relances pour une invoice (pour la colonne UI). */
export interface ReminderSummary {
  totalSent: number;
  hasFailed: boolean;
  hasScheduled: boolean;
}

/**
 * Charge les reminders de toutes les invoices d'une company et les indexe par
 * invoice_id pour affichage en colonne. Filtre RLS company-scoped automatique.
 */
export async function listRemindersByInvoice(
  companyId: string,
): Promise<Map<string, ReminderSummary>> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoice_reminders")
    .select("invoice_id, status")
    .eq("company_id", companyId);
  const out = new Map<string, ReminderSummary>();
  if (error || !data) return out;
  for (const r of data as { invoice_id: string; status: string }[]) {
    const summary = out.get(r.invoice_id) ?? {
      totalSent: 0,
      hasFailed: false,
      hasScheduled: false,
    };
    if (r.status === "sent") summary.totalSent++;
    if (r.status === "failed") summary.hasFailed = true;
    if (r.status === "scheduled") summary.hasScheduled = true;
    out.set(r.invoice_id, summary);
  }
  return out;
}

export interface ReminderRowUI {
  id: string;
  level: number;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  email_to: string;
  subject: string;
  body: string;
  created_by: string;
  created_at: string;
}

/** Charge les rows reminders complètes d'une invoice (pour le drawer timeline). */
export async function listRemindersForInvoice(
  invoiceId: string,
): Promise<ReminderRowUI[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoice_reminders")
    .select(
      "id, level, status, scheduled_at, sent_at, failed_at, error_message, email_to, subject, body, created_by, created_at",
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as ReminderRowUI[];
}
