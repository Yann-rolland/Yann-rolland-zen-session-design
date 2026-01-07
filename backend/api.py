import os
import secrets
import shutil
import sys
import time
import traceback

from binaural import generate_binaural_track
from cache import save_cached, stable_cache_key, try_load_cached
from db import (db_enabled, get_client_state, insert_wellbeing_event,
                list_wellbeing_events, upsert_client_state, wellbeing_stats)
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from llm import DEFAULT_SECTIONS, debug_ollama_once
from llm_gemini import list_gemini_models
from llm_router import generate_sections
from mixdown import MixSettings, mixdown_to_wav
from models import (GenerationRequest, GenerationResponse, HypnosisText,
                    WellBeingFeedback)
from music import generate_music_bed
from prompts import build_prompt
from tts import synthesize_tts_cached
from supabase_storage import build_default_catalog, storage_enabled

router = APIRouter()

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
    db_url = os.environ.get("DATABASE_URL", "")
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

    return {
        "python_executable": getattr(sys, "executable", None),
        "DATABASE_URL_set": bool(db_url),
        "DATABASE_HOST": host,
        "DATABASE_DNS_ok": dns_ok,
        "DATABASE_DNS_error": dns_err,
        "psycopg_importable": psycopg_ok,
        "psycopg_import_error": psycopg_err,
        "db_enabled": db_enabled(),
        "ADMIN_TOKEN_set": bool((os.environ.get("ADMIN_TOKEN") or "").strip()),
        "GEMINI_API_KEY_set": bool(os.environ.get("GEMINI_API_KEY")),
        "FREESOUND_API_KEY_set": bool(os.environ.get("FREESOUND_API_KEY")),
        "OLLAMA_MODEL": os.environ.get("OLLAMA_MODEL", None),
        "OLLAMA_NUM_GPU": os.environ.get("OLLAMA_NUM_GPU", None),
    }


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
    events = list_wellbeing_events(limit=limit, device_id=device_id, tag=tag, days=days)
    return {"events": events}


@router.get("/admin/wellbeing_stats")
def admin_wellbeing_stats(request: Request, days: int = 30):
    _require_admin(request)
    if not db_enabled():
        raise HTTPException(status_code=503, detail="DB disabled (DATABASE_URL/psycopg missing)")
    return wellbeing_stats(days=days)

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

    event = payload.model_dump()
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
                at_iso=str(event.get("at") or ""),
                rating=int(float(event.get("rating") or 0)),
                tag=str(event.get("tag") or "autre"),
                note=str(event.get("note") or ""),
                session_id=str(event.get("session_id") or ""),
                user_agent=str(event.get("_user_agent") or ""),
                client_ip=str(event.get("_client_ip") or "") or None,
            )
            return {"ok": True, "stored": "db"}
        except Exception:
            # fallback file
            pass

    line = json.dumps(event, ensure_ascii=False) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)
    return {"ok": True}


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
def list_runs(limit: int = 50):
    """
    Liste les derniers runs (métadonnées légères).
    """
    import json
    from pathlib import Path

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
def get_run(run_id: str):
    """
    Retourne les détails d'un run (texte + paths).
    """
    import json
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent
    run_dir = base_dir / "assets" / "runs" / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run introuvable")

    req = {}
    if (run_dir / "request.json").exists():
        try:
            req = json.loads((run_dir / "request.json").read_text(encoding="utf-8"))
        except Exception:
            req = {}

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
def delete_run(run_id: str):
    """
    Supprime un run (dossier assets/runs/<run_id>).
    """
    import shutil
    from pathlib import Path

    base_dir = Path(__file__).resolve().parent.parent
    run_dir = base_dir / "assets" / "runs" / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run introuvable")
    shutil.rmtree(run_dir, ignore_errors=True)
    return {"deleted": run_id}


@router.post("/generate", response_model=GenerationResponse)
async def generate(request: GenerationRequest):
    """
    Pipeline principal :
    1. Générer le texte structuré via Ollama.
    2. Générer/simuler la voix (WAV).
    3. Générer/simuler la musique d'ambiance.
    4. Générer/simuler un lit binaural (mixable).
    """
    from pathlib import Path
    base_dir = Path(__file__).resolve().parent.parent

    # Cache/fallback: si une génération échoue, on pourra renvoyer le dernier run OK pour ces paramètres.
    payload = request.model_dump()
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
        prompt = build_prompt(request)
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

