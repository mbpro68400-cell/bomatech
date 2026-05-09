/**
 * Queries pour les factures émises.
 *
 * V1 simplification : paiement total uniquement. Voir migration 0002 pour le détail.
 * Les paiements partiels (table invoice_payments) sont prévus en V2.
 */

import { getBrowserClient } from "../supabase";
import type { Invoice, InvoiceStatus } from "../engines/types";

export type EffectiveStatus = "pending" | "paid" | "cancelled" | "overdue";

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
  return { ok: !error, error: error?.message ?? null };
}

export interface BulkInvoiceInput {
  number: string;
  client_name: string;
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
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, errors: [] };

  const supabase = getBrowserClient();
  const errors: string[] = [];

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

  if (toInsert.length === 0) return { inserted: 0, skipped, errors };

  const payload = toInsert.map((r) => ({
    company_id: companyId,
    number: r.number,
    client_name: r.client_name,
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

  return { inserted, skipped, errors };
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
  return { updated: (data ?? []).length, error: null };
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
