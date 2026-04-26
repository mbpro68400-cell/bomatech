"""Forecast Engine — projects cash, revenue, and net forward.

Combines three signals:
  1. Exponentially-weighted moving average (EWMA) of recent months
  2. Linear trend fit on full history
  3. Seasonality (month-of-year delta) when >= 12 months of history

Default weights: 50% EWMA, 30% trend, 20% seasonality. These are conservative
and favor recent data, which matters for small businesses where last month
reflects the current state better than an average over 12 months.
"""

from __future__ import annotations

import numpy as np

from bomatech_engines.financial_state.models import FinancialState
from bomatech_engines.forecast.models import HistoryPoint, MonthlyPoint


class ForecastEngine:
    """Pure function wrapper. No state, no I/O."""

    def project(
        self,
        state: FinancialState,
        history: list[HistoryPoint],
        months: int = 6,
    ) -> list[MonthlyPoint]:
        """Return `months` forward monthly points starting from `state.as_of`."""
        if len(history) < 3:
            return self._naive_projection(state, months)

        rev_series = [h.revenue_cents for h in history]
        cost_series = [h.costs_cents for h in history]

        rev_forecast = self._forecast_series(rev_series, months)
        cost_forecast = self._forecast_series(cost_series, months)

        cash = state.cash_cents
        points: list[MonthlyPoint] = []
        for i in range(months):
            net = rev_forecast[i] - cost_forecast[i]
            cash += net
            points.append(
                MonthlyPoint(
                    month_index=i,
                    cash_cents=cash,
                    revenue_cents=rev_forecast[i],
                    net_cents=net,
                )
            )
        return points

    # ---- Internals ----

    def _forecast_series(self, series: list[int], months: int) -> list[int]:
        """Return a list of projected values for `months` ahead."""
        arr = np.array(series, dtype=float)

        # 1. EWMA — weights grow exponentially toward the present
        weights = np.exp(np.linspace(-1.0, 0.0, len(arr)))
        weights = weights / weights.sum()
        ewma = float(np.dot(arr, weights))

        # 2. Linear trend
        x = np.arange(len(arr))
        slope, intercept = np.polyfit(x, arr, 1)

        # 3. Seasonality (only if enough history)
        seasonality = np.zeros(months)
        if len(arr) >= 12:
            last_year = arr[-12:]
            season_vec = last_year - last_year.mean()
            # Tile to cover the forecast horizon
            reps = (months // 12) + 1
            seasonality = np.tile(season_vec, reps)[:months]

        forecast: list[int] = []
        for i in range(months):
            trend_val = intercept + slope * (len(arr) + i)
            # 50% EWMA, 30% trend, 20% seasonality (relative to EWMA)
            val = 0.5 * ewma + 0.3 * trend_val + 0.2 * (ewma + seasonality[i])
            forecast.append(max(0, int(val)))
        return forecast

    def _naive_projection(
        self, state: FinancialState, months: int
    ) -> list[MonthlyPoint]:
        """Fallback when history is too short. Uses the 90d averages in state."""
        monthly_rev = state.revenue_90d // 3 if state.revenue_90d else 0
        monthly_cost = (state.costs_var_90d + state.costs_fix_90d) // 3

        cash = state.cash_cents
        points: list[MonthlyPoint] = []
        for i in range(months):
            net = monthly_rev - monthly_cost
            cash += net
            points.append(
                MonthlyPoint(
                    month_index=i,
                    cash_cents=cash,
                    revenue_cents=monthly_rev,
                    net_cents=net,
                )
            )
        return points
