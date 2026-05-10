import { describe, expect, it } from "vitest";
import {
  computeRemindersToSchedule,
  type SchedulerInvoiceInput,
  type SchedulerExistingReminder,
} from "./reminder-scheduler";

function mkInv(p: Partial<SchedulerInvoiceInput> = {}): SchedulerInvoiceInput {
  return {
    id: p.id ?? "inv-1",
    status: p.status ?? "pending",
    client_email: p.client_email === undefined ? "client@example.com" : p.client_email,
    due_at: p.due_at ?? "2026-04-01",
    is_closed_period: p.is_closed_period ?? false,
  };
}

/** Compute the asOf date that lands exactly N days after a due_at. */
function asOfNDaysAfter(due_at: string, n: number): Date {
  const d = new Date(due_at + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

describe("computeRemindersToSchedule", () => {
  it("J-14 : nothing scheduled (pas encore atteint le palier 1)", () => {
    const inv = mkInv({ due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 14));
    expect(result).toHaveLength(0);
  });

  it("J-15 sans existant : palier 1 uniquement", () => {
    const inv = mkInv({ due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 15));
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe(1);
    expect(result[0].invoiceId).toBe(inv.id);
  });

  it("J-30 avec palier 1 sent : palier 2 uniquement", () => {
    const inv = mkInv({ due_at: "2026-04-01" });
    const existing: SchedulerExistingReminder[] = [{ level: 1, status: "sent" }];
    const result = computeRemindersToSchedule(inv, existing, asOfNDaysAfter("2026-04-01", 30));
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe(2);
  });

  it("J-30 sans existant : palier 1 ET palier 2 (cas oubliée)", () => {
    const inv = mkInv({ due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 30));
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.level).sort()).toEqual([1, 2]);
  });

  it("status=paid : nothing scheduled", () => {
    const inv = mkInv({ status: "paid", due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 30));
    expect(result).toHaveLength(0);
  });

  it("client_email null : nothing scheduled", () => {
    const inv = mkInv({ client_email: null, due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 30));
    expect(result).toHaveLength(0);
  });

  it("is_closed_period=true : nothing scheduled (facture archivée)", () => {
    const inv = mkInv({ is_closed_period: true, due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 30));
    expect(result).toHaveLength(0);
  });

  it("idempotence : reminder cancelled bloque la re-création (même status non-actif)", () => {
    const inv = mkInv({ due_at: "2026-04-01" });
    const existing: SchedulerExistingReminder[] = [{ level: 1, status: "cancelled" }];
    const result = computeRemindersToSchedule(inv, existing, asOfNDaysAfter("2026-04-01", 15));
    expect(result).toHaveLength(0);
  });

  it("status=cancelled (invoice) : nothing scheduled", () => {
    const inv = mkInv({ status: "cancelled", due_at: "2026-04-01" });
    const result = computeRemindersToSchedule(inv, [], asOfNDaysAfter("2026-04-01", 30));
    expect(result).toHaveLength(0);
  });
});
