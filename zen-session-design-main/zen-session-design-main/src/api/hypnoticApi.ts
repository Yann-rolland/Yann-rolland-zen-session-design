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
  // Par défaut, on vise le backend local.
  // On ne veut PAS utiliser window.location.origin en dev Vite (ex: :8080) car ça donne /generate => 404.
  const fallback = "http://127.0.0.1:8006";

  // In production deployments (Vercel), env vars can sometimes be missing on Preview builds.
  // If we're running on a vercel.app domain and VITE_API_BASE is empty, default to the Render backend.
  if (typeof window !== "undefined") {
    try {
      const host = String(window.location?.hostname || "").toLowerCase();
      const origin = String(window.location?.origin || "");
      if (host.endsWith(".vercel.app")) {
        return "https://bn3-backend-fyjg.onrender.com";
      }
      // If UI is served by backend (local exe), reuse origin.
      if (origin && (host === "127.0.0.1" || host === "localhost")) {
        const u = new URL(origin);
        if (u.port === "8006" || u.port === "8005" || u.port === "8000") return u.origin;
      }
    } catch {
      // ignore
    }
  }

  // Si l'UI est servie par le backend (ex: http://127.0.0.1:8006/ui), on peut réutiliser l'origin.
  if (typeof window !== "undefined" && window.location?.origin) {
    try {
      const u = new URL(window.location.origin);
      // Heuristique: si on est déjà sur un port backend connu, on prend cet origin.
      if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
        if (u.port === "8006" || u.port === "8005" || u.port === "8000") return u.origin;
      }
    } catch {
      // ignore
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
  payload: { forced_generation_text?: string; action?: "save" | "rollback" | "reset" },
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


