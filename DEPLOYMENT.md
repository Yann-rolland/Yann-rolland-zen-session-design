## Deploy (Vercel + Render) + Supabase Auth (email/password)

### Frontend (Vercel)

- **Root Directory**: `zen-session-design-main/zen-session-design-main`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

Vercel env vars:
- **Required**
  - `VITE_API_BASE=https://<ton-backend-render>.onrender.com`
  - `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=<anon key (public)>`
- **Optional (invitation only)**
  - `VITE_INVITE_ONLY=true`
  - `VITE_ALLOWED_EMAILS=email1@domaine.com,email2@domaine.com`
- **Optional (Admin link only for you)**
  - `VITE_ADMIN_EMAILS=ton-email@domaine.com`

### Backend (Render)

- **Root directory**: `backend`
- **Build**: `pip install -r ../requirements.txt`
- **Start**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

Render env vars:
- `DATABASE_URL` (pooler + `?sslmode=require`)
- `ADMIN_TOKEN`
- `CORS_ORIGINS=https://<ton-frontend-vercel>.vercel.app`
- (optional) `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`

### Supabase: store email next to user id (DB)

Run once in Supabase SQL Editor:
- `backend/supabase_profiles.sql`

This creates `public.profiles` and a trigger so each signup automatically stores:
- `profiles.id` = `auth.users.id` (unique identifier)
- `profiles.email` = user email

