import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminGetAppConfig, adminSaveAppConfig } from "@/api/hypnoticApi";
import { useToast } from "@/hooks/use-toast";
import { NavLink } from "react-router-dom";

const SS_ADMIN_TOKEN = "bn3_admin_token_v1";

export default function AdminSettings() {
  const { toast } = useToast();
  const [token, setToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(SS_ADMIN_TOKEN) || "";
    } catch {
      return "";
    }
  });
  const [forcedText, setForcedText] = useState<string>("");
  const [geminiModelDefault, setGeminiModelDefault] = useState<string>("");
  const [chatModelDefault, setChatModelDefault] = useState<string>("");
  const [elevenlabsVoiceIdDefault, setElevenlabsVoiceIdDefault] = useState<string>("");
  const [safetyRulesText, setSafetyRulesText] = useState<string>("");
  const [promptTemplateOverride, setPromptTemplateOverride] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const hasToken = Boolean(token.trim());

  const load = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await adminGetAppConfig(token.trim());
      setForcedText(res.config?.forced_generation_text || "");
      setGeminiModelDefault(res.config?.gemini_model_default || "");
      setChatModelDefault(res.config?.chat_model_default || "");
      setElevenlabsVoiceIdDefault(res.config?.elevenlabs_voice_id_default || "");
      setSafetyRulesText(res.config?.safety_rules_text || "");
      setPromptTemplateOverride(res.config?.prompt_template_override || "");
      setUpdatedAt(res.config?.updated_at || "");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasToken) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveToken = () => {
    try {
      sessionStorage.setItem(SS_ADMIN_TOKEN, token.trim());
    } catch {
      // ignore
    }
    toast({ title: "Code admin enregistré", description: "Stocké uniquement dans cette session navigateur." });
    load();
  };

  const clearToken = () => {
    setToken("");
    try {
      sessionStorage.removeItem(SS_ADMIN_TOKEN);
    } catch {
      // ignore
    }
  };

  const saveConfig = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await adminSaveAppConfig(token.trim(), {
        action: "save",
        forced_generation_text: forcedText,
        gemini_model_default: geminiModelDefault,
        chat_model_default: chatModelDefault,
        elevenlabs_voice_id_default: elevenlabsVoiceIdDefault,
        safety_rules_text: safetyRulesText,
        prompt_template_override: promptTemplateOverride,
      });
      setForcedText(res.config?.forced_generation_text || "");
      setGeminiModelDefault(res.config?.gemini_model_default || "");
      setChatModelDefault(res.config?.chat_model_default || "");
      setElevenlabsVoiceIdDefault(res.config?.elevenlabs_voice_id_default || "");
      setSafetyRulesText(res.config?.safety_rules_text || "");
      setPromptTemplateOverride(res.config?.prompt_template_override || "");
      setUpdatedAt(res.config?.updated_at || "");
      toast({ title: "Paramètres sauvegardés", description: "Ils seront appliqués aux prochaines générations." });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const rollback = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await adminSaveAppConfig(token.trim(), { action: "rollback" });
      setForcedText(res.config?.forced_generation_text || "");
      setGeminiModelDefault(res.config?.gemini_model_default || "");
      setChatModelDefault(res.config?.chat_model_default || "");
      setElevenlabsVoiceIdDefault(res.config?.elevenlabs_voice_id_default || "");
      setSafetyRulesText(res.config?.safety_rules_text || "");
      setPromptTemplateOverride(res.config?.prompt_template_override || "");
      setUpdatedAt(res.config?.updated_at || "");
      toast({ title: "Rollback OK", description: "Retour à la config précédente." });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const reset = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await adminSaveAppConfig(token.trim(), { action: "reset" });
      setForcedText(res.config?.forced_generation_text || "");
      setGeminiModelDefault(res.config?.gemini_model_default || "");
      setChatModelDefault(res.config?.chat_model_default || "");
      setElevenlabsVoiceIdDefault(res.config?.elevenlabs_voice_id_default || "");
      setSafetyRulesText(res.config?.safety_rules_text || "");
      setPromptTemplateOverride(res.config?.prompt_template_override || "");
      setUpdatedAt(res.config?.updated_at || "");
      toast({ title: "Reset OK", description: "Config remise à zéro." });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const help = useMemo(() => {
    return (
      "Ce texte est ajouté AVANT le prompt de génération (prioritaire). " +
      "Exemples: contraintes de style, structure, thèmes interdits, safety, etc. " +
      "Évite de coller des secrets."
    );
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin · Paramètres</h1>
        <p className="text-muted-foreground">
          Accès protégé par un code admin (header <code>x-admin-token</code>). Les changements sont stockés côté backend avec rollback.
        </p>
        <div className="mt-2 text-sm">
          <NavLink to="/admin/library" className="text-primary hover:underline">
            Aller à la bibliothèque audio →
          </NavLink>
        </div>
      </div>

      <GlassCard padding="lg">
        <div className="grid gap-4 md:grid-cols-3 items-end">
          <div className="md:col-span-2">
            <Label htmlFor="admin-token">Code admin</Label>
            <Input
              id="admin-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Code unique (ADMIN_TOKEN)"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">Stocké uniquement dans la session navigateur.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={clearToken} disabled={!token || isLoading}>
              Effacer
            </Button>
            <Button onClick={saveToken} disabled={!token.trim() || isLoading}>
              Valider
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="space-y-3">
          <div>
            <Label htmlFor="forcedText">Texte forcé (injection admin)</Label>
            <p className="text-xs text-muted-foreground mt-1">{help}</p>
          </div>
          <Textarea
            id="forcedText"
            value={forcedText}
            onChange={(e) => setForcedText(e.target.value)}
            placeholder="Ex: Toujours produire un style Ericksonien, éviter les mentions médicales, etc."
            className="min-h-[160px]"
            disabled={!hasToken || isLoading}
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-muted-foreground">
              {updatedAt ? (
                <>
                  Dernière sauvegarde: <code>{updatedAt}</code>
                </>
              ) : (
                "Aucune sauvegarde"
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={rollback} disabled={!hasToken || isLoading}>
                Rollback
              </Button>
              <Button variant="secondary" onClick={reset} disabled={!hasToken || isLoading}>
                Reset
              </Button>
              <Button onClick={saveConfig} disabled={!hasToken || isLoading}>
                Sauvegarder
              </Button>
            </div>
          </div>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="space-y-4">
          <div>
            <div className="font-medium">Modèles par défaut</div>
            <p className="text-xs text-muted-foreground mt-1">
              Utilisés si le client ne spécifie pas explicitement un modèle (génération + chat).
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="geminiModelDefault">Gemini (génération) · modèle par défaut</Label>
              <Input
                id="geminiModelDefault"
                value={geminiModelDefault}
                onChange={(e) => setGeminiModelDefault(e.target.value)}
                placeholder="ex: gemini-1.5-pro-latest"
                className="mt-2"
                disabled={!hasToken || isLoading}
              />
            </div>
            <div>
              <Label htmlFor="chatModelDefault">Gemini (chat) · modèle par défaut</Label>
              <Input
                id="chatModelDefault"
                value={chatModelDefault}
                onChange={(e) => setChatModelDefault(e.target.value)}
                placeholder="ex: gemini-1.5-flash-latest"
                className="mt-2"
                disabled={!hasToken || isLoading}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="elevenlabsVoiceIdDefault">ElevenLabs · voice_id par défaut</Label>
              <Input
                id="elevenlabsVoiceIdDefault"
                value={elevenlabsVoiceIdDefault}
                onChange={(e) => setElevenlabsVoiceIdDefault(e.target.value)}
                placeholder="UUID ElevenLabs (optionnel)"
                className="mt-2"
                disabled={!hasToken || isLoading}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="space-y-4">
          <div>
            <div className="font-medium">Règles de sécurité (admin)</div>
            <p className="text-xs text-muted-foreground mt-1">
              Ajoutées comme contraintes “prioritaires” au prompt de génération (utile pour filtrer des thèmes, ton, etc.).
            </p>
          </div>
          <Textarea
            value={safetyRulesText}
            onChange={(e) => setSafetyRulesText(e.target.value)}
            placeholder="Ex: Ne jamais faire de diagnostic médical. Éviter les injonctions dangereuses. Toujours rester bienveillant..."
            className="min-h-[140px]"
            disabled={!hasToken || isLoading}
          />
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="space-y-4">
          <div>
            <div className="font-medium">Template de prompt (override)</div>
            <p className="text-xs text-muted-foreground mt-1">
              Si rempli, remplace le template par défaut. Variables: <code>{"{objectif}"}</code>, <code>{"{duree_minutes}"}</code>,{" "}
              <code>{"{style}"}</code>, <code>{"{pnl_clause}"}</code>.
            </p>
          </div>
          <Textarea
            value={promptTemplateOverride}
            onChange={(e) => setPromptTemplateOverride(e.target.value)}
            placeholder="Laisse vide pour utiliser le template standard."
            className="min-h-[180px]"
            disabled={!hasToken || isLoading}
          />
        </div>
      </GlassCard>
    </div>
  );
}

