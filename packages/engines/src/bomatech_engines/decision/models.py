"""Decision Engine models — structured insights."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class AlertLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    POSITIVE = "positive"


class AlertType(str, Enum):
    CASH_RISK = "cash_risk"
    RUNWAY_SHORT = "runway_short"
    CONCENTRATION = "concentration"
    MARGIN_NEGATIVE = "margin_negative"
    COST_ANOMALY = "cost_anomaly"
    PAYMENT_DELAY = "payment_delay"
    MARGIN_IMPROVING = "margin_improving"
    REVENUE_GROWTH = "revenue_growth"


class Insight(BaseModel):
    """Structured output of the Decision Engine.

    `facts` contains ALL numeric data used to produce this insight. The LLM
    layer MUST only reference numbers present in `facts` when generating
    `message` — this is enforced by a validator in packages/ai.
    """

    id: UUID = Field(default_factory=uuid4)
    company_id: UUID
    level: AlertLevel
    type: AlertType
    title: str  # short, no jargon
    facts: dict[str, Any]  # raw numbers for UI and LLM
    message: str = ""  # LLM-generated human text (filled later)
    source_refs: list[UUID] = Field(default_factory=list)  # related tx IDs
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    dismissed: bool = False
