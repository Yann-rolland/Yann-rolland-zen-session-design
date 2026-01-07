import * as React from "react";
import { cn } from "@/lib/utils";
import { SessionPhase } from "@/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, Loader2, Clock } from "lucide-react";

interface PhaseAccordionProps {
  phases: SessionPhase[];
  currentPhaseId?: string;
  className?: string;
}

const phaseLabels: Record<SessionPhase['type'], string> = {
  'pre-ambiance': 'Pré-ambiance',
  'induction': 'Induction',
  'deepening': 'Approfondissement',
  'suggestions': 'Suggestions',
  'awakening': 'Réveil',
  'post-ambiance': 'Post-ambiance',
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs}s`;
}

export function PhaseAccordion({ phases, currentPhaseId, className }: PhaseAccordionProps) {
  const getPhaseStatus = (phase: SessionPhase) => {
    if (phase.isComplete) return 'complete';
    if (phase.id === currentPhaseId) return 'active';
    return 'pending';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'active':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={currentPhaseId}
      className={cn("space-y-2", className)}
    >
      {phases.map((phase) => {
        const status = getPhaseStatus(phase);
        return (
          <AccordionItem
            key={phase.id}
            value={phase.id}
            className={cn(
              "glass-card border-border/50 rounded-lg overflow-hidden",
              status === 'active' && "border-primary/50 glow-primary"
            )}
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-card/50">
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(status)}
                <span className={cn(
                  "font-medium",
                  status === 'complete' && "text-muted-foreground",
                  status === 'active' && "text-primary"
                )}>
                  {phaseLabels[phase.type] || phase.name}
                </span>
                <Badge variant="muted" className="ml-auto mr-2">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDuration(phase.duration)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {phase.content ? (
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {phase.content}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Contenu non disponible
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
