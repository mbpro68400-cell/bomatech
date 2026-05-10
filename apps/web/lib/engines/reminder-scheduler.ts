/**
 * Scheduler engine pur : décide quelles relances créer pour une facture donnée.
 *
 * Pure function — pas d'accès DB, pas d'IO. Prend l'état (invoice + reminders
 * existantes) et retourne la liste des reminders à insérer en DB.
 *
 * Règles V1 :
 *   - skip si invoice.status !== 'pending' (déjà payée ou annulée)
 *   - skip si invoice.client_email est null (pas d'adresse, pas de relance)
 *   - skip si invoice.is_closed_period (archivée, hors flow)
 *   - palier 1 : créé si due_at + 15j atteint ET pas déjà de reminder palier 1
 *   - palier 2 : créé si due_at + 30j atteint ET pas déjà de reminder palier 2
 *
 * Cas spécial : une facture oubliée peut atteindre J+30 sans avoir reçu sa
 * relance palier 1 — dans ce cas on schedule les deux paliers en même temps.
 *
 * Idempotence : `existingReminders` inclut TOUS les status (scheduled, sent,
 * failed, cancelled). Une reminder cancelled bloque la re-création (cohérent
 * avec la unique constraint DB sur (invoice_id, level)).
 */

import type { ReminderLevel } from "./types";

export interface SchedulerInvoiceInput {
  id: string;
  status: string;
  client_email: string | null | undefined;
  due_at: string; // ISO YYYY-MM-DD
  is_closed_period?: boolean;
}

export interface SchedulerExistingReminder {
  level: number;
  status: string;
}

export interface ReminderToSchedule {
  invoiceId: string;
  level: ReminderLevel;
  scheduledAt: Date;
}

const PALIER_1_DAYS = 15;
const PALIER_2_DAYS = 30;

function daysSinceDue(due_at: string, asOf: Date): number {
  const due = new Date(due_at + "T00:00:00Z");
  const ref = new Date(asOf.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.floor((ref.getTime() - due.getTime()) / 86_400_000);
}

export function computeRemindersToSchedule(
  invoice: SchedulerInvoiceInput,
  existingReminders: SchedulerExistingReminder[],
  asOf: Date,
): ReminderToSchedule[] {
  if (invoice.status !== "pending") return [];
  if (!invoice.client_email) return [];
  if (invoice.is_closed_period) return [];

  const days = daysSinceDue(invoice.due_at, asOf);
  const has = (lvl: number): boolean =>
    existingReminders.some((r) => r.level === lvl);

  const out: ReminderToSchedule[] = [];

  if (days >= PALIER_1_DAYS && !has(1)) {
    out.push({ invoiceId: invoice.id, level: 1, scheduledAt: asOf });
  }
  if (days >= PALIER_2_DAYS && !has(2)) {
    out.push({ invoiceId: invoice.id, level: 2, scheduledAt: asOf });
  }
  return out;
}
