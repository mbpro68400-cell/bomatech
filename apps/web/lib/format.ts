/**
 * French formatting helpers. All monetary values are in cents (integer).
 */

const CURRENCY = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

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
