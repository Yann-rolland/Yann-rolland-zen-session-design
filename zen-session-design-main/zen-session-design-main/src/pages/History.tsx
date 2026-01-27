import * as React from "react";
import { useApp } from "@/contexts/AppContext";
import { GlassCard, GlassCardContent } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Clock, Play, Trash2, Calendar, Timer, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { assetUrl, deleteRun, getRun, listRuns } from "@/api/hypnoticApi";
import { Session, SessionConfig, SessionPhase } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function History() {
  const { defaultConfig, setCurrentSession, updatePlayerState } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});

  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(50),
    refetchOnWindowFocus: false,
  });

  const deleteOneMutation = useMutation({
    mutationFn: async (runId: string) => deleteRun(runId),
    onSuccess: async (_data, runId) => {
      setSelected((s) => {
        const next = { ...s };
        delete next[runId];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: async (runIds: string[]) => {
      for (const id of runIds) {
        await deleteRun(id);
      }
      return { deleted: runIds.length };
    },
    onSuccess: async () => {
      setSelected({});
      await qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const data = await listRuns(500);
      const runs = data.runs || [];
      for (const r of runs) {
        await deleteRun(r.run_id);
      }
      return { deleted: runs.length };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["runs"] });
      // Si on supprime tout, on revient à l'accueil (session courante potentiellement supprimée)
      navigate("/");
    },
  });

  const loadRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return getRun(runId);
    },
    onSuccess: (run) => {
      // Reconstruit une Session depuis un run backend
      const req: any = run.request || {};
      const durMin = Number(req.duree_minutes || defaultConfig.duration || 15);
      const totalSec = Math.max(60, durMin * 60);

      const toPct = (x: any, fallback: number) => {
        const v = typeof x === "number" ? x : fallback;
        return Math.max(0, Math.min(100, Math.round(v * 100)));
      };

      const llmProvider = req.llm_provider === "gemini" ? ("gemini" as const) : ("local" as const);
      const ttsProvider = req.tts_provider === "elevenlabs" ? ("elevenlabs" as const) : ("local" as const);

      const config: SessionConfig = {
        ...defaultConfig,
        duration: durMin,
        voiceVolume: toPct(req.voice_volume, (defaultConfig.voiceVolume ?? 80) / 100),
        musicVolume: toPct(req.music_volume, (defaultConfig.musicVolume ?? 40) / 100),
        binauralVolume: toPct(req.binaural_volume, (defaultConfig.binauralVolume ?? 30) / 100),
        llmProvider,
        ttsProvider,
        // binauralType: on préfère la bande réellement utilisée si dispo
        binauralType: (run.binaural_band_used || req.binaural_band || defaultConfig.binauralType || "theta") as any,
      };

      const texte: any = run.texte || {};
      const pre = 10;
      const post = 10;
      const core = Math.max(30, totalSec - pre - post);
      const inductionSec = Math.round(core * 0.22);
      const deepeningSec = Math.round(core * 0.23);
      const suggestionsSec = Math.round(core * 0.40);
      const awakeningSec = Math.max(30, core - inductionSec - deepeningSec - suggestionsSec);

      const phases: SessionPhase[] = [
        { id: "pre", name: "Pré-ambiance", type: "pre-ambiance", duration: pre, isComplete: false },
        { id: "induction", name: "Induction", type: "induction", duration: inductionSec, content: texte.induction, isComplete: false },
        { id: "deepening", name: "Approfondissement", type: "deepening", duration: deepeningSec, content: texte.approfondissement, isComplete: false },
        { id: "suggestions", name: "Travail & Intégration", type: "suggestions", duration: suggestionsSec, content: `${texte.travail || ""}\n\n${texte.integration || ""}`.trim(), isComplete: false },
        { id: "awakening", name: "Réveil", type: "awakening", duration: awakeningSec, content: texte.reveil, isComplete: false },
        { id: "post", name: "Post-ambiance", type: "post-ambiance", duration: post, isComplete: false },
      ];

      const objectif = req.objectif ? String(req.objectif) : "session";
      const style = req.style ? String(req.style) : "";
      const title = `${objectif}${style ? " · " + style : ""} · ${durMin}m`;

      const session: Session = {
        id: run.run_id,
        title,
        description: req.prompt || req.objectif || "",
        createdAt: new Date(),
        duration: totalSec,
        phases,
        config,
        audio: {
          voiceUrl: assetUrl(run.tts_audio_path),
          musicUrl: assetUrl(run.music_path),
          binauralUrl: assetUrl(run.binaural_path),
          mixUrl: run.mix_path ? assetUrl(run.mix_path) : null,
        },
        status: "ready",
        cacheHit: Boolean(run.tts_cache_hit),
      };

      updatePlayerState({
        duration: totalSec,
        currentTime: 0,
        phaseProgress: 0,
        isPlaying: false,
        volumes: {
          voice: config.voiceVolume ?? 80,
          music: config.musicVolume ?? 40,
          binaural: config.binauralVolume ?? 30,
          ambiance: config.ambianceVolume ?? 25,
        },
      });
      setCurrentSession(session);
      navigate("/");
    },
  });

  const runs = runsQuery.data?.runs || [];
  const selectedIds = Object.entries(selected)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);

  if (runsQuery.isLoading) {
    return (
      <div className="fade-in">
        <h1 className="text-2xl font-bold mb-6">Historique</h1>
        <div className="text-sm text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (runsQuery.isError) {
    return (
      <div className="fade-in">
        <h1 className="text-2xl font-bold mb-6">Historique</h1>
        <div className="text-sm text-destructive">
          {(runsQuery.error as any)?.message || "Erreur de chargement"}
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => runsQuery.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="fade-in">
        <h1 className="text-2xl font-bold mb-6">Historique</h1>
        <EmptyState
          icon={Clock}
          title="Aucune session"
          description="Vos sessions générées apparaîtront ici une fois que vous aurez lancé une session."
          action={{
            label: "Créer une session",
            onClick: () => navigate("/"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historique</h1>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={selectedIds.length === 0 || deleteSelectedMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer sélection ({selectedIds.length})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer la sélection ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. {selectedIds.length} session(s) seront supprimées côté backend.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteSelectedMutation.mutate(selectedIds)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => runsQuery.refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Rafraîchir
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={deleteAllMutation.isPending}>
                <Trash2 className="w-4 h-4 mr-2" />
                Effacer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Effacer l'historique ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Toutes vos sessions (runs) seront supprimées côté backend.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteAllMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Effacer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-3">
        {runs.map((r) => (
          <GlassCard
            key={r.run_id}
            interactive
            className="cursor-pointer hover:border-primary/30"
            onClick={() => loadRunMutation.mutate(r.run_id)}
          >
            <GlassCardContent className="flex items-center gap-4 p-4">
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={Boolean(selected[r.run_id])}
                  onCheckedChange={(checked) =>
                    setSelected((s) => ({ ...s, [r.run_id]: Boolean(checked) }))
                  }
                  aria-label={`Sélectionner ${r.run_id}`}
                />
              </div>

              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Play className="w-5 h-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{r.run_id}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date((r.created_at || 0) * 1000), "d MMM yyyy", { locale: fr })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    {r.duree_minutes || "?"} min
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                <div className="hidden md:flex flex-wrap gap-1.5 justify-end">
                  <Badge variant="provider" className="text-xs">
                    {r.style || "?"}
                  </Badge>
                  <Badge variant="provider" className="text-xs">
                    {r.objectif || "?"}
                  </Badge>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={deleteOneMutation.isPending}
                      aria-label={`Supprimer ${r.run_id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer ce run ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {r.run_id} sera supprimé côté backend (irréversible).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteOneMutation.mutate(r.run_id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </GlassCardContent>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
