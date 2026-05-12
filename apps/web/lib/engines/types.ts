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
  // Phase 1.7 — accounting periods (default false, set autoritairement par trigger PG)
  is_closed_period?: boolean;
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

// ---------- Factures émises ----------
// V1 : paiement total uniquement (1 facture ↔ 1 transaction max).
// V2 prévue : paiements échelonnés via une table invoice_payments. Voir ROADMAP.

export type InvoiceStatus = "pending" | "paid" | "cancelled";
// "overdue" est dérivé côté UI : status === "pending" && due_at < today.

export type InvoiceSource = "manual" | "csv" | "factur_x" | "pdf_ocr";

export interface Invoice {
  id: string;
  company_id: string;
  number: string;
  client_name: string;
  client_email?: string | null; // 1.6.5 — optionnel, requis pour les relances auto
  amount_ht_cents: number;
  amount_tva_cents: number;
  amount_ttc_cents: number;
  vat_rate: number | null;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  status: InvoiceStatus;
  matched_transaction_id: string | null;
  match_confidence: number | null;
  description: string | null;
  source: InvoiceSource;
  source_file: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Phase 1.7 — accounting periods (default false, set autoritairement par trigger PG)
  is_closed_period?: boolean;
}

// ---------- Relances de factures (1.6.5) ----------
export type ReminderStatus = "scheduled" | "sent" | "failed" | "cancelled";
export type ReminderLevel = 1 | 2;
export type ReminderOrigin = "auto" | "manual";

export interface InvoiceReminder {
  id: string;
  invoice_id: string;
  company_id: string;
  level: ReminderLevel;
  status: ReminderStatus;
  scheduled_at: string;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  email_to: string;
  subject: string;
  body: string;
  created_by: ReminderOrigin;
  created_by_user_id: string | null;
  created_at: string;
}

// Phase 1.7 — accounting periods
export interface Company {
  id: string;
  name: string;
  current_period_start: string | null;
  last_closing_date: string | null;
}

export interface AccountingClosure {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  closed_at: string;
  closed_by: string | null;
  notes: string | null;
}

// ---------- Veille fournisseurs (1.9) ----------
// Module surveillance santé juridique fournisseurs via Pappers.
// Engine pur lib/engines/supplier-diff.ts compare deux snapshots et produit
// les alertes typées. Le mapping severity ↔ event_type est enforced côté TS
// (cf CRITICAL_EVENT_TYPES dans supplier-diff.ts), pas en DB.

export type SupplierStatus = "active" | "cessation" | "radiation" | "unknown";

export type SupplierAlertSeverity = "critical" | "info";

export type SupplierAlertEventType =
  | "procedure_collective_opened"
  | "procedure_collective_judgment"
  | "cessation"
  | "radiation"
  | "dirigeant_change"
  | "comptes_published"
  | "address_change"
  | "naf_change"
  | "capital_change"
  | "legal_form_change";

export type ProcedureCollectiveKind =
  | "sauvegarde"
  | "redressement"
  | "liquidation"
  | "conciliation";

export type ProcedureCollectiveJudgmentKind = "plan" | "conversion" | "cloture";

export interface Dirigeant {
  nom: string;
  prenom: string;
  qualite: string;
  depuis: string | null; // YYYY-MM-DD
}

/**
 * Subset normalisé du payload Pappers, stocké en jsonb dans
 * suppliers.last_pappers_snapshot. Sert de baseline au diff au prochain poll.
 */
export interface PappersSnapshot {
  siren: string;
  name: string;
  legal_form: string | null;
  naf_code: string | null;
  registration_date: string | null;
  status: SupplierStatus;
  procedure_collective: {
    open: boolean;
    kind: ProcedureCollectiveKind | null;
    last_judgment_kind: ProcedureCollectiveJudgmentKind | null;
    last_judgment_date: string | null;
  };
  dirigeants: Dirigeant[];
  capital_cents: number | null;
  address_siege: string | null;
  last_comptes_published_year: number | null;
}

/**
 * Output de l'engine supplier-diff. Sans id/created_at/dismissed_at — ceux-ci
 * sont ajoutés au moment de l'INSERT en DB (P2b).
 */
export interface SupplierAlertOutput {
  severity: SupplierAlertSeverity;
  event_type: SupplierAlertEventType;
  payload: Record<string, unknown>;
}
