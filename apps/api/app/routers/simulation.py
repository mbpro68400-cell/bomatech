"""Simulation endpoint — runs a what-if scenario via the engines package."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from bomatech_engines import (
    ForecastEngine,
    Scenario,
    SimulationEngine,
)
from bomatech_engines.financial_state.models import FinancialState
from bomatech_engines.forecast.models import HistoryPoint

from app.db.client import get_supabase_client
from app.deps import CurrentCompany
from app.schemas import SimulateRequest

router = APIRouter()


def _load_state(company_id) -> FinancialState:
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
        raise HTTPException(status_code=404, detail="No financial state")
    return FinancialState(**res.data[0])


def _load_history(company_id) -> list[HistoryPoint]:
    """Build monthly aggregates from transactions (last 12 months)."""
    # Placeholder: in a real build, this is a SQL aggregation. For MVP we
    # return an empty list and let the forecast engine fall back to naive mode.
    return []


@router.post("/simulate")
async def simulate(
    payload: SimulateRequest,
    company_id: CurrentCompany,
) -> dict:
    """Run a what-if scenario. Returns baseline + scenario + summary."""
    state = _load_state(company_id)
    history = _load_history(company_id)

    scenario = Scenario(**payload.model_dump(exclude_none=True))
    sim = SimulationEngine(ForecastEngine())
    result = sim.run(state, history, scenario)
    return result.model_dump(mode="json")
