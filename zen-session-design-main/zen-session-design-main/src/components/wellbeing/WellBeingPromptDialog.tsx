import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { WellBeingTag } from "@/types";
import * as React from "react";

const tagOptions: Array<{ value: WellBeingTag; label: string }> = [
  { value: "stress", label: "Stress" },
  { value: "sommeil", label: "Sommeil" },
  { value: "confiance", label: "Confiance" },
  { value: "performance", label: "Performance" },
  { value: "douleur", label: "Douleur" },
  { value: "autre", label: "Autre" },
];

export function WellBeingPromptDialog({
  open,
  onOpenChange,
  onSave,
  defaultTag = "stress",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (payload: { rating: number; tag: WellBeingTag; note?: string }) => void;
  defaultTag?: WellBeingTag;
}) {
  const [rating, setRating] = React.useState<number>(4);
  const [tag, setTag] = React.useState<WellBeingTag>(defaultTag);
  const [note, setNote] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;
    setRating(4);
    setTag(defaultTag);
    setNote("");
  }, [open, defaultTag]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Comment tu te sens ?</DialogTitle>
          <DialogDescription>
            Enregistre ton ressenti (ça alimente Bien-être + tes points/trophées).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ressenti (1–5)</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{rating}</span>
            </div>
            <Slider value={[rating]} onValueChange={([v]) => setRating(v)} min={1} max={5} step={1} />
            <div className="text-xs text-muted-foreground">1 = difficile · 5 = excellent</div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Note (optionnel)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: plus calme, moins de tension..." />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Plus tard
          </Button>
          <Button
            onClick={() => {
              onSave({ rating, tag, note: note.trim() || undefined });
              onOpenChange(false);
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


