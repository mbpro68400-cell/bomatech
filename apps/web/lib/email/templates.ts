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
