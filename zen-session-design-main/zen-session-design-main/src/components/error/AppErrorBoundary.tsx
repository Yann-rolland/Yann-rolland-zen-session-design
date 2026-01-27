import * as React from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Keep a visible trace in prod logs (Vercel) + browser console.
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary] Uncaught render error", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || "Erreur inconnue";

    return (
      <div className="min-h-screen bg-background">
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, hsl(240 20% 8%) 0%, hsl(240 15% 4%) 50%)",
          }}
        />
        <div className="relative container max-w-3xl py-10 px-4">
          <GlassCard padding="lg">
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold">Oups — une erreur est survenue</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  L’application a rencontré un problème. Tu peux recharger la page ou revenir à l’accueil.
                </p>
              </div>

              <div className="rounded-md bg-muted/40 p-3 text-sm font-mono break-words">
                {msg}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={this.handleReload}>Recharger</Button>
                <Button variant="secondary" onClick={this.handleGoHome}>
                  Aller à l’accueil
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }
}

