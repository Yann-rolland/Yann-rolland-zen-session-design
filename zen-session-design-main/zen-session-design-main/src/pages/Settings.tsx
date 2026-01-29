import * as React from "react";
import { useApp } from "@/contexts/AppContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SessionConfigPanel } from "@/components/session/SessionConfig";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressionTab } from "@/components/settings/ProgressionTab";
import { WellBeingTab } from "@/components/settings/WellBeingTab";
import { Moon, Eye, Settings as SettingsIcon, Volume2, Bell, Zap, Shield, Music2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";
import { adminGetAppConfig } from "@/api/hypnoticApi";
import { useToast } from "@/hooks/use-toast";

const SS_ADMIN_TOKEN = "bn3_admin_token_v1";

export default function Settings() {
  const { settings, updateSettings, defaultConfig, updateDefaultConfig } = useApp();
  const { toast } = useToast();
  const [adminToken, setAdminToken] = React.useState<string>(() => {
    try {
      return sessionStorage.getItem(SS_ADMIN_TOKEN) || "";
    } catch {
      return "";
    }
  });
  const [adminTokenSaved, setAdminTokenSaved] = React.useState<boolean>(false);

  return (
    <div className="space-y-6 fade-in">
      <h1 className="text-2xl font-bold">Réglages</h1>

      <Tabs defaultValue="settings">
        <TabsList className="w-full flex overflow-x-auto no-scrollbar gap-1 justify-start">
          <TabsTrigger value="settings" className="shrink-0 min-w-[120px] justify-center">
            Paramètres
          </TabsTrigger>
          <TabsTrigger value="progress" className="shrink-0 min-w-[120px] justify-center">
            Progression
          </TabsTrigger>
          <TabsTrigger value="wellbeing" className="shrink-0 min-w-[120px] justify-center">
            Bien-être
          </TabsTrigger>
          <TabsTrigger value="admin" className="shrink-0 min-w-[120px] justify-center">
            Admin
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 mt-6">
          {/* Appearance */}
          <GlassCard padding="lg">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <SettingsIcon className="w-5 h-5 text-primary" />
                <h2>Interface</h2>
              </div>
              <Separator className="bg-border/50" />
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Moon className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="zenMode" className="text-base">Mode Zen</Label>
                      <p className="text-sm text-muted-foreground">
                        Masque les éléments non essentiels pendant la lecture
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="zenMode"
                    checked={settings.zenMode}
                    onCheckedChange={(checked) => updateSettings({ zenMode: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Eye className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="hideAdvanced" className="text-base">Masquer paramètres avancés</Label>
                      <p className="text-sm text-muted-foreground">
                        Simplifie l'interface de création de session
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="hideAdvanced"
                    checked={settings.hideAdvancedSettings}
                    onCheckedChange={(checked) => updateSettings({ hideAdvancedSettings: checked })}
                  />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Notifications */}
          <GlassCard padding="lg">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Bell className="w-5 h-5 text-primary" />
                <h2>Notifications</h2>
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="notifications" className="text-base">Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Rappels et alertes de fin de session
                    </p>
                  </div>
                </div>
                <Switch
                  id="notifications"
                  checked={settings.notifications}
                  onCheckedChange={(checked) => updateSettings({ notifications: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="autoPlay" className="text-base">Lecture automatique</Label>
                    <p className="text-sm text-muted-foreground">
                      Démarre la session dès qu'elle est prête
                    </p>
                  </div>
                </div>
                <Switch
                  id="autoPlay"
                  checked={settings.autoPlay}
                  onCheckedChange={(checked) => updateSettings({ autoPlay: checked })}
                />
              </div>
            </div>
          </GlassCard>

          {/* Default Session Config */}
          <GlassCard padding="lg">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Volume2 className="w-5 h-5 text-primary" />
                <h2>Configuration par défaut</h2>
              </div>
              <Separator className="bg-border/50" />
              <div className="pt-2">
                <SessionConfigPanel
                  config={defaultConfig}
                  onChange={updateDefaultConfig}
                  hideAdvanced={false}
                />
              </div>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="progress" className="mt-6">
          <ProgressionTab />
        </TabsContent>

        <TabsContent value="wellbeing" className="mt-6">
          <WellBeingTab />
        </TabsContent>

        <TabsContent value="admin" className="space-y-6 mt-6">
          <GlassCard padding="lg">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="w-5 h-5 text-primary" />
                <h2>Administration</h2>
              </div>
              <Separator className="bg-border/50" />

              <div className="grid gap-4 md:grid-cols-3 items-end pt-2">
                <div className="md:col-span-2">
                  <Label htmlFor="adminToken" className="text-base">Code admin</Label>
                  <p className="text-sm text-muted-foreground">
                    Stocké uniquement dans cette session navigateur (sessionStorage).
                  </p>
                  <Input
                    id="adminToken"
                    value={adminToken}
                    onChange={(e) => {
                      setAdminToken(e.target.value);
                      setAdminTokenSaved(false);
                    }}
                    placeholder="ADMIN_TOKEN"
                    className="mt-2"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      try {
                        sessionStorage.setItem(SS_ADMIN_TOKEN, adminToken.trim());
                        setAdminTokenSaved(true);
                      } catch {
                        setAdminTokenSaved(false);
                      }
                    }}
                    disabled={!adminToken.trim()}
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
              {adminTokenSaved ? (
                <div className="text-sm text-muted-foreground">
                  Code enregistré pour cette session.
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 pt-2">
                <Button asChild variant="secondary">
                  <NavLink to="/admin/settings" className="flex items-center justify-center gap-2">
                    <Shield className="w-4 h-4" />
                    Admin · Paramètres
                  </NavLink>
                </Button>
                <Button asChild variant="secondary">
                  <NavLink to="/admin/library" className="flex items-center justify-center gap-2">
                    <Music2 className="w-4 h-4" />
                    Admin · Audio (bibliothèque)
                  </NavLink>
                </Button>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const tok = adminToken.trim();
                    if (!tok) return;
                    try {
                      await adminGetAppConfig(tok);
                      toast({ title: "Code admin OK", description: "Le backend accepte ce code." });
                    } catch (e: any) {
                      toast({
                        title: "Code admin invalide",
                        description: e?.message || String(e),
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={!adminToken.trim()}
                >
                  Tester le code
                </Button>
              </div>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
