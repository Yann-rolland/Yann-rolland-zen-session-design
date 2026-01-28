from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple

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


def expected_audio_paths() -> Dict[str, Dict[str, str]]:
    """
    Convention-based expected object keys in Supabase Storage bucket.
    Used by:
      - cloud catalog builder (signed URLs)
      - admin UI helper (upload/rename suggestions)
    """
    music_paths = {
        "user-slowlife": "music/user/slowlife.mp3",
        "user-slowmotion": "music/user/slowmotion.mp3",
        "user-yesterday": "music/user/yesterday.mp3",
        "user-dawnofchange": "music/user/dawnofchange.mp3",
    }
    ambience_paths = {
        "rain": "ambiences/rain.mp3",
        "forest": "ambiences/forest.mp3",
        "ocean": "ambiences/ocean.mp3",
        "wind": "ambiences/wind.mp3",
        "fire": "ambiences/fire.mp3",
        "pink-noise": "ambiences/pink-noise.mp3",
    }
    return {"music": music_paths, "ambiences": ambience_paths}


def _normalize_key(key: str) -> str:
    # supabase storage keys are path-like; keep it conservative.
    k = str(key or "").strip().lstrip("/")
    k = k.replace("\\", "/")
    while "//" in k:
        k = k.replace("//", "/")
    return k


def _assert_allowed_audio_key(key: str) -> str:
    """
    Security: admin endpoints should still be constrained to audio folders.
    """
    k = _normalize_key(key)
    if not k:
        raise ValueError("Empty key")
    if not (k.startswith("music/") or k.startswith("ambiences/")):
        raise ValueError("Key must start with music/ or ambiences/")
    if ".." in k.split("/"):
        raise ValueError("Invalid key")
    return k


def list_objects(prefix: str = "", *, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
    """
    List objects in bucket under a prefix using the Storage list API.
    """
    if not storage_enabled():
        return []
    prefix = _normalize_key(prefix)
    url = f"{_base_url()}/storage/v1/object/list/{_bucket()}"
    payload: Dict[str, Any] = {
        "prefix": prefix,
        "limit": max(1, min(int(limit or 200), 1000)),
        "offset": max(0, int(offset or 0)),
        "sortBy": {"column": "name", "order": "asc"},
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.post(url, headers=_auth_headers(), json=payload)
            res.raise_for_status()
            data = res.json()
            if isinstance(data, list):
                return data
    except Exception:
        return []
    return []


def upload_object(key: str, content: bytes, *, content_type: str = "audio/mpeg", upsert: bool = True) -> Dict[str, Any]:
    """
    Upload bytes to Supabase Storage (service role). Returns {ok, key, status, error?}
    """
    if not storage_enabled():
        return {"ok": False, "error": "Storage disabled"}
    k = _assert_allowed_audio_key(key)
    url = f"{_base_url()}/storage/v1/object/{_bucket()}/{k}"
    headers = {
        "Authorization": _auth_headers().get("Authorization", ""),
        "apikey": _auth_headers().get("apikey", ""),
        "Content-Type": str(content_type or "application/octet-stream"),
        # Supabase Storage supports x-upsert for overwrite.
        "x-upsert": "true" if upsert else "false",
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            res = client.post(url, headers=headers, content=content)
            if res.status_code >= 400:
                return {"ok": False, "key": k, "status": res.status_code, "error": (res.text or "")[:400]}
            return {"ok": True, "key": k, "status": res.status_code}
    except Exception as e:
        return {"ok": False, "key": k, "error": str(e)}


def move_object(source_key: str, dest_key: str) -> Dict[str, Any]:
    """
    Rename/move an object within the same bucket.
    """
    if not storage_enabled():
        return {"ok": False, "error": "Storage disabled"}
    src = _assert_allowed_audio_key(source_key)
    dst = _assert_allowed_audio_key(dest_key)
    url = f"{_base_url()}/storage/v1/object/move"
    payload = {"bucketId": _bucket(), "sourceKey": src, "destinationKey": dst}
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.post(url, headers=_auth_headers(), json=payload)
            if res.status_code >= 400:
                return {"ok": False, "source": src, "dest": dst, "status": res.status_code, "error": (res.text or "")[:400]}
            return {"ok": True, "source": src, "dest": dst}
    except Exception as e:
        return {"ok": False, "source": src, "dest": dst, "error": str(e)}


def delete_object(key: str) -> Dict[str, Any]:
    """
    Delete an object from the bucket.
    """
    if not storage_enabled():
        return {"ok": False, "error": "Storage disabled"}
    k = _assert_allowed_audio_key(key)
    url = f"{_base_url()}/storage/v1/object/{_bucket()}/{k}"
    headers = {
        "Authorization": _auth_headers().get("Authorization", ""),
        "apikey": _auth_headers().get("apikey", ""),
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.delete(url, headers=headers)
            if res.status_code >= 400:
                return {"ok": False, "key": k, "status": res.status_code, "error": (res.text or "")[:400]}
            return {"ok": True, "key": k}
    except Exception as e:
        return {"ok": False, "key": k, "error": str(e)}


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

    exp = expected_audio_paths()
    music_paths = exp.get("music") or {}
    # Ambiences: map existing enum values to optional mp3 in storage
    # NOTE: we also expose French aliases (pluie/vent/forêt/feu) for compatibility with earlier UI labels.
    ambience_paths = exp.get("ambiences") or {}

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


