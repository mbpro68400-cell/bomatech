"""Domain models for the Financial State Engine.

All monetary amounts are stored as signed integer cents. A positive amount is
income into the company (e.g. a paid invoice), a negative amount is an outflow.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class TxKind(str, Enum):
    REVENUE = "revenue"      # sales, services rendered
    COST_VAR = "cost_var"    # raw materials, sub-contracting
    COST_FIX = "cost_fix"    # rent, salaries, SaaS
    TAX = "tax"              # VAT, corporate tax, CFE
    CAPEX = "capex"          # capital expenditure (amortised)
    FINANCIAL = "financial"  # interest, loan repayments
    OTHER = "other"


class TxSource(str, Enum):
    MANUAL = "manual"
    CSV = "csv"
    OCR_PDF = "ocr_pdf"
    BRIDGE_API = "bridge_api"
    API = "api"
    FACTUR_X = "factur_x"


class Transaction(BaseModel):
    """A single financial event. The journal is the source of truth."""

    model_config = ConfigDict(frozen=False)

    id: UUID = Field(default_factory=uuid4)
    company_id: UUID
    date: date
    amount_cents: int  # signed: +income / -expense
    currency: str = "EUR"
    kind: TxKind
    category: str | None = None
    counterparty: str | None = None
    label: str
    vat_rate: Decimal | None = None
    vat_amount_cents: int | None = None
    source: TxSource = TxSource.MANUAL
    source_ref: str | None = None
    reconciled: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FinancialState(BaseModel):
    """Derived snapshot. Everything here is reconstructible from transactions."""

    company_id: UUID
    as_of: date
    version: int = 1  # monotonic, incremented on each apply

    # Cash
    cash_cents: int = 0
    cash_30d_avg_cents: int = 0

    # P&L rolling windows
    revenue_30d: int = 0
    revenue_90d: int = 0
    revenue_365d: int = 0
    costs_var_90d: int = 0
    costs_fix_90d: int = 0

    # Ratios (derived, kept here for convenience)
    gross_margin_pct: float = 0.0
    operating_margin_pct: float = 0.0

    # VAT
    vat_collected_quarter_cents: int = 0
    vat_deductible_quarter_cents: int = 0
    vat_balance_cents: int = 0

    # Trajectory
    burn_rate_monthly_cents: int = 0
    runway_months: float | None = None

    # Concentration
    top_client_name: str | None = None
    top_client_share_pct: float = 0.0

    # Meta
    transaction_count: int = 0
    last_transaction_at: datetime | None = None
    computed_at: datetime = Field(default_factory=datetime.utcnow)

    @classmethod
    def empty(cls, company_id: UUID, as_of: date) -> FinancialState:
        """Create a zero-valued state for a company."""
        return cls(company_id=company_id, as_of=as_of)
