import { describe, expect, it } from "vitest";
import { matchInvoices } from "./invoice-matching";
import type { Invoice, Transaction } from "./types";

function mkInvoice(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    id: p.id,
    company_id: p.company_id ?? "co-1",
    number: p.number ?? `FAC-${p.id}`,
    client_name: p.client_name ?? "Test SAS",
    amount_ht_cents: p.amount_ht_cents ?? 100000,
    amount_tva_cents: p.amount_tva_cents ?? 20000,
    amount_ttc_cents: p.amount_ttc_cents ?? 120000,
    vat_rate: p.vat_rate ?? 0.2,
    issued_at: p.issued_at ?? "2026-04-01",
    due_at: p.due_at ?? "2026-05-01",
    paid_at: p.paid_at ?? null,
    status: p.status ?? "pending",
    matched_transaction_id: p.matched_transaction_id ?? null,
    match_confidence: p.match_confidence ?? null,
    description: null,
    source: "manual",
    source_file: null,
    notes: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    created_by: null,
  };
}

function mkTx(p: Partial<Transaction> & { id: string }): Transaction {
  return {
    id: p.id,
    company_id: p.company_id ?? "co-1",
    date: p.date ?? "2026-05-01",
    amount_cents: p.amount_cents ?? 120000,
    currency: p.currency ?? "EUR",
    kind: p.kind ?? "revenue",
    label: p.label ?? "VIR Test SAS",
    source: "csv",
    reconciled: false,
  };
}

describe("matchInvoices", () => {
  it("returns no_candidate when there is no transaction", () => {
    const results = matchInvoices([mkInvoice({ id: "a" })], []);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("no_candidate");
  });

  it("auto-matches when amount within ±1% AND score ≥ 0.9", () => {
    // Score :
    //  amount ±1% (0.40) + window (0.20) + client name in label (0.20) +
    //  invoice number in label (0.20) = 1.0 → auto
    const results = matchInvoices(
      [mkInvoice({ id: "a", amount_ttc_cents: 120000, due_at: "2026-05-01", client_name: "ACME", number: "FAC-2026-001" })],
      [mkTx({ id: "tx-1", amount_cents: 120000, date: "2026-05-02", label: "VIR ACME FAC-2026-001" })],
    );
    expect(results[0].type).toBe("auto");
    expect(results[0].transactionId).toBe("tx-1");
    expect(results[0].score).toBeGreaterThanOrEqual(0.9);
  });

  it("emits 'suggested' when amount ok but score in [0.6, 0.9)", () => {
    // Score = amount(0.4) + window(0.2) = 0.6 → suggested (no client/number match)
    const results = matchInvoices(
      [mkInvoice({ id: "a", amount_ttc_cents: 120000, due_at: "2026-05-01", client_name: "ACME", number: "FAC-XYZ" })],
      [mkTx({ id: "tx-1", amount_cents: 120000, date: "2026-05-02", label: "Some unrelated label" })],
    );
    expect(results[0].type).toBe("suggested");
    expect(results[0].score).toBeGreaterThanOrEqual(0.6);
    expect(results[0].score).toBeLessThan(0.9);
  });

  it("flags underpayment when tx < 0.99 × invoice", () => {
    const results = matchInvoices(
      [mkInvoice({ id: "a", amount_ttc_cents: 120000, due_at: "2026-05-01" })],
      [mkTx({ id: "tx-1", amount_cents: 100000, date: "2026-05-02" })], // 83% of invoice
    );
    expect(results[0].type).toBe("underpayment");
    expect(results[0].amountDeltaPct).toBeLessThan(0);
  });

  it("flags overpayment when tx > 1.01 × invoice", () => {
    const results = matchInvoices(
      [mkInvoice({ id: "a", amount_ttc_cents: 100000, due_at: "2026-05-01" })],
      [mkTx({ id: "tx-1", amount_cents: 115000, date: "2026-05-02" })], // 115% of invoice
    );
    expect(results[0].type).toBe("overpayment");
    expect(results[0].amountDeltaPct).toBeGreaterThan(0);
  });

  it("respects strict idempotence: skips invoices already matched", () => {
    const results = matchInvoices(
      [mkInvoice({ id: "a", matched_transaction_id: "tx-existing", match_confidence: 0.7 })],
      [mkTx({ id: "tx-1", amount_cents: 120000 })],
    );
    // Already-matched invoices are not re-evaluated
    expect(results).toHaveLength(0);
  });

  it("FIFO: oldest due_at reserves the tx first", () => {
    const oldest = mkInvoice({ id: "a", amount_ttc_cents: 120000, due_at: "2026-04-01", number: "FAC-A", client_name: "X" });
    const newer = mkInvoice({ id: "b", amount_ttc_cents: 120000, due_at: "2026-05-01", number: "FAC-B", client_name: "X" });
    const tx = mkTx({ id: "tx-1", amount_cents: 120000, date: "2026-04-15", label: "X FAC-A" }); // matches oldest by name+number

    const results = matchInvoices([newer, oldest], [tx]);
    const aRes = results.find((r) => r.invoiceId === "a");
    const bRes = results.find((r) => r.invoiceId === "b");
    expect(aRes?.transactionId).toBe("tx-1"); // FIFO : a (oldest) gets it
    expect(bRes?.type).toBe("no_candidate"); // b has no other tx
  });
});
