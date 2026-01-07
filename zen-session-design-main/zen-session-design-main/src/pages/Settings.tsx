import * as React from "react";
import { useApp } from "@/contexts/AppContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SessionConfigPanel } from "@/components/session/SessionConfig";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressionTab } from "@/components/settings/ProgressionTab";
import { WellBeingTab } from "@/components/settings/WellBeingTab";
import { Moon, Eye, Settings as SettingsIcon, Volume2, Bell, Zap } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
  const { settings, updateSettings, defaultConfig, updateDefaultConfig } = useApp();

  return (
    <div className="space-y-6 fade-in">
      <h1 className="text-2xl font-bold">Réglages</h1>

      <Tabs defaultValue="settings">
        <TabsList className="w-full justify-between">
          <TabsTrigger value="settings" className="flex-1 justify-center">
            Paramètres
          </TabsTrigger>
          <TabsTrigger value="progress" className="flex-1 justify-center">
            Progression
          </TabsTrigger>
          <TabsTrigger value="wellbeing" className="flex-1 justify-center">
            Bien-être
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
      </Tabs>
    </div>
  );
}
