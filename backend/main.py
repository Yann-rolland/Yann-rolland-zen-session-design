import os
import sys
from pathlib import Path

from fastapi.responses import RedirectResponse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from api import router as api_router
import api as api_module
import llm as llm_module
from db import init_db

IS_FROZEN = bool(getattr(sys, "frozen", False))

# Charge un fichier env local automatiquement (pour éviter de retaper DATABASE_URL / ADMIN_TOKEN).
# En production, on utilisera plutôt les variables d'environnement du provider.
try:
    from dotenv import load_dotenv  # type: ignore

    env_dir = Path(__file__).resolve().parent
    # NB: on charge env.local (non bloqué / non versionné) puis .env si présent
    # En dev, on veut que le fichier local gagne même si une vieille variable est restée set
    # dans le terminal. En prod, utilisez les variables d'environnement du provider.
    load_dotenv(env_dir / "env.local", override=True)
    load_dotenv(env_dir / ".env", override=True)
except Exception:
    pass

# En mode "exe" (PyInstaller), les fichiers packagés sont dans sys._MEIPASS.
# On garde assets/ et library/ à côté de l'exe (dossier courant) car ce sont des fichiers "writable".
if IS_FROZEN:
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", Path.cwd()))
    FRONTEND_DIST_DIR = BUNDLE_DIR / "frontend_dist"
    ASSETS_DIR = Path.cwd() / "assets"
    LIBRARY_DIR = Path.cwd() / "library"
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
    FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
    ASSETS_DIR = BASE_DIR / "assets"
    LIBRARY_DIR = BASE_DIR / "library"

app = FastAPI(
    title="Hypnotic AI",
    description="MVP local de génération de sessions hypnotiques (texte + audio).",
    version="0.1.0",
)

# --- Security hardening (baseline) ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp: Response = await call_next(request)
        # Basic hardening headers (safe for API responses).
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()",
        )
        # Only set HSTS when served over HTTPS (Render/Vercel). Avoid breaking local dev.
        try:
            if (request.url.scheme or "").lower() == "https":
                resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        except Exception:
            pass
        return resp


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, max_bytes: int = 60 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = int(max_bytes)

    async def dispatch(self, request, call_next):
        # Best effort: use Content-Length if present.
        try:
            cl = request.headers.get("content-length")
            if cl and int(cl) > self.max_bytes:
                return Response("Request too large", status_code=413)
        except Exception:
            pass
        return await call_next(request)


# Apply hardening middlewares early.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=int(os.environ.get("MAX_REQUEST_BYTES", "62914560")))

# Lightweight in-memory rate limiting (single instance). Configure via env:
# - RATE_LIMIT_RPM: requests per minute per IP per bucket (default: 120)
# - RATE_LIMIT_ADMIN_RPM: stricter admin routes (default: 60)
class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits = {}  # (bucket, ip) -> (window_start_s, count)
        self._rpm = int(os.environ.get("RATE_LIMIT_RPM", "120"))
        self._admin_rpm = int(os.environ.get("RATE_LIMIT_ADMIN_RPM", "60"))

    def _key(self, request) -> tuple[str, str]:
        path = str(getattr(request.url, "path", "") or "")
        if path.startswith("/admin/"):
            bucket = "admin"
        elif path.startswith("/generate"):
            bucket = "generate"
        elif path.startswith("/chat"):
            bucket = "chat"
        elif path.startswith("/feedback/"):
            bucket = "feedback"
        else:
            bucket = "other"
        ip = ""
        try:
            ip = getattr(getattr(request, "client", None), "host", "") or ""
        except Exception:
            ip = ""
        # If behind proxy, you can enable trusting X-Forwarded-For via your reverse proxy settings.
        # We keep it simple and do not trust XFF by default.
        return (bucket, ip or "unknown")

    async def dispatch(self, request, call_next):
        bucket, ip = self._key(request)
        # Only limit sensitive buckets to avoid breaking static files.
        if bucket not in ("admin", "generate", "chat", "feedback"):
            return await call_next(request)

        limit = self._admin_rpm if bucket == "admin" else self._rpm
        now = __import__("time").time()
        win = 60.0
        k = (bucket, ip)
        start, count = self._hits.get(k, (now, 0))
        if now - float(start) >= win:
            start, count = now, 0
        count += 1
        self._hits[k] = (start, count)
        if count > limit:
            return Response("Rate limit exceeded", status_code=429)
        return await call_next(request)


app.add_middleware(SimpleRateLimitMiddleware)

# Initialise DB (Supabase/Postgres) si DATABASE_URL est défini
try:
    init_db()
except Exception:
    # Ne bloque pas le démarrage (fallback file-based possible)
    pass

# CORS:
# - En dev: ports Vite locaux
# - En prod: set CORS_ORIGINS="https://ton-frontend.com,https://www.ton-frontend.com"
# IMPORTANT:
# - WebAudio (MediaElementSource) + crossOrigin="anonymous" nécessite des headers CORS valides.
# - Le combo allow_credentials=True + allow_origins=["*"] est rejeté par les navigateurs.
cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if cors_env:
    allow_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
    # Si l'utilisateur configure CORS_ORIGINS avec localhost en dev, on autorise localhost sur n'importe quel port
    # (Vite peut basculer 8080 -> 8081 si le port est pris).
    if any(
        o.startswith("http://localhost")
        or o.startswith("http://127.0.0.1")
        or o.startswith("https://localhost")
        or o.startswith("https://127.0.0.1")
        for o in allow_origins
    ):
        allow_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    else:
        # Support Vercel preview deployments.
        # If you allow https://my-app.vercel.app, Vercel may serve previews like:
        # https://my-app-<hash>.vercel.app
        # We derive a regex that matches the allowed Vercel project(s) + their preview subdomains.
        try:
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
                # allow: https://<base>.vercel.app and https://<base>-<anything>.vercel.app
                allow_origin_regex = rf"^https://(?:{'|'.join(vercel_hosts)})(?:-[a-z0-9-]+)*\.vercel\.app$"
            else:
                allow_origin_regex = None
        except Exception:
            allow_origin_regex = None
else:
    allow_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        # Vite peut aussi choisir un autre port (ex: 8080)
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]
    # En dev, Vite peut changer de port: on autorise localhost/127.0.0.1 sur n'importe quel port.
    allow_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expose les assets audio/musique pour le frontend
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

# Expose la bibliothèque audio locale (Freesound / imports) sans l'intégrer au repo.
# URL: /library/...
LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/library", StaticFiles(directory=str(LIBRARY_DIR)), name="library")


@app.get("/health")
def healthcheck():
    return {"status": "ok"}

@app.get("/debug/imports")
def debug_imports():
    return {
        "api_file": getattr(api_module, "__file__", None),
        "llm_file": getattr(llm_module, "__file__", None),
        "ollama_model": getattr(llm_module, "MODEL", None),
        "ollama_url": getattr(llm_module, "OLLAMA_URL", None),
    }


app.include_router(api_router)

# Serve le frontend (build Vite) depuis le backend => ton client n'a qu'à lancer l'exe.
# IMPORTANT: on sert le frontend sous /ui/ pour éviter toute collision avec /generate, /runs, /assets (audio).
if FRONTEND_DIST_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIST_DIR), html=True), name="frontend")


@app.get("/")
def root():
    # Page d'accueil: redirige vers l'UI
    return RedirectResponse(url="/ui/")


def main():
    """
    Entrypoint "double-clic" pour l'exe Windows.
    Lance le serveur et ouvre le navigateur.
    """
    import webbrowser
    import uvicorn

    port = int(os.environ.get("PORT", "8006"))
    url = f"http://127.0.0.1:{port}/"
    try:
        webbrowser.open(url)
    except Exception:
        pass
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()

