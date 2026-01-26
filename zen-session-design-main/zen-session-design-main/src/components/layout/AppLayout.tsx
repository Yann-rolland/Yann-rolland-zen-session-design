import * as React from "react";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { LoadingOverlay } from "@/components/ui/LoadingSpinner";

interface AppLayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function AppLayout({ children, requireAuth = true }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const { settings } = useApp();
  const location = useLocation();

  if (isLoading) {
    return <LoadingOverlay message="Chargement..." />;
  }

  // Redirect to login if not authenticated
  if (requireAuth && !isAuthenticated && location.pathname !== "/login" && location.pathname !== "/reset-password") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className={cn(
      "min-h-screen bg-background",
      settings.zenMode && "zen-mode"
    )}>
      {/* Background gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: settings.zenMode 
            ? "var(--gradient-zen)"
            : "radial-gradient(ellipse at 50% 0%, hsl(240 20% 8%) 0%, hsl(240 15% 4%) 50%)"
        }}
      />

      {/* Desktop Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />

      {/* Main content */}
      <main
        className={cn(
          "relative min-h-screen transition-all duration-300",
          "pb-20 md:pb-0", // Bottom padding for mobile nav
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        )}
      >
        <div className="container max-w-4xl py-6 px-4 md:py-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
}
