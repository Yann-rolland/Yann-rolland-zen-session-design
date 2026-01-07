import * as React from "react";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  isPlaying: boolean;
  className?: string;
}

export function AudioWaveform({ isPlaying, className }: AudioWaveformProps) {
  return (
    <div className={cn("flex items-center gap-0.5 h-5", className)}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full bg-primary transition-all duration-200",
            isPlaying ? "wave-bar" : "h-1"
          )}
          style={{
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
