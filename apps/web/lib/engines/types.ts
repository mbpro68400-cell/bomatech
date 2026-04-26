/**
 * Domain types — TypeScript port of bomatech_engines.financial_state.models
 *
 * Conventions:
 *  - All monetary amounts are signed integer cents
 *  - Dates are ISO strings (YYYY-MM-DD) at the boundary, Date objects internally
 */

export type TxKind =
  | "revenue"
  | "cost_var"
  | "cost_fix"
  | "tax"
  | "capex"
  | "financial"
  | "other";

export type TxSource =
  | "manual"
  | "csv"
  | "ocr_pdf"
  | "bridge_api"
  | "api"
  | "factur_x";

export interface Transaction {
  id: string;
  company_id: string;
  date: string; // ISO YYYY-MM-DD
  amount_cents: number;
  currency: string;
  kind: TxKind;
  category?: string | null;
  counterparty?: string | null;
  label: string;
  vat_rate?: number | null;
  vat_amount_cents?: number | null;
  source: TxSource;
  source_ref?: string | null;
  reconciled: boolean;
}

export interface FinancialState {
  company_id: string;
  as_of: string;
  version: number;
  cash_cents: number;
  cash_30d_avg_cents: number;
  revenue_30d: number;
  revenue_90d: number;
  revenue_365d: number;
  costs_var_90d: number;
  costs_fix_90d: number;
  gross_margin_pct: number;
  operating_margin_pct: number;
  vat_collected_quarter_cents: number;
  vat_deductible_quarter_cents: number;
  vat_balance_cents: number;
  burn_rate_monthly_cents: number;
  runway_months: number | null;
  top_client_name: string | null;
  top_client_share_pct: number;
  transaction_count: number;
  computed_at: string;
}

export type AlertLevel = "info" | "warning" | "critical" | "positive";

export type AlertType =
  | "cash_risk"
  | "runway_short"
  | "concentration"
  | "margin_negative"
  | "cost_anomaly"
  | "payment_delay"
  | "margin_improving"
  | "revenue_growth";

export interface Insight {
  id: string;
  company_id: string;
  level: AlertLevel;
  type: AlertType;
  title: string;
  facts: Record<string, unknown>;
  message: string;
  source_refs: string[];
  detected_at: string;
  dismissed: boolean;
}
