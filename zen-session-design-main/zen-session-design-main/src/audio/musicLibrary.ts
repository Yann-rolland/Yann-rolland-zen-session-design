import { MusicTrackId } from "@/types";

export const MUSIC_TRACKS: Array<{ id: MusicTrackId; label: string; file: string }> = [
  { id: "user-slowlife", label: "Slowlife", file: "slowlife.mp3" },
  { id: "user-slowmotion", label: "Slowmotion", file: "slowmotion.mp3" },
  { id: "user-yesterday", label: "Yesterday", file: "yesterday.mp3" },
  { id: "user-dawnofchange", label: "Dawn of Change", file: "dawnofchange.mp3" },
];

export function musicFileForId(id: MusicTrackId): string {
  return MUSIC_TRACKS.find((t) => t.id === id)?.file || "slowlife.mp3";
}


