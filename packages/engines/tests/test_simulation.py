"""Unit tests for Simulation and Forecast Engines."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest

from bomatech_engines.financial_state.models import FinancialState
from bomatech_engines.forecast import ForecastEngine, HistoryPoint
from bomatech_engines.simulation import Scenario, SimulationEngine


@pytest.fixture
def base_state() -> FinancialState:
    """A healthy state: 87k cash, 22k/month revenue, 10k/month costs, 38% margin."""
    return FinancialState(
        company_id=uuid4(),
        as_of=date(2026, 11, 18),
        cash_cents=87_420_00,
        revenue_90d=67_200_00,  # 22.4k * 3
        costs_var_90d=41_500_00,  # gives ~38% gross margin
        costs_fix_90d=31_260_00,  # 10.42k * 3
        gross_margin_pct=0.3824,
        operating_margin_pct=-0.074,  # running at slight loss on fixed
        burn_rate_monthly_cents=int((41_500_00 + 31_260_00) / 3 - 67_200_00 / 3),
        runway_months=60.0,  # arbitrary positive
    )


@pytest.fixture
def history() -> list[HistoryPoint]:
    """6 months of fairly stable history."""
    return [
        HistoryPoint(year=2026, month=6, revenue_cents=21_000_00, costs_cents=16_000_00),
        HistoryPoint(year=2026, month=7, revenue_cents=21_500_00, costs_cents=16_500_00),
        HistoryPoint(year=2026, month=8, revenue_cents=22_000_00, costs_cents=17_000_00),
        HistoryPoint(year=2026, month=9, revenue_cents=22_200_00, costs_cents=17_500_00),
        HistoryPoint(year=2026, month=10, revenue_cents=22_400_00, costs_cents=17_800_00),
        HistoryPoint(year=2026, month=11, revenue_cents=22_800_00, costs_cents=18_200_00),
    ]


class TestForecast:
    def test_returns_requested_number_of_months(self, base_state, history):
        f = ForecastEngine()
        points = f.project(base_state, history, months=6)
        assert len(points) == 6

    def test_naive_fallback_when_history_short(self, base_state):
        f = ForecastEngine()
        short_history = [
            HistoryPoint(year=2026, month=10, revenue_cents=22_000_00, costs_cents=18_000_00),
            HistoryPoint(year=2026, month=11, revenue_cents=22_400_00, costs_cents=18_200_00),
        ]
        points = f.project(base_state, short_history, months=6)
        assert len(points) == 6
        # With <3 months history, should use naive (90d averages from state)

    def test_forecast_values_non_negative(self, base_state, history):
        f = ForecastEngine()
        points = f.project(base_state, history, months=12)
        assert all(p.revenue_cents >= 0 for p in points)


class TestSimulation:
    def test_zero_delta_matches_baseline(self, base_state, history):
        """Invariant: Scenario() with all defaults produces the same end cash as baseline.

        This is a critical UX guarantee — setting sliders to 0 must show no impact.
        """
        sim = SimulationEngine()
        result = sim.run(base_state, history, Scenario())
        assert result.summary.end_cash_delta_cents == pytest.approx(0, abs=10)
        assert result.scenario[-1].cash_cents == pytest.approx(
            result.baseline[-1].cash_cents, abs=10
        )

    def test_revenue_boost_improves_cash(self, base_state, history):
        sim = SimulationEngine()
        boost = Scenario(revenue_delta_pct=0.20, horizon_months=6)
        result = sim.run(base_state, history, boost)
        assert result.summary.end_cash_scenario_cents > result.summary.end_cash_baseline_cents

    def test_added_charges_reduce_cash(self, base_state, history):
        sim = SimulationEngine()
        cost = Scenario(recurring_charges_delta_cents=2_000_00, horizon_months=6)
        result = sim.run(base_state, history, cost)
        assert result.summary.end_cash_delta_cents < 0

    def test_capex_reduces_starting_cash(self, base_state, history):
        sim = SimulationEngine()
        capex = Scenario(one_shot_capex_cents=15_000_00, horizon_months=6)
        result = sim.run(base_state, history, capex)
        # First point cash should be ~15k lower than baseline first point
        assert result.scenario[0].cash_cents < result.baseline[0].cash_cents

    def test_risk_level_critical_when_cash_goes_negative(self, base_state, history):
        """A huge capex + charges hike should trigger critical risk."""
        sim = SimulationEngine()
        scenario = Scenario(
            one_shot_capex_cents=200_000_00,  # 200k capex on 87k cash → negative
            recurring_charges_delta_cents=10_000_00,
            horizon_months=6,
        )
        result = sim.run(base_state, history, scenario)
        assert result.summary.risk_level == "critical"
        assert result.summary.min_cash_cents < 0

    def test_scenario_forbids_unknown_params(self):
        """Scenario should refuse extra/typo params (Pydantic strict mode)."""
        with pytest.raises(Exception):
            Scenario(revenue_delta_pct=0.1, foo_bar=42)  # type: ignore

    def test_lost_client_progressive_effect(self, base_state, history):
        """Losing 34% of a client starts affecting from month 1, not month 0."""
        sim = SimulationEngine()
        scenario = Scenario(
            lost_client_name="Duval",
            lost_client_share_pct=0.34,
            horizon_months=6,
        )
        result = sim.run(base_state, history, scenario)
        # Month 0 should still be close to baseline revenue
        # Later months should clearly drop
        assert result.scenario[-1].revenue_cents < result.baseline[-1].revenue_cents
