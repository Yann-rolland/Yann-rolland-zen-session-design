import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Clock, Home, Settings, User, MessageCircle, Mic } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

const navItems = [
  { to: "/", icon: Home, label: "Accueil" },
  { to: "/chat", icon: MessageCircle, label: "Chat" },
  { to: "/history", icon: Clock, label: "Historique" },
  { to: "/settings", icon: Settings, label: "Réglages" },
  { to: "/test/elevenlabs", icon: Mic, label: "Test" },
];

export function BottomNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const allNavItems = navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div className="glass-card border-t border-border rounded-none safe-bottom">
        <div className="flex items-center justify-around h-16">
          {allNavItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full py-2",
                  "transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 mb-1 transition-transform duration-200",
                  isActive && "scale-110"
                )} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}
          
          <NavLink
            to={isAuthenticated ? "/account" : "/login"}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-2",
              "transition-all duration-200",
              (location.pathname === "/login" || location.pathname === "/account")
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <User className={cn(
              "w-5 h-5 mb-1 transition-transform duration-200",
              (location.pathname === "/login" || location.pathname === "/account") && "scale-110"
            )} />
            <span className="text-[10px] font-medium">
              {isAuthenticated ? "Compte" : "Connexion"}
            </span>
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
