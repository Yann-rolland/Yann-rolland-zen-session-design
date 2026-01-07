import { createPinkNoiseBuffer, createRainBuffer, createWindBuffer } from "./generators";

/**
 * Catalogue des ambiances :
 * - "generated" => WebAudio buffer (léger, pas de fichier)
 * - "file" => fichier dans /public/ambiences (mp3/ogg optimisé)
 */
export const AMBIENCES = [
  {
    id: "pink",
    label: "Bruit rose",
    type: "generated",
    makeBuffer: (ctx) => createPinkNoiseBuffer(ctx, 12),
  },
  {
    id: "rain",
    label: "Pluie",
    type: "generated",
    makeBuffer: (ctx) => createRainBuffer(ctx, 12),
  },
  {
    id: "wind",
    label: "Vent léger",
    type: "generated",
    makeBuffer: (ctx) => createWindBuffer(ctx, 12),
  },
  {
    id: "forest",
    label: "Forêt (fichier - optionnel)",
    type: "file",
    // Place ton fichier ici: frontend/public/ambiences/forest.mp3
    src: "/ambiences/forest.mp3",
  },
  {
    id: "freesound-rain",
    label: "Pluie (Freesound import)",
    type: "file",
    // Exemple: ce fichier sera servi par le backend via /library/...
    // Chemin final typique: /library/ambiences/freesound/audio/<id>_<name>.mp3
    //src: "/library/ambiences/freesound/audio/example_rain.mp3",
    src: "/library/ambiences/freesound/audio/396318_20170628_heavy_rain_in_bangkok_03.mp3",
  },
  // Musiques "user" (dans library/music/user/)
  {
    id: "user-yesterday",
    label: "Yesterday (musique)",
    type: "file",
    src: "/library/music/user/yesterday.mp3",
  },
  {
    id: "user-slowmotion",
    label: "Slowmotion (musique)",
    type: "file",
    src: "/library/music/user/slowmotion.mp3",
  },
  {
    id: "user-slowlife",
    label: "Slowlife (musique)",
    type: "file",
    src: "/library/music/user/slowlife.mp3",
  },
  {
    id: "user-dawnofchange",
    label: "Dawn of change (musique)",
    type: "file",
    src: "/library/music/user/dawnofchange.mp3",
  },
];


