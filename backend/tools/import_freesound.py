"""
Import Freesound previews into the local library (lightweight for mobile).

This script:
- searches Freesound
- downloads MP3 previews (no heavy originals)
- writes to: library/ambiences/freesound/audio/
- generates: library/ambiences/freesound/catalog.json (credits/licences)

Usage (PowerShell):
  $env:FREESOUND_API_KEY="YOUR_KEY"
  python tools/import_freesound.py --query "rain" --tag "rain" --limit 5 --license "cc0,by"
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

import httpx

API_BASE = "https://freesound.org/apiv2"


def slug(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")[:60] or "sound"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True, help="Search text (ex: rain, wind, forest)")
    ap.add_argument("--tag", default="", help="Optional tag filter")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--license", default="cc0,by", help="Accepted licenses: cc0,by (excludes NC)")
    ap.add_argument("--out", default="", help="Output library root (default: repo/library)")
    args = ap.parse_args()

    api_key = os.environ.get("FREESOUND_API_KEY")
    if not api_key:
        raise SystemExit("Missing env FREESOUND_API_KEY")

    # Resolve output path
    repo_root = Path(__file__).resolve().parents[2]
    library_root = Path(args.out).resolve() if args.out else (repo_root / "library")
    out_dir = library_root / "ambiences" / "freesound" / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)

    accepted = {x.strip().lower() for x in args.license.split(",") if x.strip()}

    headers = {"Authorization": f"Token {api_key}"}
    params = {
        "query": args.query,
        "fields": "id,name,username,license,previews,url",
        "page_size": min(max(args.limit, 1), 150),
        "filter": "duration:[20 TO 120]",  # loops raisonnables
    }
    if args.tag:
        params["filter"] += f" tag:{args.tag}"

    url = f"{API_BASE}/search/text/"
    with httpx.Client(timeout=60, headers=headers) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

        items = []
        for s in data.get("results", [])[: args.limit]:
            lic = str(s.get("license", "")).lower()
            # freedsound license strings include URLs; keep simple mapping
            lic_kind = "by" if "by" in lic and "nc" not in lic and "nd" not in lic and "sa" not in lic else ("cc0" if "zero" in lic or "cc0" in lic else "other")
            if lic_kind not in accepted:
                continue

            previews = s.get("previews") or {}
            mp3 = previews.get("preview-hq-mp3") or previews.get("preview-lq-mp3")
            if not mp3:
                continue

            fid = int(s["id"])
            name = str(s.get("name") or "")
            filename = f"{fid}_{slug(name)}.mp3"
            dst = out_dir / filename

            if not dst.exists():
                r2 = client.get(mp3)
                r2.raise_for_status()
                dst.write_bytes(r2.content)

            items.append(
                {
                    "id": fid,
                    "name": name,
                    "username": s.get("username"),
                    "license": s.get("license"),
                    "source_url": s.get("url"),
                    "file": f"/library/ambiences/freesound/audio/{filename}",
                    "query": args.query,
                    "tag": args.tag,
                }
            )

    catalog_path = library_root / "ambiences" / "freesound" / "catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(items)} items to {catalog_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
    


