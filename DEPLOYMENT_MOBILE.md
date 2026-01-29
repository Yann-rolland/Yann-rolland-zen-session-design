# MaÏa — Mobile (PWA maintenant, app mobile ensuite)

## PWA (installable sur téléphone) — maintenant

Déjà ajouté dans le frontend:
- `public/manifest.webmanifest`
- `public/sw.js` (service worker minimal)
- Enregistrement du SW dans `src/main.tsx`
- `index.html` contient `manifest` + `theme-color` + `viewport-fit=cover`

### Tester sur téléphone
- Ouvre l’URL Vercel sur iOS/Android.
- Android/Chrome: menu ⋮ → **Installer l'application**.
- iOS/Safari: bouton partage → **Sur l'écran d'accueil**.

> Note: pour une PWA “parfaite”, il faudra des icônes PNG 192/512 réelles (on peut les générer depuis ton logo).

## App mobile (store) — plus tard

### Option recommandée: Capacitor (wrap du site)
1. Installer Capacitor dans le frontend:
   - `npm i @capacitor/core @capacitor/cli`
2. `npx cap init` (nom + id, ex: `com.maia.app`)
3. Ajouter plateformes:
   - `npx cap add android`
   - `npx cap add ios`
4. Build web puis sync:
   - `npm run build`
   - `npx cap sync`
5. Ouvrir:
   - `npx cap open android`
   - `npx cap open ios`

### Points importants audio (mobile)
- iOS impose un “user gesture” pour démarrer l’audio (bouton Play).
- Éviter l’autoplay.
- Gérer “silent mode” selon besoin (Capacitor/Native config).

