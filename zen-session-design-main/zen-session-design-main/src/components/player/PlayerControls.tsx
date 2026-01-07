import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, FastForward, Square } from "lucide-react";

interface PlayerControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSkip?: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PlayerControls({
  isPlaying,
  onPlayPause,
  onStop,
  onRestart,
  onSkip,
  disabled = false,
  size = "md",
  className,
}: PlayerControlsProps) {
  const sizeClasses = {
    sm: {
      button: "w-10 h-10",
      icon: "w-4 h-4",
      playButton: "w-12 h-12",
      playIcon: "w-5 h-5",
    },
    md: {
      button: "w-12 h-12",
      icon: "w-5 h-5",
      playButton: "w-16 h-16",
      playIcon: "w-6 h-6",
    },
    lg: {
      button: "w-14 h-14",
      icon: "w-6 h-6",
      playButton: "w-20 h-20",
      playIcon: "w-8 h-8",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      {/* Restart */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRestart}
        disabled={disabled}
        className={cn(
          sizes.button,
          "rounded-full text-muted-foreground hover:text-foreground",
          "hover:bg-secondary transition-all duration-200"
        )}
        aria-label="Recommencer"
      >
        <RotateCcw className={sizes.icon} />
      </Button>

      {/* Play/Pause - Primary action */}
      <Button
        onClick={onPlayPause}
        disabled={disabled}
        className={cn(
          sizes.playButton,
          "rounded-full transition-all duration-300",
          "bg-gradient-primary hover:shadow-glow",
          "active:scale-95"
        )}
        aria-label={isPlaying ? "Pause" : "Lecture"}
      >
        {isPlaying ? (
          <Pause className={cn(sizes.playIcon, "text-primary-foreground")} />
        ) : (
          <Play className={cn(sizes.playIcon, "text-primary-foreground ml-0.5")} />
        )}
      </Button>

      {/* Stop */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onStop}
        disabled={disabled}
        className={cn(
          sizes.button,
          "rounded-full text-muted-foreground hover:text-destructive",
          "hover:bg-destructive/10 transition-all duration-200"
        )}
        aria-label="Arrêter"
      >
        <Square className={sizes.icon} />
      </Button>

      {/* Skip (optional) */}
      {onSkip && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onSkip}
          disabled={disabled}
          className={cn(
            sizes.button,
            "rounded-full text-muted-foreground hover:text-foreground",
            "hover:bg-secondary transition-all duration-200"
          )}
          aria-label="Passer"
        >
          <FastForward className={sizes.icon} />
        </Button>
      )}
    </div>
  );
}
