import { ProgressBar } from "@/components/player/ProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApp } from "@/contexts/AppContext";
import { TrophyId } from "@/types";
import { Flame, Lock, Star, Timer, Trophy } from "lucide-react";

const TROPHY_META: Array<{ id: TrophyId; title: string; description: string }> = [
  { id: "first_session", title: "Première session", description: "Compléter une session" },
  { id: "five_sessions", title: "Rituel", description: "Compléter 5 sessions" },
  { id: "ten_sessions", title: "Habitude", description: "Compléter 10 sessions" },
  { id: "one_hour", title: "1 heure", description: "Cumuler 60 minutes" },
  { id: "five_hours", title: "5 heures", description: "Cumuler 300 minutes" },
  { id: "streak_3", title: "Série 3 jours", description: "3 jours d'affilée" },
  { id: "streak_7", title: "Série 7 jours", description: "7 jours d'affilée" },
  { id: "wellbeing_first", title: "Ressenti", description: "Enregistrer un ressenti" },
  { id: "wellbeing_7", title: "Journal", description: "7 ressentis enregistrés" },
  { id: "mix_master", title: "Mixeur", description: "Musique + bruit" },
  { id: "binaural_explorer", title: "Binaural", description: "Explorer les types" },
  { id: "zen_master", title: "Mode Zen", description: "Activer le mode Zen" },
];

function levelFromPoints(points: number) {
  const p = Math.max(0, Math.floor(points || 0));
  const level = Math.floor(p / 100) + 1;
  const inLevel = p % 100;
  return { level, inLevel, toNext: 100 - inLevel };
}

export function ProgressionTab() {
  const { progress, resetProgress } = useApp();
  const { level, inLevel } = levelFromPoints(progress.points);
  const unlockedCount = Object.values(progress.trophies || {}).filter(Boolean).length;

  return (
    <div className="space-y-6 fade-in">
      <GlassCard padding="lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Star className="w-7 h-7 text-primary" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Niveau</div>
              <div className="text-3xl font-bold">{level}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Points totaux</div>
            <div className="text-3xl font-bold text-primary">{progress.points}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm text-muted-foreground mb-2">
            Progression niveau {level + 1}
          </div>
          <ProgressBar currentTime={inLevel} duration={100} interactive={false} showTime={false} />
          <div className="mt-2 text-sm text-muted-foreground text-right tabular-nums">
            {inLevel}% 
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <GlassCard padding="md" className="bg-card/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Trophy className="w-4 h-4" />
                <span className="text-sm">Sessions terminées</span>
              </div>
              <div className="text-lg font-semibold">{progress.totalSessionsCompleted}</div>
            </div>
          </GlassCard>
          <GlassCard padding="md" className="bg-card/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Trophy className="w-4 h-4" />
                <span className="text-sm">Sessions générées</span>
              </div>
              <div className="text-lg font-semibold">{progress.totalSessionsGenerated || 0}</div>
            </div>
          </GlassCard>
          <GlassCard padding="md" className="bg-card/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="w-4 h-4" />
                <span className="text-sm">Minutes</span>
              </div>
              <div className="text-lg font-semibold">{progress.totalMinutes}</div>
            </div>
          </GlassCard>
          <GlassCard padding="md" className="bg-card/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Flame className="w-4 h-4" />
                <span className="text-sm">Série actuelle</span>
              </div>
              <div className="text-lg font-semibold">{progress.streakDays} jours</div>
            </div>
          </GlassCard>
          <GlassCard padding="md" className="bg-card/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Trophy className="w-4 h-4" />
                <span className="text-sm">Trophées</span>
              </div>
              <div className="text-lg font-semibold">
                {unlockedCount} / {TROPHY_META.length}
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Trophées</div>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={resetProgress}>
            Réinitialiser
          </Button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TROPHY_META.map((t) => {
            const unlocked = Boolean(progress.trophies?.[t.id]);
            return (
              <GlassCard key={t.id} padding="md" className="bg-card/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                  </div>
                  {unlocked ? (
                    <Badge variant="success" className="shrink-0">OK</Badge>
                  ) : (
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}


