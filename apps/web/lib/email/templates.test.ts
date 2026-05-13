import { describe, expect, it } from "vitest";
import {
  renderReminder,
  supplierAlertDigestTemplate,
  type AlertWithSupplier,
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

// ============================================================
// 1.9 — supplierAlertDigestTemplate
// ============================================================

function mkAlert(p: Partial<AlertWithSupplier> = {}): AlertWithSupplier {
  return {
    id: p.id ?? "alert-1",
    supplier_id: p.supplier_id ?? "sup-1",
    company_id: p.company_id ?? "co-1",
    severity: p.severity ?? "critical",
    event_type: p.event_type ?? "procedure_collective_opened",
    payload: p.payload ?? {},
    email_sent_at: p.email_sent_at ?? null,
    dismissed_at: p.dismissed_at ?? null,
    dismissed_by_user_id: p.dismissed_by_user_id ?? null,
    created_at: p.created_at ?? "2026-05-12T10:00:00Z",
    supplier: p.supplier ?? {
      id: p.supplier_id ?? "sup-1",
      name: "Menuiserie Dupont SARL",
      siren: "123456789",
    },
  };
}

describe("supplierAlertDigestTemplate", () => {
  it("1. 1 fournisseur / 1 alerte procedure_collective_opened : subject + body complet", () => {
    const alert = mkAlert({
      event_type: "procedure_collective_opened",
      payload: {
        kind: "redressement",
        judgment_date: "2026-05-10",
        tribunal: "Tribunal de commerce de Paris",
      },
      created_at: "2026-05-12T08:30:00Z",
    });
    const r = supplierAlertDigestTemplate("Bomatech SARL", [alert]);
    expect(r.subject).toBe(
      "Alerte fournisseur : Menuiserie Dupont SARL — ouverture de procédure collective (redressement)",
    );
    expect(r.body).toContain("Menuiserie Dupont SARL");
    expect(r.body).toContain("SIREN 123456789");
    expect(r.body).toContain("10 mai 2026"); // judgment_date FR long
    expect(r.body).toContain("12 mai 2026"); // détecté le (created_at FR long)
    expect(r.body).toContain("Tribunal de commerce de Paris");
    expect(r.body).toContain("L'équipe Bomatech");
    expect(r.body).toContain("Bomatech SARL"); // companyName interpolé
  });

  it("2. 1 fournisseur / 2 alertes : subject pluriel, 2 lignes pour le même bloc", () => {
    const a1 = mkAlert({
      id: "a1",
      event_type: "procedure_collective_opened",
      payload: { kind: "redressement", judgment_date: "2026-05-10" },
      created_at: "2026-05-12T08:00:00Z",
    });
    const a2 = mkAlert({
      id: "a2",
      event_type: "procedure_collective_judgment",
      payload: { kind: "conversion", judgment_date: "2026-05-12" },
      created_at: "2026-05-12T08:00:00Z",
    });
    const r = supplierAlertDigestTemplate("Bomatech SARL", [a1, a2]);
    expect(r.subject).toBe(
      "Alerte fournisseur : Menuiserie Dupont SARL — 2 événements détectés",
    );
    expect(r.body).toContain("ouverture de procédure collective (redressement)");
    expect(r.body).toContain("jugement : conversion");
    // Le nom du fournisseur n'apparaît qu'UNE FOIS dans le bloc (header), pas par alerte.
    const occurrences =
      r.body.split("▸ Menuiserie Dupont SARL").length - 1;
    expect(occurrences).toBe(1);
  });

  it("3. 3 fournisseurs / 1 alerte chacun : subject N×M, ordre déterministe", () => {
    const alerts: AlertWithSupplier[] = [
      mkAlert({
        id: "a1",
        supplier_id: "sup-A",
        event_type: "cessation",
        supplier: { id: "sup-A", name: "Alpha SARL", siren: "111111111" },
      }),
      mkAlert({
        id: "a2",
        supplier_id: "sup-B",
        event_type: "radiation",
        supplier: { id: "sup-B", name: "Bravo SAS", siren: "222222222" },
      }),
      mkAlert({
        id: "a3",
        supplier_id: "sup-C",
        event_type: "procedure_collective_opened",
        payload: { kind: "sauvegarde" },
        supplier: { id: "sup-C", name: "Charlie EURL", siren: "333333333" },
      }),
    ];
    const r = supplierAlertDigestTemplate("Bomatech SARL", alerts);
    expect(r.subject).toBe(
      "Veille fournisseurs : 3 alertes critiques sur 3 fournisseurs",
    );
    expect(r.body).toContain(
      "3 événements critiques sur 3 fournisseurs",
    );
    // Ordre déterministe : Alpha puis Bravo puis Charlie dans le body.
    const idxA = r.body.indexOf("Alpha SARL");
    const idxB = r.body.indexOf("Bravo SAS");
    const idxC = r.body.indexOf("Charlie EURL");
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
    expect(idxC).toBeGreaterThan(idxB);
  });

  it("4. payload incomplet : ligne detail omise, pas d'INVALID DATE ni undefined", () => {
    const alert = mkAlert({
      event_type: "procedure_collective_opened",
      payload: { kind: "redressement" }, // ni judgment_date, ni tribunal
      created_at: "2026-05-12T08:00:00Z",
    });
    const r = supplierAlertDigestTemplate("Bomatech SARL", [alert]);
    expect(r.subject).toBe(
      "Alerte fournisseur : Menuiserie Dupont SARL — ouverture de procédure collective (redressement)",
    );
    // Le label apparaît, mais aucune ligne "Date du jugement" / "Tribunal".
    expect(r.body).toContain("ouverture de procédure collective (redressement)");
    expect(r.body).not.toContain("Date du jugement");
    expect(r.body).not.toContain("Tribunal");
    expect(r.body).not.toContain("undefined");
    expect(r.body).not.toContain("INVALID");
    expect(r.body).not.toContain("[manquant]");
    expect(r.body).not.toContain("null");
  });

  it("5. throw si le caller passe une alerte info", () => {
    const info = mkAlert({
      severity: "info",
      event_type: "dirigeant_change",
      payload: { before: [], after: [] },
    });
    expect(() => supplierAlertDigestTemplate("Bomatech SARL", [info])).toThrow(
      "supplierAlertDigestTemplate: only critical alerts are accepted",
    );
  });

  it("6. footer RGPD + URLs Bomatech/BODACC + Cordialement, texte brut sans Markdown", () => {
    const alert = mkAlert({
      event_type: "procedure_collective_opened",
      payload: { kind: "redressement", judgment_date: "2026-05-10" },
    });
    const r = supplierAlertDigestTemplate("Bomatech SARL", [alert]);

    // URLs présentes telles quelles (texte brut, pas de syntaxe Markdown).
    expect(r.body).toContain("https://bomatech.vercel.app/suppliers");
    expect(r.body).toContain("https://www.bodacc.fr");
    expect(r.body).not.toMatch(/\[.*\]\(https?:/); // pas de [text](url) markdown
    expect(r.body).not.toContain("**"); // pas de bold markdown
    expect(r.body).not.toContain("##"); // pas de heading markdown

    // Section "Que faire" présente avec les 3 puces.
    expect(r.body).toContain("Que faire :");

    // Footer RGPD : mentions clés.
    expect(r.body).toContain("intérêt légitime");
    expect(r.body).toContain("rectification");
    expect(r.body).toContain("opposition");
    expect(r.body).toContain("Aucun profilage");

    // Cordialement précède la signature "L'équipe Bomatech".
    expect(r.body).toContain("Cordialement,");
    const idxCordialement = r.body.indexOf("Cordialement,");
    const idxSignature = r.body.indexOf("L'équipe Bomatech");
    expect(idxCordialement).toBeGreaterThan(-1);
    expect(idxSignature).toBeGreaterThan(idxCordialement);
  });
});
