import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
  interactive?: boolean;
  showTime?: boolean;
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProgressBar({
  currentTime,
  duration,
  onSeek,
  interactive = true,
  showTime = true,
  className,
}: ProgressBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleValueChange = (value: number[]) => {
    if (onSeek && duration > 0) {
      onSeek((value[0] / 100) * duration);
    }
  };

  if (!interactive) {
    return (
      <div className={cn("w-full", className)}>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-player-track">
          <div
            className="h-full bg-gradient-primary rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        {showTime && (
          <div className="flex justify-between mt-2 text-xs text-muted-foreground tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <SliderPrimitive.Root
        className="relative flex w-full touch-none select-none items-center"
        value={[progress]}
        onValueChange={handleValueChange}
        max={100}
        step={0.1}
        aria-label="Progression"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-player-track">
          <SliderPrimitive.Range className="absolute h-full bg-gradient-primary rounded-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            "block h-4 w-4 rounded-full bg-player-thumb shadow-md",
            "ring-offset-background transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "hover:scale-110 active:scale-95",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          )}
        />
      </SliderPrimitive.Root>
      {showTime && (
        <div className="flex justify-between mt-2 text-xs text-muted-foreground tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
