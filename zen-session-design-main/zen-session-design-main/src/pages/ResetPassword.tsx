import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

function parseHashParams(hash: string): Record<string, string> {
  const h = (hash || "").replace(/^#/, "");
  const sp = new URLSearchParams(h);
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const hashParams = useMemo(() => parseHashParams(window.location.hash), []);
  const accessToken = hashParams["access_token"];
  const refreshToken = hashParams["refresh_token"];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // For recovery links Supabase includes access_token + refresh_token in URL hash.
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      } catch (e: any) {
        toast({
          title: "Lien invalide",
          description: e?.message || "Le lien de réinitialisation est invalide ou expiré.",
          variant: "destructive",
        });
      } finally {
        if (mounted) setIsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "Minimum 8 caractères.", variant: "destructive" });
      return;
    }
    if (password !== password2) {
      toast({ title: "Mismatch", description: "Les mots de passe ne correspondent pas.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Mot de passe mis à jour", description: "Tu peux maintenant te reconnecter." });
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message || "Impossible de mettre à jour le mot de passe.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <GlassCard padding="lg">
          <h1 className="text-xl font-semibold">Réinitialiser le mot de passe</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Choisis un nouveau mot de passe pour ton compte.
          </p>

          {!isReady ? (
            <div className="mt-6 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : (
            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw1">Nouveau mot de passe</Label>
                <Input id="pw1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirmer</Label>
                <Input id="pw2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <LoadingSpinner size="sm" /> : "Enregistrer"}
              </Button>
            </form>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

