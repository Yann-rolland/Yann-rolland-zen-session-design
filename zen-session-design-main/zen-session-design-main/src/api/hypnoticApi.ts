export type BackendObjectif = "sommeil" | "stress" | "confiance" | "performance" | "douleur";
export type BackendStyle = "ericksonien" | "classique" | "métaphorique" | "cinématographique";
export type BackendLLMProvider = "ollama" | "gemini";
export type BackendTTSProvider = "local" | "elevenlabs";
export type BackendBinauralBand = "auto" | "delta" | "theta" | "alpha" | "beta" | "gamma";

export interface GenerationRequest {
  objectif: BackendObjectif;
  duree_minutes: number;
  style: BackendStyle;
  llm_provider?: BackendLLMProvider;
  gemini_model?: string;
  mixdown?: boolean;
  voice_volume?: number;
  music_volume?: number;
  binaural_volume?: number;
  voice_offset_s?: number;
  music_offset_s?: number;
  binaural_offset_s?: number;
  binaural_band?: BackendBinauralBand;
  binaural_beat_hz?: number;
  tts_provider?: BackendTTSProvider;
  elevenlabs_voice_id?: string;
  elevenlabs_stability?: number;
  elevenlabs_similarity_boost?: number;
  elevenlabs_style?: number;
  elevenlabs_use_speaker_boost?: boolean;
}

export interface GenerationResponse {
  texte: {
    induction: string;
    approfondissement: string;
    travail: string;
    integration: string;
    reveil: string;
  };
  tts_audio_path: string;
  music_path: string;
  binaural_path: string;
  mix_path?: string | null;
  run_id?: string | null;
  llm_provider_used?: string | null;
  llm_fallback?: boolean | null;
  llm_error?: string | null;
  binaural_band_used?: string | null;
  binaural_beat_hz_used?: number | null;
  tts_provider_used?: string | null;
  tts_cache_hit?: boolean | null;
  tts_error?: string | null;
}

export interface RunsListResponse {
  runs: Array<{
    run_id: string;
    created_at: number;
    objectif?: string | null;
    duree_minutes?: number | null;
    style?: string | null;
    has_mix?: boolean;
  }>;
}

export interface RunDetailResponse {
  run_id: string;
  request?: any;
  texte?: any;
  tts_audio_path: string;
  music_path: string;
  binaural_path: string;
  mix_path?: string | null;
  binaural_band_used?: string | null;
  binaural_beat_hz_used?: number | null;
  tts_provider_used?: string | null;
  tts_cache_hit?: boolean | null;
  tts_error?: string | null;
}

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) return String(envBase).replace(/\/+$/, "");
  const fallback = "http://127.0.0.1:8006";

  if (typeof window !== "undefined") {
    try {
      const host = String(window.location?.hostname || "").toLowerCase();
      const origin = String(window.location?.origin || "");
      // In production on Vercel, prefer same-origin proxy to avoid CORS/network/adblock issues:
      // Vercel rewrite: /api/* -> https://bn3-backend-fyjg.onrender.com/*
      if (origin && host.endsWith(".vercel.app")) {
        return `${origin}/api`;
      }
      if (host.endsWith(".vercel.app")) {
        return "https://bn3-backend-fyjg.onrender.com";
      }
      if (origin && (host === "127.0.0.1" || host === "localhost")) {
        const u = new URL(origin);
        if (u.port === "8006" || u.port === "8005" || u.port === "8000") return u.origin;
      }
    } catch {
    }
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    try {
      const u = new URL(window.location.origin);
      if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
        if (u.port === "8006" || u.port === "8005" || u.port === "8000") return u.origin;
      }
    } catch {
    }
  }

  return fallback;
}

export function getApiBase(): string {
  return resolveApiBase();
}

function joinUrl(base: string, path: string): string {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export function assetUrl(path: string): string {
  return joinUrl(getApiBase(), path);
}

export function libraryUrl(path: string): string {
  const p = String(path || "");
  if (p.startsWith("/library/")) return joinUrl(getApiBase(), p);
  if (p.startsWith("library/")) return joinUrl(getApiBase(), `/${p}`);
  return joinUrl(getApiBase(), `/library/${p.replace(/^\/+/, "")}`);
}

export async function listRuns(limit = 50): Promise<RunsListResponse> {
  const base = getApiBase();
  const url = joinUrl(base, `/runs?limit=${encodeURIComponent(String(limit))}`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function getRun(runId: string): Promise<RunDetailResponse> {
  const base = getApiBase();
  const url = joinUrl(base, `/runs/${encodeURIComponent(runId)}`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function deleteRun(runId: string): Promise<{ deleted: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/runs/${encodeURIComponent(runId)}`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function sendWellBeingFeedback(payload: {
  id: string;
  device_id: string;
  user_id: string;
  user_email: string;
  at: string;
  rating: number;
  tag: string;
  note?: string;
  session_id?: string;
}): Promise<{ ok: boolean }> {
  const base = getApiBase();
  const url = joinUrl(base, "/feedback/wellbeing");
  const auth = await authHeader();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function getClientState(deviceId: string): Promise<{ device_id: string; state: any; stored?: string }> {
  const base = getApiBase();
  const auth = await authHeader();
  // If authenticated, use per-user state endpoint (isolates progress/settings/history per user)
  if (Object.keys(auth).length > 0) {
    const url = joinUrl(base, `/state/user`);
    const res = await fetch(url, { method: "GET", headers: auth });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
    }
    const data = await res.json();
    // Normalize to legacy shape for callers
    return { device_id: String(data?.user_id || ""), state: data?.state, stored: data?.stored };
  }

  const url = joinUrl(base, `/state/${encodeURIComponent(deviceId)}`);
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function saveClientState(deviceId: string, state: any): Promise<{ ok: boolean; stored?: string }> {
  const base = getApiBase();
  const auth = await authHeader();
  // If authenticated, save per-user state
  if (Object.keys(auth).length > 0) {
    const url = joinUrl(base, `/state/user`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ state }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
    }
    return res.json();
  }

  const url = joinUrl(base, `/state/${encodeURIComponent(deviceId)}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function getUserState(): Promise<{ user_id: string; state: any; stored?: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/state/user`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function saveUserState(state: any): Promise<{ ok: boolean; stored?: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/state/user`);
  const headers = await authHeader();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export interface CloudAudioCatalog {
  enabled: boolean;
  bucket?: string | null;
  signed_expires_in?: number;
  music: Record<string, string>;
  ambiences: Record<string, string>;
}

export async function getCloudAudioCatalog(): Promise<CloudAudioCatalog> {
  const base = getApiBase();
  const url = joinUrl(base, "/cloud-audio/catalog");
  let res: Response;
  try {
    // Render free instances can be sleeping; avoid cache surprises and provide a clearer error on network failures.
    res = await fetch(url, { method: "GET", cache: "no-store" });
  } catch (e: any) {
    const msg = e?.message || String(e);
    throw new Error(`Fetch failed (url=${url}). ${msg}`);
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export interface AdminWellbeingEvent {
  id: string;
  device_id: string;
  user_id?: string | null;
  user_email?: string | null;
  at: string;
  rating: number;
  tag: string;
  note: string;
  session_id: string;
  received_at: string;
  user_agent?: string;
  client_ip?: string | null;
}

export interface AdminWellbeingStats {
  days: number;
  total: number;
  avg_rating: number;
  by_tag: Array<{ tag: string; count: number; avg_rating: number }>;
  series: Array<{ day: string; count: number; avg_rating: number }>;
}

export async function adminWellbeingEvents(
  adminToken: string,
  params?: { limit?: number; device_id?: string; tag?: string; days?: number },
): Promise<{ events: AdminWellbeingEvent[] }> {
  const base = getApiBase();
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.device_id) sp.set("device_id", params.device_id);
  if (params?.tag) sp.set("tag", params.tag);
  if (params?.days != null) sp.set("days", String(params.days));
  const url = joinUrl(base, `/admin/wellbeing_events?${sp.toString()}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-admin-token": adminToken },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminWellbeingStats(adminToken: string, days = 30): Promise<AdminWellbeingStats> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/wellbeing_stats?days=${encodeURIComponent(String(days))}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-admin-token": adminToken },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export interface AdminAppConfig {
  forced_generation_text: string;
  gemini_model_default?: string;
  chat_model_default?: string;
  elevenlabs_voice_id_default?: string;
  safety_rules_text?: string;
  prompt_template_override?: string;
  updated_at?: string;
}

export async function adminGetAppConfig(adminToken: string): Promise<{ config: AdminAppConfig }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/app_config`);
  const res = await fetch(url, { method: "GET", headers: { "x-admin-token": adminToken } });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminSaveAppConfig(
  adminToken: string,
  payload: {
    action?: "save" | "rollback" | "reset";
    forced_generation_text?: string;
    gemini_model_default?: string;
    chat_model_default?: string;
    elevenlabs_voice_id_default?: string;
    safety_rules_text?: string;
    prompt_template_override?: string;
  },
): Promise<{ ok: boolean; action: string; config: AdminAppConfig }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/app_config`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export type AdminStorageExpected = {
  enabled: boolean;
  bucket?: string | null;
  expected: { music: Record<string, string>; ambiences: Record<string, string> };
  catalog: { enabled: boolean; bucket?: string | null; signed_expires_in?: number; music: Record<string, string>; ambiences: Record<string, string> };
};

export async function adminStorageExpected(adminToken: string): Promise<AdminStorageExpected> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/storage/expected`);
  const res = await fetch(url, { method: "GET", headers: { "x-admin-token": adminToken } });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminStorageList(
  adminToken: string,
  params?: { prefix?: string; limit?: number; offset?: number },
): Promise<{ enabled: boolean; items: any[] }> {
  const base = getApiBase();
  const sp = new URLSearchParams();
  if (params?.prefix) sp.set("prefix", params.prefix);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const url = joinUrl(base, `/admin/storage/list?${sp.toString()}`);
  const res = await fetch(url, { method: "GET", headers: { "x-admin-token": adminToken } });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminStorageUpload(
  adminToken: string,
  key: string,
  file: File,
  opts?: { upsert?: boolean },
): Promise<{ ok: boolean; key: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/storage/upload`);
  const fd = new FormData();
  fd.append("key", key);
  fd.append("upsert", (opts?.upsert ?? true) ? "true" : "false");
  fd.append("file", file);
  const res = await fetch(url, { method: "POST", headers: { "x-admin-token": adminToken }, body: fd });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminStorageMove(
  adminToken: string,
  source: string,
  dest: string,
): Promise<{ ok: boolean; source: string; dest: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/storage/move`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ source, dest }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminStorageDelete(adminToken: string, key: string): Promise<{ ok: boolean; key: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/storage/delete`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export type AudioAsset = {
  id: string;
  storage_key: string;
  kind: "music" | "ambience" | string;
  title: string;
  tags: string[];
  source: string;
  license: string;
  duration_s?: number | null;
  loudness_lufs?: number | null;
  notes: string;
  extra: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export async function adminListAudioAssets(
  adminToken: string,
  params?: { kind?: string; q?: string; tag?: string; limit?: number; offset?: number },
): Promise<{ items: AudioAsset[] }> {
  const base = getApiBase();
  const sp = new URLSearchParams();
  if (params?.kind) sp.set("kind", params.kind);
  if (params?.q) sp.set("q", params.q);
  if (params?.tag) sp.set("tag", params.tag);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const url = joinUrl(base, `/admin/audio_assets?${sp.toString()}`);
  const res = await fetch(url, { method: "GET", headers: { "x-admin-token": adminToken } });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminUpsertAudioAsset(
  adminToken: string,
  payload: Partial<AudioAsset> & { storage_key: string },
): Promise<{ ok: boolean; item: AudioAsset }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/audio_assets`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function adminDeleteAudioAsset(
  adminToken: string,
  storage_key: string,
): Promise<{ ok: boolean; deleted: boolean }> {
  const base = getApiBase();
  const url = joinUrl(base, `/admin/audio_assets/delete`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ storage_key }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export type PlaylistSummary = {
  tag: string;
  title: string;
  subtitle?: string;
  kind?: string;
  count: number;
};

export type PlaylistItem = AudioAsset & { signed_url?: string | null };

export async function listPlaylists(): Promise<{ playlists: PlaylistSummary[] }> {
  const base = getApiBase();
  const url = joinUrl(base, `/playlists`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${msg || "Erreur API"} (status=${res.status}, url=${url})`);
  }
  return res.json();
}

export async function getPlaylist(tag: string, limit = 50): Promise<{ playlist: any; items: PlaylistItem[] }> {
  const base = getApiBase();
  const url = joinUrl(base, `/playlists/${encodeURIComponent(tag)}?limit=${encodeURIComponent(String(limit))}`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${msg || "Erreur API"} (status=${res.status}, url=${url})`);
  }
  return res.json();
}

export type AudioLibraryItem = AudioAsset & { signed_url?: string | null };
export type AudioLibraryResponse = {
  music: AudioLibraryItem[];
  ambiences: AudioLibraryItem[];
  signed_expires_in?: number;
  storage_enabled?: boolean;
};

export async function getAudioLibrary(limit = 200): Promise<AudioLibraryResponse> {
  const base = getApiBase();
  const url = joinUrl(base, `/audio/library?limit=${encodeURIComponent(String(limit))}`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${msg || "Erreur API"} (status=${res.status}, url=${url})`);
  }
  return res.json();
}

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "model";
  content: string;
  created_at: string;
}

export async function chatHistory(limit = 50): Promise<{ messages: ChatHistoryMessage[] }> {
  const base = getApiBase();
  const url = joinUrl(base, `/chat/history?limit=${encodeURIComponent(String(limit))}`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function chatClearHistory(): Promise<{ ok: boolean; deleted: number }> {
  const base = getApiBase();
  const url = joinUrl(base, `/chat/history`);
  const headers = await authHeader();
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function chatSend(message: string, model?: string): Promise<{ reply: string }> {
  const base = getApiBase();
  const url = joinUrl(base, `/chat`);
  const headers = await authHeader();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message, model: model || "gemini-pro-latest" }),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}

export async function generateSession(payload: GenerationRequest): Promise<GenerationResponse> {
  const base = getApiBase();
  const url = joinUrl(base, "/generate");
  const auth = await authHeader();
  const doFetch = async () => {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (e: any) {
    // Render free instances can be sleeping; a first request may fail or take time.
    // Retry once after a short delay for better UX.
    const msg = e?.message || String(e);
    await new Promise((r) => setTimeout(r, 1500));
    try {
      res = await doFetch();
    } catch (e2: any) {
      const msg2 = e2?.message || String(e2);
      throw new Error(`Failed to fetch (url=${url}). ${msg2 || msg}`);
    }
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Erreur API: ${res.status} (url=${url})`);
  }
  return res.json();
}


