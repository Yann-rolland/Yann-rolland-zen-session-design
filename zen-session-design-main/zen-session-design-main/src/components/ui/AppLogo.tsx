import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type Props = {
  size?: number;
  className?: string;
  rounded?: string;
};

export function AppLogo({ size = 32, className, rounded = "rounded-xl" }: Props) {
  const [broken, setBroken] = React.useState(false);
  const px = Math.max(16, Math.min(128, Math.round(Number(size) || 32)));

  // Put your PNG file here:
  // zen-session-design-main/zen-session-design-main/public/maia-logo.png
  const src = "/maia-logo.png";

  if (broken) {
    return (
      <div
        className={cn(
          "bg-gradient-primary flex items-center justify-center shadow-glow",
          rounded,
          className,
        )}
        style={{ width: px, height: px }}
      >
        <Sparkles className="text-primary-foreground" style={{ width: Math.round(px * 0.55), height: Math.round(px * 0.55) }} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="MaÏa"
      width={px}
      height={px}
      loading="eager"
      className={cn("shadow-glow object-cover", rounded, className)}
      onError={() => setBroken(true)}
    />
  );
}

