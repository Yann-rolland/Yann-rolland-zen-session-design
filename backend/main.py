import os
import sys
from pathlib import Path

from fastapi.responses import RedirectResponse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

