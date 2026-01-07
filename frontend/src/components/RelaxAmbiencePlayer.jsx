import { useEffect, useMemo, useRef, useState } from "react";
import { AMBIENCES } from "../ambiences/catalog";
import { fadeInGain, setGain } from "../ambiences/generators";

/**
 * Lecteur "Relax Ambience" (WebAudio):
 * - Joue une ambiance (rose/rain/wind/forest) seule OU en mix avec une piste binaurale
 * - Loop infini
 * - Volumes indépendants
 * - Fade-in au démarrage (côté gain nodes)
 *
 * Important:
 * - Les fichiers audio (forest.mp3 etc.) doivent être dans `frontend/public/ambiences/`
 * - Le binaural vient du backend (URL passée via props)
 */
export default function RelaxAmbiencePlayer({
  binauralUrl,
  apiBase,
  suggestedMusicId,
  suggestedNoiseId,
  suggestedMusicVol,
  suggestedNoiseVol,
  suggestedBinauralVol,
  suggestedPlayNoise,
  applyPresetSignal,
  stopSignal,
}) {
  /**
   * Objectif demandé:
   * - Séparer tes 4 musiques ("ambiance1..4") des ambiances/bruits (bruit rose / pluie / vent)
   * - Pouvoir mixer: 1 musique + 1 bruit (et optionnellement + binaural)
   *
   * => On implémente 2 couches:
   * - Music layer: fichier MP3 (tes 4 sons)
   * - Noise layer: ambiance générée (pink/rain/wind) très légère
   */
  const [musicId, setMusicId] = useState("user-slowlife");
  const [noiseId, setNoiseId] = useState("pink");
  const [playMusic, setPlayMusic] = useState(true);
  const [playNoise, setPlayNoise] = useState(false);
  const [playBinaural, setPlayBinaural] = useState(true);
  const [musicVol, setMusicVol] = useState(0.5);
  const [noiseVol, setNoiseVol] = useState(0.35);
  const [binauralVol, setBinauralVol] = useState(0.35);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");

  // AudioContext + nodes (créés à la demande au 1er Play)
  const audioCtxRef = useRef(null);
  const masterRef = useRef(null);
  const musicGainRef = useRef(null);
  const noiseGainRef = useRef(null);
  const binauralGainRef = useRef(null);

  // Sources
  const noiseSourceRef = useRef(null); // AudioBufferSourceNode (generated)
  const musicNodeRef = useRef(null); // MediaElementSourceNode (file)
  const binauralNodeRef = useRef(null); // MediaElementSourceNode (binaural)

  // Audio elements pour la musique (file) et binaural
  const musicElRef = useRef(null);
  const binauralElRef = useRef(null);

  // On sépare clairement:
  // - musiques = tes 4 fichiers (id "user-*")
  // - bruits = générés (pink/rain/wind)
  const musicTracks = useMemo(() => AMBIENCES.filter((a) => a.id.startsWith("user-")), []);
  const noiseTracks = useMemo(
    () => AMBIENCES.filter((a) => a.type === "generated" && ["pink", "rain", "wind"].includes(a.id)),
    []
  );

  const selectedMusic = useMemo(
    () => musicTracks.find((a) => a.id === musicId) || musicTracks[0],
    [musicId, musicTracks]
  );
  const selectedNoise = useMemo(
    () => noiseTracks.find((a) => a.id === noiseId) || noiseTracks[0],
    [noiseId, noiseTracks]
  );

  // Si le parent applique un preset (selon objectif), on l'applique tant qu'on ne lit pas déjà.
  // applyPresetSignal permet de "forcer" l'application même si l'objectif n'a pas changé.
  useEffect(() => {
    if (isPlaying) return;
    if (suggestedMusicId) setMusicId(suggestedMusicId);
    if (suggestedNoiseId) setNoiseId(suggestedNoiseId);
    if (typeof suggestedMusicVol === "number") setMusicVol(suggestedMusicVol);
    if (typeof suggestedNoiseVol === "number") setNoiseVol(suggestedNoiseVol);
    if (typeof suggestedBinauralVol === "number") setBinauralVol(suggestedBinauralVol);
    if (typeof suggestedPlayNoise === "boolean") setPlayNoise(suggestedPlayNoise);
  }, [
    suggestedMusicId,
    suggestedNoiseId,
    suggestedMusicVol,
    suggestedNoiseVol,
    suggestedBinauralVol,
    suggestedPlayNoise,
    applyPresetSignal,
    isPlaying,
  ]);

  const ensureContext = async () => {
    if (audioCtxRef.current) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // Master gain: point unique pour brancher / couper facilement
    const master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(ctx.destination);
    masterRef.current = master;

    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(master);
    musicGainRef.current = musicGain;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0;
    noiseGain.connect(master);
    noiseGainRef.current = noiseGain;

    const binauralGain = ctx.createGain();
    binauralGain.gain.value = 0.0;
    binauralGain.connect(master);
    binauralGainRef.current = binauralGain;
  };

  const urlOrigin = (u) => {
    try {
      return new URL(u).origin;
    } catch {
      return "";
    }
  };

  /**
   * Vérifie qu'une URL audio est accessible.
   * IMPORTANT: sur certains setups, un fetch HEAD peut échouer (TypeError: Failed to fetch) alors que le média est lisible.
   * Dans ce cas, on ne bloque pas: on teste /health pour savoir si le backend est joignable, puis on laisse le <audio> charger.
   */
  const checkAudioUrl = async (url, label) => {
    if (!url) throw new Error(`${label}: URL vide.`);
    try {
      const head = await fetch(url, { method: "HEAD" });
      const ct = (head.headers.get("content-type") || "").toLowerCase();
      if (!head.ok) throw new Error(`HTTP ${head.status}`);
      // content-type audio (wav/mp3/ogg) — tolérant
      if (!ct.startsWith("audio/") && !ct.includes("mpeg") && !ct.includes("ogg") && !ct.includes("wav")) {
        throw new Error(`content-type=${ct || "?"}`);
      }
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      // Diagnostic: backend joignable ?
      const origin = urlOrigin(url);
      if (origin) {
        try {
          const health = await fetch(`${origin}/health`, { method: "GET" });
          if (health.ok) {
            // Backend OK => HEAD a échoué mais on tente quand même le chargement via <audio>.
            console.warn(`[RelaxAmbiencePlayer] ${label} HEAD failed (${msg}) but /health is OK. Proceeding with <audio>.`);
            return;
          }
        } catch {
          // ignore
        }
      }
      throw new Error(`${label}: impossible de charger ${url} (${msg}) — vérifie que le backend est lancé (teste: ${origin || apiBase || ""}/health)`);
    }
  };

  const stopNoiseSource = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const src = noiseSourceRef.current;
    if (src) {
      try {
        src.stop();
      } catch {
        // ignore
      }
      try {
        src.disconnect();
      } catch {
        // ignore
      }
      noiseSourceRef.current = null;
    }
  };

  const stopMusicSource = () => {
    // Idem: on garde le MediaElementSourceNode, on stoppe l'élément HTML.
    if (musicElRef.current) {
      musicElRef.current.pause();
      musicElRef.current.currentTime = 0;
    }
  };

  const stopBinauralSource = () => {
    // Idem: on garde le MediaElementSourceNode, on stoppe l'élément HTML.
    if (binauralElRef.current) {
      binauralElRef.current.pause();
      binauralElRef.current.currentTime = 0;
    }
  };

  const buildNoiseSource = async () => {
    const ctx = audioCtxRef.current;
    const gain = noiseGainRef.current;
    if (!ctx || !gain) return;

    stopNoiseSource();

    // Généré: buffer source loop
    const buffer = selectedNoise.makeBuffer(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true; // loop infini
    src.connect(gain);
    noiseSourceRef.current = src;
  };

  const buildMusicSource = async () => {
    const ctx = audioCtxRef.current;
    const gain = musicGainRef.current;
    if (!ctx || !gain) return;

    stopMusicSource();

    if (!musicElRef.current) {
      musicElRef.current = new Audio();
      musicElRef.current.preload = "auto";
    }

    // Musique = fichier /library (servi par backend)
    const resolvedSrc =
      selectedMusic.src?.startsWith("/library/") && apiBase ? `${apiBase}${selectedMusic.src}` : selectedMusic.src;
    await checkAudioUrl(resolvedSrc, "Musique");

    musicElRef.current.crossOrigin = "anonymous";
    musicElRef.current.src = resolvedSrc;
    musicElRef.current.loop = true;

    if (!musicNodeRef.current) {
      musicNodeRef.current = ctx.createMediaElementSource(musicElRef.current);
      musicNodeRef.current.connect(gain);
    }
  };

  const buildBinauralSource = async () => {
    const ctx = audioCtxRef.current;
    const gain = binauralGainRef.current;
    if (!ctx || !gain) return;

    stopBinauralSource();

    if (!binauralUrl) return;
    if (!binauralElRef.current) {
      binauralElRef.current = new Audio();
      binauralElRef.current.preload = "auto";
    }
    await checkAudioUrl(binauralUrl, "Binaural");
    binauralElRef.current.crossOrigin = "anonymous";
    binauralElRef.current.src = binauralUrl;
    binauralElRef.current.loop = true;

    if (!binauralNodeRef.current) {
      binauralNodeRef.current = ctx.createMediaElementSource(binauralElRef.current);
      binauralNodeRef.current.connect(gain);
    }
  };

  const handlePlay = async () => {
    setError("");
    try {
      await ensureContext();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      // Obligation mobile: reprendre l’AudioContext sur geste utilisateur
      if (ctx.state === "suspended") await ctx.resume();

      // (Re)build sources
      if (playMusic) await buildMusicSource();
      if (playNoise) await buildNoiseSource();
      if (playBinaural) await buildBinauralSource();

      // Démarrage des sources
      if (playMusic) {
        await musicElRef.current?.play?.();
        fadeInGain(musicGainRef.current, musicVol, 1500);
      } else {
        setGain(musicGainRef.current, 0);
      }

      if (playNoise) {
        noiseSourceRef.current?.start?.();
        fadeInGain(noiseGainRef.current, noiseVol, 1500);
      } else {
        setGain(noiseGainRef.current, 0);
      }

      if (playBinaural) {
        await binauralElRef.current?.play?.();
        fadeInGain(binauralGainRef.current, binauralVol, 1500);
      } else {
        setGain(binauralGainRef.current, 0);
      }

      setIsPlaying(true);
    } catch (e) {
      setIsPlaying(false);
      setError(e?.message || String(e));
    }
  };

  const handleStop = () => {
    // Stop propre (instantané). On pourrait ajouter fade-out si voulu.
    // (setGain est safe même si les nodes ne sont pas initialisés)
    setGain(musicGainRef.current, 0);
    setGain(noiseGainRef.current, 0);
    setGain(binauralGainRef.current, 0);
    stopMusicSource();
    stopNoiseSource();
    stopBinauralSource();
    setIsPlaying(false);
  };

  // Stop "global" déclenché par le parent (utile si plusieurs lecteurs tournent en même temps).
  useEffect(() => {
    if (!stopSignal) return;
    handleStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignal]);

  // Volumes temps réel
  useEffect(() => {
    if (isPlaying) setGain(musicGainRef.current, playMusic ? musicVol : 0);
  }, [musicVol, playMusic, isPlaying]);

  useEffect(() => {
    if (isPlaying) setGain(noiseGainRef.current, playNoise ? noiseVol : 0);
  }, [noiseVol, playNoise, isPlaying]);

  useEffect(() => {
    if (isPlaying) setGain(binauralGainRef.current, playBinaural ? binauralVol : 0);
  }, [binauralVol, playBinaural, isPlaying]);

  // Si on change de musique pendant lecture, on rebranche proprement.
  useEffect(() => {
    if (!isPlaying || !playMusic) return;
    (async () => {
      try {
        await buildMusicSource();
        await musicElRef.current?.play?.();
        setGain(musicGainRef.current, musicVol);
      } catch (e) {
        setError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicId]);

  // Si on change de bruit pendant lecture, on recrée la BufferSource (obligatoire).
  useEffect(() => {
    if (!isPlaying || !playNoise) return;
    (async () => {
      try {
        await buildNoiseSource();
        noiseSourceRef.current?.start?.();
        setGain(noiseGainRef.current, noiseVol);
      } catch (e) {
        setError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseId]);

  // Cleanup
  useEffect(() => {
    return () => {
      handleStop();
      try {
        audioCtxRef.current?.close?.();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="subcard">
      <h3>Ambiances relaxation (mix)</h3>
      <p className="muted">
        Tu peux jouer:
        - un fond musical (tes 4 musiques)
        - un bruit/ambiance (bruit rose / pluie / vent)
        - et optionnellement mixer avec le binaural de la session.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="grid3">
        <div className="field">
          <label>Fond musical (Ambiance 1..4)</label>
          <select value={musicId} onChange={(e) => setMusicId(e.target.value)} disabled={isPlaying}>
            {musicTracks.map((a, idx) => (
              <option key={a.id} value={a.id}>
                {`Ambiance ${idx + 1}`} — {a.label}
              </option>
            ))}
          </select>
          <div className="hint">Ces fichiers viennent de `library/music/user/` (servis par le backend).</div>
        </div>
        <div className="field inline">
          <label>
            <input type="checkbox" checked={playMusic} onChange={(e) => setPlayMusic(e.target.checked)} /> Jouer la
            musique
          </label>
        </div>
        <div className="field">
          <label>Musique volume</label>
          <input type="range" min="0" max="1" step="0.01" value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} />
          <div className="hint">{musicVol.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid3">
        <div className="field">
          <label>Bruit / Ambiance</label>
          <select value={noiseId} onChange={(e) => setNoiseId(e.target.value)} disabled={isPlaying}>
            {noiseTracks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <div className="hint">Ex: jouer “Bruit rose” en mix avec une de tes musiques.</div>
        </div>
        <div className="field inline">
          <label>
            <input type="checkbox" checked={playNoise} onChange={(e) => setPlayNoise(e.target.checked)} /> Jouer le bruit
          </label>
        </div>
        <div className="field">
          <label>Bruit volume</label>
          <input type="range" min="0" max="1" step="0.01" value={noiseVol} onChange={(e) => setNoiseVol(Number(e.target.value))} />
          <div className="hint">{noiseVol.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid3">
        <div className="field inline">
          <label>
            <input
              type="checkbox"
              checked={playBinaural}
              onChange={(e) => setPlayBinaural(e.target.checked)}
              disabled={!binauralUrl}
            />{" "}
            Mixer avec binaural
          </label>
          {!binauralUrl && <div className="hint">Charge/génère une session pour avoir la piste binaurale.</div>}
        </div>
        <div className="field">
          <label>Binaural volume</label>
          <input type="range" min="0" max="1" step="0.01" value={binauralVol} onChange={(e) => setBinauralVol(Number(e.target.value))} />
          <div className="hint">{binauralVol.toFixed(2)}</div>
        </div>
      </div>

      {/* Ancien bloc "Ambiance volume" supprimé: on a maintenant Music volume + Bruit volume + Binaural volume */}

      <div className="actions">
        <button type="button" onClick={handlePlay} disabled={isPlaying}>
          Play
        </button>
        <button type="button" onClick={handleStop} disabled={!isPlaying}>
          Stop
        </button>
      </div>
    </div>
  );
}


