import * as React from "react";
import { cn } from "@/lib/utils";
import { VolumeSlider } from "@/components/ui/VolumeSlider";
import { GlassCard } from "@/components/ui/GlassCard";
import { Mic, Music, Waves, Cloud } from "lucide-react";

interface MixerPanelProps {
  volumes: {
    voice: number;
    music: number;
    binaural: number;
    ambiance: number;
  };
  onVolumeChange: (channel: keyof MixerPanelProps['volumes'], value: number) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

const channels = [
  { key: 'voice' as const, label: 'Voix', icon: Mic },
  { key: 'music' as const, label: 'Musique', icon: Music },
  { key: 'binaural' as const, label: 'Binaural', icon: Waves },
  { key: 'ambiance' as const, label: 'Ambiance', icon: Cloud },
];

export function MixerPanel({
  volumes,
  onVolumeChange,
  disabled = false,
  compact = false,
  className,
}: MixerPanelProps) {
  return (
    <GlassCard className={cn("space-y-4", className)} padding={compact ? "sm" : "md"}>
      <h3 className="text-sm font-medium text-muted-foreground zen-hide">
        Mixeur Audio
      </h3>
      <div className="space-y-3">
        {channels.map((channel) => (
          <VolumeSlider
            key={channel.key}
            value={volumes[channel.key]}
            onChange={(value) => onVolumeChange(channel.key, value)}
            label={channel.label}
            icon={<channel.icon className="w-4 h-4" />}
            disabled={disabled}
            compact={compact}
          />
        ))}
      </div>
    </GlassCard>
  );
}
