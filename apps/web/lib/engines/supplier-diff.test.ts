import { describe, expect, it } from "vitest";
import { computeSupplierDiff } from "./supplier-diff";
import type { PappersSnapshot } from "./types";

function mkSnapshot(overrides: Partial<PappersSnapshot> = {}): PappersSnapshot {
  return {
    siren: "123456789",
    name: "Acme SARL",
    legal_form: "SARL",
    naf_code: "6201Z",
    registration_date: "2010-01-15",
    status: "active",
    procedure_collective: {
      open: false,
      kind: null,
      last_judgment_kind: null,
      last_judgment_date: null,
    },
    dirigeants: [
      { nom: "Dupont", prenom: "Jean", qualite: "Gérant", depuis: "2010-01-15" },
    ],
    capital_cents: 1_000_000,
    address_siege: "12 rue de la Paix, 75001 Paris",
    last_comptes_published_year: 2024,
    ...overrides,
  };
}

describe("computeSupplierDiff", () => {
  it("1. premier polling (oldSnapshot null) : 0 alerte (pas de baseline)", () => {
    expect(computeSupplierDiff(null, mkSnapshot())).toEqual([]);
  });

  it("2. snapshot identique : 0 alerte (idempotence)", () => {
    const s = mkSnapshot();
    expect(computeSupplierDiff(s, s)).toEqual([]);
  });

  // ---- critical events (4) ----

  it("3. procedure_collective_opened (redressement) : 1 critical", () => {
    const next = mkSnapshot({
      procedure_collective: {
        open: true,
        kind: "redressement",
        last_judgment_kind: null,
        last_judgment_date: null,
      },
    });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "critical",
      event_type: "procedure_collective_opened",
      payload: { kind: "redressement" },
    });
  });

  it("4. procedure_collective_judgment (conversion en LJ) : 1 critical", () => {
    const prev = mkSnapshot({
      procedure_collective: {
        open: true,
        kind: "redressement",
        last_judgment_kind: null,
        last_judgment_date: null,
      },
    });
    const next = mkSnapshot({
      procedure_collective: {
        open: true,
        kind: "redressement",
        last_judgment_kind: "conversion",
        last_judgment_date: "2026-05-10",
      },
    });
    const alerts = computeSupplierDiff(prev, next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "critical",
      event_type: "procedure_collective_judgment",
      payload: { kind: "conversion", date: "2026-05-10" },
    });
  });

  it("5. cessation : 1 critical", () => {
    const next = mkSnapshot({ status: "cessation" });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "critical",
      event_type: "cessation",
      payload: { before: "active", after: "cessation" },
    });
  });

  it("6. radiation : 1 critical", () => {
    const next = mkSnapshot({ status: "radiation" });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "critical",
      event_type: "radiation",
      payload: { before: "active", after: "radiation" },
    });
  });

  // ---- info events (6) ----

  it("7. dirigeant_change : 1 info", () => {
    const next = mkSnapshot({
      dirigeants: [
        {
          nom: "Martin",
          prenom: "Claire",
          qualite: "Gérante",
          depuis: "2026-04-01",
        },
      ],
    });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "info",
      event_type: "dirigeant_change",
    });
  });

  it("8. comptes_published (nouvelle année 2025) : 1 info", () => {
    const next = mkSnapshot({ last_comptes_published_year: 2025 });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "info",
      event_type: "comptes_published",
      payload: { before: 2024, after: 2025 },
    });
  });

  it("9. address_change : 1 info", () => {
    const next = mkSnapshot({
      address_siege: "34 avenue Foch, 75116 Paris",
    });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "info",
      event_type: "address_change",
    });
  });

  it("10. naf_change (6201Z → 6202A) : 1 info", () => {
    const next = mkSnapshot({ naf_code: "6202A" });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "info",
      event_type: "naf_change",
      payload: { before: "6201Z", after: "6202A" },
    });
  });

  it("11. capital_change (10 000 € → 50 000 €) : 1 info", () => {
    const next = mkSnapshot({ capital_cents: 5_000_000 });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "info",
      event_type: "capital_change",
      payload: { before: 1_000_000, after: 5_000_000 },
    });
  });

  it("12. legal_form_change (SARL → SAS) : 1 info", () => {
    const next = mkSnapshot({ legal_form: "SAS" });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: "info",
      event_type: "legal_form_change",
      payload: { before: "SARL", after: "SAS" },
    });
  });

  // ---- multi-changements ----

  it("13. multi-changements (proc. coll. ouverte + dirigeant + NAF) : 1 critical + 2 info", () => {
    const next = mkSnapshot({
      naf_code: "6202A",
      dirigeants: [
        {
          nom: "Martin",
          prenom: "Claire",
          qualite: "Gérante",
          depuis: "2026-04-01",
        },
      ],
      procedure_collective: {
        open: true,
        kind: "sauvegarde",
        last_judgment_kind: null,
        last_judgment_date: null,
      },
    });
    const alerts = computeSupplierDiff(mkSnapshot(), next);
    expect(alerts).toHaveLength(3);
    const critical = alerts.filter((a) => a.severity === "critical");
    const info = alerts.filter((a) => a.severity === "info");
    expect(critical).toHaveLength(1);
    expect(info).toHaveLength(2);
    expect(critical[0].event_type).toBe("procedure_collective_opened");
    expect(info.map((a) => a.event_type).sort()).toEqual([
      "dirigeant_change",
      "naf_change",
    ]);
  });
});
