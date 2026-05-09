/**
 * Invoice ↔ Transaction matching engine (Phase 4).
 *
 * V1 SCOPE NOTICE
 * ----------------
 * V1 reste 1-to-1 only (1 facture ↔ 1 transaction max). Voir migration 0002.
 * Les paiements partiels (table invoice_payments) sont prévus en V2.
 *
 * Trois branches explicites (sémantique imposée — pas de match silencieux
 * en cas de mismatch de montant) :
 *   * score ≥ 0.90 ET |amountDelta| ≤ 1 %   → MatchType "auto"
 *   * 0.60 ≤ score < 0.90 ET |amountDelta| ≤ 1 % → MatchType "suggested"
 *   * tx < 0.99 × invoice                   → MatchType "underpayment" (anomalie, pas de DB)
 *   * tx > 1.01 × invoice                   → MatchType "overpayment"  (anomalie, pas de DB)
 *   * autre cas                             → MatchType "no_candidate"
 *
 * Idempotence stricte : skip toute invoice avec matched_transaction_id != null
 * (suggestion antérieure ou paid). Re-traitement requiert dismissMatch / unmatchPaid
 * explicite côté UI.
 *
 * Tie-breakers déterministes :
 *   * Itération invoices : due_at ASC, puis id ASC (FIFO — les plus anciennes
 *     réservent les transactions en premier)
 *   * Sélection candidat tx (pour une invoice donnée) : score DESC, puis
 *     |tx.date - due_at| ASC (proximité temporelle), puis tx.id ASC
 *
 * Pré-filtrage candidats : kind='revenue', tx.date ∈ [due_at - 7, due_at + 30],
 * |amountDelta| ≤ 0.20 (HARD_BOUND), tx-non-attribuée (Set construit à partir
 * de invoices.matched_transaction_id non-null sur tout le batch — in-memory V1).
 */

import type { Invoice, Transaction } from "./types";

export type MatchType =
  | "auto"
  | "suggested"
  | "underpayment"
  | "overpayment"
  | "no_candidate";

export interface MatchResult {
  invoiceId: string;
  type: MatchType;
  transactionId?: string;
  transactionDate?: string;
  transactionLabel?: string;
  transactionAmountCents?: number;
  score?: number;
  amountDeltaPct?: number; // signed
  reason?: string;
}

const AMOUNT_TOLERANCE = 0.01;
const AMOUNT_HARD_BOUND = 0.2;
const TIME_WINDOW_BEFORE = 7;
const TIME_WINDOW_AFTER = 30;
const AUTO_MATCH_THRESHOLD = 0.9;
const SUGGEST_THRESHOLD = 0.6;

/**
 * Match all eligible pending invoices against revenue transactions.
 *
 * `invoices` MUST contain the full set (paid + pending + cancelled) so we can
 * build the set of already-attributed transaction IDs. The engine internally
 * filters down to "candidates" (pending + matched_transaction_id IS NULL).
 */
export function matchInvoices(
  invoices: Invoice[],
  transactions: Transaction[],
): MatchResult[] {
  // Block transactions already attributed (suggestion persistée OR paid)
  const usedTxIds = new Set<string>();
  for (const inv of invoices) {
    if (inv.matched_transaction_id) usedTxIds.add(inv.matched_transaction_id);
  }

  // Candidates : pending invoices with NO existing match (idempotence stricte)
  const candidates = invoices.filter(
    (inv) => inv.status === "pending" && inv.matched_transaction_id == null,
  );

  // FIFO — process oldest due_at first so they reserve transactions first
  candidates.sort((a, b) => {
    if (a.due_at !== b.due_at) return a.due_at < b.due_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Pre-filter & sort transactions once
  const revenueTxs = transactions
    .filter((t) => t.kind === "revenue" && t.amount_cents > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const results: MatchResult[] = [];

  for (const invoice of candidates) {
    const txCandidates = filterTxCandidates(invoice, revenueTxs, usedTxIds);
    if (txCandidates.length === 0) {
      results.push({ invoiceId: invoice.id, type: "no_candidate" });
      continue;
    }

    // Score each candidate
    const scored = txCandidates.map((tx) => ({
      tx,
      score: scoreMatch(invoice, tx),
      amountDeltaPct: amountDelta(invoice.amount_ttc_cents, tx.amount_cents),
      // distance to due_at, in days, used as 2nd tiebreaker
      dayDistance: dayDelta(invoice.due_at, tx.date),
    }));

    // Tiebreakers : score DESC, |tx.date - due_at| ASC, tx.id ASC
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.dayDistance !== b.dayDistance) return a.dayDistance - b.dayDistance;
      return a.tx.id < b.tx.id ? -1 : a.tx.id > b.tx.id ? 1 : 0;
    });

    const best = scored[0];
    const absDelta = Math.abs(best.amountDeltaPct);

    const baseResult = {
      invoiceId: invoice.id,
      transactionId: best.tx.id,
      transactionDate: best.tx.date,
      transactionLabel: best.tx.label,
      transactionAmountCents: best.tx.amount_cents,
      score: best.score,
      amountDeltaPct: best.amountDeltaPct,
    };

    if (absDelta <= AMOUNT_TOLERANCE) {
      if (best.score >= AUTO_MATCH_THRESHOLD) {
        results.push({ ...baseResult, type: "auto" });
        usedTxIds.add(best.tx.id); // reserve for this run (FIFO)
      } else if (best.score >= SUGGEST_THRESHOLD) {
        results.push({ ...baseResult, type: "suggested" });
        usedTxIds.add(best.tx.id); // reserve too — a suggestion blocks the tx for further candidates
      } else {
        results.push({
          invoiceId: invoice.id,
          type: "no_candidate",
          reason: `Meilleur candidat trop incertain (score ${best.score.toFixed(2)})`,
        });
      }
    } else if (best.amountDeltaPct < 0) {
      results.push({
        ...baseResult,
        type: "underpayment",
        reason: `Paiement de ${pct(1 + best.amountDeltaPct)} du montant attendu — paiement partiel suspecté, vérification manuelle requise`,
      });
      // anomaly does NOT reserve the tx — it's just a flag
    } else {
      results.push({
        ...baseResult,
        type: "overpayment",
        reason: `Paiement de ${pct(1 + best.amountDeltaPct)} du montant attendu — trop-perçu, vérification manuelle requise`,
      });
    }
  }

  return results;
}

function filterTxCandidates(
  invoice: Invoice,
  revenueTxs: Transaction[],
  usedTxIds: Set<string>,
): Transaction[] {
  const winStart = addDays(invoice.due_at, -TIME_WINDOW_BEFORE);
  const winEnd = addDays(invoice.due_at, TIME_WINDOW_AFTER);
  const minAmount = Math.round(invoice.amount_ttc_cents * (1 - AMOUNT_HARD_BOUND));
  const maxAmount = Math.round(invoice.amount_ttc_cents * (1 + AMOUNT_HARD_BOUND));
  return revenueTxs.filter(
    (tx) =>
      !usedTxIds.has(tx.id) &&
      tx.date >= winStart &&
      tx.date <= winEnd &&
      tx.amount_cents >= minAmount &&
      tx.amount_cents <= maxAmount,
  );
}

function scoreMatch(invoice: Invoice, tx: Transaction): number {
  let score = 0;

  const absDelta = Math.abs(amountDelta(invoice.amount_ttc_cents, tx.amount_cents));
  if (absDelta <= AMOUNT_TOLERANCE) score += 0.4;

  if (dayDelta(invoice.due_at, tx.date) <= 30) score += 0.2;

  const labelN = normalize(tx.label);
  const clientN = normalize(invoice.client_name);
  if (clientN.length > 2 && labelN.includes(clientN)) score += 0.2;

  const numberN = normalize(invoice.number);
  if (numberN.length > 2 && labelN.includes(numberN)) score += 0.2;

  return Math.min(1, score);
}

function amountDelta(invoiceAmount: number, txAmount: number): number {
  if (invoiceAmount === 0) return 0;
  return (txAmount - invoiceAmount) / invoiceAmount;
}

function dayDelta(dueIso: string, txIso: string): number {
  const a = new Date(dueIso).getTime();
  const b = new Date(txIso).getTime();
  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1).replace(".", ",")} %`;
}
