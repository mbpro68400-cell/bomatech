/**
 * supplier-diff engine pur : compare deux snapshots Pappers et produit les
 * alertes typées du module Veille fournisseurs (1.9).
 *
 * Pure function — pas d'accès DB, pas d'IO. Le mapping severity ↔ event_type
 * est enforced ici via CRITICAL_EVENT_TYPES, PAS en DB (cf migration 0007
 * V1 SCOPE NOTICE).
 *
 * Règles :
 *  - oldSnapshot null (1er polling, jamais vu) → 0 alerte (pas de baseline)
 *  - snapshot identique → 0 alerte (idempotence)
 *  - sinon → 1 alerte par dimension qui a changé
 *
 * Taxonomie V1 (4 critical + 6 info) :
 *   critical : procedure_collective_opened, procedure_collective_judgment,
 *              cessation, radiation
 *   info     : dirigeant_change, comptes_published, address_change,
 *              naf_change, capital_change, legal_form_change
 */

import type {
  Dirigeant,
  PappersSnapshot,
  SupplierAlertEventType,
  SupplierAlertOutput,
  SupplierAlertSeverity,
} from "./types";

const CRITICAL_EVENT_TYPES: ReadonlySet<SupplierAlertEventType> = new Set([
  "procedure_collective_opened",
  "procedure_collective_judgment",
  "cessation",
  "radiation",
]);

function severityOf(eventType: SupplierAlertEventType): SupplierAlertSeverity {
  return CRITICAL_EVENT_TYPES.has(eventType) ? "critical" : "info";
}

function sameDirigeants(a: Dirigeant[], b: Dirigeant[]): boolean {
  if (a.length !== b.length) return false;
  const key = (d: Dirigeant) =>
    `${d.nom}|${d.prenom}|${d.qualite}|${d.depuis ?? ""}`;
  const sa = [...a].map(key).sort();
  const sb = [...b].map(key).sort();
  return sa.every((k, i) => k === sb[i]);
}

export function computeSupplierDiff(
  oldSnapshot: PappersSnapshot | null,
  newSnapshot: PappersSnapshot,
): SupplierAlertOutput[] {
  if (oldSnapshot === null) {
    return [];
  }

  const alerts: SupplierAlertOutput[] = [];

  // ---- critical events ----

  if (
    !oldSnapshot.procedure_collective.open &&
    newSnapshot.procedure_collective.open
  ) {
    alerts.push({
      severity: severityOf("procedure_collective_opened"),
      event_type: "procedure_collective_opened",
      payload: { kind: newSnapshot.procedure_collective.kind },
    });
  }

  if (
    oldSnapshot.procedure_collective.last_judgment_date !==
      newSnapshot.procedure_collective.last_judgment_date &&
    newSnapshot.procedure_collective.last_judgment_date !== null
  ) {
    alerts.push({
      severity: severityOf("procedure_collective_judgment"),
      event_type: "procedure_collective_judgment",
      payload: {
        kind: newSnapshot.procedure_collective.last_judgment_kind,
        date: newSnapshot.procedure_collective.last_judgment_date,
      },
    });
  }

  if (
    oldSnapshot.status !== "cessation" &&
    newSnapshot.status === "cessation"
  ) {
    alerts.push({
      severity: severityOf("cessation"),
      event_type: "cessation",
      payload: { before: oldSnapshot.status, after: "cessation" },
    });
  }

  if (
    oldSnapshot.status !== "radiation" &&
    newSnapshot.status === "radiation"
  ) {
    alerts.push({
      severity: severityOf("radiation"),
      event_type: "radiation",
      payload: { before: oldSnapshot.status, after: "radiation" },
    });
  }

  // ---- info events ----

  if (!sameDirigeants(oldSnapshot.dirigeants, newSnapshot.dirigeants)) {
    alerts.push({
      severity: severityOf("dirigeant_change"),
      event_type: "dirigeant_change",
      payload: {
        before: oldSnapshot.dirigeants,
        after: newSnapshot.dirigeants,
      },
    });
  }

  if (
    oldSnapshot.last_comptes_published_year !==
      newSnapshot.last_comptes_published_year &&
    newSnapshot.last_comptes_published_year !== null
  ) {
    alerts.push({
      severity: severityOf("comptes_published"),
      event_type: "comptes_published",
      payload: {
        before: oldSnapshot.last_comptes_published_year,
        after: newSnapshot.last_comptes_published_year,
      },
    });
  }

  if (oldSnapshot.address_siege !== newSnapshot.address_siege) {
    alerts.push({
      severity: severityOf("address_change"),
      event_type: "address_change",
      payload: {
        before: oldSnapshot.address_siege,
        after: newSnapshot.address_siege,
      },
    });
  }

  if (oldSnapshot.naf_code !== newSnapshot.naf_code) {
    alerts.push({
      severity: severityOf("naf_change"),
      event_type: "naf_change",
      payload: {
        before: oldSnapshot.naf_code,
        after: newSnapshot.naf_code,
      },
    });
  }

  if (oldSnapshot.capital_cents !== newSnapshot.capital_cents) {
    alerts.push({
      severity: severityOf("capital_change"),
      event_type: "capital_change",
      payload: {
        before: oldSnapshot.capital_cents,
        after: newSnapshot.capital_cents,
      },
    });
  }

  if (oldSnapshot.legal_form !== newSnapshot.legal_form) {
    alerts.push({
      severity: severityOf("legal_form_change"),
      event_type: "legal_form_change",
      payload: {
        before: oldSnapshot.legal_form,
        after: newSnapshot.legal_form,
      },
    });
  }

  return alerts;
}
