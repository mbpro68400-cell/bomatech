/**
 * Financial State Engine (TypeScript port of packages/engines).
 *
 * Pure functions. Same invariants as the Python engine:
 *  - apply(state, tx) is non-mutating
 *  - recompute_full produces the same result as incremental apply
 *  - Money is signed integer cents
 */

import type { FinancialState, Transaction, TxKind } from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function emptyState(companyId: string, asOf: string): FinancialState {
  return {
    company_id: companyId,
    as_of: asOf,
    version: 1,
    cash_cents: 0,
    cash_30d_avg_cents: 0,
    revenue_30d: 0,
    revenue_90d: 0,
    revenue_365d: 0,
    costs_var_90d: 0,
    costs_fix_90d: 0,
    gross_margin_pct: 0,
    operating_margin_pct: 0,
    vat_collected_quarter_cents: 0,
    vat_deductible_quarter_cents: 0,
    vat_balance_cents: 0,
    burn_rate_monthly_cents: 0,
    runway_months: null,
    top_client_name: null,
    top_client_share_pct: 0,
    transaction_count: 0,
    computed_at: new Date().toISOString(),
  };
}

function daysBetween(a: string, b: string): number {
  const dA = new Date(a).getTime();
  const dB = new Date(b).getTime();
  return Math.floor((dA - dB) / MS_PER_DAY);
}

function inSameQuarter(txDate: string, asOf: string): boolean {
  const d = new Date(txDate);
  const ref = new Date(asOf);
  const qD = Math.floor(d.getMonth() / 3);
  const qR = Math.floor(ref.getMonth() / 3);
  return d.getFullYear() === ref.getFullYear() && qD === qR;
}

/** Apply a single transaction to the state. Pure, non-mutating. */
export function apply(state: FinancialState, tx: Transaction): FinancialState {
  if (tx.company_id !== state.company_id) {
    throw new Error("Transaction company mismatch");
  }

  const next: FinancialState = { ...state };
  next.version += 1;
  next.cash_cents += tx.amount_cents;
  next.transaction_count += 1;

  const daysOld = daysBetween(state.as_of, tx.date);

  if (daysOld >= 0 && daysOld <= 30 && tx.kind === "revenue") {
    next.revenue_30d += tx.amount_cents;
  }

  if (daysOld >= 0 && daysOld <= 90) {
    if (tx.kind === "revenue") next.revenue_90d += tx.amount_cents;
    else if (tx.kind === "cost_var") next.costs_var_90d += Math.abs(tx.amount_cents);
    else if (tx.kind === "cost_fix") next.costs_fix_90d += Math.abs(tx.amount_cents);
  }

  if (daysOld >= 0 && daysOld <= 365 && tx.kind === "revenue") {
    next.revenue_365d += tx.amount_cents;
  }

  // VAT
  if (tx.vat_amount_cents != null && inSameQuarter(tx.date, state.as_of)) {
    if (tx.kind === "revenue") {
      next.vat_collected_quarter_cents += tx.vat_amount_cents;
    } else if (tx.kind === "cost_var" || tx.kind === "cost_fix" || tx.kind === "capex") {
      next.vat_deductible_quarter_cents += tx.vat_amount_cents;
    }
    next.vat_balance_cents =
      next.vat_collected_quarter_cents - next.vat_deductible_quarter_cents;
  }

  return recomputeRatios(next);
}

function recomputeRatios(s: FinancialState): FinancialState {
  if (s.revenue_90d > 0) {
    s.gross_margin_pct = round((s.revenue_90d - s.costs_var_90d) / s.revenue_90d, 4);
    s.operating_margin_pct = round(
      (s.revenue_90d - s.costs_var_90d - s.costs_fix_90d) / s.revenue_90d,
      4,
    );
  } else {
    s.gross_margin_pct = 0;
    s.operating_margin_pct = 0;
  }

  const monthlyCosts = (s.costs_var_90d + s.costs_fix_90d) / 3;
  const monthlyRevenue = s.revenue_90d / 3;
  const burn = monthlyCosts - monthlyRevenue;
  s.burn_rate_monthly_cents = Math.round(burn);

  if (burn > 0 && s.cash_cents > 0) {
    s.runway_months = round(s.cash_cents / burn, 2);
  } else {
    s.runway_months = null;
  }

  return s;
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Rebuild state from scratch given full transaction history. Deterministic. */
export function recomputeFull(
  companyId: string,
  transactions: Transaction[],
  asOf: string,
): FinancialState {
  let state = emptyState(companyId, asOf);

  // Sort by date for deterministic ordering
  const ordered = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  for (const tx of ordered) {
    state = apply(state, tx);
  }

  // Concentration analysis
  const window90d = ordered.filter(
    (t) =>
      t.kind === "revenue" &&
      daysBetween(asOf, t.date) >= 0 &&
      daysBetween(asOf, t.date) <= 90 &&
      t.counterparty,
  );

  if (window90d.length > 0) {
    const totals = new Map<string, number>();
    let grandTotal = 0;
    for (const t of window90d) {
      const name = t.counterparty!;
      totals.set(name, (totals.get(name) ?? 0) + t.amount_cents);
      grandTotal += t.amount_cents;
    }

    let topName = "";
    let topAmount = 0;
    for (const [name, amount] of totals) {
      if (amount > topAmount) {
        topName = name;
        topAmount = amount;
      }
    }

    state.top_client_name = topName;
    state.top_client_share_pct = grandTotal > 0 ? round(topAmount / grandTotal, 4) : 0;
  }

  return state;
}
