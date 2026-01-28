from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

import httpx


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def storage_enabled() -> bool:
    return bool(_env("SUPABASE_URL") and _env("SUPABASE_SERVICE_ROLE_KEY") and _env("SUPABASE_STORAGE_BUCKET"))


def _base_url() -> str:
    return _env("SUPABASE_URL").rstrip("/")


def _bucket() -> str:
    return _env("SUPABASE_STORAGE_BUCKET")


def _auth_headers() -> Dict[str, str]:
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    return {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }


def sign_url(path: str, *, expires_in: int = 3600) -> Optional[str]:
    """
    Génère une URL signée Supabase Storage pour un objet privé.
    Retourne None si la config n'est pas active ou si l'objet n'existe pas.
    """
    if not storage_enabled():
        return None

    path = str(path or "").lstrip("/")
    if not path:
        return None

    expires_in = max(60, min(int(expires_in or 3600), 24 * 3600))
    url = f"{_base_url()}/storage/v1/object/sign/{_bucket()}/{path}"

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(url, headers=_auth_headers(), json={"expiresIn": expires_in})
            if res.status_code == 404:
                return None
            res.raise_for_status()
            data: Dict[str, Any] = res.json()
    except Exception:
        return None

    signed = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
    if not signed:
        return None

    # Supabase renvoie souvent une URL relative (commençant par /storage/...)
    signed = str(signed)
    # Some Supabase responses return paths without the "/storage/v1" prefix (e.g. "/object/sign/...").
    # Normalize to a working absolute URL.
    if signed.startswith("/object/"):
        signed = "/storage/v1" + signed
    elif signed.startswith("object/"):
        signed = "/storage/v1/" + signed
    if signed.startswith("http://") or signed.startswith("https://"):
        return signed
    if signed.startswith("/"):
        return f"{_base_url()}{signed}"
    return f"{_base_url()}/{signed}"


# Simple cache in-process (dev friendly)
_CAT_CACHE: Dict[str, Any] = {"at": 0.0, "data": None}


def build_default_catalog() -> Dict[str, Any]:
    """
    Construit un petit catalog "convention-based" pour BN-3.
    Le but est de streamer depuis Supabase Storage sans exposer la key au frontend.
    """
    now = time.time()
    ttl = max(5, min(int(_env("SUPABASE_CATALOG_CACHE_SECONDS") or 30), 600))
    cached = _CAT_CACHE.get("data")
    if cached and (now - float(_CAT_CACHE.get("at") or 0)) < ttl:
        return cached

    expires = int(_env("SUPABASE_SIGNED_URL_EXPIRES") or 3600)

    # Music tracks: keep existing IDs (frontend types)
    music_paths = {
        "user-slowlife": "music/user/slowlife.mp3",
        "user-slowmotion": "music/user/slowmotion.mp3",
        "user-yesterday": "music/user/yesterday.mp3",
        "user-dawnofchange": "music/user/dawnofchange.mp3",
    }

    # Ambiences: map existing enum values to optional mp3 in storage
    # NOTE: we also expose French aliases (pluie/vent/forêt/feu) for compatibility with earlier UI labels.
    ambience_paths = {
        "rain": "ambiences/rain.mp3",
        "forest": "ambiences/forest.mp3",
        "ocean": "ambiences/ocean.mp3",
        "wind": "ambiences/wind.mp3",
        "fire": "ambiences/fire.mp3",
        "pink-noise": "ambiences/pink-noise.mp3",
    }

    music: Dict[str, str] = {}
    for k, p in music_paths.items():
        u = sign_url(p, expires_in=expires)
        if u:
            music[k] = u

    ambiences: Dict[str, str] = {}
    for k, p in ambience_paths.items():
        u = sign_url(p, expires_in=expires)
        if not u:
            continue
        # Canonical keys (match frontend enums)
        ambiences[k] = u
        # French aliases (non-breaking)
        if k == "rain":
            ambiences["pluie"] = u
        elif k == "wind":
            ambiences["vent"] = u
        elif k == "forest":
            ambiences["foret"] = u
            ambiences["forêt"] = u
        elif k == "fire":
            ambiences["feu"] = u

    data = {
        "enabled": storage_enabled(),
        "bucket": _bucket() if storage_enabled() else None,
        "signed_expires_in": expires,
        "music": music,
        "ambiences": ambiences,
    }
    _CAT_CACHE["at"] = now
    _CAT_CACHE["data"] = data
    return data


