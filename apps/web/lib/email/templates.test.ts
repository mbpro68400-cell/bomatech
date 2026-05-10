import { describe, expect, it } from "vitest";
import {
  renderReminder,
  type ReminderContextLevel1,
  type ReminderContextLevel2,
} from "./templates";

const baseInvoice = {
  number: "FAC-2026-001",
  amount_ttc_cents: 123456, // 1 234,56 €
  issued_at: "2026-03-01",
  due_at: "2026-04-01",
};
const baseCompany = { name: "Bomatech SARL" };
const baseAsOf = new Date("2026-05-01T12:00:00Z");

const ctxLevel1: ReminderContextLevel1 = {
  invoice: baseInvoice,
  company: baseCompany,
  asOf: baseAsOf,
};

const ctxLevel2: ReminderContextLevel2 = {
  invoice: baseInvoice,
  company: baseCompany,
  level1SentAt: "2026-04-16",
  asOf: baseAsOf,
};

describe("renderReminder palier 1", () => {
  it("génère le subject avec le numéro de facture", () => {
    const r = renderReminder(1, ctxLevel1);
    expect(r.subject).toBe("Rappel — facture FAC-2026-001 en attente de règlement");
  });

  it("interpole montant TTC, dates, nom company dans le corps", () => {
    const r = renderReminder(1, ctxLevel1);
    expect(r.body).toContain("FAC-2026-001");
    expect(r.body).toContain("234,56"); // virgule décimale FR (séparateur milliers = NBSP via Intl)
    expect(r.body).toContain("€");
    expect(r.body).toContain("1 mars 2026"); // issued_at format long FR
    expect(r.body).toContain("1 avril 2026"); // due_at format long FR
    expect(r.body).toContain("Bomatech SARL");
    expect(r.body).toContain("Cordialement");
  });

  it("ton amiable : pas d'articles légaux ni mise en demeure", () => {
    const r = renderReminder(1, ctxLevel1);
    expect(r.body).not.toContain("mise en demeure");
    expect(r.body).not.toContain("L. 441-10");
    expect(r.body).not.toContain("D. 441-5");
  });
});

describe("renderReminder palier 2", () => {
  it("subject contient nombre de jours de retard calculé depuis asOf", () => {
    const r = renderReminder(2, ctxLevel2);
    // due_at = 2026-04-01, asOf = 2026-05-01 → 30 jours
    expect(r.subject).toBe("Mise en demeure — facture FAC-2026-001 impayée depuis 30 jours");
  });

  it("body contient les articles légaux et la formule mise en demeure", () => {
    const r = renderReminder(2, ctxLevel2);
    expect(r.body).toContain("Madame, Monsieur");
    expect(r.body).toContain("mettons en demeure"); // verbe au présent dans le corps
    expect(r.body).toContain("8 jours");
    expect(r.body).toContain("L. 441-10");
    expect(r.body).toContain("D. 441-5");
    expect(r.body).toContain("40 €");
    expect(r.body).toContain("Code de commerce");
  });

  it("body référence la date de la relance palier 1", () => {
    const r = renderReminder(2, ctxLevel2);
    // level1SentAt = 2026-04-16
    expect(r.body).toContain("16 avril 2026");
  });

  it("throw si level1SentAt manquant pour palier 2", () => {
    // Cas runtime : un appelant force un cast et passe un ctx incomplet.
    // Le typing TS empêche déjà ce cas à la compilation (level1SentAt: string requis),
    // mais on garde une garde runtime pour défense en profondeur.
    const incomplete = { invoice: baseInvoice, company: baseCompany, asOf: baseAsOf };
    expect(() =>
      renderReminder(2, incomplete as unknown as ReminderContextLevel2),
    ).toThrow(/level1SentAt is required/);
  });
});
