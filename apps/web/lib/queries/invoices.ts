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
): Promise<Invoice[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("invoices_emitted")
    .select("*")
    .eq("company_id", companyId)
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

export async function deleteInvoice(id: string): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getBrowserClient();
  const { error } = await supabase.from("invoices_emitted").delete().eq("id", id);
  return { ok: !error, error: error?.message ?? null };
}
