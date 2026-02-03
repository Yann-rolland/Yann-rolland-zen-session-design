import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Play, CheckCircle2, XCircle } from "lucide-react";
import { getApiBase } from "@/api/hypnoticApi";

export default function TestElevenLabs() {
  const [text, setText] = useState("Bonjour, ceci est un test de la voix ElevenLabs.");
  const [voiceId, setVoiceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    audio_path?: string;
    error?: string;
    provider_used?: string;
    cache_hit?: boolean;
  } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleTest = async () => {
    if (!text.trim()) {
      alert("Veuillez entrer un texte à tester");
      return;
    }

    setLoading(true);
    setResult(null);
    setAudioUrl(null);

    try {
      const apiBase = getApiBase();
      const formData = new FormData();
      formData.append("text", text);
      if (voiceId.trim()) {
        formData.append("voice_id", voiceId.trim());
      }

      const response = await fetch(`${apiBase}/test/elevenlabs`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data);

      if (data.success && data.audio_path) {
        // Construire l'URL complète de l'audio
        const fullUrl = `${apiBase}/${data.audio_path}`;
        setAudioUrl(fullUrl);
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || "Erreur lors du test",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test ElevenLabs TTS</CardTitle>
          <CardDescription>
            Testez la synthèse vocale ElevenLabs sans affecter le reste de l'application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="text">Texte à synthétiser</Label>
            <Textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Entrez le texte que vous souhaitez convertir en voix..."
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voice_id">
              Voice ID (optionnel - laisse vide pour utiliser la valeur par défaut)
            </Label>
            <Input
              id="voice_id"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="Ex: 21m00Tcm4TlvDq8ikWAM (voix publique)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              💡 Si vous avez une erreur de limite de voix personnalisées, utilisez une voix publique 
              (ex: 21m00Tcm4TlvDq8ikWAM) ou laissez vide pour la voix par défaut.
            </p>
          </div>

          <Button onClick={handleTest} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Tester la voix
              </>
            )}
          </Button>

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.success ? (
                  <div className="space-y-2">
                    <p>✅ Génération réussie !</p>
                    <p className="text-sm text-muted-foreground">
                      Provider: {result.provider_used || "N/A"} | Cache: {result.cache_hit ? "Oui" : "Non"}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold">Erreur:</p>
                    <p className="text-sm">{result.error}</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {audioUrl && result?.success && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audio généré</CardTitle>
              </CardHeader>
              <CardContent>
                <audio controls className="w-full" src={audioUrl}>
                  Votre navigateur ne supporte pas la lecture audio.
                </audio>
                <p className="text-sm text-muted-foreground mt-2">
                  URL: <code className="text-xs">{audioUrl}</code>
                </p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
