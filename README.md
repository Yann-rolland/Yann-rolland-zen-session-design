# Hypnotic AI (MVP local)

Generateur local de sessions d'hypnose personnalisées (texte + voix + musique + battements binauraux). Backend FastAPI piloté par Ollama (Llama 3 installé), frontend React léger via Vite.

## Pré-requis
- Python 3.10+
- Node.js 18+
- Ollama installé et modèle `llama3` disponible (ou ajuster dans `backend/llm.py`)
 - (Optionnel) une clé Gemini si vous voulez utiliser Gemini au lieu d'Ollama (voir plus bas)

## Installation backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r ../requirements.txt
```

## Lancer le backend
```bash
cd backend
uvicorn main:app --reload --port 8005
```

> Si le port 8000 est occupé, utilisez `--port 8005` (valeur par défaut côté frontend ajustée à 8005, version avec mixdown+cache).

## Installation frontend
```bash
cd frontend
npm install
npm run dev
```

Le frontend attend le backend sur `http://localhost:8005` par défaut (surchargable via `VITE_API_BASE`).

## Choix du générateur de texte (Ollama vs Gemini)
- **Ollama (local)** : par défaut (`llm_provider="ollama"`).
- **Gemini (API)** : mettez `llm_provider="gemini"` + configurez la variable d'environnement `GEMINI_API_KEY` côté backend.

Exemple Windows (PowerShell) :
```powershell
$env:GEMINI_API_KEY="VOTRE_CLE"
```

Fichier d'exemple : `backend/env.example`

## Exemple d'appel API
```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d "{\"objectif\":\"stress\",\"duree_minutes\":15,\"style\":\"ericksonien\"}"
```

Avec port 8004 :
```bash
curl -X POST http://localhost:8004/generate \
  -H "Content-Type: application/json" \
  -d "{\"objectif\":\"stress\",\"duree_minutes\":15,\"style\":\"ericksonien\"}"
```

Avec port 8005 (mixdown+cache) :
```bash
curl -X POST http://localhost:8005/generate \
  -H "Content-Type: application/json" \
  -d "{\"objectif\":\"stress\",\"duree_minutes\":15,\"style\":\"ericksonien\",\"mixdown\":true,\"llm_provider\":\"ollama\"}"
```

## Structure
```
hypnotic-ai/
├── backend/           # FastAPI + pipeline (LLM, TTS, musique, binaural)
├── frontend/          # React (Vite) interface simple
├── assets/            # Sorties audio par défaut
├── requirements.txt
└── README.md
```

## Notes MVP
- `tts.py`, `music.py`, `binaural.py` contiennent des placeholders reproductibles pour générer des WAV simples. Ils sont conçus pour être remplacés par des moteurs réels (Coqui XTTS, Kokoro, ElevenLabs, générateurs musicaux).
- Les fichiers audio sont écrits dans `assets/audio/session.wav` et `assets/music/ambient.wav`.
- Le prompt LLM impose la structure Induction → Approfondissement → Travail → Intégration → Réveil avec formulations PNL obligatoires.

## Git / GitHub (publication)
Ce repo contient des **fichiers générés** (runs, audio, caches) et des **sons locaux** (`library/`) qui ne doivent pas partir sur GitHub.

- Un `.gitignore` racine est fourni et ignore notamment:
  - `assets/runs/`, `assets/cache/`, `assets/tts_cache/`, `assets/state/`
  - `library/` (en gardant `library/README.md`)
  - `node_modules/`, `dist/`, `.venv/`
  - `.env` / variables sensibles (`DATABASE_URL`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, etc.)

### Commandes (Windows / PowerShell ou cmd)
À la racine `D:\BN-3`:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <URL_DU_REPO_GITHUB>
git push -u origin main
```

Si tu as déjà ajouté des fichiers avant le `.gitignore` (ex: `library/`), retire-les de l'index:

```bash
git rm -r --cached library assets/runs assets/cache assets/tts_cache assets/state
git commit -m "Stop tracking generated/local files"
```

## Démarrage rapide (Windows)

### Backend
Le backend lit automatiquement `backend/env.local` (non versionné) pour `DATABASE_URL` et `ADMIN_TOKEN`.

- Lance:

```powershell
cd D:\BN-3\backend
.\run.ps1
```

### Frontend (Lovable)

```powershell
cd D:\BN-3\zen-session-design-main\zen-session-design-main
.\run.ps1
```

## Étape 3 (Cloud ambiances) — Supabase Storage
Le backend peut streamer musique + ambiances depuis **Supabase Storage** (bucket privé) via des **URLs signées**.

### 1) Créer le bucket
Dans Supabase → Storage:
- crée un bucket privé (ex: `bn3-audio`)
- upload tes fichiers aux chemins suivants:
  - `music/user/slowlife.mp3`
  - `music/user/slowmotion.mp3`
  - `music/user/yesterday.mp3`
  - `music/user/dawnofchange.mp3`
  - `ambiences/rain.mp3`
  - `ambiences/forest.mp3`
  - `ambiences/ocean.mp3`
  - `ambiences/wind.mp3`
  - `ambiences/fire.mp3`
  - `ambiences/pink-noise.mp3`

### 2) Configurer le backend (local)
Dans `backend/env.local` (non versionné), ajoute:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_STORAGE_BUCKET=bn3-audio
SUPABASE_SIGNED_URL_EXPIRES=3600
```

### 3) Vérifier
- `GET http://127.0.0.1:8006/cloud-audio/catalog` doit retourner `enabled:true` et des URLs dans `music` / `ambiences`.
- Le frontend utilisera automatiquement le cloud si dispo (sinon fallback `/library` local).

## Déploiement (prod)

### Backend (Render)
Ce repo inclut un `render.yaml` prêt à l'emploi.

- **Root directory**: `backend`
- **Build**: `pip install -r ../requirements.txt`
- **Start**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

Variables Render à définir:
- `DATABASE_URL` (pooler + `?sslmode=require`)
- `ADMIN_TOKEN`
- `CORS_ORIGINS` = `https://<ton-frontend-vercel>.vercel.app`
- (optionnel) `GEMINI_API_KEY`
- (optionnel) `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`

### Frontend (Vercel)
Le frontend Lovable est dans `zen-session-design-main/zen-session-design-main` (avec un `vercel.json`).

Dans Vercel:
- **Root Directory**: `zen-session-design-main/zen-session-design-main`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment**: `VITE_API_BASE=https://<ton-backend-render>.onrender.com`

Ajoute aussi (pour l’auth email + mot de passe Supabase) :
- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon key (public)>`

Optionnel (mode “par invitation”) :
- `VITE_INVITE_ONLY=true`
- `VITE_ALLOWED_EMAILS=email1@domaine.com,email2@domaine.com`

Optionnel (UI Admin seulement pour toi) :
- `VITE_ADMIN_EMAILS=ton-email@domaine.com`

## Supabase Auth — stocker email à côté de l’identifiant

Supabase Auth stocke déjà l’email dans `auth.users`, mais pour avoir un tableau “propre” dans ton schéma public
avec `id + email`, exécute une fois dans Supabase (SQL Editor) :

- `backend/supabase_profiles.sql`
