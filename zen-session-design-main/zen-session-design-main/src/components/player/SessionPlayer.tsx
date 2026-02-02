import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { WellBeingPromptDialog } from "@/components/wellbeing/WellBeingPromptDialog";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Repeat,
  Timer,
  Volume2,
} from "lucide-react";
import * as React from "react";
import { AmbienceMixer } from "./AmbienceMixer";
import { AudioWaveform } from "./AudioWaveform";
import { MixerPanel } from "./MixerPanel";
import { PlayerControls } from "./PlayerControls";
import { ProgressBar } from "./ProgressBar";

interface SessionPlayerProps {
  className?: string;
}

export function SessionPlayer({ className }: SessionPlayerProps) {
  const { playerState, updatePlayerState, currentSession, settings, recordSessionCompleted, addWellBeingEntry } = useApp();
  const [mixerOpen, setMixerOpen] = React.useState(!settings.zenMode);
  const [wellBeingOpen, setWellBeingOpen] = React.useState(false);
  const lastPromptedSessionIdRef = React.useRef<string | null>(null);
  const mixRef = React.useRef<HTMLAudioElement | null>(null);
  const voiceRef = React.useRef<HTMLAudioElement | null>(null);
  const musicRef = React.useRef<HTMLAudioElement | null>(null);
  const binauralRef = React.useRef<HTMLAudioElement | null>(null);
  const tickRef = React.useRef<number | null>(null);

  const usingMix = Boolean(currentSession?.audio?.mixUrl);

  const primaryEl = () => {
    if (usingMix) return mixRef.current;
    // Pour le suivi temps/durée, la voix est un bon proxy
    return voiceRef.current;
  };

  const stopTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const computePhaseAt = (tSec: number) => {
    const phases = currentSession?.phases || [];
    let acc = 0;
    for (const p of phases) {
      const start = acc;
      const end = acc + (p.duration || 0);
      if (tSec >= start && tSec < end) {
        const prog = p.duration > 0 ? (tSec - start) / p.duration : 0;
        return { phase: p, phaseProgress: Math.max(0, Math.min(1, prog)) };
      }
      acc = end;
    }
    return { phase: phases[phases.length - 1], phaseProgress: 1 };
  };

  const syncStateFromAudio = () => {
    const el = primaryEl();
    if (!el) return;
    const t = Number.isFinite(el.currentTime) ? el.currentTime : 0;
    const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (currentSession?.duration || 0);
    const { phase, phaseProgress } = computePhaseAt(t);
    updatePlayerState({
      currentTime: t,
      duration: d,
      currentPhase: phase,
      phaseProgress,
    });
  };

  const applyVolumes = () => {
    if (!currentSession) return;
    const v = playerState.volumes;
    const to01 = (x: number) => Math.max(0, Math.min(1, (Number(x) || 0) / 100));
    if (usingMix) {
      if (mixRef.current) mixRef.current.volume = to01(v.voice); // proxy
      return;
    }
    if (voiceRef.current) voiceRef.current.volume = to01(v.voice);
    if (musicRef.current) musicRef.current.volume = to01(v.music);
    if (binauralRef.current) binauralRef.current.volume = to01(v.binaural);
    // ambiance: pas implémentée ici (placeholder)
  };

  const pauseAll = () => {
    [mixRef.current, voiceRef.current, musicRef.current, binauralRef.current].forEach((el) => {
      try {
        el?.pause?.();
      } catch {
        // ignore
      }
    });
  };

  const stopAll = () => {
    pauseAll();
    [mixRef.current, voiceRef.current, musicRef.current, binauralRef.current].forEach((el) => {
      if (!el) return;
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
    });
    stopTick();
  };

  const playAll = async () => {
    if (!currentSession) return;
    applyVolumes();
    try {
      if (usingMix) {
        if (!mixRef.current) throw new Error("Audio (mix) manquant.");
        mixRef.current.loop = Boolean(currentSession.config.loop);
        await mixRef.current.play();
      } else {
        if (!voiceRef.current) throw new Error("Audio (voix) manquant.");
        voiceRef.current.loop = false;
        // Optional tracks: don't block voice playback if they fail.
        const wantMusic = Boolean(currentSession.config.playMusic) && (playerState.volumes.music ?? 0) > 0;
        const wantBinaural = Boolean(currentSession.config.playBinaural) && (playerState.volumes.binaural ?? 0) > 0;

        if (wantMusic && musicRef.current) {
          try {
            musicRef.current.loop = Boolean(currentSession.config.loop);
            await musicRef.current.play();
          } catch {
            // ignore: keep going for voice
          }
        }
        if (wantBinaural && binauralRef.current) {
          try {
            binauralRef.current.loop = Boolean(currentSession.config.loop);
            await binauralRef.current.play();
          } catch {
            // ignore: keep going for voice
          }
        }
        // Voice last (most important)
        await voiceRef.current.play();
      }
    } catch (e: any) {
      throw new Error(e?.message || String(e));
    }
  };

  const handlePlayPause = () => {
    if (!currentSession) return;
    const next = !playerState.isPlaying;
    if (next) {
      (async () => {
        try {
          await playAll();
          updatePlayerState({ isPlaying: true });
        } catch {
          // Si play() échoue (autoplay/cors), on revient en pause.
          updatePlayerState({ isPlaying: false });
        }
      })();
      return;
    }
    pauseAll();
    updatePlayerState({ isPlaying: false });
  };

  const handleStop = () => {
    stopAll();
    updatePlayerState({ 
      isPlaying: false, 
      currentTime: 0,
      phaseProgress: 0 
    });
  };

  const handleRestart = () => {
    const el = primaryEl();
    if (el) {
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
    }
    updatePlayerState({ currentTime: 0, phaseProgress: 0 });
  };

  const handleSeek = (time: number) => {
    const el = primaryEl();
    if (el) {
      try {
        el.currentTime = time;
      } catch {
        // ignore
      }
    }
    updatePlayerState({ currentTime: time });
  };

  const handleVolumeChange = (channel: keyof typeof playerState.volumes, value: number) => {
    updatePlayerState({
      volumes: { ...playerState.volumes, [channel]: value }
    });
  };

  // Appliquer volumes en temps réel
  React.useEffect(() => {
    applyVolumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.volumes, currentSession?.audio?.mixUrl, currentSession?.audio?.voiceUrl, currentSession?.audio?.musicUrl, currentSession?.audio?.binauralUrl]);

  // Tick de progression quand on joue
  React.useEffect(() => {
    stopTick();
    if (!currentSession) return;
    if (!playerState.isPlaying) return;
    tickRef.current = window.setInterval(() => {
      syncStateFromAudio();
    }, 250) as any;
    return () => stopTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.isPlaying, currentSession?.id]);

  // Sync durée à l’arrivée d’une nouvelle session
  React.useEffect(() => {
    stopAll();
    if (!currentSession) return;
    updatePlayerState({
      isPlaying: false,
      currentTime: 0,
      duration: currentSession.duration || 0,
      currentPhase: currentSession.phases?.[0],
      phaseProgress: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id]);

  const onPrimaryLoadedMeta = () => {
    syncStateFromAudio();
  };

  const onPrimaryEnded = () => {
    // Fin de la voix (ou du mix): stop propre
    stopAll();
    updatePlayerState({ isPlaying: false });
    try {
      if (currentSession) recordSessionCompleted(currentSession);
    } catch {
      // ignore
    }
    // Pop-up ressenti (une fois par session)
    try {
      if (currentSession?.id && lastPromptedSessionIdRef.current !== currentSession.id) {
        lastPromptedSessionIdRef.current = currentSession.id;
        setWellBeingOpen(true);
      }
    } catch {
      // ignore
    }
  };

  if (!currentSession) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Player Card */}
      <GlassCard variant="glow" padding="lg" className="relative overflow-hidden">
        {/* Background glow effect when playing */}
        {playerState.isPlaying && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-radial from-primary/5 to-transparent breathing" />
          </div>
        )}

        <div className="relative space-y-6">
          {/* Session info */}
          <div className="flex items-start justify-between zen-hide">
            <div>
              <h2 className="text-xl font-semibold mb-1">{currentSession.title}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="w-4 h-4" />
                <span>{Math.max(1, Math.round((currentSession.duration || 0) / 60))} min</span>
                {currentSession.config.loop && (
                  <Badge variant="muted" icon={<Repeat className="w-3 h-3" />}>
                    Boucle
                  </Badge>
                )}
              </div>
            </div>
            <AudioWaveform isPlaying={playerState.isPlaying} />
          </div>

          {/* Current phase */}
          {playerState.currentPhase && (
            <div className="text-center py-2 zen-hide">
              <p className="text-sm text-muted-foreground mb-1">Phase actuelle</p>
              <p className="text-lg font-medium capitalize">
                {playerState.currentPhase.name}
              </p>
            </div>
          )}

          {/* Progress */}
          <div className="group">
            <ProgressBar
              currentTime={playerState.currentTime}
              duration={playerState.duration}
              onSeek={handleSeek}
              showTime={true}
            />
          </div>

          {/* Controls */}
          <PlayerControls
            isPlaying={playerState.isPlaying}
            onPlayPause={handlePlayPause}
            onStop={handleStop}
            onRestart={handleRestart}
            size="lg"
          />

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center zen-hide">
            <Badge variant="provider">
              LLM: {currentSession.config.llmProvider}
            </Badge>
            <Badge variant="provider">
              TTS: {currentSession.config.ttsProvider}
            </Badge>
            {currentSession.ttsProviderUsed && currentSession.ttsProviderUsed !== currentSession.config.ttsProvider && (
              <Badge variant="warning" title={currentSession.ttsError || undefined}>
                TTS utilisé: {currentSession.ttsProviderUsed}
              </Badge>
            )}
            {currentSession.ttsCacheHit !== undefined && currentSession.ttsCacheHit !== null && (
              <Badge variant={currentSession.ttsCacheHit ? "success" : "muted"}>
                TTS cache: {currentSession.ttsCacheHit ? "hit" : "miss"}
              </Badge>
            )}
            {currentSession.ttsError ? (
              <Badge variant="destructive" title={currentSession.ttsError}>
                TTS erreur
              </Badge>
            ) : null}
            <Badge variant="provider">
              Binaural: {currentSession.config.binauralType}
            </Badge>
            {currentSession.cacheHit !== undefined && (
              <Badge variant={currentSession.cacheHit ? "success" : "muted"}>
                Cache: {currentSession.cacheHit ? "hit" : "miss"}
              </Badge>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Ambiences relaxation (mix): music mp3 + generated noise + optional session binaural */}
      <div className="zen-hide">
        <AmbienceMixer
          binauralUrl={currentSession?.audio?.binauralUrl || null}
          initialConfig={currentSession.config}
          defaultOpen={false}
        />
      </div>

      {/* Mixer Panel */}
      <Collapsible open={mixerOpen} onOpenChange={setMixerOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between py-3 zen-hide"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Volume2 className="w-4 h-4" />
              <span className="text-sm">Mixeur Audio</span>
            </div>
            {mixerOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="slide-up">
          <MixerPanel
            volumes={playerState.volumes}
            onVolumeChange={handleVolumeChange}
            disabled={!playerState.isPlaying && playerState.currentTime === 0}
          />
        </CollapsibleContent>
      </Collapsible>

      <WellBeingPromptDialog
        open={wellBeingOpen}
        onOpenChange={setWellBeingOpen}
        defaultTag={"stress"}
        onSave={(payload) => {
          if (!currentSession) return;
          addWellBeingEntry({
            rating: payload.rating,
            tag: payload.tag,
            note: payload.note,
            sessionId: currentSession.id,
          });
        }}
      />

      {/* Audio elements (invisibles) */}
      {usingMix ? (
        <audio
          ref={mixRef}
          src={currentSession.audio.mixUrl || undefined}
          preload="auto"
          onLoadedMetadata={onPrimaryLoadedMeta}
          onEnded={onPrimaryEnded}
        />
      ) : (
        <>
          <audio
            ref={voiceRef}
            src={currentSession.audio.voiceUrl}
            preload="auto"
            onLoadedMetadata={onPrimaryLoadedMeta}
            onEnded={onPrimaryEnded}
          />
          <audio ref={musicRef} src={currentSession.audio.musicUrl} preload="auto" loop />
          <audio ref={binauralRef} src={currentSession.audio.binauralUrl} preload="auto" loop />
        </>
      )}
    </div>
  );
}
