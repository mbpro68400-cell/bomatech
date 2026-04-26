"""FastAPI dependencies: auth, DB access, current company resolution."""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from app.config import settings
from app.db.client import get_supabase_client

logger = logging.getLogger(__name__)


async def current_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> UUID:
    """Extract the user ID (auth.users.id) from the Supabase JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )
        return UUID(sub)
    except JWTError as e:
        logger.warning("JWT decode failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from e


async def current_company_id(
    user_id: Annotated[UUID, Depends(current_user_id)],
    x_company_id: Annotated[str | None, Header()] = None,
) -> UUID:
    """Resolve the active company for the current user.

    Clients send `X-Company-Id` to pick among the companies they belong to.
    If absent, the first company is used.
    """
    db = get_supabase_client()
    memberships = (
        db.table("company_members")
        .select("company_id")
        .eq("user_id", str(user_id))
        .execute()
    )
    if not memberships.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No company associated with this user",
        )

    company_ids = {m["company_id"] for m in memberships.data}

    if x_company_id:
        if x_company_id not in company_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this company",
            )
        return UUID(x_company_id)

    return UUID(next(iter(company_ids)))


CurrentUser = Annotated[UUID, Depends(current_user_id)]
CurrentCompany = Annotated[UUID, Depends(current_company_id)]
