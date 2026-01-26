from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import HTTPException, Request


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def _supabase_base_url() -> str:
    return _env("SUPABASE_URL").rstrip("/")


def _supabase_api_key() -> str:
    # Prefer service role (server-side). Fallback to anon key if provided.
    return _env("SUPABASE_SERVICE_ROLE_KEY") or _env("SUPABASE_ANON_KEY")


@dataclass(frozen=True)
class SupabaseUser:
    id: str
    email: Optional[str] = None


def get_current_user(request: Request) -> SupabaseUser:
    """
    Validates a Supabase access token and returns the current user.

    Requires:
    - Authorization: Bearer <access_token> (from Supabase auth session)
    - SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY) set on backend
    """
    auth = (request.headers.get("authorization") or request.headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    base = _supabase_base_url()
    key = _supabase_api_key()
    if not base or not key:
        raise HTTPException(status_code=503, detail="Supabase auth not configured on server (SUPABASE_URL/SUPABASE_*_KEY)")

    url = f"{base}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": key,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.get(url, headers=headers)
        if res.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        res.raise_for_status()
        data = res.json() or {}
        uid = str(data.get("id") or "").strip()
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid token (missing user id)")
        email = data.get("email")
        return SupabaseUser(id=uid, email=str(email) if email else None)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Supabase auth error: {e}")

