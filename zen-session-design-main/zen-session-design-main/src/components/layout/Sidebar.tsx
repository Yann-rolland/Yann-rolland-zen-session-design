import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import {
  Home,
  Clock,
  Settings,
  LogOut,
  User,
  Sparkles,
  Moon,
  ChevronLeft,
  ChevronRight,
  Shield,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: "/", icon: Home, label: "Accueil" },
  { to: "/chat", icon: MessageCircle, label: "Chat" },
  { to: "/history", icon: Clock, label: "Historique" },
  { to: "/settings", icon: Settings, label: "Réglages" },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { settings, updateSettings } = useApp();

  // Always show Admin entry. Actual access is protected by the code (x-admin-token) on the backend.
  // This avoids a dead-end where an admin cannot reach the page to enter the code the first time.
  const allNavItems = [...navItems, { to: "/admin/settings", icon: Shield, label: "Admin" }];

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out",
        "bg-sidebar border-r border-sidebar-border",
        "hidden md:flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-sidebar-border",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">MaÏa</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {allNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                "hover:bg-sidebar-accent text-sidebar-foreground",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 shrink-0",
                isActive && "text-primary"
              )} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.to} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      {/* Zen Mode Toggle */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={() => updateSettings({ zenMode: !settings.zenMode })}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200",
            "hover:bg-sidebar-accent text-sidebar-foreground",
            settings.zenMode && "bg-accent/20 text-accent",
            collapsed && "justify-center px-2"
          )}
        >
          <Moon className={cn(
            "w-5 h-5 shrink-0",
            settings.zenMode && "text-accent"
          )} />
          {!collapsed && <span>Mode Zen</span>}
        </button>
      </div>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        {user ? (
          <div className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center"
          )}>
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                <button
                  onClick={logout}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Déconnexion
                </button>
              </div>
            )}
            {collapsed && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button onClick={logout} className="sr-only">
                    Déconnexion
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Déconnexion</TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          <NavLink
            to="/login"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
              "hover:bg-sidebar-accent text-sidebar-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <User className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Connexion</span>}
          </NavLink>
        )}
      </div>
    </aside>
  );
}
