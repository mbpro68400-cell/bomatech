"""Financial state endpoint — returns the current company snapshot."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.db.client import get_supabase_client
from app.deps import CurrentCompany

router = APIRouter()


@router.get("/state")
async def get_current_state(company_id: CurrentCompany) -> dict:
    """Return the latest financial state for the current company."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No state computed yet. Import transactions first.",
        )
    return res.data[0]
