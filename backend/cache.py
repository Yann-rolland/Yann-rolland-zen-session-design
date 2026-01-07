import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Optional


def stable_cache_key(payload: Dict[str, Any]) -> str:
    """Clé stable basée sur JSON trié (pour réutiliser les sorties)."""
    dumped = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(dumped).hexdigest()[:16]


def cache_dir(base_dir: Path) -> Path:
    return base_dir / "assets" / "cache"


def try_load_cached(base_dir: Path, key: str) -> Optional[Dict[str, Any]]:
    p = cache_dir(base_dir) / f"{key}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_cached(base_dir: Path, key: str, data: Dict[str, Any]) -> Path:
    d = cache_dir(base_dir)
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{key}.json"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return p

