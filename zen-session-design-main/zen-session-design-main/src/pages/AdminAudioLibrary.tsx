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
  const [metaKind, setMetaKind] = React.useState<string>("");
  const [metaQ, setMetaQ] = React.useState<string>("");
  const [metaTag, setMetaTag] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const [moveSource, setMoveSource] = React.useState<string>("");
  const [moveDest, setMoveDest] = React.useState<string>("");

  const loadStorage = async () => {
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
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const loadMeta = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const meta = await adminListAudioAssets(token.trim(), {
        kind: metaKind || undefined,
        q: metaQ || undefined,
        tag: metaTag ? canonicalizeTag(metaTag) : undefined,
        limit: 300,
        offset: 0,
      });
      setAssets(meta.items || []);
    } catch (e: any) {
      setError(e?.message || String(e));
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadStorage(), loadMeta()]);
  };

  React.useEffect(() => {
    if (!hasToken) return;
    loadStorage();
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
      await adminStorageUpload(token.trim(), key, file, { upsert: true });
      toast({ title: "Upload OK", description: key });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const onAddNewToPrefix = async (prefixKey: string, desiredName: string | undefined, file: File) => {
    if (!token.trim()) return;
    const safeBase = (desiredName || file.name || "audio")
      .toString()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");
    const ext = (file.name || "").includes(".") ? "." + String(file.name).split(".").pop() : "";
    const base = safeBase && !safeBase.endsWith(ext) ? `${safeBase}${ext}` : safeBase || `audio${ext || ".mp3"}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15); // yyyymmddThhmmss
    const p = (prefixKey || "").trim();
    const pp = p.endsWith("/") || p === "" ? p : p + "/";
    const key = `${pp}${base.replace(/^\/+/, "")}`.replaceAll("//", "/");
    const keyUnique = key.includes(".") ? key.replace(/\.(\w+)$/, `-${stamp}.$1`) : `${key}-${stamp}`;

    setIsLoading(true);
    setError("");
    try {
      await adminStorageUpload(token.trim(), keyUnique, file, { upsert: false });
      toast({ title: "Ajouté (nouveau)", description: keyUnique });
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

  const TAG_FR_TO_EN: Record<string, string> = {
    pluie: "rain",
    orage: "storm",
    tempete: "storm",
    tempête: "storm",
    vent: "wind",
    ocean: "ocean",
    océan: "ocean",
    foret: "forest",
    forêt: "forest",
    feu: "fire",
    cheminée: "fireplace",
    cheminee: "fireplace",
    mer: "ocean",
    vague: "waves",
    vagues: "waves",
    bruit: "noise",
    bruitrose: "pink-noise",
    "bruit-rose": "pink-noise",
    bruinrose: "pink-noise",
    bruitblanc: "white-noise",
    "bruit-blanc": "white-noise",
    bruitbrun: "brown-noise",
    "bruit-brun": "brown-noise",
    detente: "relax",
    détente: "relax",
    relaxation: "relax",
    calme: "calm",
    sommeil: "sleep",
    focus: "focus",
    concentration: "focus",
    meditation: "meditation",
    méditation: "meditation",
    zen: "zen",
  };

  const TAG_EN_TO_FR: Record<string, string> = {
    rain: "Pluie",
    wind: "Vent",
    ocean: "Océan",
    forest: "Forêt",
    fire: "Feu",
    fireplace: "Cheminée",
    waves: "Vagues",
    noise: "Bruit",
    "pink-noise": "Bruit rose",
    "white-noise": "Bruit blanc",
    "brown-noise": "Bruit brun",
    relax: "Détente",
    calm: "Calme",
    sleep: "Sommeil",
    focus: "Concentration",
    meditation: "Méditation",
    zen: "Zen",
    storm: "Orage",
  };

  function stripAccents(s: string): string {
    try {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch {
      return s;
    }
  }

  function canonicalizeTag(raw: string): string {
    const base = stripAccents(String(raw || "").trim().toLowerCase());
    const cleaned = base
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!cleaned) return "";
    return TAG_FR_TO_EN[cleaned] || cleaned;
  }

  function prettyTag(en: string): string {
    const k = String(en || "").trim();
    const fr = TAG_EN_TO_FR[k];
    return fr ? `${fr} (${k})` : k;
  }

  const parseTags = (s: string) => {
    const raw = (s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 60);
    const out: string[] = [];
    for (const t of raw) {
      const canon = canonicalizeTag(t);
      if (canon && !out.includes(canon)) out.push(canon);
    }
    return out.slice(0, 30);
  };

  const UploadControl = (props: { disabled: boolean; onFile: (file: File) => void }) => {
    const { disabled, onFile } = props;
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    return (
      <div className="shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.currentTarget.value = "";
          }}
        />
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            // Trigger file dialog reliably (some browsers don't open it when clicking a button inside a <label>).
            inputRef.current?.click();
          }}
        >
          Uploader
        </Button>
      </div>
    );
  };

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
        const canonicalTags = parseTags(tagsText);
        const res = await adminUpsertAudioAsset(token.trim(), {
          storage_key: storageKey,
          kind,
          title: title || "",
          tags: canonicalTags,
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
          <div className="text-xs text-muted-foreground mt-2">
            Enregistré (canonique EN): <code>{parseTags(tagsText).join(", ") || "—"}</code>
          </div>
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
                    <div className="flex items-center gap-2">
                      <UploadControl disabled={!hasToken || isLoading} onFile={(f) => onUploadToKey(key, f)} />
                      <UploadControl
                        disabled={!hasToken || isLoading}
                        onFile={(f) => onAddNewToPrefix("music/user/", undefined, f)}
                      />
                    </div>
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
                    <div className="flex items-center gap-2">
                      <UploadControl disabled={!hasToken || isLoading} onFile={(f) => onUploadToKey(key, f)} />
                      <UploadControl
                        disabled={!hasToken || isLoading}
                        onFile={(f) => onAddNewToPrefix("ambiences/", undefined, f)}
                      />
                    </div>
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
          <div className="font-medium">Recherche (métadonnées)</div>
          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div className="md:col-span-2">
              <Label htmlFor="meta-q">Recherche (titre / chemin)</Label>
              <Input id="meta-q" value={metaQ} onChange={(e) => setMetaQ(e.target.value)} className="mt-2" placeholder="ex: ocean / slowlife" />
            </div>
            <div>
              <Label htmlFor="meta-kind">Type</Label>
              <select
                id="meta-kind"
                className="mt-2 flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={metaKind}
                onChange={(e) => setMetaKind(e.target.value)}
              >
                <option value="">Tous</option>
                <option value="music">Musique</option>
                <option value="ambience">Ambiances</option>
              </select>
            </div>
            <div>
              <Label htmlFor="meta-tag">Tag (FR/EN)</Label>
              <Input id="meta-tag" value={metaTag} onChange={(e) => setMetaTag(e.target.value)} className="mt-2" placeholder="ex: pluie / rain" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={loadMeta} disabled={!hasToken || isLoading}>
              Rechercher
            </Button>
          </div>

          <div className="grid gap-3">
            {assets.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun résultat.</div>
            ) : (
              assets.slice(0, 60).map((a) => (
                <div key={a.storage_key} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {a.title || "—"}{" "}
                        <span className="text-xs text-muted-foreground">· {a.kind}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        <code>{a.storage_key}</code>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(a.tags || []).length ? (a.tags || []).map(prettyTag).join(" · ") : "Tags: —"}
                      </div>
                    </div>
                  </div>
                  <AssetEditor
                    storageKey={a.storage_key}
                    kind={(String(a.kind) === "music" ? "music" : "ambience") as any}
                    defaultTitle={a.title || a.storage_key.split("/").pop()?.split(".")[0] || ""}
                  />
                </div>
              ))
            )}
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
              <Button variant="secondary" onClick={loadStorage} disabled={!hasToken || isLoading}>
                Recharger
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Astuce: clique un “dossier” pour naviguer. Prefix courant: <code>{prefix || "—"}</code>
            </div>
            <UploadControl
              disabled={!hasToken || isLoading}
              onFile={(f) => onAddNewToPrefix(prefix || "", undefined, f)}
            />
          </div>

          <div className="grid gap-2">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun fichier (ou storage désactivé).</div>
            ) : (
              items.map((it, idx) => {
                const name = String((it as any).name || (it as any).id || "");
                const isFolder = name && !name.includes(".");
                const p = (prefix || "").trim();
                const basePrefix = p.endsWith("/") || p === "" ? p : p + "/";
                const fullKey = `${basePrefix}${name}`.replaceAll("//", "/");
                return (
                  <div key={name || idx} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        className="text-sm font-medium truncate text-left hover:underline disabled:no-underline"
                        disabled={!isFolder}
                        onClick={() => {
                          if (!isFolder) return;
                          const next = `${basePrefix}${name}/`.replaceAll("//", "/");
                          setPrefix(next);
                        }}
                      >
                        {isFolder ? `📁 ${name}` : `🎵 ${name}`}
                      </button>
                      <div className="text-xs text-muted-foreground truncate">
                        {(it as any).updated_at ? <span>maj: {(it as any).updated_at}</span> : null}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!isFolder ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setMoveSource(fullKey);
                              setMoveDest(fullKey);
                            }}
                            disabled={!hasToken || isLoading}
                          >
                            Renommer
                          </Button>
                          <Button variant="destructive" onClick={() => onDelete(fullKey)} disabled={!hasToken || isLoading}>
                            Supprimer
                          </Button>
                        </>
                      ) : null}
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

