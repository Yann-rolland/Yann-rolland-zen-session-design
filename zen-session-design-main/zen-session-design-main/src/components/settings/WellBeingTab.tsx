import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { WellBeingEntry, WellBeingTag } from "@/types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Heart, Trash2, TrendingUp } from "lucide-react";
import * as React from "react";

const tagOptions: Array<{ value: WellBeingTag; label: string }> = [
  { value: "stress", label: "Stress" },
  { value: "sommeil", label: "Sommeil" },
  { value: "confiance", label: "Confiance" },
  { value: "performance", label: "Performance" },
  { value: "douleur", label: "Douleur" },
  { value: "autre", label: "Autre" },
];

function avg(xs: number[]) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function WellBeingTab() {
  const { progress, addWellBeingEntry, deleteWellBeingEntry, settings, updateSettings } = useApp();
  const [rating, setRating] = React.useState<number>(4);
  const [tag, setTag] = React.useState<WellBeingTag>("stress");
  const [note, setNote] = React.useState<string>("");

  const entries = progress.wellbeing || [];
  const last7 = entries.slice(0, 7).map((e) => Number(e.rating || 0));
  const avg7 = avg(last7);

  const handleAdd = () => {
    addWellBeingEntry({ rating, tag, note: note.trim() || undefined });
    setNote("");
  };

  if (entries.length === 0) {
    return (
      <div className="fade-in">
        <EmptyState
          icon={Calendar}
          title="Pas encore de données de ressenti."
          description="Complète quelques sessions puis ajoute ton ressenti pour voir ton évolution."
        />
        <div className="mt-6">
          <GlassCard padding="lg" className="space-y-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              <div className="text-lg font-semibold">Ajouter un ressenti</div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1 space-y-2">
                <Label>Thème</Label>
                <Select value={tag} onValueChange={(v: WellBeingTag) => setTag(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tagOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1 space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Ressenti (1–5)</Label>
                  <span className="text-sm text-muted-foreground tabular-nums">{rating}</span>
                </div>
                <Slider value={[rating]} onValueChange={([v]) => setRating(v)} min={1} max={5} step={1} />
                <div className="text-xs text-muted-foreground">1 = difficile · 5 = excellent</div>
              </div>
              <div className="md:col-span-1 space-y-2">
                <Label>Note (optionnel)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: plus détendu, moins de ruminations..." />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleAdd}>Enregistrer</Button>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <GlassCard padding="lg" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Partage (amélioration de l'app)</div>
            <div className="text-sm text-muted-foreground">
              Si activé, tes ressentis seront envoyés au développeur via ton backend (stockage local).
            </div>
          </div>
          <Button
            variant={settings.shareWellBeingWithDeveloper ? "default" : "secondary"}
            onClick={() => updateSettings({ shareWellBeingWithDeveloper: !settings.shareWellBeingWithDeveloper })}
          >
            {settings.shareWellBeingWithDeveloper ? "Activé" : "Désactivé"}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Conseil: évite de mettre des infos personnelles dans la note si tu actives le partage.
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <div className="text-lg font-semibold">Analyse du ressenti</div>
          </div>
          <div className="text-sm text-muted-foreground">
            Moyenne (7 derniers): <span className="text-primary font-semibold">{avg7.toFixed(1)}</span> / 5
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Conseil: note ton ressenti après la session pour voir ta progression (stress, sommeil, confiance…).
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary" />
          <div className="text-lg font-semibold">Ajouter un ressenti</div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1 space-y-2">
            <Label>Thème</Label>
            <Select value={tag} onValueChange={(v: WellBeingTag) => setTag(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tagOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ressenti (1–5)</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{rating}</span>
            </div>
            <Slider value={[rating]} onValueChange={([v]) => setRating(v)} min={1} max={5} step={1} />
            <div className="text-xs text-muted-foreground">1 = difficile · 5 = excellent</div>
          </div>
          <div className="md:col-span-1 space-y-2">
            <Label>Note (optionnel)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: sensation de calme, moins de tension..." />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleAdd}>Enregistrer</Button>
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="space-y-4">
        <div className="text-lg font-semibold">Historique de ressenti</div>
        <div className="space-y-3">
          {entries.map((e: WellBeingEntry) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {tagOptions.find((t) => t.value === (e.tag || "autre"))?.label || "Ressenti"} · {e.rating}/5
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {format(new Date(e.at), "d MMM yyyy", { locale: fr })}
                </div>
                {e.note ? <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{e.note}</div> : null}
              </div>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => deleteWellBeingEntry(e.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}


