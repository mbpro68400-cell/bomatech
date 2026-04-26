"""Insights endpoint — returns current Decision Engine alerts."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from uuid import UUID

from app.db.client import get_supabase_client
from app.deps import CurrentCompany

router = APIRouter()


@router.get("/insights")
async def list_insights(
    company_id: CurrentCompany,
    include_dismissed: bool = False,
) -> list[dict]:
    """Return insights for the current company."""
    db = get_supabase_client()
    q = (
        db.table("insights")
        .select("*")
        .eq("company_id", str(company_id))
        .order("detected_at", desc=True)
    )
    if not include_dismissed:
        q = q.eq("dismissed", False)
    return q.execute().data


@router.post("/insights/{insight_id}/dismiss")
async def dismiss_insight(insight_id: UUID, company_id: CurrentCompany) -> dict:
    """Mark an insight as dismissed."""
    db = get_supabase_client()
    res = (
        db.table("insights")
        .update({"dismissed": True})
        .eq("id", str(insight_id))
        .eq("company_id", str(company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Insight not found")
    return {"ok": True}
