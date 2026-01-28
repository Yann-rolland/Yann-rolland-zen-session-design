import * as React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  adminStorageDelete,
  adminStorageExpected,
  adminStorageList,
  adminStorageMove,
  adminStorageUpload,
  adminListAudioAssets,
  adminUpsertAudioAsset,
  type AudioAsset,
  type AdminStorageExpected,
} from "@/api/hypnoticApi";

const SS_ADMIN_TOKEN = "bn3_admin_token_v1";

function getToken(): string {
  try {
    return sessionStorage.getItem(SS_ADMIN_TOKEN) || "";
  } catch {
    return "";
  }
}

function setToken(v: string) {
  try {
    sessionStorage.setItem(SS_ADMIN_TOKEN, v);
  } catch {
    // ignore
  }
}

type ObjRow = { name?: string; id?: string; updated_at?: string; created_at?: string; metadata?: any };

export default function AdminAudioLibrary() {
  const { toast } = useToast();
  const [token, setTokenState] = React.useState<string>(() => getToken());
  const hasToken = Boolean(token.trim());

  const [expected, setExpected] = React.useState<AdminStorageExpected | null>(null);
  const [items, setItems] = React.useState<ObjRow[]>([]);
  const [assets, setAssets] = React.useState<AudioAsset[]>([]);
  const [prefix, setPrefix] = React.useState<string>("music/");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const [moveSource, setMoveSource] = React.useState<string>("");
  const [moveDest, setMoveDest] = React.useState<string>("");

  const loadAll = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const [exp, lst] = await Promise.all([
        adminStorageExpected(token.trim()),
        adminStorageList(token.trim(), { prefix, limit: 500 }),
      ]);
      setExpected(exp);
      setItems((lst.items || []) as any);
      try {
        const meta = await adminListAudioAssets(token.trim(), { limit: 1000, offset: 0 });
        setAssets(meta.items || []);
      } catch {
        setAssets([]);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!hasToken) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, prefix]);

  const saveToken = () => {
    setToken(token.trim());
    toast({ title: "Code admin enregistré", description: "Stocké uniquement dans cette session navigateur." });
    loadAll();
  };

  const onUploadToKey = async (key: string, file: File) => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      await adminStorageUpload(token.trim(), key, file);
      toast({ title: "Upload OK", description: key });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const onMove = async (src: string, dst: string) => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      await adminStorageMove(token.trim(), src, dst);
      toast({ title: "Renommage OK", description: `${src} → ${dst}` });
      setMoveSource("");
      setMoveDest("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const onDelete = async (key: string) => {
    if (!token.trim()) return;
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(`Supprimer définitivement: ${key} ?`)) return;
    setIsLoading(true);
    setError("");
    try {
      await adminStorageDelete(token.trim(), key);
      toast({ title: "Supprimé", description: key });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const expMusic = expected?.expected?.music || {};
  const expAmb = expected?.expected?.ambiences || {};
  const catMusic = expected?.catalog?.music || {};
  const catAmb = expected?.catalog?.ambiences || {};

  const assetsByKey = React.useMemo(() => {
    const m = new Map<string, AudioAsset>();
    for (const a of assets || []) {
      if (a?.storage_key) m.set(String(a.storage_key), a);
    }
    return m;
  }, [assets]);

  const parseTags = (s: string) =>
    (s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30);

  const AssetEditor = (props: { storageKey: string; kind: "music" | "ambience"; defaultTitle: string }) => {
    const { storageKey, kind, defaultTitle } = props;
    const existing = assetsByKey.get(storageKey);
    const [title, setTitle] = React.useState(existing?.title || defaultTitle);
    const [tagsText, setTagsText] = React.useState((existing?.tags || []).join(", "));
    const [source, setSource] = React.useState(existing?.source || "");
    const [license, setLicense] = React.useState(existing?.license || "");

    React.useEffect(() => {
      const next = assetsByKey.get(storageKey);
      setTitle(next?.title || defaultTitle);
      setTagsText((next?.tags || []).join(", "));
      setSource(next?.source || "");
      setLicense(next?.license || "");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, assetsByKey]);

    const save = async () => {
      if (!token.trim()) return;
      setIsLoading(true);
      setError("");
      try {
        const res = await adminUpsertAudioAsset(token.trim(), {
          storage_key: storageKey,
          kind,
          title: title || "",
          tags: parseTags(tagsText),
          source: source || "",
          license: license || "",
        });
        const next = [res.item, ...(assets || []).filter((a) => a.storage_key !== res.item.storage_key)];
        setAssets(next);
        toast({ title: "Metadata sauvegardée", description: storageKey });
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Titre</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2" disabled={!hasToken || isLoading} />
        </div>
        <div className="md:col-span-2">
          <Label>Tags (séparés par virgule)</Label>
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="mt-2" disabled={!hasToken || isLoading} />
        </div>
        <div>
          <Label>Source</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} className="mt-2" disabled={!hasToken || isLoading} />
        </div>
        <div>
          <Label>Licence</Label>
          <Input value={license} onChange={(e) => setLicense(e.target.value)} className="mt-2" disabled={!hasToken || isLoading} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={save} disabled={!hasToken || isLoading}>
            Sauver metadata
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin · Bibliothèque audio</h1>
        <p className="text-muted-foreground">
          Upload / rename / delete dans Supabase Storage (via backend). Le navigateur ne voit jamais la clé service role.
        </p>
      </div>

      <GlassCard padding="lg">
        <div className="grid gap-4 md:grid-cols-3 items-end">
          <div className="md:col-span-2">
            <Label htmlFor="admin-token">Code admin</Label>
            <Input
              id="admin-token"
              value={token}
              onChange={(e) => setTokenState(e.target.value)}
              placeholder="Code unique (ADMIN_TOKEN)"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">Stocké uniquement dans la session navigateur.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={saveToken} disabled={!token.trim() || isLoading}>
              Valider
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium">Catalogue attendu (pour l’app)</div>
            <div className="text-xs text-muted-foreground">
              Bucket: <code>{expected?.bucket || "?"}</code> · Storage:{" "}
              <code>{expected?.enabled ? "enabled" : "disabled"}</code>
            </div>
          </div>
          <Button variant="secondary" onClick={loadAll} disabled={!hasToken || isLoading}>
            Rafraîchir
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="font-medium">Musique</div>
            {Object.entries(expMusic).map(([id, key]) => {
              const ok = Boolean(catMusic[id]);
              const defaultTitle = id.replace(/^user-/, "").replaceAll("-", " ");
              return (
                <div key={id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{id}</div>
                      <div className="text-xs text-muted-foreground">
                        <code>{key}</code> · {ok ? "OK" : "manquant"}
                      </div>
                    </div>
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        disabled={!hasToken || isLoading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUploadToKey(key, f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button variant="secondary" disabled={!hasToken || isLoading}>
                        Uploader
                      </Button>
                    </label>
                  </div>
                  <AssetEditor storageKey={key} kind="music" defaultTitle={defaultTitle} />
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="font-medium">Ambiances</div>
            {Object.entries(expAmb).map(([id, key]) => {
              const ok = Boolean(catAmb[id] || catAmb[id.replace("-", "")]);
              const defaultTitle = id.replaceAll("-", " ");
              return (
                <div key={id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{id}</div>
                      <div className="text-xs text-muted-foreground">
                        <code>{key}</code> · {ok ? "OK" : "manquant"}
                      </div>
                    </div>
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        disabled={!hasToken || isLoading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUploadToKey(key, f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button variant="secondary" disabled={!hasToken || isLoading}>
                        Uploader
                      </Button>
                    </label>
                  </div>
                  <AssetEditor storageKey={key} kind="ambience" defaultTitle={defaultTitle} />
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="space-y-3">
          <div className="font-medium">Lister les fichiers existants</div>
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <div className="md:col-span-2">
              <Label htmlFor="prefix">Prefix</Label>
              <Input id="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="music/ ou ambiences/" className="mt-2" />
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={loadAll} disabled={!hasToken || isLoading}>
                Recharger
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun fichier (ou storage désactivé).</div>
            ) : (
              items.map((it, idx) => {
                const name = String((it as any).name || (it as any).id || "");
                return (
                  <div key={name || idx} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(it as any).updated_at ? <span>maj: {(it as any).updated_at}</span> : null}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="destructive" onClick={() => onDelete(`${prefix}${name}`)} disabled={!hasToken || isLoading}>
                        Supprimer
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="space-y-3">
          <div className="font-medium">Renommer / déplacer</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="move-src">Source</Label>
              <Input
                id="move-src"
                value={moveSource}
                onChange={(e) => setMoveSource(e.target.value)}
                placeholder="ex: ambiences/pluie.mp3"
                className="mt-2"
                disabled={!hasToken || isLoading}
              />
            </div>
            <div>
              <Label htmlFor="move-dst">Destination</Label>
              <Input
                id="move-dst"
                value={moveDest}
                onChange={(e) => setMoveDest(e.target.value)}
                placeholder="ex: ambiences/rain.mp3"
                className="mt-2"
                disabled={!hasToken || isLoading}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => onMove(moveSource, moveDest)} disabled={!hasToken || isLoading || !moveSource.trim() || !moveDest.trim()}>
              Renommer
            </Button>
          </div>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>
      </GlassCard>
    </div>
  );
}

