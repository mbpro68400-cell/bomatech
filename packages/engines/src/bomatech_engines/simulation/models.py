"""Simulation Engine models — what-if scenarios."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from bomatech_engines.forecast.models import MonthlyPoint

RiskLevel = Literal["safe", "tight", "critical"]


class Scenario(BaseModel):
    """Input parameters for a what-if simulation.

    All deltas are applied to the baseline projection. Deltas of 0 yield the
    same result as the baseline.
    """

    model_config = ConfigDict(extra="forbid")  # fail loudly on typos

    name: str = "custom"
    horizon_months: Literal[3, 6, 12] = 6

    # Generic deltas
    revenue_delta_pct: float = 0.0  # 0.10 = +10% on monthly revenue
    recurring_charges_delta_cents: int = 0  # +/month in fixed costs
    one_shot_capex_cents: int = 0  # one-off outflow at t=0
    gross_margin_delta_pts: float = 0.0  # +points (e.g. +2.0 = 38.2% → 40.2%)

    # Specific templates (optional overlays)
    lost_client_name: str | None = None
    lost_client_share_pct: float | None = None  # 0.34 = lose 34% of revenue
    new_hire_monthly_cost_cents: int | None = None  # salary + charges


class ScenarioSummary(BaseModel):
    """Compact diff between baseline and scenario at the horizon."""

    end_cash_baseline_cents: int
    end_cash_scenario_cents: int
    end_cash_delta_cents: int
    end_cash_delta_pct: float

    runway_baseline_months: float | None
    runway_scenario_months: float | None
    runway_delta_months: float | None

    min_cash_cents: int
    min_cash_month: int

    risk_level: RiskLevel


class SimulationResult(BaseModel):
    """Full output: both trajectories + summary."""

    baseline: list[MonthlyPoint] = Field(default_factory=list)
    scenario: list[MonthlyPoint] = Field(default_factory=list)
    summary: ScenarioSummary
