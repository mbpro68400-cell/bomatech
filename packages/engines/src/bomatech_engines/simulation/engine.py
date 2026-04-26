"""Simulation Engine — applies a scenario delta to a baseline projection."""

from __future__ import annotations

from bomatech_engines.financial_state.models import FinancialState
from bomatech_engines.forecast.engine import ForecastEngine
from bomatech_engines.forecast.models import HistoryPoint, MonthlyPoint
from bomatech_engines.simulation.models import (
    Scenario,
    ScenarioSummary,
    SimulationResult,
)


class SimulationEngine:
    """Composes ForecastEngine and applies scenario deltas."""

    def __init__(self, forecast_engine: ForecastEngine | None = None) -> None:
        self.forecast = forecast_engine or ForecastEngine()

    def run(
        self,
        state: FinancialState,
        history: list[HistoryPoint],
        scenario: Scenario,
    ) -> SimulationResult:
        """Produce baseline + scenario trajectories and a diff summary."""
        baseline = self.forecast.project(state, history, months=scenario.horizon_months)
        scenario_points = self._apply_scenario(state, baseline, scenario)
        summary = self._summarize(state, baseline, scenario_points, scenario)
        return SimulationResult(
            baseline=baseline,
            scenario=scenario_points,
            summary=summary,
        )

    # ---- Internals ----

    def _apply_scenario(
        self,
        state: FinancialState,
        baseline: list[MonthlyPoint],
        sc: Scenario,
    ) -> list[MonthlyPoint]:
        """Transform a baseline trajectory by applying scenario deltas.

        Key invariant: with all deltas = 0, the scenario trajectory equals the
        baseline trajectory. This keeps the UI honest — changing a slider to 0
        and back should not produce different numbers.
        """
        # Starting cash is reduced by any one-shot capex
        cash = state.cash_cents - sc.one_shot_capex_cents

        extra_fixed_monthly = sc.recurring_charges_delta_cents + (
            sc.new_hire_monthly_cost_cents or 0
        )
        margin_delta = sc.gross_margin_delta_pts / 100.0
        base_margin = state.gross_margin_pct

        result: list[MonthlyPoint] = []
        for i, base in enumerate(baseline):
            # 1. Adjust revenue
            rev = int(base.revenue_cents * (1.0 + sc.revenue_delta_pct))
            if sc.lost_client_share_pct is not None and i >= 1:
                rev = int(rev * (1.0 - sc.lost_client_share_pct))

            # 2. Decompose baseline costs into variable + fixed
            #    Variable is estimated from baseline revenue × (1 - margin).
            baseline_costs = base.revenue_cents - base.net_cents
            baseline_variable = int(base.revenue_cents * (1.0 - base_margin))
            baseline_fixed = baseline_costs - baseline_variable

            # 3. Apply scenario changes
            new_variable = int(rev * (1.0 - base_margin - margin_delta))
            new_fixed = baseline_fixed + extra_fixed_monthly

            net = rev - new_variable - new_fixed
            cash += net

            result.append(
                MonthlyPoint(
                    month_index=i,
                    cash_cents=cash,
                    revenue_cents=rev,
                    net_cents=net,
                )
            )
        return result

    def _summarize(
        self,
        state: FinancialState,
        baseline: list[MonthlyPoint],
        scenario: list[MonthlyPoint],
        _sc: Scenario,
    ) -> ScenarioSummary:
        end_base = baseline[-1].cash_cents
        end_sc = scenario[-1].cash_cents
        min_point = min(scenario, key=lambda p: p.cash_cents)

        # New runway estimate based on average negative net in scenario
        negatives = [abs(p.net_cents) for p in scenario if p.net_cents < 0]
        if negatives:
            avg_burn = sum(negatives) / len(negatives)
            new_runway: float | None = round(state.cash_cents / avg_burn, 2)
        else:
            new_runway = None  # no burn — effectively infinite

        base_runway = state.runway_months

        if base_runway is not None and new_runway is not None:
            runway_delta: float | None = round(new_runway - base_runway, 2)
        else:
            runway_delta = None

        # Risk assessment
        if min_point.cash_cents < 0:
            risk: str = "critical"
        elif min_point.cash_cents < int(state.cash_cents * 0.3):
            risk = "tight"
        else:
            risk = "safe"

        delta_pct = ((end_sc - end_base) / end_base) if end_base else 0.0

        return ScenarioSummary(
            end_cash_baseline_cents=end_base,
            end_cash_scenario_cents=end_sc,
            end_cash_delta_cents=end_sc - end_base,
            end_cash_delta_pct=round(delta_pct, 4),
            runway_baseline_months=base_runway,
            runway_scenario_months=new_runway,
            runway_delta_months=runway_delta,
            min_cash_cents=min_point.cash_cents,
            min_cash_month=min_point.month_index,
            risk_level=risk,  # type: ignore[arg-type]
        )
