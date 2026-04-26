/**
 * Decision Engine — rule-based insights from a financial state.
 * TypeScript port of packages/engines/decision/engine.py.
 */

import type {
  AlertLevel,
  AlertType,
  FinancialState,
  Insight,
  Transaction,
} from "./types";

const THRESHOLDS = {
  CONCENTRATION_WARNING: 0.30,
  CONCENTRATION_CRITICAL: 0.50,
  RUNWAY_CRITICAL_MONTHS: 3.0,
  RUNWAY_WARNING_MONTHS: 6.0,
  COST_GROWTH_WARNING: 0.50,
  COST_GROWTH_CRITICAL: 1.00,
  COST_MIN_AMOUNT_CENTS: 10_000,
} as const;

function makeInsight(args: Omit<Insight, "id" | "detected_at" | "dismissed" | "message" | "source_refs"> & { source_refs?: string[] }): Insight {
  return {
    id: crypto.randomUUID(),
    detected_at: new Date().toISOString(),
    dismissed: false,
    message: "",
    source_refs: args.source_refs ?? [],
    ...args,
  };
}

export function evaluateInsights(
  state: FinancialState,
  transactions: Transaction[],
): Insight[] {
  const insights: Insight[] = [];

  // Runway
  if (state.runway_months !== null) {
    if (state.runway_months < THRESHOLDS.RUNWAY_CRITICAL_MONTHS) {
      insights.push(
        makeInsight({
          company_id: state.company_id,
          level: "critical" as AlertLevel,
          type: "runway_short" as AlertType,
          title: "Trésorerie critique sous 3 mois",
          facts: {
            runway_months: state.runway_months,
            cash_cents: state.cash_cents,
            burn_rate_monthly_cents: state.burn_rate_monthly_cents,
          },
        }),
      );
    } else if (state.runway_months < THRESHOLDS.RUNWAY_WARNING_MONTHS) {
      insights.push(
        makeInsight({
          company_id: state.company_id,
          level: "warning",
          type: "runway_short",
          title: "Runway tendue",
          facts: {
            runway_months: state.runway_months,
            cash_cents: state.cash_cents,
            burn_rate_monthly_cents: state.burn_rate_monthly_cents,
          },
        }),
      );
    }
  }

  // Concentration
  if (state.top_client_share_pct >= THRESHOLDS.CONCENTRATION_WARNING && state.top_client_name) {
    const level: AlertLevel =
      state.top_client_share_pct >= THRESHOLDS.CONCENTRATION_CRITICAL ? "critical" : "warning";
    insights.push(
      makeInsight({
        company_id: state.company_id,
        level,
        type: "concentration",
        title: `Dépendance client forte : ${state.top_client_name}`,
        facts: {
          client: state.top_client_name,
          share_pct: state.top_client_share_pct,
          revenue_90d_cents: state.revenue_90d,
          client_revenue_cents: Math.floor(state.revenue_90d * state.top_client_share_pct),
        },
      }),
    );
  }

  // Margin
  if (state.revenue_90d > 0 && state.operating_margin_pct < 0) {
    insights.push(
      makeInsight({
        company_id: state.company_id,
        level: "critical",
        type: "margin_negative",
        title: "Marge opérationnelle négative",
        facts: {
          operating_margin_pct: state.operating_margin_pct,
          gross_margin_pct: state.gross_margin_pct,
          revenue_90d_cents: state.revenue_90d,
          costs_90d_cents: state.costs_var_90d + state.costs_fix_90d,
        },
      }),
    );
  }

  // Cost anomalies
  insights.push(...detectCostAnomalies(state, transactions));

  // Positive signals
  if (state.gross_margin_pct > 0.4) {
    insights.push(
      makeInsight({
        company_id: state.company_id,
        level: "positive",
        type: "margin_improving",
        title: "Marge brute au-dessus de 40 %",
        facts: {
          gross_margin_pct: state.gross_margin_pct,
          revenue_90d_cents: state.revenue_90d,
        },
      }),
    );
  }

  return insights;
}

function detectCostAnomalies(
  state: FinancialState,
  transactions: Transaction[],
): Insight[] {
  const window90d = new Map<string, number>();
  const windowPrev = new Map<string, number>();

  const asOfMs = new Date(state.as_of).getTime();
  const day = 1000 * 60 * 60 * 24;

  for (const t of transactions) {
    if (t.kind !== "cost_fix" && t.kind !== "cost_var") continue;
    if (!t.category) continue;

    const ageDays = Math.floor((asOfMs - new Date(t.date).getTime()) / day);
    if (ageDays >= 0 && ageDays <= 90) {
      window90d.set(t.category, (window90d.get(t.category) ?? 0) + Math.abs(t.amount_cents));
    } else if (ageDays >= 91 && ageDays <= 180) {
      windowPrev.set(t.category, (windowPrev.get(t.category) ?? 0) + Math.abs(t.amount_cents));
    }
  }

  const insights: Insight[] = [];
  for (const [category, recent] of window90d) {
    const previous = windowPrev.get(category) ?? 0;
    if (recent < THRESHOLDS.COST_MIN_AMOUNT_CENTS || previous < THRESHOLDS.COST_MIN_AMOUNT_CENTS) {
      continue;
    }
    const growth = (recent - previous) / previous;
    if (growth < THRESHOLDS.COST_GROWTH_WARNING) continue;

    const level: AlertLevel =
      growth >= THRESHOLDS.COST_GROWTH_CRITICAL ? "critical" : "warning";
    insights.push(
      makeInsight({
        company_id: state.company_id,
        level,
        type: "cost_anomaly",
        title: `Charge '${category}' en forte hausse`,
        facts: {
          category,
          growth_pct: Math.round(growth * 10000) / 10000,
          recent_90d_cents: recent,
          previous_90d_cents: previous,
        },
      }),
    );
  }

  return insights;
}
