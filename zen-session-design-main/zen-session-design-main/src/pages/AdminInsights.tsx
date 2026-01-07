import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminWellbeingEvents, adminWellbeingStats } from "@/api/hypnoticApi";
import { useToast } from "@/hooks/use-toast";

const SS_ADMIN_TOKEN = "bn3_admin_token_v1";

function fmt(n: number, digits = 1) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

export default function AdminInsights() {
  const { toast } = useToast();
  const [token, setToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(SS_ADMIN_TOKEN) || "";
    } catch {
      return "";
    }
  });
  const [days, setDays] = useState<number>(30);

  const hasToken = Boolean(token?.trim());

  const statsQuery = useQuery({
    queryKey: ["admin", "wellbeing_stats", days],
    enabled: hasToken,
    queryFn: async () => adminWellbeingStats(token.trim(), days),
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "wellbeing_events", days],
    enabled: hasToken,
    queryFn: async () => adminWellbeingEvents(token.trim(), { limit: 200, days }),
    retry: false,
  });

  const topTags = useMemo(() => {
    const byTag = statsQuery.data?.by_tag || [];
    return byTag.slice(0, 6);
  }, [statsQuery.data]);

  const saveToken = () => {
    try {
      sessionStorage.setItem(SS_ADMIN_TOKEN, token.trim());
    } catch {
      // ignore
    }
    toast({ title: "Token enregistré", description: "Ce token est stocké uniquement dans cette session navigateur." });
    statsQuery.refetch();
    eventsQuery.refetch();
  };

  const clearToken = () => {
    setToken("");
    try {
      sessionStorage.removeItem(SS_ADMIN_TOKEN);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Admin · Insights</h1>
          <p className="text-muted-foreground">
            Statistiques et événements de bien‑être (stockés dans Supabase). Accès protégé par <code>ADMIN_TOKEN</code>.
          </p>
        </div>
      </div>

      <GlassCard padding="lg">
        <div className="grid gap-4 md:grid-cols-3 items-end">
          <div className="md:col-span-2">
            <Label htmlFor="admin-token">Admin token</Label>
            <Input
              id="admin-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="x-admin-token…"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Le token n’est jamais envoyé à Supabase depuis le navigateur. Il sert uniquement à appeler le backend.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={clearToken} disabled={!token}>
              Effacer
            </Button>
            <Button onClick={saveToken} disabled={!token.trim()}>
              Valider
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Label htmlFor="days">Fenêtre</Label>
            <Input
              id="days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value || 30))))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">jours</span>
          </div>
          {(statsQuery.isFetching || eventsQuery.isFetching) && <LoadingSpinner size="sm" />}
        </div>

        {!hasToken && (
          <div className="mt-4 text-sm text-muted-foreground">
            Saisis ton <code>ADMIN_TOKEN</code> puis clique sur <b>Valider</b>.
          </div>
        )}

        {(statsQuery.error || eventsQuery.error) && (
          <div className="mt-4 text-sm text-destructive">
            {(statsQuery.error as any)?.message || (eventsQuery.error as any)?.message || "Erreur"}
          </div>
        )}

        {statsQuery.data && (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <GlassCard padding="md">
              <div className="text-sm text-muted-foreground">Événements</div>
              <div className="text-2xl font-semibold mt-1">{statsQuery.data.total}</div>
              <div className="text-xs text-muted-foreground mt-1">sur {statsQuery.data.days} jours</div>
            </GlassCard>
            <GlassCard padding="md">
              <div className="text-sm text-muted-foreground">Rating moyen</div>
              <div className="text-2xl font-semibold mt-1">{fmt(statsQuery.data.avg_rating, 2)}</div>
              <div className="text-xs text-muted-foreground mt-1">échelle 1–5</div>
            </GlassCard>
            <GlassCard padding="md">
              <div className="text-sm text-muted-foreground">Top tags</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {topTags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  topTags.map((t) => (
                    <Badge key={t.tag} variant="secondary">
                      {t.tag} · {t.count}
                    </Badge>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Derniers événements</h2>
            <Button
              variant="ghost"
              onClick={() => {
                statsQuery.refetch();
                eventsQuery.refetch();
              }}
              disabled={!hasToken}
            >
              Rafraîchir
            </Button>
          </div>

          <div className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reçu</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(eventsQuery.data?.events || []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.received_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{e.device_id}</TableCell>
                    <TableCell>
                      <Badge>{e.rating}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.tag}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate">{e.note || "—"}</TableCell>
                  </TableRow>
                ))}
                {hasToken && eventsQuery.data && (eventsQuery.data.events?.length || 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Aucun événement sur cette période.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}


