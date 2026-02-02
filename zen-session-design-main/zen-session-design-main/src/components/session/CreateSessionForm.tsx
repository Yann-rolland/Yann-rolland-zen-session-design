import {
  assetUrl,
  BackendObjectif,
  BackendStyle,
  generateSession,
  getApiBase,
} from "@/api/hypnoticApi";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { Session, SessionConfig, SessionPhase } from "@/types";
import { Sparkles, Wand2, Zap } from "lucide-react";
import * as React from "react";
import { SessionConfigPanel } from "./SessionConfig";
import { PRESETS, applyPresetToConfig } from "@/lib/presets";

interface CreateSessionFormProps {
  onSessionCreated: (session: Session) => void;
  className?: string;
}

export function CreateSessionForm({ onSessionCreated, className }: CreateSessionFormProps) {
  const { defaultConfig, settings, updatePlayerState, recordSessionGenerated } = useApp();
  const [prompt, setPrompt] = React.useState("");
  const [config, setConfig] = React.useState<SessionConfig>(defaultConfig);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [objectif, setObjectif] = React.useState<BackendObjectif>("stress");
  const [style, setStyle] = React.useState<BackendStyle>("ericksonien");
  const [error, setError] = React.useState<string>("");

  const handleConfigChange = (updates: Partial<SessionConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const mapLLMProvider = (p: SessionConfig["llmProvider"]) => {
    // Backend supporte: ollama|gemini. Tout le reste => ollama (local)
    if (p === "gemini") return "gemini" as const;
    return "ollama" as const;
  };

  const mapTTSProvider = (p: SessionConfig["ttsProvider"]) => {
    if (p === "elevenlabs") return "elevenlabs" as const;
    return "local" as const;
  };

  const runGeneration = async (opts: { prompt: string; objectif: BackendObjectif; style: BackendStyle; config: SessionConfig }) => {
    setIsGenerating(true);
    setError("");

    try {
      const resp = await generateSession({
        objectif: opts.objectif,
        duree_minutes: opts.config.duration,
        style: opts.style,
        llm_provider: mapLLMProvider(opts.config.llmProvider),
        tts_provider: mapTTSProvider(opts.config.ttsProvider),
        // Mixdown = 1 piste finale (voix + musique + binaural) pour lecture simple.
        // Recommandé en prod quand tout est configuré (LLM/TTS cloud).
        mixdown: true,
        voice_volume: Math.max(0, Math.min(2, (opts.config.voiceVolume ?? 80) / 100)),
        music_volume: opts.config.playMusic ? Math.max(0, Math.min(2, (opts.config.musicVolume ?? 40) / 100)) : 0,
        binaural_volume:
          !opts.config.playBinaural || opts.config.binauralType === "none"
            ? 0
            : Math.max(0, Math.min(2, (opts.config.binauralVolume ?? 30) / 100)),
        binaural_band:
          !opts.config.playBinaural || opts.config.binauralType === "none"
            ? "auto"
            : (opts.config.binauralType as any),
        binaural_beat_hz: 0,
        voice_offset_s: 0,
        music_offset_s: 0,
        binaural_offset_s: 0,
      });

      const totalSec = Math.max(60, opts.config.duration * 60);
      const pre = 10;
      const post = 10;
      const core = Math.max(30, totalSec - pre - post);
      const inductionSec = Math.round(core * 0.22);
      const deepeningSec = Math.round(core * 0.23);
      const suggestionsSec = Math.round(core * 0.40);
      const awakeningSec = Math.max(30, core - inductionSec - deepeningSec - suggestionsSec);

      const phases: SessionPhase[] = [
        { id: "pre", name: "Pré-ambiance", type: "pre-ambiance", duration: pre, content: undefined, isComplete: false },
        { id: "induction", name: "Induction", type: "induction", duration: inductionSec, content: resp.texte.induction, isComplete: false },
        { id: "deepening", name: "Approfondissement", type: "deepening", duration: deepeningSec, content: resp.texte.approfondissement, isComplete: false },
        { id: "suggestions", name: "Travail & Intégration", type: "suggestions", duration: suggestionsSec, content: `${resp.texte.travail}\n\n${resp.texte.integration}`, isComplete: false },
        { id: "awakening", name: "Réveil", type: "awakening", duration: awakeningSec, content: resp.texte.reveil, isComplete: false },
        { id: "post", name: "Post-ambiance", type: "post-ambiance", duration: post, content: undefined, isComplete: false },
      ];

      const session: Session = {
        id: resp.run_id || Date.now().toString(),
        title: opts.prompt.slice(0, 50) + (opts.prompt.length > 50 ? "..." : ""),
        description: opts.prompt,
        createdAt: new Date(),
        duration: totalSec,
        phases,
        config: opts.config,
        audio: {
          voiceUrl: assetUrl(resp.tts_audio_path),
          musicUrl: assetUrl(resp.music_path),
          binauralUrl: assetUrl(resp.binaural_path),
          mixUrl: resp.mix_path ? assetUrl(resp.mix_path) : null,
        },
        status: "ready",
        cacheHit: Boolean(resp.tts_cache_hit),
        ttsProviderUsed: resp.tts_provider_used ?? null,
        ttsCacheHit: resp.tts_cache_hit ?? null,
        ttsError: resp.tts_error ?? null,
        audioStats: (resp as any).audio_stats ?? null,
        llmProviderUsed: resp.llm_provider_used ?? null,
        llmFallback: resp.llm_fallback ?? null,
        llmError: resp.llm_error ?? null,
      };

      // Initialise le player sur la session créée (durée + volumes)
      updatePlayerState({
        duration: totalSec,
        currentTime: 0,
        phaseProgress: 0,
        isPlaying: false,
        volumes: {
          voice: opts.config.voiceVolume ?? 80,
          music: opts.config.musicVolume ?? 40,
          binaural: opts.config.binauralVolume ?? 30,
          ambiance: opts.config.ambianceVolume ?? 25,
        },
      });

      // Progression: session générée (update immédiat)
      try {
        recordSessionGenerated(session);
      } catch {
        // ignore
      }

      onSessionCreated(session);
    } catch (err: any) {
      const raw = err?.message || String(err);
      // Improve UX for the most common backend auth failure.
      if (raw.includes("Missing Authorization bearer token")) {
        setError(
          `Tu n'es pas connecté(e). Connecte-toi (Supabase) puis réessaie.\n\nDétail: ${raw}\n\nAPI: ${getApiBase()}`,
        );
      } else {
        setError(raw);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    await runGeneration({ prompt: prompt.trim(), objectif, style, config });
  };

  const handlePreset = async (presetId: BackendObjectif) => {
    if (isGenerating) return;
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const nextConfig = applyPresetToConfig(config, preset);
    // Met à jour l'UI immédiatement
    setConfig(nextConfig);
    setObjectif(preset.objectif);
    setStyle(preset.style);
    setPrompt(preset.prompt);
    await runGeneration({ prompt: preset.prompt, objectif: preset.objectif, style: preset.style, config: nextConfig });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-6", className)}>
      {/* 1-click presets */}
      <GlassCard padding="lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <div className="text-base font-medium">Sessions 1‑clic</div>
          </div>
          <div className="text-sm text-muted-foreground">
            Lance une session instantanément: les réglages audio sont appliqués automatiquement.
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="secondary"
                onClick={() => handlePreset(p.id)}
                disabled={isGenerating}
                className="h-auto py-3 flex flex-col items-start gap-1"
              >
                <div className="font-semibold">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.subtitle}</div>
              </Button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Prompt Input */}
      <GlassCard padding="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            <Label htmlFor="prompt" className="text-base font-medium">
              Décrivez votre session
            </Label>
          </div>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Une session pour améliorer ma confiance en moi avant une présentation importante..."
            className="min-h-[120px] resize-none bg-secondary/50 border-border/50 focus:border-primary/50"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Objectif</Label>
              <Select value={objectif} onValueChange={(v: BackendObjectif) => setObjectif(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stress">Stress</SelectItem>
                  <SelectItem value="sommeil">Sommeil</SelectItem>
                  <SelectItem value="confiance">Confiance</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="douleur">Douleur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={style} onValueChange={(v: BackendStyle) => setStyle(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ericksonien">Ericksonien</SelectItem>
                  <SelectItem value="classique">Classique</SelectItem>
                  <SelectItem value="métaphorique">Métaphorique</SelectItem>
                  <SelectItem value="cinématographique">Cinématographique</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Soyez précis sur votre objectif pour une session personnalisée
          </p>
        </div>
      </GlassCard>

      {/* Configuration */}
      <div className="zen-hide">
        <SessionConfigPanel
          config={config}
          onChange={handleConfigChange}
          hideAdvanced={settings.hideAdvancedSettings}
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        size="lg"
        disabled={!prompt.trim() || isGenerating}
        className={cn(
          "w-full h-14 text-lg font-medium",
          "bg-gradient-primary hover:shadow-glow",
          "transition-all duration-300",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isGenerating ? (
          <>
            <LoadingSpinner size="sm" className="mr-2" />
            Génération en cours...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" />
            Lancer la session
          </>
        )}
      </Button>

      {error ? (
        <GlassCard padding="md" className="border border-destructive/30">
          <div className="text-sm text-destructive">
            {error}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            API: <code>{getApiBase()}</code>
            <div className="mt-1">
              Vérifie que le backend répond sur <code>/health</code> et que <code>VITE_API_BASE</code> pointe au bon endroit.
            </div>
          </div>
        </GlassCard>
      ) : null}
    </form>
  );
}
