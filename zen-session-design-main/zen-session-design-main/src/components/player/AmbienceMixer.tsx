import * as React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MUSIC_TRACKS, musicFileForId } from "@/audio/musicLibrary";
import { makeNoiseBuffer, rampGain } from "@/audio/noiseGenerators";
import { getCloudAudioCatalog, libraryUrl } from "@/api/hypnoticApi";
import { AmbianceType, BinauralType, MusicTrackId, SessionConfig } from "@/types";
import { ChevronDown, ChevronUp, Music2, Cloud, Waves } from "lucide-react";

type Props = {
  binauralUrl?: string | null;
  initialConfig: SessionConfig;
  defaultOpen?: boolean;
};

const ambianceOptions: { value: AmbianceType; label: string }[] = [
  { value: "none", label: "Aucune" },
  { value: "pink-noise", label: "Bruit rose" },
  { value: "rain", label: "Pluie" },
  { value: "forest", label: "Forêt" },
  { value: "ocean", label: "Océan" },
  { value: "wind", label: "Vent" },
  { value: "fire", label: "Feu de cheminée" },
];

const binauralOptions: { value: BinauralType; label: string }[] = [
  { value: "none", label: "Aucun" },
  { value: "delta", label: "Delta" },
  { value: "theta", label: "Theta" },
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
];

function pctTo01(pct: number): number {
  return Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
}

function NativeSelect(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  const { value, onChange, disabled, options } = props;
  return (
    <select
      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function AmbienceMixer({ binauralUrl, initialConfig, defaultOpen = false }: Props) {
  const [open, setOpen] = React.useState<boolean>(Boolean(defaultOpen));
  const [musicTrackId, setMusicTrackId] = React.useState<MusicTrackId>(initialConfig.musicTrackId);
  const [ambianceType, setAmbianceType] = React.useState<AmbianceType>(initialConfig.ambianceType);
  const [binauralType, setBinauralType] = React.useState<BinauralType>(initialConfig.binauralType);

  const [playMusic, setPlayMusic] = React.useState<boolean>(Boolean(initialConfig.playMusic));
  const [playNoise, setPlayNoise] = React.useState<boolean>(Boolean(initialConfig.playNoise));
  const [playBinaural, setPlayBinaural] = React.useState<boolean>(Boolean(initialConfig.playBinaural));

  const [musicVol, setMusicVol] = React.useState<number>(pctTo01(initialConfig.musicVolume));
  const [noiseVol, setNoiseVol] = React.useState<number>(pctTo01(initialConfig.ambianceVolume));
  const [binauralVol, setBinauralVol] = React.useState<number>(pctTo01(initialConfig.binauralVolume));

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [cloudCatalog, setCloudCatalog] = React.useState<{ music: Record<string, string>; ambiences: Record<string, string> } | null>(null);
  const [cloudCatalogStatus, setCloudCatalogStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cloudCatalogError, setCloudCatalogError] = React.useState<string>("");
  const isMountedRef = React.useRef(true);
  const stopTimeoutRef = React.useRef<number | null>(null);
  const stopTokenRef = React.useRef<number>(0);

  // Audio graph refs
  const ctxRef = React.useRef<AudioContext | null>(null);
  const masterRef = React.useRef<GainNode | null>(null);
  const musicGainRef = React.useRef<GainNode | null>(null);
  const noiseGainRef = React.useRef<GainNode | null>(null);
  const binauralGainRef = React.useRef<GainNode | null>(null);

  const musicElRef = React.useRef<HTMLAudioElement | null>(null);
  const ambienceElRef = React.useRef<HTMLAudioElement | null>(null);
  const binauralElRef = React.useRef<HTMLAudioElement | null>(null);
  const musicNodeRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const ambienceNodeRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const binauralNodeRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const noiseSrcRef = React.useRef<AudioBufferSourceNode | null>(null);

  // Load cloud audio catalog (optional) - fallback to local /library if not configured.
  React.useEffect(() => {
    let alive = true;
    isMountedRef.current = true;
    setCloudCatalogStatus("loading");
    (async () => {
      try {
        const cat = await getCloudAudioCatalog();
        if (!alive) return;
        if (cat?.enabled) setCloudCatalog({ music: cat.music || {}, ambiences: cat.ambiences || {} });
        else setCloudCatalog({ music: {}, ambiences: {} });
        setCloudCatalogError("");
        setCloudCatalogStatus("ready");
      } catch {
        if (!alive) return;
        setCloudCatalog({ music: {}, ambiences: {} });
        setCloudCatalogError("Impossible de charger /cloud-audio/catalog (réseau/CORS/VITE_API_BASE).");
        setCloudCatalogStatus("error");
      }
    })();
    return () => {
      alive = false;
      isMountedRef.current = false;
    };
  }, []);

  const ensureCloudCatalogLoaded = async () => {
    if (cloudCatalog) return cloudCatalog;
    setCloudCatalogStatus("loading");
    try {
      const cat = await getCloudAudioCatalog();
      const next = cat?.enabled ? { music: cat.music || {}, ambiences: cat.ambiences || {} } : { music: {}, ambiences: {} };
      if (isMountedRef.current) setCloudCatalog(next);
      if (isMountedRef.current) {
        setCloudCatalogError("");
        setCloudCatalogStatus("ready");
      }
      return next;
    } catch {
      const next = { music: {}, ambiences: {} };
      if (isMountedRef.current) setCloudCatalog(next);
      if (isMountedRef.current) {
        setCloudCatalogError("Impossible de charger /cloud-audio/catalog (réseau/CORS/VITE_API_BASE).");
        setCloudCatalogStatus("error");
      }
      return next;
    }
  };

  // Reset UI state when session/config changes (but keep user tweaks while playing)
  React.useEffect(() => {
    if (isPlaying) return;
    setMusicTrackId(initialConfig.musicTrackId);
    setAmbianceType(initialConfig.ambianceType);
    setBinauralType(initialConfig.binauralType);
    setPlayMusic(Boolean(initialConfig.playMusic));
    setPlayNoise(Boolean(initialConfig.playNoise));
    setPlayBinaural(Boolean(initialConfig.playBinaural));
    setMusicVol(pctTo01(initialConfig.musicVolume));
    setNoiseVol(pctTo01(initialConfig.ambianceVolume));
    setBinauralVol(pctTo01(initialConfig.binauralVolume));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig, binauralUrl]);

  const ensureContext = async () => {
    if (ctxRef.current) return;
    const AudioContextImpl = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AudioContextImpl();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    masterRef.current = master;

    const mg = ctx.createGain();
    mg.gain.value = 0;
    mg.connect(master);
    musicGainRef.current = mg;

    const ng = ctx.createGain();
    ng.gain.value = 0;
    ng.connect(master);
    noiseGainRef.current = ng;

    const bg = ctx.createGain();
    bg.gain.value = 0;
    bg.connect(master);
    binauralGainRef.current = bg;
  };

  const stopNoise = () => {
    const src = noiseSrcRef.current;
    if (!src) return;
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
    noiseSrcRef.current = null;
  };

  const stopAmbienceTrack = () => {
    try {
      ambienceElRef.current?.pause();
      if (ambienceElRef.current) ambienceElRef.current.currentTime = 0;
    } catch {
      // ignore
    }
  };

  const fadeOutMs = Math.max(0, Math.min(60_000, Math.round((Number(initialConfig.fadeOutDuration) || 10) * 1000)));

  const clearStopTimeout = () => {
    if (stopTimeoutRef.current) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  };

  const stopAll = (withFade = true) => {
    setError("");
    // Invalide tout "finalize" précédent
    stopTokenRef.current += 1;
    const token = stopTokenRef.current;
    clearStopTimeout();

    // UX: reflète immédiatement l'arrêt (même si le fade continue quelques ms)
    setIsPlaying(false);

    const ms = withFade ? Math.max(250, fadeOutMs) : 0;
    rampGain(musicGainRef.current, 0, ms || 1);
    rampGain(noiseGainRef.current, 0, ms || 1);
    rampGain(binauralGainRef.current, 0, ms || 1);

    const finalize = () => {
      // Si l'utilisateur a relancé Play entre-temps, on ne coupe pas la nouvelle lecture.
      if (stopTokenRef.current !== token) return;
      stopNoise();
      stopAmbienceTrack();
      try {
        musicElRef.current?.pause();
        if (musicElRef.current) musicElRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      try {
        binauralElRef.current?.pause();
        if (binauralElRef.current) binauralElRef.current.currentTime = 0;
      } catch {
        // ignore
      }
    };

    if (!ms) {
      finalize();
      return;
    }
    stopTimeoutRef.current = window.setTimeout(finalize, ms + 50);
  };

  const buildMusic = async () => {
    const ctx = ctxRef.current;
    const gain = musicGainRef.current;
    if (!ctx || !gain) return;

    if (!musicElRef.current) {
      musicElRef.current = new Audio();
      musicElRef.current.preload = "auto";
    }
    const file = musicFileForId(musicTrackId);
    const cloudSrc = cloudCatalog?.music?.[musicTrackId];
    // In production deployments (Vercel/Render), the backend usually does NOT ship local /library MP3 assets.
    // If no cloud catalog is configured, avoid trying to play a 404 HTML page as audio (browser shows "no compatible source").
    if (!cloudSrc && import.meta.env.PROD) {
      throw new Error(
        "Catalogue audio non prêt (ou musique manquante). Vérifie VITE_API_BASE et le chargement du catalogue, puis réessaie."
      );
    }
    const src = cloudSrc || libraryUrl(`/library/music/user/${file}`);
    musicElRef.current.crossOrigin = "anonymous";
    musicElRef.current.src = src;
    musicElRef.current.loop = true;

    if (!musicNodeRef.current) {
      musicNodeRef.current = ctx.createMediaElementSource(musicElRef.current);
      musicNodeRef.current.connect(gain);
    }
  };

  const buildBinaural = async () => {
    const ctx = ctxRef.current;
    const gain = binauralGainRef.current;
    if (!ctx || !gain) return;
    if (!binauralUrl) return;

    if (!binauralElRef.current) {
      binauralElRef.current = new Audio();
      binauralElRef.current.preload = "auto";
    }
    binauralElRef.current.crossOrigin = "anonymous";
    binauralElRef.current.src = binauralUrl;
    binauralElRef.current.loop = true;

    if (!binauralNodeRef.current) {
      binauralNodeRef.current = ctx.createMediaElementSource(binauralElRef.current);
      binauralNodeRef.current.connect(gain);
    }
  };

  const buildNoise = async () => {
    const ctx = ctxRef.current;
    const gain = noiseGainRef.current;
    if (!ctx || !gain) return;

    stopNoise();

    // Prefer a cloud ambience track if available (same ambianceType key)
    const cloudSrc = cloudCatalog?.ambiences?.[ambianceType];
    if (cloudSrc) {
      if (!ambienceElRef.current) {
        ambienceElRef.current = new Audio();
        ambienceElRef.current.preload = "auto";
      }
      ambienceElRef.current.crossOrigin = "anonymous";
      ambienceElRef.current.src = cloudSrc;
      ambienceElRef.current.loop = true;
      if (!ambienceNodeRef.current) {
        ambienceNodeRef.current = ctx.createMediaElementSource(ambienceElRef.current);
        ambienceNodeRef.current.connect(gain);
      }
      return;
    }

    // Fallback: generated noise buffer
    stopAmbienceTrack();
    const buf = makeNoiseBuffer(ctx, ambianceType);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    noiseSrcRef.current = src;
  };

  const handlePlay = async () => {
    setError("");
    try {
      // Annule un stop en cours (sinon finalize coupe la lecture)
      stopTokenRef.current += 1;
      clearStopTimeout();

      // In prod we depend on the backend-provided cloud catalog for MP3s.
      // If the user presses Play too quickly, wait for the catalog to load.
      if (import.meta.env.PROD) {
        await ensureCloudCatalogLoaded();
      }

      await ensureContext();
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume();

      if (playMusic) {
        await buildMusic();
        await musicElRef.current?.play?.();
        rampGain(musicGainRef.current, musicVol, 1500);
      } else {
        rampGain(musicGainRef.current, 0, 200);
      }

      if (playNoise && ambianceType !== "none") {
        await buildNoise();
        if (noiseSrcRef.current) {
          noiseSrcRef.current.start?.();
        } else {
          await ambienceElRef.current?.play?.();
        }
        rampGain(noiseGainRef.current, noiseVol, 1500);
      } else {
        rampGain(noiseGainRef.current, 0, 200);
        stopNoise();
        stopAmbienceTrack();
      }

      if (playBinaural && binauralUrl && binauralType !== "none") {
        await buildBinaural();
        await binauralElRef.current?.play?.();
        rampGain(binauralGainRef.current, binauralVol, 1500);
      } else {
        rampGain(binauralGainRef.current, 0, 200);
      }

      setIsPlaying(true);
    } catch (e: any) {
      setIsPlaying(false);
      setError(e?.message || String(e));
    }
  };

  // Live volume updates
  React.useEffect(() => {
    if (!isPlaying) return;
    rampGain(musicGainRef.current, playMusic ? musicVol : 0, 120);
  }, [musicVol, playMusic, isPlaying]);
  React.useEffect(() => {
    if (!isPlaying) return;
    rampGain(noiseGainRef.current, playNoise ? noiseVol : 0, 120);
  }, [noiseVol, playNoise, isPlaying]);
  React.useEffect(() => {
    if (!isPlaying) return;
    rampGain(binauralGainRef.current, playBinaural ? binauralVol : 0, 120);
  }, [binauralVol, playBinaural, isPlaying]);

  // Rebuild on selection changes during playback
  React.useEffect(() => {
    if (!isPlaying || !playMusic) return;
    (async () => {
      try {
        await buildMusic();
        await musicElRef.current?.play?.();
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicTrackId]);

  React.useEffect(() => {
    if (!isPlaying || !playNoise) return;
    (async () => {
      try {
        await buildNoise();
        if (noiseSrcRef.current) {
          noiseSrcRef.current.start?.();
        } else {
          await ambienceElRef.current?.play?.();
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambianceType]);

  React.useEffect(() => {
    if (!isPlaying || !playBinaural) return;
    (async () => {
      try {
        await buildBinaural();
        await binauralElRef.current?.play?.();
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binauralUrl]);

  // Cleanup
  React.useEffect(() => {
    return () => {
      clearStopTimeout();
      stopAll(false);
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const binauralDisabled = !binauralUrl;

  const musicLabel = MUSIC_TRACKS.find((t) => t.id === musicTrackId)?.label || "—";
  const noiseLabel = ambianceOptions.find((o) => o.value === ambianceType)?.label || "—";
  const binauralLabel = binauralOptions.find((o) => o.value === binauralType)?.label || "—";

  return (
    <GlassCard padding="lg" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold">Ambiances relaxation (mix)</div>
          <div className="text-sm text-muted-foreground">
            Musique (MP3) + bruit/ambiance + (optionnel) binaural.
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {playMusic ? `Musique: ${musicLabel} (${musicVol.toFixed(2)})` : "Musique: off"}
            {" · "}
            {playNoise ? `Bruit: ${noiseLabel} (${noiseVol.toFixed(2)})` : "Bruit: off"}
            {" · "}
            {playBinaural && !binauralDisabled && binauralType !== "none"
              ? `Binaural: ${binauralLabel} (${binauralVol.toFixed(2)})`
              : "Binaural: off"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={() => stopAll(true)} disabled={!isPlaying}>
            Stop
          </Button>
          <Button onClick={handlePlay} disabled={isPlaying}>
            Play
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Cloud audio:{" "}
        {cloudCatalogStatus === "loading"
          ? "chargement…"
          : cloudCatalogStatus === "ready"
            ? "OK"
            : cloudCatalogStatus === "error"
              ? "erreur"
              : "—"}
        {cloudCatalogStatus === "error" ? (
          <>
            {" · "}
            <span className="text-destructive">{cloudCatalogError}</span>
            <div className="mt-1">
              Test:{" "}
              <a
                className="underline"
                href={`${(import.meta.env.VITE_API_BASE as string | undefined) || ""}/cloud-audio/catalog`}
                target="_blank"
                rel="noreferrer"
              >
                ouvrir /cloud-audio/catalog
              </a>
            </div>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="text-sm text-destructive">
          {error}
          <div className="text-xs text-muted-foreground mt-1">
            Si tu vois une erreur CORS, vérifie que Render autorise ton domaine Vercel dans `CORS_ORIGINS` (et que
            `VITE_API_BASE` pointe vers Render, pas localhost).
          </div>
        </div>
      ) : null}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span>Paramètres avancés</span>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="slide-up pt-2">
          <div className="space-y-5">
            {/* Music */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Fond musical</div>
                    <div className="text-xs text-muted-foreground">Fichiers MP3 servis par le backend</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-muted-foreground">Jouer</Label>
                  <Switch checked={playMusic} onCheckedChange={(c) => setPlayMusic(c)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2 space-y-2">
                  <Label>Musique (Ambiance 1..4)</Label>
                  <NativeSelect
                    value={musicTrackId}
                    onChange={(v) => setMusicTrackId(v as MusicTrackId)}
                    disabled={!playMusic || isPlaying}
                    options={MUSIC_TRACKS.map((t, idx) => ({
                      value: t.id,
                      label: `Ambiance ${idx + 1} — ${t.label}`,
                    }))}
                  />
                  <div className="text-xs text-muted-foreground">
                    Source: <code>/library/music/user/</code>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Volume</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{musicVol.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[musicVol]}
                    onValueChange={([v]) => setMusicVol(v)}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={!playMusic}
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Noise */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Bruit / Ambiance</div>
                    <div className="text-xs text-muted-foreground">Généré localement (WebAudio)</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-muted-foreground">Jouer</Label>
                  <Switch checked={playNoise} onCheckedChange={(c) => setPlayNoise(c)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2 space-y-2">
                  <Label>Type</Label>
                  <NativeSelect
                    value={ambianceType}
                    onChange={(v) => setAmbianceType(v as AmbianceType)}
                    disabled={!playNoise || isPlaying}
                    options={ambianceOptions.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Volume</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{noiseVol.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[noiseVol]}
                    onValueChange={([v]) => setNoiseVol(v)}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={!playNoise}
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Binaural */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Waves className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Binaural</div>
                    <div className="text-xs text-muted-foreground">Piste générée par la session (backend)</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-muted-foreground">Mixer</Label>
                  <Switch checked={playBinaural} onCheckedChange={(c) => setPlayBinaural(c)} disabled={binauralDisabled} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2 space-y-2">
                  <Label>Type</Label>
                  <NativeSelect
                    value={binauralType}
                    onChange={(v) => setBinauralType(v as BinauralType)}
                    disabled={!playBinaural || binauralDisabled || isPlaying}
                    options={binauralOptions.map((o) => ({ value: o.value, label: o.label }))}
                  />
                  {!binauralUrl ? (
                    <div className="text-xs text-muted-foreground">
                      Génère/charge une session pour activer la piste binaurale.
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Volume</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{binauralVol.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[binauralVol]}
                    onValueChange={([v]) => setBinauralVol(v)}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={!playBinaural || binauralDisabled || binauralType === "none"}
                  />
                </div>
              </div>
            </div>

            {/* Debug: liens directs */}
            <div className="text-xs text-muted-foreground">
              <div>
                music:{" "}
                <a
                  href={libraryUrl(`/library/music/user/${musicFileForId(musicTrackId)}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  ouvrir
                </a>
                {" · "}
                binaural:{" "}
                {binauralUrl ? (
                  <a href={binauralUrl} target="_blank" rel="noreferrer">
                    ouvrir
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

    </GlassCard>
  );
}


