from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


@dataclass(frozen=True)
class AdminAppConfig:
    forced_generation_text: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "forced_generation_text": self.forced_generation_text,
            "updated_at": self.updated_at,
        }


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _base_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def _config_dir() -> Path:
    d = _base_dir() / "assets" / "state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _paths() -> Tuple[Path, Path, Path]:
    d = _config_dir()
    return (
        d / "admin_app_config.json",
        d / "admin_app_config.prev.json",
        d / "admin_app_config.history.jsonl",
    )


def _sanitize_text(s: str) -> str:
    s = (s or "").replace("\x00", "").strip()
    # Keep it reasonably small to avoid prompt explosions / accidental paste of secrets.
    if len(s) > 8000:
        s = s[:8000]
    return s


# Small in-process cache
_CACHE: Dict[str, Any] = {"at": 0.0, "data": None}


def load_admin_app_config(*, cache_ttl_s: int = 10) -> AdminAppConfig:
    now = time.time()
    cached = _CACHE.get("data")
    if cached and (now - float(_CACHE.get("at") or 0)) < max(1, int(cache_ttl_s)):
        return cached

    cfg_path, _prev, _hist = _paths()
    if not cfg_path.exists():
        cfg = AdminAppConfig(forced_generation_text="", updated_at="")
        _CACHE["at"] = now
        _CACHE["data"] = cfg
        return cfg

    try:
        raw = json.loads(cfg_path.read_text(encoding="utf-8"))
        forced = _sanitize_text(str(raw.get("forced_generation_text") or ""))
        updated_at = str(raw.get("updated_at") or "")
        cfg = AdminAppConfig(forced_generation_text=forced, updated_at=updated_at)
    except Exception:
        cfg = AdminAppConfig(forced_generation_text="", updated_at="")

    _CACHE["at"] = now
    _CACHE["data"] = cfg
    return cfg


def save_admin_app_config(new_forced_text: str) -> AdminAppConfig:
    """
    Save config with rollback protection:
    - write previous config to *.prev.json
    - append an audit line to history.jsonl
    - atomic write via temp file then replace
    """
    cfg_path, prev_path, hist_path = _paths()

    forced = _sanitize_text(new_forced_text)
    updated_at = _now_iso()
    next_cfg = AdminAppConfig(forced_generation_text=forced, updated_at=updated_at)

    # Backup previous config (best effort)
    try:
        if cfg_path.exists():
            prev_path.write_text(cfg_path.read_text(encoding="utf-8"), encoding="utf-8")
    except Exception:
        pass

    # Atomic write
    tmp = cfg_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(next_cfg.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(cfg_path)

    # Append history line (best effort)
    try:
        hist_path.parent.mkdir(parents=True, exist_ok=True)
        with hist_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"at": updated_at, **next_cfg.to_dict()}, ensure_ascii=False) + "\n")
    except Exception:
        pass

    _CACHE["at"] = time.time()
    _CACHE["data"] = next_cfg
    return next_cfg


def rollback_admin_app_config() -> AdminAppConfig:
    cfg_path, prev_path, _hist = _paths()
    if not prev_path.exists():
        return load_admin_app_config(cache_ttl_s=0)
    try:
        # Restore previous
        cfg_path.write_text(prev_path.read_text(encoding="utf-8"), encoding="utf-8")
    except Exception:
        pass
    _CACHE["at"] = 0.0
    _CACHE["data"] = None
    return load_admin_app_config(cache_ttl_s=0)


def reset_admin_app_config() -> AdminAppConfig:
    return save_admin_app_config("")

