"""Transactions endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.db.client import get_supabase_client
from app.deps import CurrentCompany
from app.schemas import TransactionCreate, TransactionOut

router = APIRouter()


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    company_id: CurrentCompany,
    limit: int = 100,
    offset: int = 0,
) -> list[TransactionOut]:
    """List transactions for the current company (most recent first)."""
    db = get_supabase_client()
    res = (
        db.table("transactions")
        .select("*")
        .eq("company_id", str(company_id))
        .order("date", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return [TransactionOut(**row) for row in res.data]


@router.post(
    "/transactions",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    payload: TransactionCreate,
    company_id: CurrentCompany,
) -> TransactionOut:
    """Create a transaction."""
    db = get_supabase_client()
    res = (
        db.table("transactions")
        .insert({
            **payload.model_dump(mode="json"),
            "company_id": str(company_id),
            "source": "api",
        })
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create transaction",
        )
    return TransactionOut(**res.data[0])
