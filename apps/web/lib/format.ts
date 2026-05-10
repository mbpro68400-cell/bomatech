/**
 * French formatting helpers. All monetary values are in cents (integer).
 */

const CURRENCY = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const CURRENCY_PRECISE = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_LONG = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

const PERCENT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatEuros(cents: number): string {
  return CURRENCY.format(cents / 100);
}

export function formatPercent(ratio: number): string {
  return PERCENT.format(ratio);
}

export function formatMonths(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  return `${rounded} mois`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "1 234,56 €" — pour les courriers formels (relances, mise en demeure). */
export function formatEurosPrecise(cents: number): string {
  return CURRENCY_PRECISE.format(cents / 100);
}

/** "8 mai 2026" — format long pour les emails formels. */
export function formatDateLong(iso: string): string {
  return DATE_LONG.format(new Date(iso));
}
