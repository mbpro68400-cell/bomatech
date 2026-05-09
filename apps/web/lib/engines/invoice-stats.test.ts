import { describe, expect, it } from "vitest";
import { computeARSummary } from "./invoice-stats";
import type { Invoice } from "./types";

function mkInvoice(p: Partial<Invoice>): Invoice {
  return {
    id: p.id ?? "inv-test",
    company_id: p.company_id ?? "co-test",
    number: p.number ?? "FAC-TEST",
    client_name: p.client_name ?? "Test Client",
    amount_ht_cents: p.amount_ht_cents ?? 100000,
    amount_tva_cents: p.amount_tva_cents ?? 20000,
    amount_ttc_cents: p.amount_ttc_cents ?? 120000,
    vat_rate: p.vat_rate ?? 0.2,
    issued_at: p.issued_at ?? "2026-01-01",
    due_at: p.due_at ?? "2026-02-01",
    paid_at: p.paid_at ?? null,
    status: p.status ?? "pending",
    matched_transaction_id: p.matched_transaction_id ?? null,
    match_confidence: p.match_confidence ?? null,
    description: p.description ?? null,
    source: p.source ?? "manual",
    source_file: p.source_file ?? null,
    notes: p.notes ?? null,
    created_at: p.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: p.updated_at ?? "2026-01-01T00:00:00Z",
    created_by: p.created_by ?? null,
  };
}

describe("computeARSummary", () => {
  it("returns zeros on empty input", () => {
    const r = computeARSummary([], "2026-05-01");
    expect(r.totalARCents).toBe(0);
    expect(r.pendingCount).toBe(0);
    expect(r.overdueCount).toBe(0);
    expect(r.avgAgeDays).toBe(0);
    expect(r.oldestOverdueDays).toBe(0);
  });

  it("ignores paid and cancelled invoices", () => {
    const r = computeARSummary(
      [
        mkInvoice({ status: "paid", amount_ttc_cents: 100000 }),
        mkInvoice({ status: "cancelled", amount_ttc_cents: 200000 }),
      ],
      "2026-05-01",
    );
    expect(r.totalARCents).toBe(0);
    expect(r.pendingCount).toBe(0);
  });

  it("counts pending non-overdue correctly", () => {
    const r = computeARSummary(
      [
        mkInvoice({ id: "a", status: "pending", amount_ttc_cents: 100000, issued_at: "2026-04-01", due_at: "2026-06-01" }),
        mkInvoice({ id: "b", status: "pending", amount_ttc_cents: 50000, issued_at: "2026-04-15", due_at: "2026-05-15" }),
      ],
      "2026-05-01",
    );
    expect(r.totalARCents).toBe(150000);
    expect(r.pendingCount).toBe(2);
    expect(r.overdueCount).toBe(0);
    expect(r.oldestOverdueDays).toBe(0);
  });

  it("flags overdue and computes oldestOverdueDays", () => {
    const r = computeARSummary(
      [
        mkInvoice({ id: "a", status: "pending", amount_ttc_cents: 100000, issued_at: "2026-01-01", due_at: "2026-02-01" }),
        mkInvoice({ id: "b", status: "pending", amount_ttc_cents: 50000, issued_at: "2026-04-15", due_at: "2026-05-15" }),
      ],
      "2026-05-01",
    );
    // a: due 2026-02-01, today 2026-05-01 → 89 days overdue
    expect(r.overdueCount).toBe(1);
    expect(r.overdueARCents).toBe(100000);
    expect(r.oldestOverdueDays).toBeGreaterThanOrEqual(89);
    expect(r.oldestOverdueDays).toBeLessThanOrEqual(90);
  });

  it("computes avgAgeDays weighted by amount", () => {
    // invoice A : 90 days old, 200€ → contribution 90 * 20000
    // invoice B : 10 days old, 100€ → contribution 10 * 10000
    // Σ amounts = 30000, Σ weighted = 1800000+100000 = 1900000
    // avg = 1900000 / 30000 = 63.33 → rounded to 63
    const r = computeARSummary(
      [
        mkInvoice({ id: "a", status: "pending", amount_ttc_cents: 20000, issued_at: "2026-02-01", due_at: "2026-06-01" }),
        mkInvoice({ id: "b", status: "pending", amount_ttc_cents: 10000, issued_at: "2026-04-21", due_at: "2026-05-21" }),
      ],
      "2026-05-01",
    );
    expect(r.avgAgeDays).toBeGreaterThanOrEqual(60);
    expect(r.avgAgeDays).toBeLessThanOrEqual(70);
  });
});
