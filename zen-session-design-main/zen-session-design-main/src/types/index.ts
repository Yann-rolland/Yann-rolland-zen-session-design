// MaÏa Type Definitions

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

export interface SessionConfig {
  voiceVolume: number;
  musicVolume: number;
  binauralVolume: number;
  ambianceVolume: number;
  ambianceType: AmbianceType;
  binauralType: BinauralType;
  musicTrackId: MusicTrackId;
  playMusic: boolean;
  playNoise: boolean;
  playBinaural: boolean;
  duration: number; // in minutes
  fadeOutDuration: number; // in seconds
  loop: boolean;
  llmProvider: LLMProvider;
  ttsProvider: TTSProvider;
}

export type AmbianceType = 'pink-noise' | 'rain' | 'forest' | 'wind' | 'ocean' | 'fire' | 'none';
export type BinauralType = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'none';
export type MusicTrackId = 'user-slowlife' | 'user-slowmotion' | 'user-yesterday' | 'user-dawnofchange';
export type LLMProvider = 'gemini' | 'openai' | 'anthropic' | 'local';
export type TTSProvider = 'elevenlabs' | 'openai' | 'google' | 'local';

export interface SessionPhase {
  id: string;
  name: string;
  type: 'pre-ambiance' | 'induction' | 'deepening' | 'suggestions' | 'awakening' | 'post-ambiance';
  duration: number; // in seconds
  content?: string;
  audioUrl?: string;
  isComplete: boolean;
}

export interface SessionAudio {
  voiceUrl: string;
  musicUrl: string;
  binauralUrl: string;
  mixUrl?: string | null;
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  createdAt: Date;
  duration: number; // total duration in seconds
  phases: SessionPhase[];
  config: SessionConfig;
  audio: SessionAudio;
  status: 'created' | 'generating' | 'ready' | 'playing' | 'paused' | 'completed' | 'error';
  cacheHit?: boolean;
  // Backend diagnostics (useful when providers fallback)
  ttsProviderUsed?: string | null;
  ttsCacheHit?: boolean | null;
  ttsError?: string | null;
  llmProviderUsed?: string | null;
  llmFallback?: boolean | null;
  llmError?: string | null;
  audioStats?: any | null;
}

export interface HistoryEntry {
  id: string;
  sessionId: string;
  sessionTitle: string;
  playedAt: Date;
  duration: number;
  completedPhases: string[];
  config: SessionConfig;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentPhase?: SessionPhase;
  phaseProgress: number;
  volumes: {
    voice: number;
    music: number;
    binaural: number;
    ambiance: number;
  };
  isMuted: boolean;
  isFadingOut: boolean;
}

export interface AppSettings {
  zenMode: boolean;
  hideAdvancedSettings: boolean;
  defaultConfig: Partial<SessionConfig>;
  theme: 'dark' | 'system';
  notifications: boolean;
  autoPlay: boolean;
  shareWellBeingWithDeveloper: boolean;
}

// Gamification / Progress / Well-being
export type TrophyId =
  | "first_session"
  | "five_sessions"
  | "ten_sessions"
  | "one_hour"
  | "five_hours"
  | "streak_3"
  | "streak_7"
  | "wellbeing_first"
  | "wellbeing_7"
  | "mix_master"
  | "binaural_explorer"
  | "zen_master";

export interface Trophy {
  id: TrophyId;
  title: string;
  description: string;
  pointsReward: number;
}

export interface TrophyUnlock {
  id: TrophyId;
  unlockedAt: string; // ISO
}

export type WellBeingTag = "stress" | "sommeil" | "confiance" | "performance" | "douleur" | "autre";

export interface WellBeingEntry {
  id: string;
  at: string; // ISO
  rating: number; // 1..5
  note?: string;
  tag?: WellBeingTag;
  sessionId?: string;
}

export interface ProgressData {
  points: number;
  totalSessionsGenerated: number;
  totalSessionsCompleted: number;
  totalMinutes: number;
  streakDays: number;
  lastSessionDay?: string; // YYYY-MM-DD
  trophies: Record<TrophyId, TrophyUnlock | undefined>;
  wellbeing: WellBeingEntry[];
}
