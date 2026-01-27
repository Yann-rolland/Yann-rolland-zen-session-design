import { toast } from "@/hooks/use-toast";
import { safeJsonParse, safeJsonStringify, todayKey } from '@/lib/persistence';
import { AppSettings, HistoryEntry, PlayerState, ProgressData, Session, SessionConfig, Trophy, TrophyId, WellBeingEntry } from '@/types';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

interface AppContextType {
  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  
  // Current session
  currentSession: Session | null;
  setCurrentSession: (session: Session | null) => void;
  
  // Player state
  playerState: PlayerState;
  updatePlayerState: (updates: Partial<PlayerState>) => void;
  
  // History
  history: HistoryEntry[];
  addToHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  
  // Default config
  defaultConfig: SessionConfig;
  updateDefaultConfig: (updates: Partial<SessionConfig>) => void;

  // Progress / trophies / well-being
  progress: ProgressData;
  recordSessionGenerated: (session: Session) => void;
  addWellBeingEntry: (entry: Omit<WellBeingEntry, "id" | "at"> & { at?: string }) => void;
  deleteWellBeingEntry: (id: string) => void;
  recordSessionCompleted: (session: Session) => void;
  resetProgress: () => void;
}

const defaultSessionConfig: SessionConfig = {
  voiceVolume: 80,
  musicVolume: 40,
  binauralVolume: 30,
  ambianceVolume: 25,
  ambianceType: 'rain',
  binauralType: 'theta',
  musicTrackId: 'user-slowlife',
  playMusic: true,
  playNoise: false,
  playBinaural: true,
  duration: 20,
  fadeOutDuration: 30,
  loop: false,
  llmProvider: 'gemini',
  ttsProvider: 'elevenlabs',
};

const defaultSettings: AppSettings = {
  zenMode: false,
  hideAdvancedSettings: false,
  defaultConfig: defaultSessionConfig,
  theme: 'dark',
  notifications: true,
  autoPlay: false,
  shareWellBeingWithDeveloper: false,
};


const defaultProgress: ProgressData = {
  points: 0,
  totalSessionsGenerated: 0,
  totalSessionsCompleted: 0,
  totalMinutes: 0,
  streakDays: 0,
  lastSessionDay: undefined,
  trophies: {} as any,
  wellbeing: [],
};

const LS_PROGRESS = "bn3_progress_v1";
const LS_WELLBEING_QUEUE = "bn3_wellbeing_queue_v1";

const defaultPlayerState: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  phaseProgress: 0,
  volumes: {
    voice: 80,
    music: 40,
    binaural: 30,
    ambiance: 25,
  },
  isMuted: false,
  isFadingOut: false,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>(defaultPlayerState);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [defaultConfig, setDefaultConfig] = useState<SessionConfig>(defaultSessionConfig);
  const [progress, setProgress] = useState<ProgressData>(defaultProgress);

  const deviceId = useMemo(() => {
    const k = "bn3_device_id_v1";
    try {
      const existing = localStorage.getItem(k);
      if (existing) return existing;
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(k, id);
      return id;
    } catch {
      return "unknown";
    }
  }, []);

  // NOTE: settings/progress/history sont synchronisés via /state/user (Supabase/Postgres) quand dispo.

  // Load per-user state from backend when auth becomes available
  useEffect(() => {
    let unsub: { subscription: { unsubscribe: () => void } } | null = null;

    async function loadForCurrentUser() {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid) return;

        const { getUserState } = await import("@/api/hypnoticApi");
        const resp = await getUserState();
        const st = resp?.state || {};

        const s = st.settings || null;
        const p = st.progress || null;
        const h = st.history || null;
        if (s) setSettings((prev) => ({ ...prev, ...s }));
        if (h && Array.isArray(h)) setHistory(h);
        if (p) {
          setProgress({
            ...defaultProgress,
            ...p,
            trophies: (p.trophies || {}) as any,
            wellbeing: Array.isArray(p.wellbeing) ? p.wellbeing : [],
          });
        }
      } catch {
        // Fallback local, isolated by userId
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data } = await supabase.auth.getUser();
          const uid = data.user?.id;
          if (!uid) return;
          const rawP = localStorage.getItem(`${LS_PROGRESS}:${uid}`);
          const dataP = safeJsonParse<ProgressData>(rawP);
          if (dataP && typeof dataP.points === "number") {
            setProgress({
              ...defaultProgress,
              ...dataP,
              trophies: (dataP.trophies || {}) as any,
              wellbeing: Array.isArray(dataP.wellbeing) ? dataP.wellbeing : [],
            });
          }
          const rawH = localStorage.getItem(`bn3_history_v1:${uid}`);
          const dataH = safeJsonParse<HistoryEntry[]>(rawH);
          if (Array.isArray(dataH)) setHistory(dataH);
        } catch {
          // ignore
        }
      }
    }

    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        unsub = supabase.auth.onAuthStateChange((_ev) => {
          // Clear local state when switching users, then load new user's data
          setHistory([]);
          setProgress(defaultProgress);
          loadForCurrentUser();
        }).data;
        // initial load
        loadForCurrentUser();
      } catch {
        // ignore
      }
    })();

    return () => {
      try {
        unsub?.subscription?.unsubscribe();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave debounced to per-user backend state
  useEffect(() => {
    const t = window.setTimeout(() => {
      (async () => {
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data } = await supabase.auth.getUser();
          const uid = data.user?.id;
          if (!uid) return;
          const { saveUserState } = await import("@/api/hypnoticApi");
          await saveUserState({ settings, progress, history });
        } catch {
          // fallback local per user
          try {
            const { supabase } = await import("@/lib/supabaseClient");
            const { data } = await supabase.auth.getUser();
            const uid = data.user?.id;
            if (!uid) return;
            localStorage.setItem(`${LS_PROGRESS}:${uid}`, safeJsonStringify(progress));
            localStorage.setItem(`bn3_history_v1:${uid}`, safeJsonStringify(history));
          } catch {
            // ignore
          }
        }
      })();
    }, 600);
    return () => window.clearTimeout(t);
  }, [settings, progress, history]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const updatePlayerState = (updates: Partial<PlayerState>) => {
    setPlayerState(prev => ({ ...prev, ...updates }));
  };

  const addToHistory = (entry: HistoryEntry) => {
    setHistory(prev => [entry, ...prev]);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const updateDefaultConfig = (updates: Partial<SessionConfig>) => {
    setDefaultConfig(prev => ({ ...prev, ...updates }));
  };

  const TROPHIES: Trophy[] = useMemo(() => ([
    { id: "first_session", title: "Première session", description: "Compléter une session", pointsReward: 25 },
    { id: "five_sessions", title: "Rituel", description: "Compléter 5 sessions", pointsReward: 50 },
    { id: "ten_sessions", title: "Habitude", description: "Compléter 10 sessions", pointsReward: 100 },
    { id: "one_hour", title: "1 heure", description: "Cumuler 60 minutes", pointsReward: 40 },
    { id: "five_hours", title: "5 heures", description: "Cumuler 300 minutes", pointsReward: 120 },
    { id: "streak_3", title: "Série 3 jours", description: "3 jours d'affilée", pointsReward: 60 },
    { id: "streak_7", title: "Série 7 jours", description: "7 jours d'affilée", pointsReward: 150 },
    { id: "wellbeing_first", title: "Ressenti", description: "Enregistrer un ressenti", pointsReward: 15 },
    { id: "wellbeing_7", title: "Journal", description: "7 ressentis enregistrés", pointsReward: 40 },
    { id: "mix_master", title: "Mixeur", description: "Utiliser le mix (music+bruit)", pointsReward: 25 },
    { id: "binaural_explorer", title: "Binaural", description: "Tester 3 types binauraux", pointsReward: 35 },
    { id: "zen_master", title: "Mode Zen", description: "Activer le mode Zen", pointsReward: 20 },
  ]), []);

  const unlockTrophy = (id: TrophyId) => {
    setProgress((p) => {
      if (p.trophies?.[id]) return p;
      const nowIso = new Date().toISOString();
      const next = {
        ...p,
        trophies: { ...(p.trophies || ({} as any)), [id]: { id, unlockedAt: nowIso } },
      };
      const trophy = TROPHIES.find((t) => t.id === id);
      if (trophy) {
        next.points = (next.points || 0) + trophy.pointsReward;
        // Toast discret
        try {
          toast({ title: `Trophée débloqué: ${trophy.title}`, description: `+${trophy.pointsReward} pts` });
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const recordSessionGenerated = (session: Session) => {
    setProgress((p) => ({
      ...p,
      totalSessionsGenerated: (p.totalSessionsGenerated || 0) + 1,
    }));
  };

  const enqueueWellbeing = (entry: WellBeingEntry) => {
    try {
      const raw = localStorage.getItem(LS_WELLBEING_QUEUE);
      const arr = safeJsonParse<WellBeingEntry[]>(raw) || [];
      localStorage.setItem(LS_WELLBEING_QUEUE, safeJsonStringify([entry, ...arr].slice(0, 200)));
    } catch {
      // ignore
    }
  };

  const dequeueWellbeing = (id: string) => {
    try {
      const raw = localStorage.getItem(LS_WELLBEING_QUEUE);
      const arr = safeJsonParse<WellBeingEntry[]>(raw) || [];
      localStorage.setItem(LS_WELLBEING_QUEUE, safeJsonStringify(arr.filter((x) => x.id !== id)));
    } catch {
      // ignore
    }
  };

  const flushWellBeingQueue = async () => {
    if (!settings.shareWellBeingWithDeveloper) return;
    try {
      const raw = localStorage.getItem(LS_WELLBEING_QUEUE);
      const arr = safeJsonParse<WellBeingEntry[]>(raw) || [];
      if (arr.length === 0) return;
      const { sendWellBeingFeedback } = await import("@/api/hypnoticApi");
      const { supabase } = await import("@/lib/supabaseClient");
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      const userEmail = data.user?.email;
      // Require authenticated user identity to link events to a profile
      if (!userId || !userEmail) {
        try {
          toast({
            title: "Connexion requise",
            description: "Connecte‑toi pour envoyer ton ressenti au développeur (sinon il reste stocké localement).",
          });
        } catch {
          // ignore
        }
        return;
      }
      // Envoie au plus 10 d'un coup pour éviter spam
      for (const e of arr.slice(0, 10)) {
        try {
          await sendWellBeingFeedback({
            id: e.id,
            device_id: deviceId,
            user_id: userId,
            user_email: userEmail,
            at: e.at,
            rating: e.rating,
            tag: String(e.tag || "autre"),
            note: e.note || "",
            session_id: e.sessionId || "",
          });
          dequeueWellbeing(e.id);
        } catch {
          // stop at first failure (backend down)
          break;
        }
      }
    } catch {
      // ignore
    }
  };

  // Flush queue on startup + when opt-in is toggled
  useEffect(() => {
    flushWellBeingQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.shareWellBeingWithDeveloper]);

  // Also flush whenever auth state changes (e.g., user logs in after writing notes)
  useEffect(() => {
    let unsub: { subscription: { unsubscribe: () => void } } | null = null;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        unsub = supabase.auth.onAuthStateChange(() => {
          flushWellBeingQueue();
        }).data;
      } catch {
        // ignore
      }
    })();
    return () => {
      try {
        unsub?.subscription?.unsubscribe();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.shareWellBeingWithDeveloper]);

  const addWellBeingEntry: AppContextType["addWellBeingEntry"] = (entry) => {
    const nowIso = entry.at || new Date().toISOString();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const newEntry: WellBeingEntry = { id, at: nowIso, rating: Number(entry.rating), note: entry.note, tag: entry.tag, sessionId: entry.sessionId };
    setProgress((p) => {
      const nextWellbeing = [newEntry, ...(p.wellbeing || [])];
      const next: ProgressData = { ...p, wellbeing: nextWellbeing };
      return next;
    });
    // unlock trophies based on state after write (best effort)
    unlockTrophy("wellbeing_first");
    // queue for developer feedback (opt-in is handled in UI by enabling backend save; we always queue locally)
    enqueueWellbeing(newEntry);
    // best-effort immediate send if opted-in
    setTimeout(() => {
      flushWellBeingQueue();
    }, 0);
  };

  const deleteWellBeingEntry = (id: string) => {
    setProgress((p) => ({ ...p, wellbeing: (p.wellbeing || []).filter((x) => x.id !== id) }));
  };

  // Award points + update stats when a session finishes.
  const recordSessionCompleted = (session: Session) => {
    const minutes = Math.max(1, Math.round((session.duration || 0) / 60));
    const day = todayKey();

    setProgress((p) => {
      const prevDay = p.lastSessionDay;
      let streak = p.streakDays || 0;
      if (!prevDay) {
        streak = 1;
      } else if (prevDay === day) {
        // same day: don't increase streak
      } else {
        // check if prevDay was yesterday
        const prev = new Date(prevDay + "T00:00:00");
        const cur = new Date(day + "T00:00:00");
        const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
        streak = diffDays === 1 ? streak + 1 : 1;
      }

      const basePoints = 10 + minutes; // simple + lisible
      const next: ProgressData = {
        ...p,
        points: (p.points || 0) + basePoints,
        totalSessionsCompleted: (p.totalSessionsCompleted || 0) + 1,
        totalMinutes: (p.totalMinutes || 0) + minutes,
        streakDays: streak,
        lastSessionDay: day,
      };
      try {
        toast({ title: "Session terminée", description: `+${basePoints} pts` });
      } catch {
        // ignore
      }
      return next;
    });

    // Unlock rules
    setProgress((p) => {
      const s = p.totalSessionsCompleted || 0;
      const m = p.totalMinutes || 0;
      const st = p.streakDays || 0;
      // We evaluate after increment; so use current p as "after"
      if (s >= 1) unlockTrophy("first_session");
      if (s >= 5) unlockTrophy("five_sessions");
      if (s >= 10) unlockTrophy("ten_sessions");
      if (m >= 60) unlockTrophy("one_hour");
      if (m >= 300) unlockTrophy("five_hours");
      if (st >= 3) unlockTrophy("streak_3");
      if (st >= 7) unlockTrophy("streak_7");

      if (settings.zenMode) unlockTrophy("zen_master");
      if (session.config.playMusic && session.config.playNoise) unlockTrophy("mix_master");
      return p;
    });
  };

  const resetProgress = () => setProgress(defaultProgress);

  return (
    <AppContext.Provider value={{
      settings,
      updateSettings,
      currentSession,
      setCurrentSession,
      playerState,
      updatePlayerState,
      history,
      addToHistory,
      clearHistory,
      defaultConfig,
      updateDefaultConfig,
      progress,
      recordSessionGenerated,
      addWellBeingEntry,
      deleteWellBeingEntry,
      recordSessionCompleted,
      resetProgress,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
