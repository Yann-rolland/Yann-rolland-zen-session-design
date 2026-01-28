import * as React from "react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Sparkles, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [isCodeLogin, setIsCodeLogin] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const { login, signup, requestLoginCode, verifyLoginCode, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const from = (location.state as any)?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (isCodeLogin) {
        if (!codeSent) {
          await requestLoginCode(email);
          toast({
            title: "Code envoyé",
            description: "Vérifie tes emails et saisis le code reçu.",
          });
          setCodeSent(true);
          return;
        }
        await verifyLoginCode(email, code);
        toast({ title: "Connexion réussie", description: "Bon retour parmi nous !" });
        navigate(from, { replace: true });
        return;
      }
      if (isForgot) {
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        toast({
          title: "Email envoyé",
          description: "Vérifie ta boîte mail pour réinitialiser ton mot de passe.",
        });
        setIsForgot(false);
        return;
      }
      if (isSignUp) {
        const res = await signup(email, password, name);
        if (res.needsEmailConfirmation) {
          toast({
            title: "Compte créé",
            description: "Vérifie tes emails pour confirmer ton compte, puis reconnecte‑toi.",
          });
          // Stay on login screen
          setIsSignUp(false);
          return;
        }
        toast({ title: "Compte créé", description: "Bienvenue sur MaÏa !" });
      } else {
        await login(email, password);
        toast({
          title: "Connexion réussie",
          description: "Bon retour parmi nous !",
        });
      }
      navigate(from, { replace: true });
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as any)?.message || "Vérifiez vos identifiants et réessayez.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div 
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 30%, hsl(38 92% 50% / 0.08) 0%, transparent 50%)"
          }}
        />
      </div>

      <div className="w-full max-w-md relative fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary mb-4 shadow-glow">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-gradient-primary">MaÏa</h1>
          <p className="text-muted-foreground mt-2">
            {isForgot
              ? "Réinitialiser votre mot de passe"
              : isCodeLogin
                ? "Connexion par code"
                : isSignUp
                  ? "Créez votre compte"
                  : "Connectez-vous pour continuer"}
          </p>
        </div>

        {/* Form */}
        <GlassCard padding="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Nom</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Votre nom"
                    className="pl-10 bg-secondary/50 border-border/50"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  className="pl-10 bg-secondary/50 border-border/50"
                />
              </div>
            </div>

            {isCodeLogin && (
              <div className="space-y-2">
                <Label htmlFor="code">Code reçu par email</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  disabled={!codeSent}
                  className="bg-secondary/50 border-border/50"
                />
                {!codeSent && (
                  <div className="text-xs text-muted-foreground">
                    Clique sur “Envoyer le code” puis saisis le code reçu.
                  </div>
                )}
              </div>
            )}

            {!isForgot && !isCodeLogin && (
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="pl-10 pr-10 bg-secondary/50 border-border/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-primary hover:shadow-glow transition-all duration-300"
            >
              {isLoading ? (
                <LoadingSpinner size="sm" />
              ) : isForgot ? (
                "Envoyer le lien"
              ) : isCodeLogin ? (
                codeSent ? "Valider le code" : "Envoyer le code"
              ) : isSignUp ? (
                "Créer un compte"
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setIsForgot(true);
                setIsSignUp(false);
                setIsCodeLogin(false);
                setCodeSent(false);
                setCode("");
              }}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              Mot de passe oublié ?
            </button>
            {isForgot && (
              <button
                type="button"
                onClick={() => setIsForgot(false)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Retour
              </button>
            )}
          </div>

          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                setIsCodeLogin((v) => !v);
                setIsForgot(false);
                setIsSignUp(false);
                setCodeSent(false);
                setCode("");
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isCodeLogin ? (
                <>Connexion avec <span className="text-primary">mot de passe</span></>
              ) : (
                <>Connexion avec <span className="text-primary">code</span></>
              )}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={isForgot || isCodeLogin}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? (
                <>Déjà un compte ? <span className="text-primary">Se connecter</span></>
              ) : (
                <>Pas de compte ? <span className="text-primary">S'inscrire</span></>
              )}
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
