import * as React from "react";
import { useApp } from "@/contexts/AppContext";
import { Session } from "@/types";
import { CreateSessionForm } from "@/components/session/CreateSessionForm";
import { SessionPlayer } from "@/components/player/SessionPlayer";
import { PhaseAccordion } from "@/components/session/PhaseAccordion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { AmbienceMixer } from "@/components/player/AmbienceMixer";
import { Sparkles, ArrowLeft } from "lucide-react";
import { NavLink } from "react-router-dom";

export default function Home() {
  const { currentSession, setCurrentSession, playerState, settings, defaultConfig } = useApp();

  const handleSessionCreated = (session: Session) => {
    setCurrentSession(session);
  };

  const handleBackToCreate = () => {
    setCurrentSession(null);
  };

  return (
    <div className="space-y-8 fade-in">
      {/* Hero Section - Only show when no session */}
      {!currentSession && (
        <div className="text-center py-8 md:py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary mb-6 shadow-glow">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3 text-gradient-primary">
            MaÏa
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Créez des sessions de relaxation et d'hypnose personnalisées avec l'IA
          </p>
        </div>
      )}

      {/* Main Content */}
      {currentSession ? (
        <div className="space-y-6">
          {/* Back button */}
          <Button
            variant="ghost"
            onClick={handleBackToCreate}
            className="zen-hide"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Nouvelle session
          </Button>

          {/* Player */}
          <SessionPlayer />

          {/* Phases */}
          <div className="zen-hide">
            <h3 className="text-lg font-semibold mb-4">Phases de la session</h3>
            <PhaseAccordion
              phases={currentSession.phases}
              currentPhaseId={playerState.currentPhase?.id}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="zen-hide">
            <AmbienceMixer binauralUrl={null} initialConfig={defaultConfig} defaultOpen={false} />
          </div>
          <GlassCard padding="lg" className="zen-hide">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">Playlists</div>
                <div className="text-sm text-muted-foreground">
                  Des sons prêts par thème (sommeil, pluie, focus…), comme Spotify.
                </div>
              </div>
              <Button asChild>
                <NavLink to="/playlists">Voir</NavLink>
              </Button>
            </div>
          </GlassCard>
          <CreateSessionForm onSessionCreated={handleSessionCreated} />
        </div>
      )}
    </div>
  );
}
