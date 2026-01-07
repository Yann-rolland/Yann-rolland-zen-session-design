import * as React from "react";
import { cn } from "@/lib/utils";
import { SessionConfig as SessionConfigType, AmbianceType, BinauralType, LLMProvider, TTSProvider, MusicTrackId } from "@/types";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cloud, Waves, Timer, Volume2, ChevronDown, ChevronUp, Music2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MUSIC_TRACKS } from "@/audio/musicLibrary";

interface SessionConfigProps {
  config: SessionConfigType;
  onChange: (updates: Partial<SessionConfigType>) => void;
  hideAdvanced?: boolean;
  className?: string;
}

const ambianceOptions: { value: AmbianceType; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'pink-noise', label: 'Bruit rose' },
  { value: 'rain', label: 'Pluie' },
  { value: 'forest', label: 'Forêt' },
  { value: 'ocean', label: 'Océan' },
  { value: 'wind', label: 'Vent' },
  { value: 'fire', label: 'Feu de cheminée' },
];

const binauralOptions: { value: BinauralType; label: string; hz: string }[] = [
  { value: 'none', label: 'Aucun', hz: '' },
  { value: 'delta', label: 'Delta', hz: '0.5-4 Hz' },
  { value: 'theta', label: 'Theta', hz: '4-8 Hz' },
  { value: 'alpha', label: 'Alpha', hz: '8-14 Hz' },
  { value: 'beta', label: 'Beta', hz: '14-30 Hz' },
  { value: 'gamma', label: 'Gamma', hz: '30-100 Hz' },
];

const llmOptions: { value: LLMProvider; label: string }[] = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI GPT' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'local', label: 'Local' },
];

const ttsOptions: { value: TTSProvider; label: string }[] = [
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'openai', label: 'OpenAI TTS' },
  { value: 'google', label: 'Google TTS' },
  { value: 'local', label: 'Local' },
];

export function SessionConfigPanel({ config, onChange, hideAdvanced = false, className }: SessionConfigProps) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [audioOpen, setAudioOpen] = React.useState(false);

  const musicLabel = MUSIC_TRACKS.find((t) => t.id === config.musicTrackId)?.label || "—";
  const noiseLabel = ambianceOptions.find((o) => o.value === config.ambianceType)?.label || "—";
  const binauralLabel = binauralOptions.find((o) => o.value === config.binauralType)?.label || "—";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Duration */}
      <GlassCard padding="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <Label>Durée</Label>
            </div>
            <span className="text-sm font-medium">{config.duration} min</span>
          </div>
          <Slider
            value={[config.duration]}
            onValueChange={([value]) => onChange({ duration: value })}
            min={5}
            max={60}
            step={5}
            className="w-full"
          />
        </div>
      </GlassCard>

      {/* Audio settings (repliable) */}
      <GlassCard padding="md">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <Label>Configuration audio</Label>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {config.playMusic ? `Musique: ${musicLabel}` : "Musique: off"}
                {" · "}
                {config.playNoise ? `Bruit: ${noiseLabel}` : "Bruit: off"}
                {" · "}
                {config.playBinaural && config.binauralType !== "none" ? `Binaural: ${binauralLabel}` : "Binaural: off"}
              </div>
            </div>
          </div>

          <Collapsible open={audioOpen} onOpenChange={setAudioOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span>Paramètres avancés</span>
                {audioOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="slide-up pt-2">
              <div className="space-y-5">
                {/* Music */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Music2 className="w-4 h-4 text-muted-foreground" />
                      <div className="font-medium">Fond musical</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="text-sm text-muted-foreground">Jouer</Label>
                      <Switch
                        checked={Boolean(config.playMusic)}
                        onCheckedChange={(checked) => onChange({ playMusic: checked })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-2">
                      <Label>Musique (Ambiance 1..4)</Label>
                      <Select
                        value={config.musicTrackId}
                        onValueChange={(value: MusicTrackId) => onChange({ musicTrackId: value })}
                        disabled={!config.playMusic}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MUSIC_TRACKS.map((t, idx) => (
                            <SelectItem key={t.id} value={t.id}>
                              {`Ambiance ${idx + 1}`} — {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Volume</Label>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {(config.musicVolume ?? 0) / 100}
                        </span>
                      </div>
                      <Slider
                        value={[config.musicVolume ?? 40]}
                        onValueChange={([value]) => onChange({ musicVolume: value })}
                        min={0}
                        max={100}
                        step={1}
                        disabled={!config.playMusic}
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
                      <div className="font-medium">Bruit / Ambiance</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="text-sm text-muted-foreground">Jouer</Label>
                      <Switch
                        checked={Boolean(config.playNoise)}
                        onCheckedChange={(checked) => onChange({ playNoise: checked })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={config.ambianceType}
                        onValueChange={(value: AmbianceType) => onChange({ ambianceType: value })}
                        disabled={!config.playNoise}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ambianceOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Volume</Label>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {(config.ambianceVolume ?? 0) / 100}
                        </span>
                      </div>
                      <Slider
                        value={[config.ambianceVolume ?? 25]}
                        onValueChange={([value]) => onChange({ ambianceVolume: value })}
                        min={0}
                        max={100}
                        step={1}
                        disabled={!config.playNoise}
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
                      <div className="font-medium">Binaural</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="text-sm text-muted-foreground">Mixer</Label>
                      <Switch
                        checked={Boolean(config.playBinaural)}
                        onCheckedChange={(checked) => onChange({ playBinaural: checked })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={config.binauralType}
                        onValueChange={(value: BinauralType) => onChange({ binauralType: value })}
                        disabled={!config.playBinaural}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {binauralOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <span>{option.label}</span>
                                {option.hz && (
                                  <span className="text-xs text-muted-foreground">
                                    ({option.hz})
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Volume</Label>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {(config.binauralVolume ?? 0) / 100}
                        </span>
                      </div>
                      <Slider
                        value={[config.binauralVolume ?? 30]}
                        onValueChange={([value]) => onChange({ binauralVolume: value })}
                        min={0}
                        max={100}
                        step={1}
                        disabled={!config.playBinaural || config.binauralType === "none"}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </GlassCard>

      {/* Options */}
      <GlassCard padding="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="loop">Lecture en boucle</Label>
            <Switch
              id="loop"
              checked={config.loop}
              onCheckedChange={(checked) => onChange({ loop: checked })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Durée du fade-out</Label>
              <span className="text-sm text-muted-foreground">
                {config.fadeOutDuration}s
              </span>
            </div>
            <Slider
              value={[config.fadeOutDuration]}
              onValueChange={([value]) => onChange({ fadeOutDuration: value })}
              min={5}
              max={60}
              step={5}
            />
          </div>
        </div>
      </GlassCard>

      {/* Advanced Settings */}
      {!hideAdvanced && (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span>Paramètres avancés</span>
              {advancedOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="slide-up pt-2">
            <GlassCard padding="md">
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Fournisseur LLM</Label>
                  <Select
                    value={config.llmProvider}
                    onValueChange={(value: LLMProvider) => onChange({ llmProvider: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {llmOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Fournisseur TTS</Label>
                  <Select
                    value={config.ttsProvider}
                    onValueChange={(value: TTSProvider) => onChange({ ttsProvider: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ttsOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </GlassCard>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
