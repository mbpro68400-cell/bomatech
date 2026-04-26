"""Supabase client singleton."""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Return the service-role Supabase client (for server-to-server calls).

    For user-scoped reads, prefer the anon client with the user's JWT set
    via .postgrest.auth(token).
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
