import * as React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getPlaylist, listPlaylists, type PlaylistItem, type PlaylistSummary } from "@/api/hypnoticApi";
import { Music2, Play, Pause, SkipBack, SkipForward, Search } from "lucide-react";

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function Playlists() {
  const { toast } = useToast();
  const [lists, setLists] = React.useState<PlaylistSummary[]>([]);
  const [selected, setSelected] = React.useState<PlaylistSummary | null>(null);
  const [items, setItems] = React.useState<PlaylistItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [q, setQ] = React.useState("");

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [idx, setIdx] = React.useState<number>(0);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [dur, setDur] = React.useState(0);

  const current = items[idx];
  const canPlay = Boolean(current?.signed_url);

  const loadLists = async () => {
    setIsLoading(true);
    try {
      const res = await listPlaylists();
      setLists(res.playlists || []);
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlaylist = async (p: PlaylistSummary) => {
    setIsLoading(true);
    try {
      const res = await getPlaylist(p.tag, 80);
      setSelected(p);
      setItems(res.items || []);
      setIdx(0);
      setPlaying(false);
      setPos(0);
      setDur(0);
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime || 0);
    const onDur = () => setDur(a.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setPos(0);
      // auto next
      setIdx((i) => {
        const next = Math.min((items?.length || 1) - 1, i + 1);
        return next;
      });
      setTimeout(() => {
        try {
          if (audioRef.current && items.length > 0) {
            audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          }
        } catch {
          setPlaying(false);
        }
      }, 0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("durationchange", onDur);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("durationchange", onDur);
      a.removeEventListener("ended", onEnd);
    };
  }, [items]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current?.signed_url) {
      a.pause();
      a.removeAttribute("src");
      setPlaying(false);
      return;
    }
    a.src = current.signed_url;
    a.load();
    if (playing) {
      a.play().catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, current?.signed_url]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lists;
    return (lists || []).filter((p) => {
      const s = `${p.title} ${p.subtitle || ""} ${p.tag}`.toLowerCase();
      return s.includes(qq);
    });
  }, [lists, q]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!canPlay) {
      toast({
        title: "Audio indisponible",
        description: "Storage non configuré ou URL signée absente.",
        variant: "destructive",
      });
      return;
    }
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    try {
      await a.play();
      setPlaying(true);
    } catch (e: any) {
      setPlaying(false);
      toast({ title: "Lecture impossible", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min((items?.length || 1) - 1, i + 1));

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Playlists</h1>
          <p className="text-muted-foreground">Des ambiances prêtes, classées par thèmes (comme Spotify).</p>
        </div>
        <Button variant="secondary" onClick={loadLists} disabled={isLoading}>
          Rafraîchir
        </Button>
      </div>

      <GlassCard padding="lg">
        <div className="space-y-2">
          <Label htmlFor="q">Rechercher un thème</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="q" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex: sommeil / pluie / focus" />
            </div>
          </div>
        </div>
      </GlassCard>

      {!selected ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <GlassCard key={p.tag} padding="lg" className="space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Music2 className="w-5 h-5 text-primary" />
                <div className="truncate">{p.title}</div>
              </div>
              <div className="text-sm text-muted-foreground">{p.subtitle || ""}</div>
              <div className="text-xs text-muted-foreground">
                <code>{p.tag}</code> · {p.count} sons
              </div>
              <div className="pt-2 flex justify-end">
                <Button onClick={() => loadPlaylist(p)} disabled={isLoading}>
                  Ouvrir
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm text-muted-foreground">Playlist</div>
              <div className="text-xl font-semibold">{selected.title}</div>
              <div className="text-sm text-muted-foreground">{selected.subtitle || ""}</div>
            </div>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Retour
            </Button>
          </div>

          <GlassCard padding="lg">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{current?.title || current?.storage_key || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {(current?.tags || []).slice(0, 6).join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" size="icon" onClick={prev} disabled={idx <= 0 || isLoading}>
                    <SkipBack />
                  </Button>
                  <Button size="icon" onClick={toggle} disabled={isLoading || !items.length}>
                    {playing ? <Pause /> : <Play />}
                  </Button>
                  <Button variant="secondary" size="icon" onClick={next} disabled={idx >= items.length - 1 || isLoading}>
                    <SkipForward />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>{fmtTime(pos)}</div>
                <div>{fmtTime(dur)}</div>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, Math.floor(dur || 0))}
                value={Math.min(Math.floor(pos || 0), Math.floor(dur || 0))}
                onChange={(e) => {
                  const a = audioRef.current;
                  if (!a) return;
                  const v = Number(e.target.value) || 0;
                  a.currentTime = v;
                  setPos(v);
                }}
                className="w-full"
              />

              <audio ref={audioRef} preload="metadata" />
            </div>
          </GlassCard>

          <div className="grid gap-2">
            {items.map((it, i) => (
              <button
                key={it.storage_key}
                className={`text-left rounded-md border border-border p-3 hover:bg-muted/40 transition ${
                  i === idx ? "bg-muted/40" : ""
                }`}
                onClick={() => setIdx(i)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.title || it.storage_key}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(it.tags || []).slice(0, 6).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">#{i + 1}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

