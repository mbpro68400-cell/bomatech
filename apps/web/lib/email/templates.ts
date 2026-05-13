/**
 * Templates email FR pour les relances de factures impayées (1.6.5).
 *
 * Pas de stockage DB des templates en V1 : ils vivent en dur ici, modifiables
 * uniquement par release. Le résultat est snapshoté dans
 * invoice_reminders.subject/body au moment de l'envoi, donc même si on change
 * un template plus tard, l'historique conserve le mail réellement envoyé.
 *
 * Paliers V1 :
 *   1 = amiable, déclenché à due_at + 15 jours
 *   2 = mise en demeure, déclenché à due_at + 30 jours (articles L.441-10 et
 *       D.441-5 du Code de commerce, indemnité forfaitaire 40 €)
 */

import { formatDateLong, formatEurosPrecise } from "../format";
import type { Supplier, SupplierAlert } from "../engines/types";

interface ReminderInvoice {
  number: string;
  amount_ttc_cents: number;
  issued_at: string; // ISO date YYYY-MM-DD
  due_at: string;
}

interface ReminderCompany {
  name: string;
}

/** Contexte palier 1 : pas de date de relance précédente requise. */
export interface ReminderContextLevel1 {
  invoice: ReminderInvoice;
  company: ReminderCompany;
  /** Date de référence pour les calculs de jours de retard. Défaut = now(). */
  asOf?: Date;
}

/** Contexte palier 2 : la date d'envoi du palier 1 est obligatoire (référence légale dans le corps). */
export interface ReminderContextLevel2 {
  invoice: ReminderInvoice;
  company: ReminderCompany;
  /** Date d'envoi de la relance palier 1 (ISO YYYY-MM-DD). REQUIS pour le palier 2. */
  level1SentAt: string;
  asOf?: Date;
}

/** Conservé pour compatibilité externe. Préférer les types discriminés ci-dessus. */
export type ReminderTemplateContext = ReminderContextLevel1 | ReminderContextLevel2;

export interface RenderedReminder {
  subject: string;
  body: string;
}

/** Calcule le nombre de jours entiers entre due_at et asOf (positif si en retard). */
function daysSince(due_at: string, asOf: Date): number {
  const due = new Date(due_at + "T00:00:00Z");
  const ref = new Date(asOf.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.floor((ref.getTime() - due.getTime()) / 86_400_000);
}

// Surcharges : on force level1SentAt requis quand level === 2.
export function renderReminder(level: 1, ctx: ReminderContextLevel1): RenderedReminder;
export function renderReminder(level: 2, ctx: ReminderContextLevel2): RenderedReminder;
export function renderReminder(
  level: 1 | 2,
  ctx: ReminderContextLevel1 | ReminderContextLevel2,
): RenderedReminder {
  const asOf = ctx.asOf ?? new Date();
  const ttc = formatEurosPrecise(ctx.invoice.amount_ttc_cents);
  const issuedAtFr = formatDateLong(ctx.invoice.issued_at);
  const dueAtFr = formatDateLong(ctx.invoice.due_at);
  const nJours = daysSince(ctx.invoice.due_at, asOf);

  if (level === 1) {
    return {
      subject: `Rappel — facture ${ctx.invoice.number} en attente de règlement`,
      body: [
        `Bonjour,`,
        ``,
        `Sauf erreur de notre part, la facture n°${ctx.invoice.number} d'un montant de ${ttc} TTC, émise le ${issuedAtFr} et échue le ${dueAtFr}, reste à ce jour impayée.`,
        ``,
        `Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais. Si ce paiement a déjà été effectué, merci d'ignorer ce message.`,
        ``,
        `Pour toute question, n'hésitez pas à nous répondre directement sur cet email.`,
        ``,
        `Cordialement,`,
        ctx.company.name,
      ].join("\n"),
    };
  }

  // level === 2 — mise en demeure : level1SentAt est requis par les types ET garde runtime.
  const ctx2 = ctx as ReminderContextLevel2;
  if (!ctx2.level1SentAt) {
    throw new Error(
      "renderReminder(2): level1SentAt is required (date d'envoi du palier 1)",
    );
  }
  const datePalier1Fr = formatDateLong(ctx2.level1SentAt);
  return {
    subject: `Mise en demeure — facture ${ctx.invoice.number} impayée depuis ${nJours} jours`,
    body: [
      `Madame, Monsieur,`,
      ``,
      `Malgré notre relance du ${datePalier1Fr}, la facture n°${ctx.invoice.number} d'un montant de ${ttc} TTC, échue le ${dueAtFr}, demeure impayée à ce jour (${nJours} jours de retard).`,
      ``,
      `Nous vous mettons en demeure de procéder au règlement intégral sous 8 jours à compter de la réception du présent courrier.`,
      ``,
      `À défaut, nous nous réservons le droit d'engager toute procédure de recouvrement, ainsi que l'application des pénalités de retard et de l'indemnité forfaitaire de 40 € prévues par les articles L. 441-10 et D. 441-5 du Code de commerce.`,
      ``,
      `Cordialement,`,
      ctx.company.name,
    ].join("\n"),
  };
}

// ============================================================
// 1.9 — Digest veille fournisseurs (alertes critical uniquement)
// ============================================================
// Le digest est éphémère : non snapshoté en DB. Si retry, on régénère
// à partir des alertes critical avec email_sent_at IS NULL. La table
// supplier_alerts n'a donc pas de colonnes subject/body (cf 0007).

// URLs hardcodées V1 — à externaliser en NEXT_PUBLIC_APP_URL en V1.5
// (cf ROADMAP « limites V1 1.9 »).
const BOMATECH_APP_URL = "https://bomatech.vercel.app";
const BODACC_URL = "https://www.bodacc.fr";

/** Alerte enrichie avec un sous-ensemble de son supplier pour le rendu. */
export type AlertWithSupplier = SupplierAlert & {
  supplier: Pick<Supplier, "id" | "name" | "siren">;
};

export interface RenderedSupplierDigest {
  subject: string;
  body: string;
}

function assertAllCritical(alerts: AlertWithSupplier[]): void {
  for (const a of alerts) {
    if (a.severity !== "critical") {
      throw new Error(
        "supplierAlertDigestTemplate: only critical alerts are accepted",
      );
    }
  }
}

function eventLabel(alert: AlertWithSupplier): string {
  const p = alert.payload as Record<string, unknown>;
  switch (alert.event_type) {
    case "procedure_collective_opened": {
      const kind = typeof p.kind === "string" ? p.kind : "non précisée";
      return `ouverture de procédure collective (${kind})`;
    }
    case "procedure_collective_judgment": {
      const kind = typeof p.kind === "string" ? p.kind : "non précisé";
      return `jugement : ${kind}`;
    }
    case "cessation":
      return "cessation d'activité déclarée";
    case "radiation":
      return "radiation du RCS";
    default:
      // Cas garde-fou : assertAllCritical doit normalement avoir filtré.
      throw new Error(
        "supplierAlertDigestTemplate: only critical alerts are accepted",
      );
  }
}

/**
 * Detail dépendant du payload. Retourne null si le payload n'a pas les
 * champs attendus — la ligne est alors omise (pas de "[manquant]" ni
 * "undefined" affichés à l'utilisateur).
 */
function eventDetail(alert: AlertWithSupplier): string | null {
  const p = alert.payload as Record<string, unknown>;
  switch (alert.event_type) {
    case "procedure_collective_opened": {
      const date =
        typeof p.judgment_date === "string" ? p.judgment_date : null;
      const tribunal = typeof p.tribunal === "string" ? p.tribunal : null;
      if (!date && !tribunal) return null;
      const parts: string[] = [];
      if (date) parts.push(`Date du jugement : ${formatDateLong(date)}`);
      if (tribunal) parts.push(`Tribunal : ${tribunal}`);
      return parts.join(". ") + ".";
    }
    case "procedure_collective_judgment": {
      const date =
        typeof p.judgment_date === "string" ? p.judgment_date : null;
      if (!date) return null;
      return `Date : ${formatDateLong(date)}.`;
    }
    case "cessation": {
      const date =
        typeof p.effective_date === "string" ? p.effective_date : null;
      if (!date) return null;
      return `Date effective : ${formatDateLong(date)}.`;
    }
    case "radiation": {
      const date =
        typeof p.radiation_date === "string" ? p.radiation_date : null;
      if (!date) return null;
      return `Date de radiation : ${formatDateLong(date)}.`;
    }
    default:
      return null;
  }
}

function buildIntroAdaptative(numAlerts: number, numSuppliers: number): string {
  if (numAlerts === 1 && numSuppliers === 1) {
    return "un événement critique sur 1 fournisseur";
  }
  if (numAlerts > 1 && numSuppliers === 1) {
    return `${numAlerts} événements critiques sur 1 fournisseur`;
  }
  if (numAlerts === 1 && numSuppliers > 1) {
    return `1 événement critique réparti sur ${numSuppliers} fournisseurs`;
  }
  return `${numAlerts} événements critiques sur ${numSuppliers} fournisseurs`;
}

function buildSubject(alerts: AlertWithSupplier[]): string {
  const supplierIds = new Set(alerts.map((a) => a.supplier.id));
  const numSuppliers = supplierIds.size;
  const numAlerts = alerts.length;
  if (numSuppliers === 1 && numAlerts === 1) {
    return `Alerte fournisseur : ${alerts[0].supplier.name} — ${eventLabel(alerts[0])}`;
  }
  if (numSuppliers === 1 && numAlerts > 1) {
    return `Alerte fournisseur : ${alerts[0].supplier.name} — ${numAlerts} événements détectés`;
  }
  return `Veille fournisseurs : ${numAlerts} alertes critiques sur ${numSuppliers} fournisseurs`;
}

/**
 * Groupe les alertes par supplier en préservant l'ordre d'apparition
 * (Map preserve insertion order). Le caller (P6) est responsable de
 * passer un tableau pré-ordonné.
 */
function groupBySupplier(
  alerts: AlertWithSupplier[],
): Map<string, AlertWithSupplier[]> {
  const map = new Map<string, AlertWithSupplier[]>();
  for (const a of alerts) {
    const arr = map.get(a.supplier.id) ?? [];
    arr.push(a);
    map.set(a.supplier.id, arr);
  }
  return map;
}

/**
 * Rend un digest email FR pour les alertes critical d'une company.
 *
 * @param companyName  Nom de la société destinataire (pour personnalisation intro).
 * @param alerts       Alertes pré-filtrées et pré-ordonnées par le caller.
 *                     Doivent être TOUTES `severity === 'critical'` (sinon throw).
 *
 * Subject adaptatif selon (nbAlertes, nbFournisseurs). Body texte brut
 * ~72 chars de large, signature "L'équipe Bomatech / contact@bomatech.fr".
 *
 * Limites V1 (à documenter ROADMAP) : texte brut uniquement, pas d'unsubscribe
 * one-click RFC 8058, pas de tracking, digest identique pour owner et admin.
 */
export function supplierAlertDigestTemplate(
  companyName: string,
  alerts: AlertWithSupplier[],
): RenderedSupplierDigest {
  assertAllCritical(alerts);

  const grouped = groupBySupplier(alerts);
  const numAlerts = alerts.length;
  const numSuppliers = grouped.size;

  const blocks: string[] = [];
  for (const group of grouped.values()) {
    const supplier = group[0].supplier;
    const lines: string[] = [];
    lines.push(`▸ ${supplier.name} (SIREN ${supplier.siren})`);
    for (const alert of group) {
      const detectedAt = formatDateLong(alert.created_at.slice(0, 10));
      lines.push(`   ${eventLabel(alert)} (détecté le ${detectedAt})`);
      const detail = eventDetail(alert);
      if (detail) lines.push(`   ${detail}`);
    }
    blocks.push(lines.join("\n"));
  }

  const intro = buildIntroAdaptative(numAlerts, numSuppliers);

  const body = [
    "Bonjour,",
    "",
    `Bomatech a détecté ${intro} pour la société ${companyName}.`,
    "",
    blocks.join("\n\n"),
    "",
    "Que faire :",
    "  - Consulter le détail dans Bomatech :",
    `    ${BOMATECH_APP_URL}/suppliers`,
    "  - Vérifier la publication officielle sur le BODACC :",
    `    ${BODACC_URL}`,
    "  - Le cas échéant, prendre contact avec le fournisseur pour",
    "    confirmer la situation avant toute décision commerciale.",
    "",
    "Note : ces alertes proviennent des bases Pappers et BODACC. Elles",
    "n'ont pas de valeur juridique probante et peuvent présenter jusqu'à",
    "24 heures de retard. Pour les démarches officielles, vérifiez",
    "directement sur le BODACC.",
    "",
    "—",
    "Bomatech traite vos données fournisseurs (raison sociale, SIREN,",
    "dirigeants publics) sur la base de votre intérêt légitime à",
    "surveiller la santé juridique de vos relations commerciales.",
    "Sources : registres publics RCS via Pappers, annonces officielles",
    "via BODACC. Aucun profilage. Pour exercer vos droits (accès,",
    "rectification, opposition), écrivez à contact@bomatech.fr.",
    "",
    "Cordialement,",
    "",
    "—",
    "L'équipe Bomatech",
    "contact@bomatech.fr",
  ].join("\n");

  return { subject: buildSubject(alerts), body };
}
