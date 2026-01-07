import { useEffect, useRef, useState } from "react";
import { deleteRun, generateSession, getRun, listRuns } from "./api";
import RelaxAmbiencePlayer from "./components/RelaxAmbiencePlayer";

const objectifs = ["sommeil", "stress", "confiance", "performance", "douleur"];
const styles = ["ericksonien", "classique", "métaphorique", "cinématographique"];
const durees = [15, 20, 30, 45, 60];
const providers = [
  { value: "ollama", label: "Ollama (local)" },
  { value: "gemini", label: "Gemini (API)" },
];
const ttsProviders = [
  { value: "local", label: "Local (Windows SAPI)" },
  { value: "elevenlabs", label: "ElevenLabs (API)" },
];
const binauralBands = [
  { value: "auto", label: "Auto (selon objectif)" },
  { value: "delta", label: "Delta (0.5–4 Hz) — sommeil profond" },
  { value: "theta", label: "Theta (4–8 Hz) — relaxation/transe" },
  { value: "alpha", label: "Alpha (8–13 Hz) — détente lucide" },
  { value: "beta", label: "Beta (13–30 Hz) — concentration" },
  { value: "gamma", label: "Gamma (>30 Hz) — performance/flow" },
];

export default function App() {
  const PAGES = { home: "home", history: "history", login: "login", settings: "settings" };
  // Par défaut: page Connexion. Une fois la session restaurée, on bascule sur Accueil.
  const [page, setPage] = useState(PAGES.login);

  // UI: toasts + zen mode
  const [toasts, setToasts] = useState([]);
  const [zenMode, setZenMode] = useState(() => {
    try {
      return localStorage.getItem("hypnotic_ai_zen_v1") === "1";
    } catch {
      return false;
    }
  });
  const [hideAdvanced, setHideAdvanced] = useState(() => {
    try {
      return localStorage.getItem("hypnotic_ai_hide_advanced_v1") === "1";
    } catch {
      return false;
    }
  });

  const pushToast = (type, title, body, ttlMs = 3500) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((t) => [...t, { id, type, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttlMs);
  };

  // Auth MVP (localStorage only — pas de backend)
  const LS_USERS = "hypnotic_ai_users_v1";
  const LS_SESSION = "hypnotic_ai_session_v1";
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPassword2, setAuthPassword2] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState("");
  const [form, setForm] = useState({
    objectif: "stress",
    duree_minutes: 15,
    style: "ericksonien",
    llm_provider: "ollama",
    gemini_model: "gemini-pro-latest",
    mixdown: true,
    voice_volume: 1.0,
    music_volume: 0.35,
    binaural_volume: 0.25,
    voice_offset_s: 0.0,
    music_offset_s: 0.0,
    binaural_offset_s: 0.0,

    // Binaural
    binaural_band: "auto",
    binaural_beat_hz: 0,

    // TTS
    tts_provider: "local",
    elevenlabs_voice_id: "",
    elevenlabs_stability: 0.55,
    elevenlabs_similarity_boost: 0.75,
    elevenlabs_style: 0.15,
    elevenlabs_use_speaker_boost: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Volumes de lecture (player) — indépendants des volumes de "mixdown" côté backend.
  const [ambianceVol, setAmbianceVol] = useState(0.5);
  const [binauralVol, setBinauralVol] = useState(0.35);
  const [ambBinauralPlaying, setAmbBinauralPlaying] = useState(false);
  const [fullSessionPlaying, setFullSessionPlaying] = useState(false);
  const [stopAllSignal, setStopAllSignal] = useState(0);
  const [applyThemeSignal, setApplyThemeSignal] = useState(0);
  const [lastThemeApplied, setLastThemeApplied] = useState(null);

  // Session complète: petite pré-ambiance avant que la voix démarre
  const preludePresetsSec = [0, 10, 30, 60];
  const [fullPreludeSec, setFullPreludeSec] = useState(10);
  const fullSessionRef = useRef({ timeouts: [], onVoiceEnded: null });

  // Minuteur (lecteur Ambiance + Binaural)
  // - configurable: 15 / 30 / 60 min
  // - à l’échéance: fade-out 10s puis stop proprement
  const timerPresets = [15, 30, 60];
  const [timerMinutes, setTimerMinutes] = useState(15);
  const [timerRemainingSec, setTimerRemainingSec] = useState(null); // null = pas actif
  const timerIntervalRef = useRef(null);
  const timerTimeoutRef = useRef(null);
  const isFadingOutRef = useRef(false);

  const voiceRef = useRef(null);
  const musicRef = useRef(null);
  const binauralRef = useRef(null);
  const mixRef = useRef(null);

  // API base:
  // - en prod / tunnel: on veut le même host que la page (sinon "localhost" pointerait vers le PC du client)
  // - en dev: VITE_API_BASE peut override
  // - fallback final: 127.0.0.1:8006 (PC dev)
  const apiBase =
    import.meta.env.VITE_API_BASE ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "http://127.0.0.1:8006";

  const readUsers = () => {
    try {
      return JSON.parse(localStorage.getItem(LS_USERS) || "{}");
    } catch {
      return {};
    }
  };

  const writeUsers = (users) => {
    localStorage.setItem(LS_USERS, JSON.stringify(users));
  };

  const sha256Hex = async (text) => {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const makeSalt = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

  useEffect(() => {
    // Restaure session si présente
    try {
      const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
      if (s?.email) {
        setCurrentUserEmail(String(s.email));
        setPage(PAGES.home);
      } else {
        setPage(PAGES.login);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.dataset.zen = zenMode ? "1" : "0";
      localStorage.setItem("hypnotic_ai_zen_v1", zenMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [zenMode]);

  useEffect(() => {
    try {
      localStorage.setItem("hypnotic_ai_hide_advanced_v1", hideAdvanced ? "1" : "0");
    } catch {
      // ignore
    }
  }, [hideAdvanced]);

  // Presets "thèmes" (Auto): règle tout d'un coup selon l'objectif.
  // - binaural band
  // - musique (parmi tes 4)
  // - bruit (rose/pluie/vent)
  // - volumes recommandés
  const themePresets = {
    sommeil: {
      binaural_band: "delta",
      musicId: "user-dawnofchange",
      noiseId: "pink",
      playNoise: true,
      // Volumes lecteur "Ambiances relaxation (mix)"
      musicVol: 0.45,
      noiseVol: 0.18,
      binauralVol: 0.28,
      // Volumes lecteur musique+binaural (App.jsx)
      appAmbianceVol: 0.45,
      appBinauralVol: 0.28,
    },
    stress: {
      binaural_band: "alpha",
      musicId: "user-slowlife",
      noiseId: "pink",
      playNoise: true,
      musicVol: 0.5,
      noiseVol: 0.22,
      binauralVol: 0.3,
      appAmbianceVol: 0.5,
      appBinauralVol: 0.3,
    },
    confiance: {
      binaural_band: "alpha",
      musicId: "user-yesterday",
      noiseId: "pink",
      playNoise: false,
      musicVol: 0.5,
      noiseVol: 0.15,
      binauralVol: 0.26,
      appAmbianceVol: 0.5,
      appBinauralVol: 0.26,
    },
    performance: {
      binaural_band: "beta",
      musicId: "user-slowmotion",
      noiseId: "wind",
      playNoise: false,
      musicVol: 0.55,
      noiseVol: 0.12,
      binauralVol: 0.22,
      appAmbianceVol: 0.55,
      appBinauralVol: 0.22,
    },
    douleur: {
      binaural_band: "delta",
      musicId: "user-slowlife",
      noiseId: "pink",
      playNoise: true,
      musicVol: 0.45,
      noiseVol: 0.2,
      binauralVol: 0.3,
      appAmbianceVol: 0.45,
      appBinauralVol: 0.3,
    },
  };

  const applyThemePreset = () => {
    const preset = themePresets[form.objectif];
    if (!preset) return;
    // Si un lecteur tourne, on évite d'écraser en live.
    if (fullSessionPlaying || ambBinauralPlaying || isPlaying) {
      setError("Arrête la lecture en cours avant d'appliquer un preset (bouton Stop tout).");
      return;
    }
    setError("");
    // 1) Request backend: binaural band (et reset beat override)
    setForm((f) => ({
      ...f,
      binaural_band: preset.binaural_band,
      binaural_beat_hz: 0,
    }));
    // 2) Volumes lecteurs App.jsx (ambiance+binaural / session complète)
    setAmbianceVol(preset.appAmbianceVol);
    setBinauralVol(preset.appBinauralVol);
    // 3) Déclenche l'application côté RelaxAmbiencePlayer (musique/bruit/volumes)
    setApplyThemeSignal((s) => s + 1);
    setLastThemeApplied({
      objectif: form.objectif,
      binaural_band: preset.binaural_band,
      musicId: preset.musicId,
      noiseId: preset.noiseId,
      playNoise: preset.playNoise,
      musicVol: preset.musicVol,
      noiseVol: preset.noiseVol,
      binauralVol: preset.binauralVol,
      appAmbianceVol: preset.appAmbianceVol,
      appBinauralVol: preset.appBinauralVol,
      at: Date.now(),
    });
  };

  // Suggestion "musique/bruit" selon l'objectif choisi (modifiable manuellement dans le lecteur).
  const suggestedMusicIdByObjectif = {
    sommeil: "user-dawnofchange",
    stress: "user-slowlife",
    confiance: "user-yesterday",
    performance: "user-slowmotion",
    douleur: "user-slowlife",
  };
  const suggestedMusicId = suggestedMusicIdByObjectif[form.objectif] || "user-slowlife";
  // Bruit conseillé (optionnel). Par défaut: off.
  const suggestedNoiseIdByObjectif = {
    sommeil: "pink",
    stress: "pink",
    confiance: "pink",
    performance: "wind",
    douleur: "pink",
  };
  const suggestedNoiseId = suggestedNoiseIdByObjectif[form.objectif] || "pink";
  const suggestedTheme = themePresets[form.objectif] || null;

  /**
   * Fade-in simple (frontend) :
   * - met le volume à 0
   * - démarre play()
   * - remonte progressivement vers targetVolume sur durationMs
   *
   * Pourquoi côté frontend ?
   * - on veut un démarrage doux même si les WAV ont déjà un contenu "sec"
   * - compatible avec loop infini
   */
  const fadeInPlay = async (audioEl, targetVolume, durationMs = 1500) => {
    if (!audioEl) return;
    audioEl.loop = true; // loop infini demandé
    audioEl.volume = 0.0;

    // play() doit être déclenché par un geste utilisateur (click)
    await audioEl.play();

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      audioEl.volume = targetVolume * t;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /**
   * Fade-out + stop propre (frontend) :
   * - baisse le volume jusqu'à 0 sur durationMs
   * - pause()
   * - remet currentTime à 0 (stop propre)
   *
   * Important: on marque isFadingOutRef=true pour éviter que les sliders "écrasent"
   * le volume pendant la descente.
   */
  const fadeOutAndStop = async (musicEl, binauralEl, durationMs = 10_000) => {
    if (!musicEl || !binauralEl) return;
    isFadingOutRef.current = true;

    // On prend les volumes actuels comme point de départ
    const startMusicVol = musicEl.volume ?? 0;
    const startBinauralVol = binauralEl.volume ?? 0;
    const start = performance.now();

    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / durationMs);
        const factor = 1 - t;
        musicEl.volume = startMusicVol * factor;
        binauralEl.volume = startBinauralVol * factor;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    // Stop propre
    try {
      musicEl.pause();
      binauralEl.pause();
      musicEl.currentTime = 0;
      binauralEl.currentTime = 0;
    } finally {
      isFadingOutRef.current = false;
    }
  };

  const sleepMs = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      // stocke pour pouvoir annuler si l'utilisateur stoppe
      fullSessionRef.current.timeouts.push(t);
    });

  const stopFullSession = async () => {
    // Annule les timers en attente
    for (const t of fullSessionRef.current.timeouts) clearTimeout(t);
    fullSessionRef.current.timeouts = [];

    // Retire listener "ended" (si posé)
    if (voiceRef.current && fullSessionRef.current.onVoiceEnded) {
      try {
        voiceRef.current.removeEventListener("ended", fullSessionRef.current.onVoiceEnded);
      } catch {
        // ignore
      }
    }
    fullSessionRef.current.onVoiceEnded = null;

    // Stop propre des pistes
    [mixRef.current, musicRef.current, binauralRef.current, voiceRef.current].forEach((el) => {
      if (!el) return;
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // ignore
      }
    });
    setFullSessionPlaying(false);
  };

  const stopAllAudio = async () => {
    // Stoppe: session complète + lecteur simple + ambiance+binaural + ambiances(mix)
    try {
      await stopFullSession();
    } catch {
      // ignore
    }
    try {
      handlePause();
    } catch {
      // ignore
    }
    try {
      pauseAmbianceBinaural();
    } catch {
      // ignore
    }
    try {
      stopTimer();
    } catch {
      // ignore
    }
    setStopAllSignal((s) => s + 1);
  };

  const navigate = async (nextPage) => {
    // Sécurité UX: changer d'onglet stoppe tout ce qui joue (sinon on a l'impression que "Stop" ne marche pas).
    await stopAllAudio();
    // Guard: pages protégées => connexion requise
    const protectedPages = [PAGES.home, PAGES.history, PAGES.settings];
    if (!currentUserEmail && protectedPages.includes(nextPage)) {
      setAuthMsg("Connecte-toi pour accéder à cette page.");
      setPage(PAGES.login);
      return;
    }
    setPage(nextPage);
    if (nextPage === PAGES.history) refreshRuns();
  };

  const logout = async () => {
    await stopAllAudio();
    localStorage.removeItem(LS_SESSION);
    setCurrentUserEmail(null);
    setAuthPassword("");
    setAuthPassword2("");
    setAuthMsg("Déconnecté.");
    setPage(PAGES.login);
  };

  const onAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthMsg("");
    setAuthLoading(true);
    try {
      const email = normalizeEmail(authEmail);
      const pwd = String(authPassword || "");
      if (!email.includes("@")) throw new Error("Email invalide.");
      if (pwd.length < 6) throw new Error("Mot de passe: minimum 6 caractères.");

      const users = readUsers();
      if (authMode === "register") {
        if (pwd !== String(authPassword2 || "")) throw new Error("Les mots de passe ne correspondent pas.");
        if (users[email]) throw new Error("Ce compte existe déjà. Essaie de te connecter.");
        const salt = makeSalt();
        const hash = await sha256Hex(`${salt}:${pwd}`);
        users[email] = { salt, hash, created_at: Date.now() };
        writeUsers(users);
        setAuthMsg("Compte créé. Tu es connecté.");
      } else {
        const u = users[email];
        if (!u?.salt || !u?.hash) throw new Error("Compte introuvable. Crée un compte d’abord.");
        const hash = await sha256Hex(`${u.salt}:${pwd}`);
        if (hash !== u.hash) throw new Error("Mot de passe incorrect.");
        setAuthMsg("Connecté.");
      }

      localStorage.setItem(LS_SESSION, JSON.stringify({ email, at: Date.now() }));
      setCurrentUserEmail(email);
      setPage(PAGES.home);
      setAuthPassword("");
      setAuthPassword2("");
      pushToast("success", "Connexion", `Bienvenue ${email}`);
    } catch (err) {
      setAuthMsg(err?.message || String(err));
      pushToast("error", "Connexion", err?.message || String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  // Démarre un minuteur (remplace l'ancien s'il existe)
  const startTimer = (minutes) => {
    // Nettoyage si déjà actif
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);

    const totalSec = Math.max(1, Math.round(minutes * 60));
    const endAt = Date.now() + totalSec * 1000;
    setTimerRemainingSec(totalSec);

    // Update "remaining" toutes les secondes (UI)
    timerIntervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setTimerRemainingSec(left);
    }, 1000);

    // A l'échéance: fade-out 10s puis stop
    timerTimeoutRef.current = setTimeout(async () => {
      await fadeOutAndStop(musicRef.current, binauralRef.current, 10_000);
      // Nettoie états/timers
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      timerTimeoutRef.current = null;
      setTimerRemainingSec(null);
      setAmbBinauralPlaying(false);
    }, totalSec * 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);
    timerIntervalRef.current = null;
    timerTimeoutRef.current = null;
    setTimerRemainingSec(null);
  };

  const refreshRuns = async () => {
    setRunsLoading(true);
    try {
      const data = await listRuns(50);
      setRuns(data.runs || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunsLoading(false);
    }
  };

  useEffect(() => {
    refreshRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]:
        type === "checkbox"
          ? checked
          : name === "duree_minutes" ||
              name === "binaural_beat_hz" ||
              name.startsWith("elevenlabs_") && name !== "elevenlabs_voice_id" ||
              name.endsWith("_volume") ||
              name.endsWith("_offset_s")
            ? Number(value)
            : value,
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await generateSession(form);
      pushToast("success", "Session générée", `run ${data.run_id || ""}`.trim());
      setSession({
        texte: data.texte,
        tts_audio_path: `${apiBase}/${data.tts_audio_path}`,
        music_path: `${apiBase}/${data.music_path}`,
        binaural_path: `${apiBase}/${data.binaural_path}`,
        mix_path: data.mix_path ? `${apiBase}/${data.mix_path}` : null,
        run_id: data.run_id || null,
        llm_provider_used: data.llm_provider_used || null,
        llm_fallback: Boolean(data.llm_fallback),
        llm_error: data.llm_error || null,
        binaural_band_used: data.binaural_band_used || null,
        binaural_beat_hz_used: typeof data.binaural_beat_hz_used === "number" ? data.binaural_beat_hz_used : null,
        tts_provider_used: data.tts_provider_used || null,
        tts_cache_hit: Boolean(data.tts_cache_hit),
        tts_error: data.tts_error || null,
      });
      await refreshRuns();
    } catch (err) {
      setError(err.message);
      pushToast("error", "Erreur génération", err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadRun = async (runId) => {
    setError("");
    try {
      const data = await getRun(runId);
      setSession({
        texte: data.texte || {},
        tts_audio_path: `${apiBase}/${data.tts_audio_path}`,
        music_path: `${apiBase}/${data.music_path}`,
        binaural_path: `${apiBase}/${data.binaural_path}`,
        mix_path: data.mix_path ? `${apiBase}/${data.mix_path}` : null,
        run_id: data.run_id,
        // /runs/{id} ne renvoie pas encore l'état LLM; on laisse vide ici.
        llm_provider_used: null,
        llm_fallback: false,
        llm_error: null,
        binaural_band_used: data.binaural_band_used || null,
        binaural_beat_hz_used: typeof data.binaural_beat_hz_used === "number" ? data.binaural_beat_hz_used : null,
        tts_provider_used: data.tts_provider_used || null,
        tts_cache_hit: Boolean(data.tts_cache_hit),
        tts_error: data.tts_error || null,
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const removeRun = async (runId) => {
    setError("");
    try {
      await deleteRun(runId);
      if (session?.run_id === runId) {
        setSession(null);
        setIsPlaying(false);
      }
      await refreshRuns();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const handlePlay = async () => {
    setError("");
    try {
      const useMix = Boolean(session?.mix_path);
      const tryPlay = async (el, label) => {
        if (!el) return;
        try {
          // Certaines plateformes peuvent refuser play() si pas de geste utilisateur.
          // Ici on est déclenché par un click, mais on capture quand même l'erreur.
          await el.play();
        } catch (e) {
          const src = el.currentSrc || el.src || "(src inconnu)";
          throw new Error(`${label}: ${e?.message || e} (src=${src})`);
        }
      };

      if (useMix) {
        await tryPlay(mixRef.current, "Mix");
      } else {
        await tryPlay(musicRef.current, "Musique");
        await tryPlay(voiceRef.current, "Voix");
        await tryPlay(binauralRef.current, "Binaural");
      }
      setIsPlaying(true);
    } catch (e) {
      setIsPlaying(false);
      setError(`Lecture audio impossible: ${e?.message || e}`);
    }
  };

  const handlePause = () => {
    [mixRef.current, musicRef.current, voiceRef.current, binauralRef.current].forEach((el) => {
      if (el) {
        el.pause();
      }
    });
    setIsPlaying(false);
  };

  /**
   * Lecteur "Ambiance + Binaural" (simultané) :
   * - deux pistes jouées en même temps
   * - volumes indépendants
   * - loop infini
   * - fade-in au démarrage
   *
   * On utilise les pistes déjà générées dans la session :
   * - ambiance = session.music_path
   * - binaural = session.binaural_path
   */
  const playAmbianceBinaural = async () => {
    setError("");
    try {
      if (!session) {
        setError("Génère ou charge une session pour obtenir les pistes ambiance + binaural.");
        return;
      }
      // Si on relance le lecteur, on stoppe un éventuel minuteur précédent.
      stopTimer();
      // Fade-in indépendant (le mix n'est pas utilisé ici)
      await fadeInPlay(musicRef.current, ambianceVol, 1500);
      await fadeInPlay(binauralRef.current, binauralVol, 1500);
      setAmbBinauralPlaying(true);

      // Démarre le minuteur (configurable). Si tu veux "désactiver", mets un preset très grand.
      startTimer(timerMinutes);
    } catch (e) {
      setAmbBinauralPlaying(false);
      setError(`Lecture ambiance+binaural impossible: ${e?.message || e}`);
    }
  };

  const pauseAmbianceBinaural = () => {
    [musicRef.current, binauralRef.current].forEach((el) => {
      if (el) el.pause();
    });
    // Pause => stoppe aussi le minuteur (sinon le fade-out se déclencherait "dans le vide")
    stopTimer();
    setAmbBinauralPlaying(false);
  };

  /**
   * Session complète (1 clic):
   * - lance musique+binaural avec fade-in
   * - attend une "pré-ambiance" (ex: 10s)
   * - démarre la voix (non-loop)
   * - à la fin de la voix: fade-out musique+binaural (10s) puis stop
   */
  const playFullSession = async () => {
    setError("");
    try {
      if (!session) {
        setError("Génère ou charge une session pour lancer une session complète.");
        return;
      }

      // Evite lectures concurrentes
      await stopFullSession();
      handlePause();
      pauseAmbianceBinaural();
      stopTimer();

      setFullSessionPlaying(true);

      // Prépare les éléments
      if (voiceRef.current) {
        voiceRef.current.loop = false;
        voiceRef.current.currentTime = 0;
        voiceRef.current.volume = 1.0;
      }
      if (musicRef.current) {
        musicRef.current.loop = true;
        musicRef.current.currentTime = 0;
      }
      if (binauralRef.current) {
        binauralRef.current.loop = true;
        binauralRef.current.currentTime = 0;
      }

      // 1) Démarre fond (fade-in)
      await fadeInPlay(musicRef.current, ambianceVol, 1500);
      await fadeInPlay(binauralRef.current, binauralVol, 1500);

      // 2) Pré-ambiance
      if (fullPreludeSec > 0) await sleepMs(fullPreludeSec * 1000);

      // 3) Voix
      if (!voiceRef.current) throw new Error("Voix: élément audio manquant.");
      const onEnded = async () => {
        // 4) Fin: fade-out et stop
        try {
          await fadeOutAndStop(musicRef.current, binauralRef.current, 10_000);
        } finally {
          await stopFullSession();
        }
      };
      fullSessionRef.current.onVoiceEnded = onEnded;
      voiceRef.current.addEventListener("ended", onEnded, { once: true });
      await voiceRef.current.play();
    } catch (e) {
      setFullSessionPlaying(false);
      setError(`Session complète impossible: ${e?.message || e}`);
    }
  };

  // Applique les volumes en temps réel pendant la lecture
  useEffect(() => {
    if (musicRef.current && ambBinauralPlaying && !isFadingOutRef.current) {
      musicRef.current.volume = ambianceVol;
    }
  }, [ambianceVol, ambBinauralPlaying]);

  useEffect(() => {
    if (binauralRef.current && ambBinauralPlaying && !isFadingOutRef.current) {
      binauralRef.current.volume = binauralVol;
    }
  }, [binauralVol, ambBinauralPlaying]);

  // Nettoyage si l'utilisateur quitte la page (évite timers "orphelins")
  useEffect(() => {
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <div className="toastHost" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div className="t-title">{t.title}</div>
            {t.body ? <div className="t-body">{t.body}</div> : null}
          </div>
        ))}
      </div>

      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-title">Hypnotic AI</div>
            <div className="brand-small">Sessions hypnotiques (texte + voix + musique + binaural)</div>
          </div>

          <div className="actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className={`btn btn-pill btn-secondary ${page === PAGES.home ? "active" : ""}`}
              onClick={() => navigate(PAGES.home)}
              disabled={!currentUserEmail}
            >
              Accueil
            </button>
            <button
              type="button"
              className={`btn btn-pill btn-secondary ${page === PAGES.history ? "active" : ""}`}
              onClick={() => navigate(PAGES.history)}
              disabled={!currentUserEmail}
            >
              Historique
            </button>
            <button
              type="button"
              className={`btn btn-pill btn-secondary ${page === PAGES.login ? "active" : ""}`}
              onClick={() => navigate(PAGES.login)}
            >
              Connexion
            </button>
            <button
              type="button"
              className={`btn btn-pill btn-secondary ${page === PAGES.settings ? "active" : ""}`}
              onClick={() => navigate(PAGES.settings)}
              disabled={!currentUserEmail}
            >
              Réglages
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            {currentUserEmail ? <div className="userpill">{currentUserEmail}</div> : <div className="muted">Non connecté</div>}
            {currentUserEmail ? (
              <div className="actions" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-danger btn-sm" onClick={logout}>
                  Déconnexion
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={stopAllAudio}>
                  Stop tout
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="main">

      {page === PAGES.history && (
        <section className="card">
          <div className="row">
            <h2>Historique</h2>
            <button type="button" onClick={refreshRuns} disabled={runsLoading}>
              {runsLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
          {runs.length === 0 ? (
            <p className="muted">Aucun run enregistré pour le moment.</p>
          ) : (
            <div className="runs">
              {runs.map((r) => (
                <div className="run" key={r.run_id}>
                  <div className="run-meta">
                    <div className="run-id">{r.run_id}</div>
                    <div className="muted">
                      {r.objectif || "?"} · {r.duree_minutes || "?"}m · {r.style || "?"}{" "}
                      {r.has_mix ? "· mix" : ""}
                    </div>
                  </div>
                  <div className="run-actions">
                    <button type="button" onClick={() => loadRun(r.run_id)}>
                      Charger
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRun(r.run_id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {page === PAGES.login && (
        <section className="card">
          <div className="row">
            <h2>{authMode === "register" ? "Créer un compte" : "Connexion"}</h2>
            <div className="actions" style={{ margin: 0 }}>
              <button
                type="button"
                className={`navbtn ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}
              >
                Connexion
              </button>
              <button
                type="button"
                className={`navbtn ${authMode === "register" ? "active" : ""}`}
                onClick={() => setAuthMode("register")}
              >
                Créer un compte
              </button>
            </div>
          </div>

          <p className="muted">
            MVP local: comptes stockés dans ton navigateur (localStorage). Plus tard on branchera un vrai backend.
          </p>

          {authMsg ? <div className={authMsg.toLowerCase().includes("incorrect") ? "error" : "hint"}>{authMsg}</div> : null}

          <form onSubmit={onAuthSubmit}>
            <div className="grid3">
              <div className="field">
                <label>Email</label>
                <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} type="text" placeholder="ex: toi@email.com" />
              </div>
              <div className="field">
                <label>Mot de passe</label>
                <input value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} type="password" placeholder="••••••••" />
              </div>
              {authMode === "register" && (
                <div className="field">
                  <label>Confirmer</label>
                  <input
                    value={authPassword2}
                    onChange={(e) => setAuthPassword2(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                  />
                </div>
              )}
            </div>
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={authLoading}>
                {authLoading ? "..." : authMode === "register" ? "Créer" : "Se connecter"}
              </button>
            </div>
          </form>
        </section>
      )}

      {page === PAGES.settings && (
        <section className="card">
          <h2>Réglages</h2>
          <p className="muted">
            Placeholder MVP. Ici on mettra: profils, thèmes, limites de génération, clés API, etc.
          </p>
          <div className="grid3">
            <div className="field inline">
              <label>
                <input type="checkbox" checked={zenMode} onChange={(e) => setZenMode(e.target.checked)} /> Mode Zen
              </label>
              <div className="hint">Typo un peu plus douce + contraste réduit.</div>
            </div>
            <div className="field inline">
              <label>
                <input
                  type="checkbox"
                  checked={hideAdvanced}
                  onChange={(e) => setHideAdvanced(e.target.checked)}
                />{" "}
                Masquer réglages avancés (par défaut)
              </label>
              <div className="hint">Les sections “Réglages …” restent disponibles mais repliées.</div>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-danger" onClick={stopAllAudio}>
              Stop tout
            </button>
            <a className="btn btn-ghost" href={`${apiBase}/export/tts-dataset.zip`} target="_blank" rel="noreferrer">
              Export dataset voix (ZIP)
            </a>
          </div>
        </section>
      )}

      {page === PAGES.home && (
        <form className="card" onSubmit={onSubmit}>
        <div className="subcard">
          <div className="row">
            <div>
              <h2 style={{ margin: 0 }}>Créer une session</h2>
              <div className="muted">Choisis ton objectif, puis génère. Les réglages avancés restent optionnels.</div>
            </div>
            <div className="actions" style={{ margin: 0 }}>
              <button type="button" className="btn btn-secondary" onClick={applyThemePreset} disabled={loading}>
                Auto (preset thème)
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Génération..." : "Générer"}
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Objectif</label>
          <select name="objectif" value={form.objectif} onChange={onChange}>
            {objectifs.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <div className="hint">
            Règle d’un coup: binaural + musique + bruit + volumes recommandés (tu peux ensuite ajuster).
          </div>
          <div className="hint">
            Réglage binaural demandé: <strong>{form.binaural_band}</strong> (puis clique <strong>Générer</strong> pour
            régénérer les pistes).
          </div>
          {lastThemeApplied?.objectif === form.objectif && (
            <div className="hint">
              Preset appliqué: binaural <strong>{lastThemeApplied.binaural_band}</strong>, musique{" "}
              <strong>{lastThemeApplied.musicId}</strong>, bruit <strong>{lastThemeApplied.noiseId}</strong>{" "}
              ({lastThemeApplied.playNoise ? "on" : "off"}), volumes (musique {lastThemeApplied.musicVol}, bruit{" "}
              {lastThemeApplied.noiseVol}, binaural {lastThemeApplied.binauralVol}).
            </div>
          )}
        </div>

        <div className="field">
          <label>Durée (minutes)</label>
          <select name="duree_minutes" value={form.duree_minutes} onChange={onChange}>
            {durees.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Style</label>
          <select name="style" value={form.style} onChange={onChange}>
            {styles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Générateur de texte</label>
          <select name="llm_provider" value={form.llm_provider} onChange={onChange}>
            {providers.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {form.llm_provider === "gemini" && (
          <div className="field">
            <label>Modèle Gemini</label>
            <input name="gemini_model" value={form.gemini_model} onChange={onChange} />
            <div className="hint">
              La clé API doit être configurée côté backend via la variable d'environnement <code>GEMINI_API_KEY</code>.
            </div>
          </div>
        )}

        <div className="field">
          <label>Voix (TTS)</label>
          <select name="tts_provider" value={form.tts_provider} onChange={onChange}>
            {ttsProviders.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="hint">
            ElevenLabs requiert <code>ELEVENLABS_API_KEY</code> côté backend. (Avec cache pour économiser le crédit.)
          </div>
        </div>

        {form.tts_provider === "elevenlabs" && (
          <div className="field">
            <label>ElevenLabs voice_id (optionnel)</label>
            <input
              name="elevenlabs_voice_id"
              value={form.elevenlabs_voice_id}
              onChange={onChange}
              placeholder="UUID voice_id (sinon ELEVENLABS_VOICE_ID côté backend)"
            />
          </div>
        )}

        {form.tts_provider === "elevenlabs" && (
        <details className="advanced" open={!hideAdvanced}>
          <summary>Réglages ElevenLabs (voix)</summary>
            <div className="grid3">
              <div className="field">
                <label>stability</label>
                <input
                  type="range"
                  name="elevenlabs_stability"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.elevenlabs_stability ?? 0.55}
                  onChange={onChange}
                />
                <div className="hint">{Number(form.elevenlabs_stability ?? 0.55).toFixed(2)}</div>
              </div>
              <div className="field">
                <label>similarity_boost</label>
                <input
                  type="range"
                  name="elevenlabs_similarity_boost"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.elevenlabs_similarity_boost ?? 0.75}
                  onChange={onChange}
                />
                <div className="hint">{Number(form.elevenlabs_similarity_boost ?? 0.75).toFixed(2)}</div>
              </div>
              <div className="field">
                <label>style</label>
                <input
                  type="range"
                  name="elevenlabs_style"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.elevenlabs_style ?? 0.15}
                  onChange={onChange}
                />
                <div className="hint">{Number(form.elevenlabs_style ?? 0.15).toFixed(2)}</div>
              </div>
            </div>
            <div className="field inline">
              <label>
                <input
                  type="checkbox"
                  name="elevenlabs_use_speaker_boost"
                  checked={Boolean(form.elevenlabs_use_speaker_boost ?? true)}
                  onChange={onChange}
                />{" "}
                use_speaker_boost
              </label>
            </div>
            <div className="hint">
              Ces valeurs sont envoyées au backend et influencent le cache (si tu changes un slider, ça régénère).
            </div>
          </details>
        )}

        <div className="field inline">
          <label>
            <input type="checkbox" name="mixdown" checked={form.mixdown} onChange={onChange} /> Mixdown (1 piste WAV)
          </label>
        </div>

        <details className="advanced" open={!hideAdvanced}>
          <summary>Réglages audio (volume / offset)</summary>
          <div className="grid3">
            <div className="field">
              <label>Voix volume</label>
              <input
                type="range"
                name="voice_volume"
                min="0"
                max="2"
                step="0.05"
                value={form.voice_volume}
                onChange={onChange}
              />
              <div className="hint">{form.voice_volume.toFixed(2)}</div>
            </div>
            <div className="field">
              <label>Musique volume</label>
              <input
                type="range"
                name="music_volume"
                min="0"
                max="2"
                step="0.05"
                value={form.music_volume}
                onChange={onChange}
              />
              <div className="hint">{form.music_volume.toFixed(2)}</div>
            </div>
            <div className="field">
              <label>Binaural volume</label>
              <input
                type="range"
                name="binaural_volume"
                min="0"
                max="2"
                step="0.05"
                value={form.binaural_volume}
                onChange={onChange}
              />
              <div className="hint">{form.binaural_volume.toFixed(2)}</div>
            </div>
          </div>

          <div className="grid3">
            <div className="field">
              <label>Binaural (type)</label>
              <select name="binaural_band" value={form.binaural_band} onChange={onChange}>
                {binauralBands.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <div className="hint">Auto = choisi selon l’objectif. Sinon tu forces Delta/Theta/Alpha/Beta/Gamma.</div>
            </div>
            <div className="field">
              <label>Beat exact (Hz) — optionnel</label>
              <input
                type="number"
                name="binaural_beat_hz"
                min="0"
                max="80"
                step="0.5"
                value={form.binaural_beat_hz}
                onChange={onChange}
              />
              <div className="hint">0 = désactivé. Si &gt; 0, priorité sur le type.</div>
            </div>
          </div>

          <div className="grid3">
            <div className="field">
              <label>Voix offset (s)</label>
              <input
                type="number"
                name="voice_offset_s"
                min="0"
                max="30"
                step="0.25"
                value={form.voice_offset_s}
                onChange={onChange}
              />
            </div>
            <div className="field">
              <label>Musique offset (s)</label>
              <input
                type="number"
                name="music_offset_s"
                min="0"
                max="30"
                step="0.25"
                value={form.music_offset_s}
                onChange={onChange}
              />
            </div>
            <div className="field">
              <label>Binaural offset (s)</label>
              <input
                type="number"
                name="binaural_offset_s"
                min="0"
                max="30"
                step="0.25"
                value={form.binaural_offset_s}
                onChange={onChange}
              />
            </div>
          </div>
        </details>

        </form>
      )}

      {error && <div className="error">{error}</div>}

      {session && (
        <section className="card">
          <h2>Session générée</h2>
          {session.run_id && <div className="muted">run: {session.run_id}</div>}
          {session.llm_provider_used && (
            <div className="muted">
              LLM: {session.llm_provider_used}
              {session.llm_fallback ? " (fallback)" : ""}
            </div>
          )}
          {session.llm_fallback && session.llm_error && (
            <div className="error">LLM fallback: {session.llm_error}</div>
          )}

          {(session.binaural_band_used || typeof session.binaural_beat_hz_used === "number") && (
            <div className="muted">
              Binaural: {session.binaural_band_used || "?"}
              {typeof session.binaural_beat_hz_used === "number" ? ` (${session.binaural_beat_hz_used} Hz)` : ""}
            </div>
          )}

          {(session.tts_provider_used || session.tts_cache_hit !== null || session.tts_error) && (
            <div className="muted">
              TTS: {session.tts_provider_used || "?"}
              {session.tts_cache_hit ? " (cache)" : ""}
              {session.tts_error ? ` — note: ${session.tts_error}` : ""}
            </div>
          )}

          <div className="badges">
            {session.llm_provider_used ? (
              <span className={`badge ${session.llm_fallback ? "warn" : "ok"}`}>
                LLM: {session.llm_provider_used}
                {session.llm_fallback ? " (fallback)" : ""}
              </span>
            ) : null}
            {session.tts_provider_used ? (
              <span className={`badge ${session.tts_error ? "warn" : "ok"}`}>
                TTS: {session.tts_provider_used}
                {session.tts_cache_hit ? " (cache)" : ""}
              </span>
            ) : null}
            {session.binaural_band_used ? (
              <span className="badge ok">
                Binaural: {session.binaural_band_used}
                {typeof session.binaural_beat_hz_used === "number" ? ` (${session.binaural_beat_hz_used} Hz)` : ""}
              </span>
            ) : null}
            {session.mix_path ? <span className="badge ok">Mix: prêt</span> : <span className="badge warn">Mix: non</span>}
          </div>

          {/* Ambiances relaxation (solo ou mix avec binaural) */}
          <RelaxAmbiencePlayer
            binauralUrl={session?.binaural_path}
            apiBase={apiBase}
            suggestedMusicId={suggestedMusicId}
            suggestedNoiseId={suggestedNoiseId}
            suggestedMusicVol={suggestedTheme?.musicVol}
            suggestedNoiseVol={suggestedTheme?.noiseVol}
            suggestedBinauralVol={suggestedTheme?.binauralVol}
            suggestedPlayNoise={suggestedTheme?.playNoise}
            applyPresetSignal={applyThemeSignal}
            stopSignal={stopAllSignal}
          />

          <div className="actions">
            <button type="button" className="btn btn-danger" onClick={stopAllAudio}>
              Stop tout (tous les lecteurs)
            </button>
          </div>

          <div className="subcard">
            <h3>Session complète (1 clic)</h3>
            <p className="muted">
              Lance musique+binaural, attend une pré-ambiance, puis démarre la voix. À la fin: fade-out 10s puis stop.
            </p>
            <div className="grid3">
              <div className="field">
                <label>Pré-ambiance</label>
                <select
                  value={fullPreludeSec}
                  onChange={(e) => setFullPreludeSec(Number(e.target.value))}
                  disabled={fullSessionPlaying}
                >
                  {preludePresetsSec.map((s) => (
                    <option key={s} value={s}>
                      {s}s
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={playFullSession} disabled={fullSessionPlaying}>
                Play session complète
              </button>
              <button type="button" className="btn btn-secondary" onClick={stopFullSession} disabled={!fullSessionPlaying}>
                Stop
              </button>
            </div>
          </div>

          <div className="subcard">
            <h3>Lecteur Ambiance + Binaural</h3>
            <p className="muted">
              Ambiance (loop) + Binaural (loop) joués simultanément avec fade-in.
            </p>

            <div className="grid3">
              <div className="field">
                <label>Minuteur</label>
                <select
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(Number(e.target.value))}
                  disabled={ambBinauralPlaying}
                >
                  {timerPresets.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
                {timerRemainingSec !== null && (
                  <div className="hint">
                    Temps restant: {Math.floor(timerRemainingSec / 60)}:
                    {String(timerRemainingSec % 60).padStart(2, "0")}
                  </div>
                )}
                <div className="hint">
                  À la fin: fade-out sur 10s puis stop des deux pistes.
                </div>
              </div>
            </div>

            <div className="grid3">
              <div className="field">
                <label>Ambiance volume</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={ambianceVol}
                  onChange={(e) => setAmbianceVol(Number(e.target.value))}
                />
                <div className="hint">{ambianceVol.toFixed(2)}</div>
              </div>
              <div className="field">
                <label>Binaural volume</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={binauralVol}
                  onChange={(e) => setBinauralVol(Number(e.target.value))}
                />
                <div className="hint">{binauralVol.toFixed(2)}</div>
              </div>
            </div>

            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={playAmbianceBinaural} disabled={ambBinauralPlaying}>
                Play ambiance + binaural
              </button>
              <button type="button" className="btn btn-secondary" onClick={pauseAmbianceBinaural} disabled={!ambBinauralPlaying}>
                Pause ambiance + binaural
              </button>
            </div>
          </div>

          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={handlePlay} disabled={isPlaying}>
              Play
            </button>
            <button type="button" className="btn btn-secondary" onClick={handlePause} disabled={!isPlaying}>
              Pause
            </button>
          </div>

          <div className="accordion">
            {Object.entries(session.texte || {}).map(([phase, content]) => (
              <details key={phase} open={phase === "induction"}>
                <summary>
                  {phase}
                  <span style={{ float: "right" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigator.clipboard?.writeText?.(String(content || ""));
                        pushToast("success", "Copié", phase);
                      }}
                    >
                      Copier
                    </button>
                  </span>
                </summary>
                <div className="phase-text">{content}</div>
              </details>
            ))}
          </div>

          {/* Audio tags: on laisse les <audio> cachés, mais on loggue mieux les erreurs (source + piste) */}
          <audio ref={voiceRef} src={session.tts_audio_path} preload="auto" />
          <audio ref={musicRef} src={session.music_path} preload="auto" loop />
          <audio ref={binauralRef} src={session.binaural_path} preload="auto" loop />
          {session.mix_path && <audio ref={mixRef} src={session.mix_path} preload="auto" />}

          {/* Liens de debug rapides (ouvre le fichier audio directement) */}
          <div className="muted" style={{ marginTop: 10 }}>
            <div>
              audio:{" "}
              <a href={session.tts_audio_path} target="_blank" rel="noreferrer">
                voix
              </a>{" "}
              |{" "}
              <a href={session.music_path} target="_blank" rel="noreferrer">
                musique
              </a>{" "}
              |{" "}
              <a href={session.binaural_path} target="_blank" rel="noreferrer">
                binaural
              </a>{" "}
              {session.mix_path ? (
                <>
                  |{" "}
                  <a href={session.mix_path} target="_blank" rel="noreferrer">
                    mix
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </section>
      )}
        </main>
      </div>
    </div>
  );
}

