"""Models for the Forecast Engine."""

from __future__ import annotations

from pydantic import BaseModel


class MonthlyPoint(BaseModel):
    """One month in a projected trajectory."""

    month_index: int  # 0 = next month, 1 = M+2, ...
    cash_cents: int
    revenue_cents: int
    net_cents: int  # revenue - costs for this month


class HistoryPoint(BaseModel):
    """Historical monthly aggregate, used as input for forecasts."""

    year: int
    month: int  # 1-12
    revenue_cents: int
    costs_cents: int
