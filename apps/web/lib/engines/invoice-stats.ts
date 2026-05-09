/**
 * AR (Accounts Receivable) statistics engine — Phase 5.
 *
 * Pure function. Computes a summary of pending invoices (créances en cours) :
 * total à encaisser, nombre, nombre en retard, montant en retard, âge moyen
 * pondéré par montant (DSO simplifié), nombre de jours du plus vieux retard.
 *
 * V1 simplification : DSO ici = âge moyen pondéré des créances pending,
 * pas la formule académique (AR / sales × period). C'est plus intuitif
 * pour le dirigeant : "en moyenne tes clients te paient en X jours".
 * Si on veut la formule académique, ce sera V2 quand on disposera d'un
 * total facturé sur la période (qu'on n'a pas encore — le revenue dans
 * financial_state vient des transactions bancaires).
 */

import type { Invoice } from "./types";

export interface ARSummary {
  totalARCents: number;        // somme TTC des factures status='pending'
  pendingCount: number;        // nb factures pending (incl. overdue)
  overdueCount: number;        // nb factures pending dont due_at < asOf
  overdueARCents: number;      // somme TTC des overdue
  avgAgeDays: number;          // âge moyen pondéré par montant (depuis issued_at)
  oldestOverdueDays: number;   // jours de retard de la plus vieille overdue
}

export function emptyARSummary(): ARSummary {
  return {
    totalARCents: 0,
    pendingCount: 0,
    overdueCount: 0,
    overdueARCents: 0,
    avgAgeDays: 0,
    oldestOverdueDays: 0,
  };
}

export function computeARSummary(invoices: Invoice[], asOfIso: string): ARSummary {
  const today = new Date(asOfIso).getTime();
  const day = 1000 * 60 * 60 * 24;

  let totalARCents = 0;
  let overdueARCents = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let weightedAgeSum = 0;
  let oldestOverdueDays = 0;

  for (const inv of invoices) {
    if (inv.status !== "pending") continue;

    pendingCount += 1;
    totalARCents += inv.amount_ttc_cents;

    const dueDate = new Date(inv.due_at).getTime();
    const issuedDate = new Date(inv.issued_at).getTime();
    const ageDays = Math.max(0, Math.floor((today - issuedDate) / day));
    weightedAgeSum += ageDays * inv.amount_ttc_cents;

    if (dueDate < today) {
      overdueCount += 1;
      overdueARCents += inv.amount_ttc_cents;
      const overdueDays = Math.floor((today - dueDate) / day);
      if (overdueDays > oldestOverdueDays) oldestOverdueDays = overdueDays;
    }
  }

  const avgAgeDays = totalARCents > 0 ? Math.round(weightedAgeSum / totalARCents) : 0;

  return {
    totalARCents,
    pendingCount,
    overdueCount,
    overdueARCents,
    avgAgeDays,
    oldestOverdueDays,
  };
}
