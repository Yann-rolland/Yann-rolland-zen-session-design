import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

interface VolumeSliderProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  showMuteButton?: boolean;
  className?: string;
  compact?: boolean;
}

export function VolumeSlider({
  value,
  onChange,
  label,
  icon,
  disabled = false,
  showMuteButton = true,
  className,
  compact = false,
}: VolumeSliderProps) {
  const [isMuted, setIsMuted] = React.useState(false);
  const [prevValue, setPrevValue] = React.useState(value);

  const handleMuteToggle = () => {
    if (isMuted) {
      onChange(prevValue);
      setIsMuted(false);
    } else {
      setPrevValue(value);
      onChange(0);
      setIsMuted(true);
    }
  };

  const handleValueChange = (newValue: number[]) => {
    onChange(newValue[0]);
    if (newValue[0] > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const VolumeIcon = value === 0 || isMuted ? VolumeX : value < 50 ? Volume1 : Volume2;

  return (
    <div className={cn(
      "flex items-center gap-3",
      compact ? "gap-2" : "gap-3",
      className
    )}>
      {showMuteButton && (
        <button
          onClick={handleMuteToggle}
          disabled={disabled}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            "hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isMuted && "text-muted-foreground"
          )}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {icon || <VolumeIcon className={compact ? "w-4 h-4" : "w-5 h-5"} />}
        </button>
      )}
      
      <div className="flex-1 flex items-center gap-3">
        {!compact && (
          <span className="text-sm text-muted-foreground min-w-[80px]">{label}</span>
        )}
        
        <SliderPrimitive.Root
          className={cn(
            "relative flex w-full touch-none select-none items-center",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          value={[isMuted ? 0 : value]}
          onValueChange={handleValueChange}
          max={100}
          step={1}
          disabled={disabled}
          aria-label={label}
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
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          />
        </SliderPrimitive.Root>
        
        <span className="text-xs text-muted-foreground min-w-[32px] text-right tabular-nums">
          {isMuted ? 0 : value}%
        </span>
      </div>
    </div>
  );
}
