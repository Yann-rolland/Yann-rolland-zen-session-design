import os
import secrets
import shutil
import sys
import time
import traceback

from binaural import generate_binaural_track
from cache import save_cached, stable_cache_key, try_load_cached
from db import (
    db_enabled,
    get_client_state,
    get_user_state,
    insert_wellbeing_event,
    list_wellbeing_events,
    upsert_client_state,
    upsert_user_state,
    wellbeing_stats,
    insert_chat_message,
    list_chat_messages,
    clear_chat_messages,
    upsert_audio_asset,
    list_audio_assets,
    delete_audio_asset,
)
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from llm import DEFAULT_SECTIONS, debug_ollama_once
from llm_gemini import list_gemini_models
from llm_router import generate_sections
from mixdown import MixSettings, mixdown_to_wav
from models import (
    ChatRequest,
    ChatResponse,
    GenerationRequest,
    GenerationResponse,
    HypnosisText,
    WellBeingFeedback,
)
from music import generate_music_bed
from prompts import build_prompt_with_overrides
from tts import synthesize_tts_cached
from urllib.parse import urlparse
from supabase_storage import (
    build_default_catalog,
    delete_object,
    expected_audio_paths,
    list_objects,
    move_object,
    sign_url,
    storage_enabled,
    upload_object,
)
from supabase_auth import get_current_user
from admin_app_config import load_admin_app_config, rollback_admin_app_config, save_admin_app_config, reset_admin_app_config
from llm_gemini import chat_gemini

router = APIRouter()

# User-facing playlists (Spotify-like): we build themed playlists from audio_assets tags.
# Tags are stored canonically in EN (e.g., sleep/relax/rain/ocean/fire).
PLAYLIST_THEMES = [
    {"tag": "sleep", "title": "Sommeil", "subtitle": "Sons doux pour s'endormir", "kind": "ambience"},
    {"tag": "relax", "title": "Détente", "subtitle": "Ambiances calmes et apaisantes", "kind": "ambience"},
    {"tag": "focus", "title": "Concentration", "subtitle": "Rester centré, sans distraction", "kind": "ambience"},
    {"tag": "meditation", "title": "Méditation", "subtitle": "Présence, respiration, lenteur", "kind": "ambience"},
    {"tag": "rain", "title": "Pluie", "subtitle": "Pluie, orage, gouttes", "kind": "ambience"},
    {"tag": "ocean", "title": "Océan", "subtitle": "Vagues, mer, rivage", "kind": "ambience"},
    {"tag": "fire", "title": "Feu", "subtitle": "Cheminée, crépitements", "kind": "ambience"},
    {"tag": "forest", "title": "Forêt", "subtitle": "Nature, oiseaux, bois", "kind": "ambience"},
    {"tag": "wind", "title": "Vent", "subtitle": "Vent, souffle, air", "kind": "ambience"},
    {"tag": "zen", "title": "Zen", "subtitle": "Sélection zen (mix)", "kind": "ambience"},
]

def _require_admin(request: Request) -> None:
    """
    Protection simple des endpoints admin:
    - set ADMIN_TOKEN côté backend (env)
    - le client doit envoyer header: x-admin-token: <token>
    """
    required = (os.environ.get("ADMIN_TOKEN") or "").strip()
    if not required:
        raise HTTPException(status_code=503, detail="ADMIN_TOKEN not configured on server")
    provided = (request.headers.get("x-admin-token") or "").strip()
    if not provided or not secrets.compare_digest(provided, required):
        raise HTTPException(status_code=401, detail="Unauthorized")

def _redact_secrets(s: str) -> str:
    """
    Empêche les erreurs renvoyées au frontend (llm_error/tts_error/etc) de contenir des secrets
    (ex: URL avec ?key=...).
    """
    if not s:
        return s
    try:
        import re

        s = re.sub(r"([?&]key=)[^&\s]+", r"\1REDACTED", s)
        s = re.sub(r"AIza[0-9A-Za-z\-_]{20,}", "AIzaREDACTED", s)
    except Exception:
        pass
    return s


def _pick_binaural_band_and_beat(request: GenerationRequest) -> tuple[str, float]:
    """
    Choix binaural:
    - Si request.binaural_beat_hz > 0 => on respecte ce beat exact
    - Sinon si request.binaural_band != auto => on mappe vers un beat "typique"
    - Sinon (auto) => on choisit selon l'objectif

    Notes:
    - Delta: 0.5-4 Hz (sommeil profond)
    - Theta: 4-8 Hz (relax/transe)
    - Alpha: 8-13 Hz (détente lucide)
    - Beta: 13-30 Hz (concentration)
    - Gamma: >30 Hz (performance/flow)
    """
    beat_override = float(getattr(request, "binaural_beat_hz", 0.0) or 0.0)
    if beat_override > 0.0:
        band = str(getattr(request, "binaural_band", "custom"))
        return (band, beat_override)

    band = getattr(request, "binaural_band", None)
    band_value = getattr(band, "value", str(band or "auto"))

    # Beats "typiques" (au milieu de chaque bande)
    band_to_beat = {
        "delta": 2.0,
        "theta": 6.0,
        "alpha": 10.0,
        "beta": 18.0,
        "gamma": 40.0,
    }

    if band_value in band_to_beat:
        return (band_value, band_to_beat[band_value])

    # Auto: mapping simple par objectif (enum)
    obj = getattr(request, "objectif", None)
    obj_value = getattr(obj, "value", str(obj or "")).lower()
    if obj_value == "sommeil":
        return ("delta", band_to_beat["delta"])
    if obj_value == "stress":
        return ("alpha", band_to_beat["alpha"])
    if obj_value == "confiance":
        return ("alpha", band_to_beat["alpha"])
    if obj_value == "performance":
        return ("gamma", band_to_beat["gamma"])
    if obj_value == "douleur":
        return ("delta", band_to_beat["delta"])

    # Fallback
    return ("theta", band_to_beat["theta"])

@router.get("/debug/ollama")
async def debug_ollama():
    return await debug_ollama_once()

@router.get("/debug/env")
def debug_env():
    """
    Debug: confirme si les variables d'environnement sont visibles par le process backend.
    Ne renvoie jamais les valeurs (sécurité), seulement True/False.
    """
    # NB: db_enabled() vérifie DATABASE_URL + import psycopg.
    try:
        import psycopg  # noqa: F401

        psycopg_ok = True
        psycopg_err = None
    except Exception:
        psycopg_ok = False
        try:
            import traceback

            psycopg_err = traceback.format_exc(limit=2)
        except Exception:
            psycopg_err = "import failed"
    # Use the same parsing as the DB connector (strips unsupported params like pgbouncer=...)
    try:
        from db import get_database_url
        db_url = get_database_url() or ""
    except Exception:
        db_url = os.environ.get("DATABASE_URL", "") or ""
    host = None
    try:
        if db_url:
            from urllib.parse import urlparse

            u = urlparse(db_url)
            host = u.hostname
    except Exception:
        host = None

    dns_ok = None
    dns_err = None
    try:
        if host:
            import socket

            socket.getaddrinfo(host, None)
            dns_ok = True
        elif db_url:
            dns_ok = False
            dns_err = "no hostname parsed from DATABASE_URL"
    except Exception as e:
        dns_ok = False
        dns_err = str(e)

    cors_env = (os.environ.get("CORS_ORIGINS") or "").strip()
    allow_origins = [o.strip() for o in cors_env.split(",") if o.strip()] if cors_env else []
    cors_preview_regex = None
    try:
        # Mirror the Vercel-preview regex logic from main.py (debug only)
        from urllib.parse import urlparse
        import re

        vercel_hosts = []
        for o in allow_origins:
            u = urlparse(o)
            host = (u.hostname or "").lower()
            if host.endswith(".vercel.app"):
                base = host[: -len(".vercel.app")]
                if base:
                    vercel_hosts.append(re.escape(base))
        if vercel_hosts:
            cors_preview_regex = rf"^https://(?:{'|'.join(vercel_hosts)})(?:-[a-z0-9-]+)*\.vercel\.app$"
    except Exception:
        cors_preview_regex = None

    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
    supabase_service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    supabase_bucket = (os.environ.get("SUPABASE_STORAGE_BUCKET") or "").strip()

    gemini_key = os.environ.get("GEMINI_API_KEY") or ""
    gemini_key = gemini_key.strip()

    return {
        "RENDER_GIT_COMMIT": os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("RENDER_COMMIT") or None,
        "python_executable": getattr(sys, "executable", None),
        "DATABASE_URL_set": bool((os.environ.get("DATABASE_URL", "") or "").strip()),
        "DATABASE_HOST": host,
        "DATABASE_DNS_ok": dns_ok,
        "DATABASE_DNS_error": dns_err,
        "psycopg_importable": psycopg_ok,
        "psycopg_import_error": psycopg_err,
        "db_enabled": db_enabled(),
        "ADMIN_TOKEN_set": bool((os.environ.get("ADMIN_TOKEN") or "").strip()),
        "CORS_ORIGINS_set": bool(cors_env),
        "CORS_ORIGINS_count": len(allow_origins),
        "CORS_ORIGINS": allow_origins,
        "CORS_VERCEL_PREVIEW_REGEX": cors_preview_regex,
        "SUPABASE_URL_set": bool(supabase_url),
        "SUPABASE_SERVICE_ROLE_KEY_set": bool(supabase_service_key),
        "SUPABASE_STORAGE_BUCKET_set": bool(supabase_bucket),
        "GEMINI_API_KEY_set": bool(gemini_key),
        "GEMINI_API_KEY_len": len(gemini_key),
        "FREESOUND_API_KEY_set": bool(os.environ.get("FREESOUND_API_KEY")),
        "OLLAMA_MODEL": os.environ.get("OLLAMA_MODEL", None),
        "OLLAMA_NUM_GPU": os.environ.get("OLLAMA_NUM_GPU", None),
    }

@router.get("/debug/db_ping")
def debug_db_ping():
    """
    Vérifie réellement la connexion Postgres (SELECT 1).
    Ne renvoie jamais l'URL complète ni de secrets.
    """
    if not db_enabled():
        return {"ok": False, "error": "DB disabled (DATABASE_URL/psycopg missing)"}
    try:
        from db import get_database_url, get_conn

        db_url = get_database_url()
        host = None
        try:
            host = urlparse(db_url).hostname
        except Exception:
            host = None

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("select 1;")
                _ = cur.fetchone()
        return {"ok": True, "host": host}
    except Exception as e:
        return {"ok": False, "host": host, "error": str(e)}


@router.get("/debug/gemini/models")
async def debug_gemini_models():
    """
    Retourne la liste des modèles Gemini visibles par la clé (ne renvoie pas la clé).
    """
    return await list_gemini_models()


@router.get("/cloud-audio/catalog")
def cloud_audio_catalog():
    """
    Retourne un petit catalogue d'URLs audio "cloud" (Supabase Storage) si configuré.
    - Ne renvoie jamais les secrets (service key).
    - Fournit des URLs signées (bucket privé).
    Le frontend peut utiliser ces URLs comme fallback/priorité par rapport à /library (local).
    """
    if not storage_enabled():
        return {"enabled": False, "music": {}, "ambiences": {}}
    return build_default_catalog()


@router.get("/playlists")
def playlists(request: Request):
    """
    User-facing themed playlists (requires auth).
    Built from audio_assets metadata in DB + Supabase Storage signed URLs.
    """
    _ = get_current_user(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")

    out = []
    for p in PLAYLIST_THEMES:
        tag = str(p.get("tag") or "").strip()
        kind = str(p.get("kind") or "").strip() or None
        try:
            items = list_audio_assets(kind=kind, tag=tag, limit=1, offset=0)
            # We don't want to pull all items just to count; do a cheap count query:
            # Best-effort using LIMIT 1000 then len (still fine for MVP).
            # If you later have many assets, we'll replace with a COUNT(*) query.
            items_full = list_audio_assets(kind=kind, tag=tag, limit=1000, offset=0)
            count = len(items_full)
        except Exception:
            count = 0
        out.append(
            {
                "tag": tag,
                "title": p.get("title"),
                "subtitle": p.get("subtitle"),
                "kind": p.get("kind"),
                "count": int(count),
            }
        )
    return {"playlists": out}


@router.get("/playlists/{tag}")
def playlist_items(tag: str, request: Request, limit: int = 50):
    """
    Returns playlist items for a given theme tag.
    Includes signed_url for playback (bucket private).
    """
    _ = get_current_user(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    limit = max(1, min(int(limit or 50), 200))
    tag = str(tag or "").strip().lower()

    # Find metadata for the playlist (fallback to tag)
    meta = next((p for p in PLAYLIST_THEMES if str(p.get("tag") or "").lower() == tag), None)
    kind = (str(meta.get("kind")) if isinstance(meta, dict) else "") or None

    try:
        items = list_audio_assets(kind=kind, tag=tag, limit=limit, offset=0)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")

    # Attach signed URLs (best effort). If storage isn't enabled, return without URLs.
    expires = int(os.environ.get("SUPABASE_SIGNED_URL_EXPIRES", "3600") or 3600)
    out_items = []
    for it in items:
        k = str((it or {}).get("storage_key") or "").lstrip("/")
        signed = sign_url(k, expires_in=expires) if (storage_enabled() and k) else None
        out_items.append({**it, "signed_url": signed})

    return {
        "playlist": {
            "tag": tag,
            "title": (meta.get("title") if isinstance(meta, dict) else None) or tag,
            "subtitle": (meta.get("subtitle") if isinstance(meta, dict) else None) or "",
        },
        "items": out_items,
    }


@router.get("/chat/history")
def chat_history(request: Request, limit: int = 50):
    """
    Returns authenticated user's chat history (latest N, oldest->newest).
    """
    u = get_current_user(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        items = list_chat_messages(user_id=u.id, limit=limit)
        return {"messages": items}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.delete("/chat/history")
def chat_clear_history(request: Request):
    """
    Clears authenticated user's chat history.
    """
    u = get_current_user(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        deleted = clear_chat_messages(user_id=u.id)
        return {"ok": True, "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.post("/chat")
async def chat(payload: ChatRequest, request: Request):
    """
    Chat endpoint backed by Gemini (server-side API key).
    Requires Supabase auth (Authorization bearer token).
    Stores messages per-user in Postgres.
    """
    u = get_current_user(request)

    # Build message list: small context from DB + current user message
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")

    try:
        history = list_chat_messages(user_id=u.id, limit=20)
    except Exception:
        history = []

    msgs: list[dict] = []
    for m in history:
        role = str(m.get("role") or "")
        if role not in ("user", "model"):
            continue
        msgs.append({"role": role, "content": str(m.get("content") or "")})

    user_text = str(payload.message or "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Empty message")
    msgs.append({"role": "user", "content": user_text})

    # Optional admin steering (reuse forced_generation_text as "system" prefix)
    try:
        cfg = load_admin_app_config()
        forced = (cfg.forced_generation_text or "").strip()
        if forced:
            msgs = [{"role": "user", "content": f"INSTRUCTION ADMIN (prioritaire):\n{forced}"}] + msgs
    except Exception:
        pass

    try:
        try:
            cfg = load_admin_app_config()
            default_model = (cfg.chat_model_default or "").strip()
        except Exception:
            default_model = ""
        model = str(payload.model or "").strip() or default_model or "gemini-pro-latest"
        reply = await chat_gemini(msgs, model=model)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Chat error: {_redact_secrets(str(e))}")

    # Persist both user and model messages
    try:
        insert_chat_message(user_id=u.id, role="user", content=user_text)
        insert_chat_message(user_id=u.id, role="model", content=reply)
    except Exception:
        # If DB write fails, still return reply
        pass

    return ChatResponse(reply=reply, stored=True)


@router.get("/admin/wellbeing_events")
def admin_wellbeing_events(
    request: Request,
    limit: int = 200,
    device_id: str | None = None,
    tag: str | None = None,
    days: int | None = None,
):
    _require_admin(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        events = list_wellbeing_events(limit=limit, device_id=device_id, tag=tag, days=days)
        return {"events": events}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.get("/admin/wellbeing_stats")
def admin_wellbeing_stats(request: Request, days: int = 30):
    _require_admin(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        return wellbeing_stats(days=days)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.get("/admin/app_config")
def admin_get_app_config(request: Request):
    """
    Admin-only app configuration (global):
    - forced_generation_text: prepended to every LLM prompt to steer sessions.
    Stored in assets/state/admin_app_config.json with rollback protection.
    """
    _require_admin(request)
    cfg = load_admin_app_config()
    return {"config": cfg.to_dict()}


@router.post("/admin/app_config")
async def admin_save_app_config(request: Request):
    """
    Save admin app config with rollback protection.
    Body:
      { "forced_generation_text": "...", "action": "save"|"rollback"|"reset" }
    """
    _require_admin(request)
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    action = str((payload or {}).get("action") or "save").lower().strip()
    if action == "rollback":
        cfg = rollback_admin_app_config()
        return {"ok": True, "action": "rollback", "config": cfg.to_dict()}
    if action == "reset":
        cfg = reset_admin_app_config()
        return {"ok": True, "action": "reset", "config": cfg.to_dict()}

    updates = dict(payload or {})
    updates.pop("updated_at", None)
    cfg = save_admin_app_config(updates)
    return {"ok": True, "action": "save", "config": cfg.to_dict()}


@router.get("/admin/storage/expected")
def admin_storage_expected(request: Request):
    """
    Helper endpoint for admin UI: returns expected audio keys + current catalog presence.
    """
    _require_admin(request)
    return {
        "enabled": storage_enabled(),
        "bucket": os.environ.get("SUPABASE_STORAGE_BUCKET"),
        "expected": expected_audio_paths(),
        "catalog": build_default_catalog() if storage_enabled() else {"enabled": False, "music": {}, "ambiences": {}},
    }


@router.get("/admin/storage/list")
def admin_storage_list(request: Request, prefix: str = "", limit: int = 200, offset: int = 0):
    """
    Lists objects from Supabase Storage bucket (admin only).
    """
    _require_admin(request)
    if not storage_enabled():
        return {"enabled": False, "items": []}
    items = list_objects(prefix=prefix, limit=limit, offset=offset)
    return {"enabled": True, "items": items}


@router.get("/admin/audio_assets")
def admin_list_audio_assets(
    request: Request,
    kind: str | None = None,
    q: str | None = None,
    tag: str | None = None,
    limit: int = 200,
    offset: int = 0,
):
    """
    List audio asset metadata stored in DB (admin only).
    """
    _require_admin(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        items = list_audio_assets(kind=kind, q=q, tag=tag, limit=limit, offset=offset)
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.post("/admin/audio_assets")
async def admin_upsert_audio_assets(request: Request):
    """
    Upsert audio asset metadata by storage_key (admin only).
    Body example:
      {
        "storage_key": "ambiences/ocean.mp3",
        "kind": "ambience",
        "title": "Océan doux",
        "tags": ["ocean", "calm"],
        "source": "freesound",
        "license": "CC0",
        "duration_s": 600,
        "loudness_lufs": -18.5,
        "notes": "",
        "extra": { ... }
      }
    """
    _require_admin(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    try:
        item = upsert_audio_asset(
            storage_key=str((payload or {}).get("storage_key") or ""),
            kind=str((payload or {}).get("kind") or "ambience"),
            title=str((payload or {}).get("title") or ""),
            tags=(payload or {}).get("tags") or [],
            source=str((payload or {}).get("source") or ""),
            license=str((payload or {}).get("license") or ""),
            duration_s=(payload or {}).get("duration_s"),
            loudness_lufs=(payload or {}).get("loudness_lufs"),
            notes=str((payload or {}).get("notes") or ""),
            extra=(payload or {}).get("extra") or {},
        )
        return {"ok": True, "item": item}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.post("/admin/audio_assets/delete")
async def admin_delete_audio_assets(request: Request):
    """
    Delete audio asset metadata by storage_key (admin only).
    Body: { "storage_key": "ambiences/ocean.mp3" }
    """
    _require_admin(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    storage_key = str((payload or {}).get("storage_key") or "")
    try:
        deleted = delete_audio_asset(storage_key=storage_key)
        return {"ok": True, "deleted": bool(deleted)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.post("/admin/storage/upload")
async def admin_storage_upload(
    request: Request,
    key: str = Form(...),
    upsert: str = Form("true"),
    file: UploadFile = File(...),
):
    """
    Upload an audio file to Supabase Storage via backend (admin only).
    Uses service role key server-side; the frontend never sees it.
    """
    _require_admin(request)
    if not storage_enabled():
        raise HTTPException(status_code=503, detail="Storage disabled (SUPABASE_* missing)")

    # Basic hardening: validate destination key and file type
    key_str = str(key or "").strip()
    if not key_str:
        raise HTTPException(status_code=400, detail="Missing key")
    key_lower = key_str.lower()
    if not (
        key_lower.endswith(".mp3")
        or key_lower.endswith(".wav")
        or key_lower.endswith(".ogg")
        or key_lower.endswith(".webm")
    ):
        raise HTTPException(status_code=400, detail="Invalid extension (allowed: .mp3, .wav, .ogg, .webm)")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    # Content-type best effort + magic bytes sniffing (prevents HTML/text upload by mistake)
    ct = (file.content_type or "").strip().lower()
    head = bytes(data[:16] or b"")
    is_mp3 = head.startswith(b"ID3") or (len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)
    is_wav = head.startswith(b"RIFF") and (b"WAVE" in head)
    is_ogg = head.startswith(b"OggS")
    is_webm = head.startswith(b"\x1a\x45\xdf\xa3")  # EBML
    if not any([is_mp3, is_wav, is_ogg, is_webm]):
        raise HTTPException(status_code=400, detail="File does not look like a supported audio format")
    if not ct:
        ct = "audio/mpeg" if is_mp3 else ("audio/wav" if is_wav else ("audio/ogg" if is_ogg else "audio/webm"))

    upsert_flag = str(upsert or "true").strip().lower() in ("1", "true", "yes", "y", "on")
    res = upload_object(key_str, data, content_type=ct, upsert=upsert_flag)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Upload failed")
    # Best-effort: auto-create metadata row for easier catalog curation (if DB enabled).
    try:
        if db_enabled():
            storage_key = str(res.get("key") or key or "")
            kind = "music" if storage_key.startswith("music/") else "ambience"
            filename = storage_key.split("/")[-1]
            title = filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").strip()
            _ = upsert_audio_asset(storage_key=storage_key, kind=kind, title=title, tags=[], source="", license="", extra={"uploaded_via": "admin"})
    except Exception:
        pass
    return {"ok": True, "key": res.get("key")}


@router.post("/admin/storage/move")
async def admin_storage_move(request: Request):
    """
    Move/rename an object in Supabase Storage (admin only).
    Body: { "source": "...", "dest": "..." }
    """
    _require_admin(request)
    if not storage_enabled():
        raise HTTPException(status_code=503, detail="Storage disabled (SUPABASE_* missing)")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    src = str((payload or {}).get("source") or "")
    dst = str((payload or {}).get("dest") or "")
    res = move_object(src, dst)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Move failed")
    return {"ok": True, "source": res.get("source"), "dest": res.get("dest")}


@router.post("/admin/storage/delete")
async def admin_storage_delete(request: Request):
    """
    Delete an object in Supabase Storage (admin only).
    Body: { "key": "..." }
    """
    _require_admin(request)
    if not storage_enabled():
        raise HTTPException(status_code=503, detail="Storage disabled (SUPABASE_* missing)")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    key = str((payload or {}).get("key") or "")
    res = delete_object(key)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error") or "Delete failed")
    return {"ok": True, "key": res.get("key")}
@router.post("/feedback/wellbeing")
async def feedback_wellbeing(payload: WellBeingFeedback, request: Request):
    """
    Opt-in: reçoit un ressenti utilisateur et le stocke côté backend pour amélioration produit.
    Stockage:
    - si DATABASE_URL est défini => Postgres (Supabase) table wellbeing_events
    - sinon => fichier local assets/feedback/wellbeing.jsonl
    """
    import json
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent
    fb_dir = base_dir / "assets" / "feedback"
    fb_dir.mkdir(parents=True, exist_ok=True)
    path = fb_dir / "wellbeing.jsonl"

    # Always bind event to authenticated Supabase user (prevents mixing users)
    u = get_current_user(request)
    event = payload.model_dump()
    event["user_id"] = u.id
    event["user_email"] = u.email
    # Ajoute un minimum de contexte (sans secrets)
    try:
        event["_received_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        event["_client_ip"] = getattr(getattr(request, "client", None), "host", None)
        event["_user_agent"] = request.headers.get("user-agent", "")
    except Exception:
        pass

    # Prefer DB if enabled
    if db_enabled():
        try:
            insert_wellbeing_event(
                event_id=str(event.get("id") or ""),
                device_id=str(event.get("device_id") or ""),
                user_id=str(event.get("user_id") or "") or None,
                user_email=str(event.get("user_email") or "") or None,
                at_iso=str(event.get("at") or ""),
                rating=int(float(event.get("rating") or 0)),
                tag=str(event.get("tag") or "autre"),
                note=str(event.get("note") or ""),
                session_id=str(event.get("session_id") or ""),
                user_agent=str(event.get("_user_agent") or ""),
                client_ip=str(event.get("_client_ip") or "") or None,
            )
            return {"ok": True, "stored": "db"}
        except Exception as e:
            # fallback file (but keep the reason to debug)
            try:
                event["_db_error"] = str(e)
            except Exception:
                pass

    line = json.dumps(event, ensure_ascii=False) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)
    return {"ok": True, "stored": "file"}


@router.get("/state/{device_id}")
def get_state(device_id: str):
    """
    Retourne l'état (progress/settings) d'un device.
    Stockage:
    - si DATABASE_URL => table client_state
    - sinon => fichier assets/state/<device_id>.json
    """
    import json
    from pathlib import Path

    if db_enabled():
        try:
            state = get_client_state(device_id=device_id) or {}
            return {"device_id": device_id, "state": state, "stored": "db"}
        except Exception as e:
            # Fallback file si DB down (DNS, credentials, etc.)
            # Ne renvoie pas DATABASE_URL; seulement l'erreur brute.
            return {"device_id": device_id, "state": {}, "stored": "file", "db_error": str(e)}

    base_dir = Path(__file__).resolve().parent.parent
    st_dir = base_dir / "assets" / "state"
    st_dir.mkdir(parents=True, exist_ok=True)
    fp = st_dir / f"{device_id}.json"
    if fp.exists():
        try:
            return {"device_id": device_id, "state": json.loads(fp.read_text(encoding="utf-8")), "stored": "file"}
        except Exception:
            return {"device_id": device_id, "state": {}, "stored": "file"}
    return {"device_id": device_id, "state": {}, "stored": "file"}


@router.get("/state/user")
def get_state_user(request: Request):
    """
    Retourne l'état (progress/settings/history) du user connecté (Supabase).
    Auth: Authorization: Bearer <supabase_access_token>
    Stockage:
    - si DATABASE_URL => table user_state
    """
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    u = get_current_user(request)
    try:
        st = get_user_state(user_id=u.id) or {}
        return {"user_id": u.id, "state": st, "stored": "db"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.post("/state/user")
async def save_state_user(request: Request):
    """
    Sauve l'état (progress/settings/history) du user connecté (Supabase).
    Auth: Authorization: Bearer <supabase_access_token>
    """
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    u = get_current_user(request)
    try:
        body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {e}")
    state = body.get("state", body)
    try:
        upsert_user_state(user_id=u.id, state=state)
        return {"ok": True, "stored": "db"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB error: {e}")


@router.post("/state/{device_id}")
async def save_state(device_id: str, request: Request):
    """
    Sauve l'état (progress/settings) d'un device.
    Le frontend envoie un JSON libre (on garde la structure côté UI).
    """
    import json
    from pathlib import Path

    try:
        body = await request.json()
    except Exception as e:
        # Mauvais JSON (souvent un problème d'échappement dans PowerShell/curl)
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {e}")
    state = body.get("state", body)

    if db_enabled():
        try:
            upsert_client_state(device_id=device_id, state=state)
            return {"ok": True, "stored": "db"}
        except Exception as e:
            return {"ok": True, "stored": "file", "db_error": str(e)}

    base_dir = Path(__file__).resolve().parent.parent
    st_dir = base_dir / "assets" / "state"
    st_dir.mkdir(parents=True, exist_ok=True)
    fp = st_dir / f"{device_id}.json"
    fp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "stored": "file"}

@router.get("/runs")
def list_runs(request: Request, limit: int = 50):
    """
    Liste les derniers runs (métadonnées légères).
    """
    import json
    from pathlib import Path

    u = get_current_user(request)
    base_dir = Path(__file__).resolve().parent.parent
    runs_dir = base_dir / "assets" / "runs"
    if not runs_dir.exists():
        return {"runs": []}

    runs = []
    for d in runs_dir.iterdir():
        if not d.is_dir():
            continue
        rid = d.name
        req_path = d / "request.json"
        meta = {}
        if req_path.exists():
            try:
                meta = json.loads(req_path.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
        # Per-user isolation: only list runs that belong to current user
        owner = str(meta.get("_user_id") or meta.get("user_id") or "").strip()
        if owner != u.id:
            continue

        runs.append(
            {
                "run_id": rid,
                "created_at": int(d.stat().st_mtime),
                "objectif": meta.get("objectif"),
                "duree_minutes": meta.get("duree_minutes"),
                "style": meta.get("style"),
                "has_mix": (d / "mix.wav").exists(),
            }
        )

    runs.sort(key=lambda x: x["created_at"], reverse=True)
    return {"runs": runs[: max(1, min(limit, 500))]}


@router.get("/runs/{run_id}")
def get_run(run_id: str, request: Request):
    """
    Retourne les détails d'un run (texte + paths).
    """
    import json
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent
    run_dir = base_dir / "assets" / "runs" / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run introuvable")

    u = get_current_user(request)
    req = {}
    if (run_dir / "request.json").exists():
        try:
            req = json.loads((run_dir / "request.json").read_text(encoding="utf-8"))
        except Exception:
            req = {}
    owner = str(req.get("_user_id") or req.get("user_id") or "").strip()
    if owner != u.id:
        raise HTTPException(status_code=404, detail="Run introuvable")

    texte = None
    if (run_dir / "script.json").exists():
        try:
            texte = json.loads((run_dir / "script.json").read_text(encoding="utf-8"))
        except Exception:
            texte = None

    binaural_meta = {}
    if (run_dir / "binaural.json").exists():
        try:
            binaural_meta = json.loads((run_dir / "binaural.json").read_text(encoding="utf-8"))
        except Exception:
            binaural_meta = {}

    resp = {
        "run_id": run_id,
        "request": req,
        "texte": texte,
        "tts_audio_path": f"assets/runs/{run_id}/voice.wav",
        "music_path": f"assets/runs/{run_id}/music.wav",
        "binaural_path": f"assets/runs/{run_id}/binaural.wav",
        "mix_path": f"assets/runs/{run_id}/mix.wav" if (run_dir / "mix.wav").exists() else None,
        "binaural_band_used": binaural_meta.get("binaural_band_used"),
        "binaural_beat_hz_used": binaural_meta.get("binaural_beat_hz_used"),
        # TTS meta (si présent)
        "tts_provider_used": None,
        "tts_cache_hit": None,
        "tts_error": None,
    }
    if (run_dir / "tts_meta.json").exists():
        try:
            tts_meta = json.loads((run_dir / "tts_meta.json").read_text(encoding="utf-8"))
            resp["tts_provider_used"] = tts_meta.get("tts_provider_used")
            resp["tts_cache_hit"] = tts_meta.get("tts_cache_hit")
            resp["tts_error"] = tts_meta.get("tts_error")
        except Exception:
            pass
    return resp


@router.get("/export/tts-dataset.zip")
def export_tts_dataset():
    """
    Exporte un ZIP de dataset "voix" (utile si tu veux fine-tune plus tard).
    Inclut, pour chaque run:
    - voice.wav
    - script.json
    - request.json
    - binaural.json (si présent)
    - tts_meta.json (si présent)
    """
    import zipfile
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent
    runs_dir = base_dir / "assets" / "runs"
    exports_dir = base_dir / "assets" / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)

    ts = time.strftime("%Y%m%d-%H%M%S")
    zip_path = exports_dir / f"tts_dataset_{ts}.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        if runs_dir.exists():
            for run_dir in runs_dir.iterdir():
                if not run_dir.is_dir():
                    continue
                run_id = run_dir.name
                for fname in ("voice.wav", "script.json", "request.json", "binaural.json", "tts_meta.json"):
                    fp = run_dir / fname
                    if fp.exists():
                        zf.write(fp, arcname=f"{run_id}/{fname}")

    return FileResponse(path=str(zip_path), filename=zip_path.name, media_type="application/zip")


@router.delete("/runs/{run_id}")
def delete_run(run_id: str, request: Request):
    """
    Supprime un run (dossier assets/runs/<run_id>).
    """
    import shutil
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent
    run_dir = base_dir / "assets" / "runs" / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run introuvable")
    # ownership check
    import json
    req = {}
    if (run_dir / "request.json").exists():
        try:
            req = json.loads((run_dir / "request.json").read_text(encoding="utf-8"))
        except Exception:
            req = {}
    u = get_current_user(request)
    owner = str(req.get("_user_id") or req.get("user_id") or "").strip()
    if owner != u.id:
        raise HTTPException(status_code=404, detail="Run introuvable")
    shutil.rmtree(run_dir, ignore_errors=True)
    return {"deleted": run_id}


@router.post("/generate", response_model=GenerationResponse)
async def generate(request: GenerationRequest, http_request: Request):
    """
    Pipeline principal :
    1. Générer le texte structuré via Ollama.
    2. Générer/simuler la voix (WAV).
    3. Générer/simuler la musique d'ambiance.
    4. Générer/simuler un lit binaural (mixable).
    """
    from pathlib import Path
    base_dir = Path(__file__).resolve().parent.parent
    u = get_current_user(http_request)

    # Cache/fallback: si une génération échoue, on pourra renvoyer le dernier run OK pour ces paramètres.
    payload = request.model_dump()
    # Attach owner (used for /runs filtering); never trust client-supplied user identity
    payload["_user_id"] = u.id
    payload["_user_email"] = u.email
    key = stable_cache_key(payload)
    cached = try_load_cached(base_dir=base_dir, key=key)
    # Si l'ancien cache venait d'un fallback LLM, on préfère regénérer (évite de "rester bloqué" sur le script par défaut)
    if cached and cached.get("llm_fallback"):
        cached = None
    # Dossier "runs" : un nouveau run par génération (historique complet)
    runs_dir = base_dir / "assets" / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    run_id = time.strftime("%Y%m%d-%H%M%S") + "-" + key[:6] + "-" + secrets.token_hex(3)
    run_dir = runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # Chemins run (relatifs pour le frontend)
    tts_rel = f"assets/runs/{run_id}/voice.wav"
    music_rel = f"assets/runs/{run_id}/music.wav"
    binaural_rel = f"assets/runs/{run_id}/binaural.wav"
    mix_rel = f"assets/runs/{run_id}/mix.wav"

    tts_abs = base_dir / tts_rel
    music_abs = base_dir / music_rel
    binaural_abs = base_dir / binaural_rel
    mix_abs = base_dir / mix_rel

    # Chemins legacy "latest" (compat / debugging)
    legacy_tts_abs = base_dir / "assets/audio/session.wav"
    legacy_music_abs = base_dir / "assets/music/ambient.wav"
    legacy_binaural_abs = base_dir / "assets/audio/binaural.wav"
    legacy_mix_abs = base_dir / "assets/audio/mix.wav"

    try:
        # Admin config: extra safety rules + optional template + defaults
        try:
            cfg = load_admin_app_config()
        except Exception:
            cfg = None

        try:
            # Default model overrides (only if client didn't explicitly set something custom)
            prov = getattr(request, "llm_provider", "ollama")
            llm_provider = getattr(prov, "value", str(prov))
            if llm_provider == "gemini":
                default_model = (getattr(cfg, "gemini_model_default", "") or "").strip()
                if default_model and (not str(getattr(request, "gemini_model", "") or "").strip() or str(getattr(request, "gemini_model", "")).strip() == "gemini-pro-latest"):
                    request.gemini_model = default_model
        except Exception:
            pass

        try:
            prov = getattr(request, "tts_provider", "local")
            tts_provider = getattr(prov, "value", str(prov))
            if tts_provider == "elevenlabs":
                default_voice_id = (getattr(cfg, "elevenlabs_voice_id_default", "") or "").strip()
                if default_voice_id and not str(getattr(request, "elevenlabs_voice_id", "") or "").strip():
                    request.elevenlabs_voice_id = default_voice_id
        except Exception:
            pass

        prompt = build_prompt_with_overrides(
            request,
            safety_rules_text=str(getattr(cfg, "safety_rules_text", "") or ""),
            prompt_template_override=str(getattr(cfg, "prompt_template_override", "") or ""),
        )
        # Admin override: force an additional instruction to steer the LLM.
        try:
            forced = (getattr(cfg, "forced_generation_text", "") or "").strip()
            if forced:
                prompt = f"INSTRUCTION ADMIN (prioritaire, à respecter strictement):\n{forced}\n\n---\n\n{prompt}"
        except Exception:
            pass
        # Safe: si LLM lent/HS, on ne casse pas /generate (on garde un texte fallback),
        # mais on expose l'état pour que le frontend puisse l'afficher.
        # llm_provider peut être un Enum (LLMProvider.gemini) => on prend .value si dispo pour un affichage clair.
        prov = getattr(request, "llm_provider", "ollama")
        llm_provider_used = getattr(prov, "value", str(prov))
        llm_fallback = False
        llm_error = None
        try:
            sections = await generate_sections(prompt, request)
        except Exception as e:
            sections = DEFAULT_SECTIONS
            llm_fallback = True
            llm_error = _redact_secrets(str(e))
        # Même si l'appel n'a pas levé, on peut tomber sur DEFAULT_SECTIONS si parsing a échoué ailleurs.
        if sections is DEFAULT_SECTIONS:
            llm_fallback = True
            llm_error = llm_error or "LLM output not parsable; using DEFAULT_SECTIONS"

        # 1) TTS (avec cache pour éviter de reconsommer le crédit ElevenLabs)
        full_text = " ".join(sections.values())
        prov = getattr(request, "tts_provider", "local")
        tts_provider = getattr(prov, "value", str(prov))
        cache_hit, tts_provider_used, tts_err = synthesize_tts_cached(
            full_text=full_text,
            output_path=str(tts_abs),
            provider=tts_provider,
            elevenlabs_voice_id=getattr(request, "elevenlabs_voice_id", "") or "",
            base_dir=base_dir,
        )
        (run_dir / "tts_meta.json").write_text(
            __import__("json").dumps(
                {
                    "tts_provider_requested": tts_provider,
                    "tts_provider_used": tts_provider_used,
                    "tts_cache_hit": cache_hit,
                    "tts_error": tts_err,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        # 2) Music + 3) Binaural (sr bas pour limiter RAM)
        generate_music_bed(duration_minutes=request.duree_minutes, output_path=str(music_abs), sample_rate=8000)
        binaural_band_used, binaural_beat_hz_used = _pick_binaural_band_and_beat(request)
        generate_binaural_track(
            duration_minutes=request.duree_minutes,
            output_path=str(binaural_abs),
            sample_rate=8000,
            beat_hz=float(binaural_beat_hz_used),
        )

        # 4) Mixdown (optionnel)
        mix_path = None
        if request.mixdown:
            settings = MixSettings(
                voice_volume=request.voice_volume,
                music_volume=request.music_volume,
                binaural_volume=request.binaural_volume,
                voice_offset_s=request.voice_offset_s,
                music_offset_s=request.music_offset_s,
                binaural_offset_s=request.binaural_offset_s,
            )
            try:
                mixdown_to_wav(
                    voice_wav=tts_abs,
                    music_wav=music_abs,
                    binaural_wav=binaural_abs,
                    out_wav=mix_abs,
                    settings=settings,
                )
                mix_path = mix_rel
            except Exception:
                (run_dir / "mix_error.txt").write_text(traceback.format_exc(), encoding="utf-8")
                mix_path = None

        # Copie "latest" (ne conditionne pas la réussite du run)
        try:
            legacy_tts_abs.parent.mkdir(parents=True, exist_ok=True)
            legacy_music_abs.parent.mkdir(parents=True, exist_ok=True)
            legacy_binaural_abs.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(str(tts_abs), str(legacy_tts_abs))
            shutil.copyfile(str(music_abs), str(legacy_music_abs))
            shutil.copyfile(str(binaural_abs), str(legacy_binaural_abs))
            if mix_path:
                shutil.copyfile(str(mix_abs), str(legacy_mix_abs))
        except Exception:
            pass

        resp = GenerationResponse(
            texte=HypnosisText(**sections),
            tts_audio_path=tts_rel,
            music_path=music_rel,
            binaural_path=binaural_rel,
            mix_path=mix_path,
            run_id=run_id,
            llm_provider_used=llm_provider_used,
            llm_fallback=llm_fallback,
            llm_error=llm_error,
            binaural_band_used=binaural_band_used,
            binaural_beat_hz_used=binaural_beat_hz_used,
            tts_provider_used=tts_provider_used,
            tts_cache_hit=cache_hit,
            tts_error=tts_err,
        )
        save_cached(base_dir=base_dir, key=key, data=resp.model_dump())
        # Stocke les paramètres aussi (audit / reproductibilité)
        import json
        (run_dir / "request.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        (run_dir / "script.json").write_text(json.dumps(sections, ensure_ascii=False, indent=2), encoding="utf-8")
        (run_dir / "binaural.json").write_text(
            json.dumps(
                {"binaural_band_used": binaural_band_used, "binaural_beat_hz_used": binaural_beat_hz_used},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        if llm_error:
            (run_dir / "llm_error.txt").write_text(_redact_secrets(llm_error), encoding="utf-8")
        return resp

    except Exception as exc:
        # Fallback : si on a un cache OK pour ce payload, on le renvoie.
        if cached and all(k in cached for k in ["texte", "tts_audio_path", "music_path", "binaural_path"]):
            return GenerationResponse(**cached)
        raise HTTPException(status_code=500, detail=f"Erreur génération: {exc}")

