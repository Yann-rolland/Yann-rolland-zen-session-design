import { BackendObjectif, BackendStyle } from "@/api/hypnoticApi";
import { AmbianceType, BinauralType, MusicTrackId, SessionConfig } from "@/types";

export type PresetId = BackendObjectif;

export type Preset = {
  id: PresetId;
  title: string;
  subtitle: string;
  objectif: BackendObjectif;
  style: BackendStyle;
  prompt: string;
  config: Partial<SessionConfig>;
};

export const PRESETS: Preset[] = [
  {
    id: "stress",
    title: "Anti‑stress",
    subtitle: "Calme + recentrage",
    objectif: "stress",
    style: "ericksonien",
    prompt: "Je veux relâcher le stress et retrouver un état de calme, de sécurité et de clarté.",
    config: {
      duration: 15,
      playMusic: true,
      musicTrackId: "user-slowlife" as MusicTrackId,
      musicVolume: 35,
      playNoise: true,
      ambianceType: "rain" as AmbianceType,
      ambianceVolume: 30,
      playBinaural: true,
      binauralType: "alpha" as BinauralType,
      binauralVolume: 25,
      voiceVolume: 85,
      fadeOutDuration: 20,
    },
  },
  {
    id: "sommeil",
    title: "Sommeil",
    subtitle: "Endormissement profond",
    objectif: "sommeil",
    style: "métaphorique",
    prompt: "Je veux m'endormir facilement et dormir profondément, en laissant mon corps se relâcher complètement.",
    config: {
      duration: 30,
      playMusic: true,
      musicTrackId: "user-yesterday" as MusicTrackId,
      musicVolume: 25,
      playNoise: true,
      ambianceType: "ocean" as AmbianceType,
      ambianceVolume: 25,
      playBinaural: true,
      binauralType: "delta" as BinauralType,
      binauralVolume: 20,
      voiceVolume: 75,
      fadeOutDuration: 30,
    },
  },
  {
    id: "confiance",
    title: "Confiance",
    subtitle: "Assurance + présence",
    objectif: "confiance",
    style: "ericksonien",
    prompt: "Je veux renforcer ma confiance en moi, mon assurance et ma présence, naturellement et durablement.",
    config: {
      duration: 18,
      playMusic: true,
      musicTrackId: "user-dawnofchange" as MusicTrackId,
      musicVolume: 30,
      playNoise: false,
      ambianceType: "none" as AmbianceType,
      ambianceVolume: 0,
      playBinaural: true,
      binauralType: "alpha" as BinauralType,
      binauralVolume: 25,
      voiceVolume: 85,
      fadeOutDuration: 20,
    },
  },
  {
    id: "performance",
    title: "Performance",
    subtitle: "Focus + énergie",
    objectif: "performance",
    style: "cinématographique",
    prompt: "Je veux entrer en état de focus, d'énergie et de performance, tout en restant calme et lucide.",
    config: {
      duration: 12,
      playMusic: true,
      musicTrackId: "user-slowmotion" as MusicTrackId,
      musicVolume: 20,
      playNoise: false,
      ambianceType: "none" as AmbianceType,
      ambianceVolume: 0,
      playBinaural: true,
      binauralType: "gamma" as BinauralType,
      binauralVolume: 20,
      voiceVolume: 90,
      fadeOutDuration: 10,
    },
  },
  {
    id: "douleur",
    title: "Douleur",
    subtitle: "Apaisement + relâchement",
    objectif: "douleur",
    style: "classique",
    prompt: "Je veux apaiser la douleur et relâcher les tensions, en laissant mon corps se détendre en sécurité.",
    config: {
      duration: 20,
      playMusic: true,
      musicTrackId: "user-slowlife" as MusicTrackId,
      musicVolume: 25,
      playNoise: true,
      ambianceType: "forest" as AmbianceType,
      ambianceVolume: 25,
      playBinaural: true,
      binauralType: "theta" as BinauralType,
      binauralVolume: 20,
      voiceVolume: 80,
      fadeOutDuration: 25,
    },
  },
];

export function applyPresetToConfig(base: SessionConfig, preset: Preset): SessionConfig {
  return { ...base, ...preset.config };
}


