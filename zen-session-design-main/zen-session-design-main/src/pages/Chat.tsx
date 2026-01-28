import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatClearHistory, chatHistory, chatSend, ChatHistoryMessage } from "@/api/hypnoticApi";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Chat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = text.trim().length > 0 && !isLoading;

  const load = async () => {
    setIsBooting(true);
    try {
      const res = await chatHistory(80);
      setMessages(res.messages || []);
    } catch (e: any) {
      toast({ title: "Chat indisponible", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setIsBooting(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg) return;
    setText("");
    setIsLoading(true);
    try {
      // Optimistic append
      const optimistic: ChatHistoryMessage = {
        id: `tmp_${Date.now()}`,
        role: "user",
        content: msg,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);

      const res = await chatSend(msg);
      const reply: ChatHistoryMessage = {
        id: `tmp_${Date.now()}_reply`,
        role: "model",
        content: res.reply || "",
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, reply]);
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setIsLoading(false);
      // Refresh from DB (best effort)
      load();
    }
  };

  const handleClear = async () => {
    setIsLoading(true);
    try {
      await chatClearHistory();
      setMessages([]);
      toast({ title: "Chat effacé" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const empty = useMemo(() => (messages || []).length === 0, [messages]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Chat</h1>
          <p className="text-muted-foreground">Discute avec l’assistant (Gemini). Historique privé par utilisateur.</p>
        </div>
        <Button variant="secondary" onClick={handleClear} disabled={isLoading || empty}>
          Effacer
        </Button>
      </div>

      <GlassCard padding="lg" className="min-h-[420px] flex flex-col">
        <div className="flex-1 space-y-3 overflow-auto pr-1">
          {isBooting ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : empty ? (
            <div className="text-sm text-muted-foreground">
              Écris un message pour commencer. Exemple: “Aide‑moi à préparer une session anti‑stress de 15 minutes.”
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[92%] rounded-xl border px-3 py-2 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-primary/10 border-primary/20"
                    : "mr-auto bg-secondary/40 border-border/60",
                )}
              >
                {m.content}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Écrire un message…"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={!canSend}>
            Envoyer
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Si ça répond “GEMINI_API_KEY manquant”, ajoute la clé dans Render → Environment.
        </div>
      </GlassCard>
    </div>
  );
}

