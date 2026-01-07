# Bibliothèque audio locale (non versionnée)

Ce dossier est destiné à stocker des fichiers audio *externes* (ex: import Freesound)
sans alourdir le code du projet.

## Structure recommandée
```
library/
  ambiences/
    freesound/
      audio/
      catalog.json
  music/
    user/
      yesterday.mp3
      slowmotion.mp3
      slowlife.mp3
      dawnofchange.mp3
```

## Accès depuis l'application
Le backend sert ce dossier via l'URL:
- `http://localhost:8006/library/...`

Exemples:
- `http://localhost:8006/library/ambiences/freesound/audio/xxx.mp3`
- `http://localhost:8006/library/music/user/yesterday.mp3`

## Note
Si tu utilises Git, pense à ignorer `library/` (ne pas committer les sons).

