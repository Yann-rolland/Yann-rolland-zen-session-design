from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Dict, Optional


def get_database_url() -> str:
    """
    Returns a psycopg-compatible DATABASE_URL.

    Supabase sometimes provides pooler URLs with extra params like `pgbouncer=true`.
    psycopg3 rejects unknown query parameters, so we strip those.
    """
    raw = (os.environ.get("DATABASE_URL", "") or "").strip()
    if not raw:
        return ""
    try:
        from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

        u = urlsplit(raw)
        q = [(k, v) for (k, v) in parse_qsl(u.query, keep_blank_values=True) if k.lower() != "pgbouncer"]
        new_query = urlencode(q, doseq=True)
        return urlunsplit((u.scheme, u.netloc, u.path, new_query, u.fragment))
    except Exception:
        # If parsing fails, keep raw (best effort).
        return raw


def db_enabled() -> bool:
    if not get_database_url():
        return False
    try:
        import psycopg  # noqa: F401
    except Exception:
        return False
    return True


@contextmanager
def get_conn():
    """
    Connexion Postgres (Supabase ou autre Postgres).
    - DATABASE_URL doit être défini.
    """
    import psycopg

    url = get_database_url()
    if not url:
        raise RuntimeError("DATABASE_URL manquant")
    # autocommit pour simplifier (events append + upsert)
    with psycopg.connect(url, autocommit=True) as conn:
        yield conn


def init_db() -> None:
    """
    Crée les tables si elles n'existent pas.
    Schéma portable (Postgres standard).
    """
    if not db_enabled():
        return
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                create table if not exists client_state (
                  device_id text primary key,
                  state_json jsonb not null,
                  updated_at timestamptz not null default now()
                );
                """
            )
            # Per-user state (recommended): isolates progress/settings/history by Supabase user_id
            cur.execute(
                """
                create table if not exists user_state (
                  user_id uuid primary key,
                  state_json jsonb not null,
                  updated_at timestamptz not null default now()
                );
                """
            )
            cur.execute(
                """
                create table if not exists wellbeing_events (
                  id text primary key,
                  device_id text not null,
                  user_id uuid,
                  user_email text,
                  at timestamptz not null,
                  rating int not null,
                  tag text not null,
                  note text not null,
                  session_id text not null,
                  received_at timestamptz not null default now(),
                  user_agent text not null default '',
                  client_ip text
                );
                """
            )
            # Backward-compatible migrations (in case the table existed before adding user columns)
            cur.execute("alter table wellbeing_events add column if not exists user_id uuid;")
            cur.execute("alter table wellbeing_events add column if not exists user_email text;")
            # Helpful indexes for per-user analysis
            cur.execute("create index if not exists idx_wellbeing_user_id on wellbeing_events(user_id);")
            cur.execute("create index if not exists idx_wellbeing_device_id on wellbeing_events(device_id);")
            cur.execute("create index if not exists idx_wellbeing_received_at on wellbeing_events(received_at);")


def upsert_client_state(device_id: str, state: Dict[str, Any]) -> None:
    if not db_enabled():
        raise RuntimeError("DB disabled")
    payload = json.dumps(state, ensure_ascii=False)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into client_state(device_id, state_json, updated_at)
                values (%s, %s::jsonb, now())
                on conflict (device_id)
                do update set state_json = excluded.state_json, updated_at = now();
                """,
                (device_id, payload),
            )


def upsert_user_state(user_id: str, state: Dict[str, Any]) -> None:
    if not db_enabled():
        raise RuntimeError("DB disabled")
    payload = json.dumps(state, ensure_ascii=False)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into user_state(user_id, state_json, updated_at)
                values (%s::uuid, %s::jsonb, now())
                on conflict (user_id)
                do update set state_json = excluded.state_json, updated_at = now();
                """,
                (user_id, payload),
            )


def get_user_state(user_id: str) -> Optional[Dict[str, Any]]:
    if not db_enabled():
        return None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("select state_json from user_state where user_id=%s::uuid", (user_id,))
            row = cur.fetchone()
            if not row:
                return None
            val = row[0]
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except Exception:
                    return None
            if isinstance(val, dict):
                return val
            return json.loads(json.dumps(val))


def get_client_state(device_id: str) -> Optional[Dict[str, Any]]:
    if not db_enabled():
        return None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("select state_json from client_state where device_id=%s", (device_id,))
            row = cur.fetchone()
            if not row:
                return None
            # psycopg renvoie jsonb déjà parsé en dict si loaders actifs, sinon string
            val = row[0]
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except Exception:
                    return None
            if isinstance(val, dict):
                return val
            return json.loads(json.dumps(val))


def insert_wellbeing_event(
    *,
    event_id: str,
    device_id: str,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    at_iso: str,
    rating: int,
    tag: str,
    note: str,
    session_id: str,
    user_agent: str = "",
    client_ip: Optional[str] = None,
) -> None:
    if not db_enabled():
        raise RuntimeError("DB disabled")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into wellbeing_events(
                  id, device_id, user_id, user_email, at, rating, tag, note, session_id, user_agent, client_ip
                )
                values (%s, %s, %s::uuid, %s, %s::timestamptz, %s, %s, %s, %s, %s, %s)
                on conflict (id) do nothing;
                """,
                (
                    event_id,
                    device_id,
                    (user_id or None),
                    (user_email or None),
                    at_iso,
                    int(rating),
                    tag,
                    note,
                    session_id,
                    user_agent or "",
                    client_ip,
                ),
            )


def list_wellbeing_events(
    *,
    limit: int = 200,
    device_id: Optional[str] = None,
    tag: Optional[str] = None,
    days: Optional[int] = None,
) -> list[dict]:
    if not db_enabled():
        raise RuntimeError("DB disabled")
    limit = max(1, min(int(limit or 200), 2000))

    where = []
    params: list[Any] = []
    if device_id:
        where.append("device_id = %s")
        params.append(device_id)
    if tag:
        where.append("tag = %s")
        params.append(tag)
    if days and int(days) > 0:
        where.append("received_at >= now() - (%s || ' days')::interval")
        params.append(int(days))

    where_sql = f"where {' and '.join(where)}" if where else ""
    sql = f"""
        select id, device_id, user_id, user_email, at, rating, tag, note, session_id, received_at, user_agent, client_ip
        from wellbeing_events
        {where_sql}
        order by received_at desc
        limit {limit};
    """

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall() or []

    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r[0],
                "device_id": r[1],
                "user_id": (str(r[2]) if r[2] is not None else None),
                "user_email": (r[3] if r[3] is not None else None),
                "at": (r[4].isoformat() if hasattr(r[4], "isoformat") else str(r[4])),
                "rating": int(r[5]),
                "tag": r[6],
                "note": r[7],
                "session_id": r[8],
                "received_at": (r[9].isoformat() if hasattr(r[9], "isoformat") else str(r[9])),
                "user_agent": r[10],
                "client_ip": r[11],
            }
        )
    return out


def wellbeing_stats(*, days: int = 30) -> dict:
    """
    Statistiques simples (pour une page admin):
    - total events sur N jours
    - moyenne rating
    - répartition par tag
    - série journalière (count + avg)
    """
    if not db_enabled():
        raise RuntimeError("DB disabled")
    days = max(1, min(int(days or 30), 365))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select count(*), coalesce(avg(rating), 0)
                from wellbeing_events
                where received_at >= now() - (%s || ' days')::interval;
                """,
                (days,),
            )
            total, avg_rating = cur.fetchone() or (0, 0)

            cur.execute(
                """
                select tag, count(*), coalesce(avg(rating), 0)
                from wellbeing_events
                where received_at >= now() - (%s || ' days')::interval
                group by tag
                order by count(*) desc;
                """,
                (days,),
            )
            by_tag_rows = cur.fetchall() or []

            cur.execute(
                """
                select date_trunc('day', received_at) as day, count(*), coalesce(avg(rating), 0)
                from wellbeing_events
                where received_at >= now() - (%s || ' days')::interval
                group by day
                order by day asc;
                """,
                (days,),
            )
            by_day_rows = cur.fetchall() or []

    by_tag = [
        {"tag": t, "count": int(c), "avg_rating": float(a)} for (t, c, a) in by_tag_rows
    ]
    series = [
        {
            "day": (d.date().isoformat() if hasattr(d, "date") else str(d)),
            "count": int(c),
            "avg_rating": float(a),
        }
        for (d, c, a) in by_day_rows
    ]

    return {
        "days": days,
        "total": int(total),
        "avg_rating": float(avg_rating),
        "by_tag": by_tag,
        "series": series,
    }


