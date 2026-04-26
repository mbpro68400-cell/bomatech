"""I/O schemas for the API (request / response models)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class TransactionCreate(BaseModel):
    """Input for creating a transaction."""
    date: date
    amount_cents: int
    kind: str
    label: str
    category: str | None = None
    counterparty: str | None = None
    vat_rate: float | None = None
    vat_amount_cents: int | None = None


class TransactionOut(BaseModel):
    id: UUID
    date: date
    amount_cents: int
    kind: str
    label: str
    category: str | None = None
    counterparty: str | None = None


class SimulateRequest(BaseModel):
    """Parameters for a what-if scenario."""
    horizon_months: int = Field(default=6, ge=3, le=12)
    revenue_delta_pct: float = 0.0
    recurring_charges_delta_cents: int = 0
    one_shot_capex_cents: int = 0
    gross_margin_delta_pts: float = 0.0
    lost_client_name: str | None = None
    lost_client_share_pct: float | None = None
    new_hire_monthly_cost_cents: int | None = None


class HealthOut(BaseModel):
    status: str
    environment: str
