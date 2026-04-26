"""Decision Engine — rule-based insights from a financial state.

Rules are deterministic and independently testable. Each rule returns zero or
more Insights. The engine composes all rule outputs into a list.

Adding a new rule:
  1. Write a `_check_<something>` method that takes (state, txs) and returns list[Insight].
  2. Register it in `evaluate()`.
  3. Write a unit test.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from bomatech_engines.decision.models import AlertLevel, AlertType, Insight
from bomatech_engines.financial_state.models import (
    FinancialState,
    Transaction,
    TxKind,
)


class DecisionEngine:
    """Thresholds are class attributes so they can be tuned per company later."""

    # Concentration
    CONCENTRATION_WARNING = 0.30  # top client >= 30% of revenue
    CONCENTRATION_CRITICAL = 0.50

    # Runway
    RUNWAY_CRITICAL_MONTHS = 3.0
    RUNWAY_WARNING_MONTHS = 6.0

    # Cost anomaly (comparing last 90d vs previous 90d)
    COST_GROWTH_WARNING = 0.50  # +50%
    COST_GROWTH_CRITICAL = 1.00  # +100%
    COST_MIN_AMOUNT_CENTS = 10_000  # ignore tiny categories (< 100€)

    # Payment delay
    PAYMENT_DELAY_WARNING_DAYS = 10  # > contract terms by 10+ days on average

    def evaluate(
        self,
        state: FinancialState,
        transactions: list[Transaction],
    ) -> list[Insight]:
        """Return all insights currently detectable from state + recent transactions."""
        insights: list[Insight] = []
        insights.extend(self._check_runway(state))
        insights.extend(self._check_concentration(state, transactions))
        insights.extend(self._check_margin(state))
        insights.extend(self._check_cost_anomalies(state, transactions))
        insights.extend(self._check_positive_signals(state))
        return insights

    # ---- Individual rules ----

    def _check_runway(self, s: FinancialState) -> list[Insight]:
        if s.runway_months is None:
            return []

        if s.runway_months < self.RUNWAY_CRITICAL_MONTHS:
            level = AlertLevel.CRITICAL
            title = "Trésorerie critique sous 3 mois"
        elif s.runway_months < self.RUNWAY_WARNING_MONTHS:
            level = AlertLevel.WARNING
            title = "Runway tendue"
        else:
            return []

        return [
            Insight(
                company_id=s.company_id,
                level=level,
                type=AlertType.RUNWAY_SHORT,
                title=title,
                facts={
                    "runway_months": s.runway_months,
                    "cash_cents": s.cash_cents,
                    "burn_rate_monthly_cents": s.burn_rate_monthly_cents,
                },
            )
        ]

    def _check_concentration(
        self, s: FinancialState, transactions: list[Transaction]
    ) -> list[Insight]:
        if s.top_client_share_pct < self.CONCENTRATION_WARNING:
            return []
        if not s.top_client_name:
            return []

        level = (
            AlertLevel.CRITICAL
            if s.top_client_share_pct >= self.CONCENTRATION_CRITICAL
            else AlertLevel.WARNING
        )

        # Find the related transaction IDs for source_refs
        client_tx_ids = [
            t.id
            for t in transactions
            if t.counterparty == s.top_client_name
            and t.kind == TxKind.REVENUE
            and 0 <= (s.as_of - t.date).days <= 90
        ]

        return [
            Insight(
                company_id=s.company_id,
                level=level,
                type=AlertType.CONCENTRATION,
                title=f"Dépendance client forte : {s.top_client_name}",
                facts={
                    "client": s.top_client_name,
                    "share_pct": s.top_client_share_pct,
                    "revenue_90d_cents": s.revenue_90d,
                    "client_revenue_cents": int(
                        s.revenue_90d * s.top_client_share_pct
                    ),
                },
                source_refs=client_tx_ids[:10],
            )
        ]

    def _check_margin(self, s: FinancialState) -> list[Insight]:
        if s.revenue_90d == 0:
            return []

        if s.operating_margin_pct < 0:
            return [
                Insight(
                    company_id=s.company_id,
                    level=AlertLevel.CRITICAL,
                    type=AlertType.MARGIN_NEGATIVE,
                    title="Marge opérationnelle négative",
                    facts={
                        "operating_margin_pct": s.operating_margin_pct,
                        "gross_margin_pct": s.gross_margin_pct,
                        "revenue_90d_cents": s.revenue_90d,
                        "costs_90d_cents": s.costs_var_90d + s.costs_fix_90d,
                    },
                )
            ]
        return []

    def _check_cost_anomalies(
        self, s: FinancialState, transactions: list[Transaction]
    ) -> list[Insight]:
        """Detect expense categories that grew by >50% vs previous 90d."""
        window_90d: dict[str, int] = defaultdict(int)
        window_prev: dict[str, int] = defaultdict(int)

        for t in transactions:
            if t.kind not in (TxKind.COST_FIX, TxKind.COST_VAR) or t.category is None:
                continue
            age = (s.as_of - t.date).days
            if 0 <= age <= 90:
                window_90d[t.category] += abs(t.amount_cents)
            elif 91 <= age <= 180:
                window_prev[t.category] += abs(t.amount_cents)

        insights: list[Insight] = []
        for category, recent in window_90d.items():
            previous = window_prev.get(category, 0)
            if (
                recent < self.COST_MIN_AMOUNT_CENTS
                or previous < self.COST_MIN_AMOUNT_CENTS
            ):
                continue
            growth = (recent - previous) / previous
            if growth < self.COST_GROWTH_WARNING:
                continue

            level = (
                AlertLevel.CRITICAL
                if growth >= self.COST_GROWTH_CRITICAL
                else AlertLevel.WARNING
            )

            insights.append(
                Insight(
                    company_id=s.company_id,
                    level=level,
                    type=AlertType.COST_ANOMALY,
                    title=f"Charge '{category}' en forte hausse",
                    facts={
                        "category": category,
                        "growth_pct": round(growth, 4),
                        "recent_90d_cents": recent,
                        "previous_90d_cents": previous,
                    },
                )
            )
        return insights

    def _check_positive_signals(self, s: FinancialState) -> list[Insight]:
        """Opposite of alarming things — surface good news too."""
        out: list[Insight] = []
        if s.gross_margin_pct > 0.4:
            out.append(
                Insight(
                    company_id=s.company_id,
                    level=AlertLevel.POSITIVE,
                    type=AlertType.MARGIN_IMPROVING,
                    title="Marge brute au-dessus de 40%",
                    facts={
                        "gross_margin_pct": s.gross_margin_pct,
                        "revenue_90d_cents": s.revenue_90d,
                    },
                )
            )
        return out

    # ---- Placeholder for payment delay rule (needs invoice/payment linking) ----

    def _check_payment_delays(
        self, s: FinancialState, transactions: list[Transaction]
    ) -> list[Insight]:
        """Detect clients paying systematically late.

        Requires linking invoices (issue date) to payments (receipt date).
        Not implemented in MVP — placeholder for v2.
        """
        return []


def _days_between(a: date, b: date) -> int:
    """Helper kept for future use in payment delay rule."""
    return abs((a - b).days) if isinstance(a - b, timedelta) else 0
