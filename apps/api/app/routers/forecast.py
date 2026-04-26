"""Forecast endpoint — returns projected cash over N months."""

from __future__ import annotations

from fastapi import APIRouter, Query

from bomatech_engines import ForecastEngine
from bomatech_engines.financial_state.models import FinancialState

from app.db.client import get_supabase_client
from app.deps import CurrentCompany

router = APIRouter()


@router.get("/forecast")
async def get_forecast(
    company_id: CurrentCompany,
    months: int = Query(default=6, ge=3, le=12),
) -> dict:
    """Return a cash projection for `months` months."""
    db = get_supabase_client()
    res = (
        db.table("financial_states")
        .select("*")
        .eq("company_id", str(company_id))
        .order("as_of", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return {"points": [], "method": "none"}

    state = FinancialState(**res.data[0])
    fc = ForecastEngine()
    points = fc.project(state, history=[], months=months)
    return {
        "points": [p.model_dump() for p in points],
        "method": "naive",
    }
