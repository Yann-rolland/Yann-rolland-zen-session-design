import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from "react";
import { User } from "@/types";
import { supabase } from "@/lib/supabaseClient";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  requestLoginCode: (email: string) => Promise<void>;
  verifyLoginCode: (email: string, code: string) => Promise<void>;
  logout: () => void;
  signup: (email: string, password: string, name?: string) => Promise<{ needsEmailConfirmation: boolean }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const adminEmails = useMemo(() => {
    const raw = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? "";
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  const inviteOnly = (import.meta.env.VITE_INVITE_ONLY as string | undefined)?.toLowerCase() === "true";
  const allowedEmails = useMemo(() => {
    const raw = (import.meta.env.VITE_ALLOWED_EMAILS as string | undefined) ?? "";
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  const isAdmin = !!user?.email && adminEmails.includes(user.email.toLowerCase());

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const su = data.session?.user;
        if (!mounted) return;
        if (su?.email) {
          setUser({
            id: su.id,
            email: su.email,
            name: (su.user_metadata?.name as string | undefined) ?? su.email.split("@")[0],
          });
        } else {
          setUser(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const su = session?.user;
      if (!mounted) return;
      if (su?.email) {
        setUser({
          id: su.id,
          email: su.email,
          name: (su.user_metadata?.name as string | undefined) ?? su.email.split("@")[0],
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      if (inviteOnly && allowedEmails.length > 0 && !allowedEmails.includes(email.trim().toLowerCase())) {
        throw new Error("Accès sur invitation: cet email n'est pas autorisé.");
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const su = data.user;
      if (su?.email) {
        setUser({
          id: su.id,
          email: su.email,
          name: (su.user_metadata?.name as string | undefined) ?? su.email.split("@")[0],
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [allowedEmails, inviteOnly]);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    setUser(null);
  }, []);

  const requestLoginCode = useCallback(async (email: string) => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (inviteOnly && allowedEmails.length > 0 && !allowedEmails.includes(normalizedEmail)) {
        throw new Error("Accès sur invitation: cet email n'est pas autorisé.");
      }
      const emailRedirectTo = `${window.location.origin}/login`;
      // Sends an email OTP if enabled in Supabase; otherwise sends a magic link.
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo,
        },
      });
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, [allowedEmails, inviteOnly]);

  const verifyLoginCode = useCallback(async (email: string, code: string) => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (inviteOnly && allowedEmails.length > 0 && !allowedEmails.includes(normalizedEmail)) {
        throw new Error("Accès sur invitation: cet email n'est pas autorisé.");
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      const su = data.session?.user;
      if (su?.email) {
        setUser({
          id: su.id,
          email: su.email,
          name: (su.user_metadata?.name as string | undefined) ?? su.email.split("@")[0],
        });
      } else {
        // If session isn't returned, fetch user as a fallback
        const me = await supabase.auth.getUser();
        const u = me.data.user;
        if (u?.email) {
          setUser({
            id: u.id,
            email: u.email,
            name: (u.user_metadata?.name as string | undefined) ?? u.email.split("@")[0],
          });
        } else {
          throw new Error("Connexion impossible (session manquante).");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [allowedEmails, inviteOnly]);

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (inviteOnly && allowedEmails.length > 0 && !allowedEmails.includes(normalizedEmail)) {
        throw new Error("Accès sur invitation: cet email n'est pas autorisé.");
      }

      // Ensure email confirmation link redirects to the current app domain (Vercel/prod/preview),
      // otherwise Supabase may use its "Site URL" (often misconfigured) leading to "site inaccessible".
      const emailRedirectTo = `${window.location.origin}/login`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name?.trim() || undefined },
          emailRedirectTo,
        },
      });
      if (error) throw error;

      // If email confirmations are enabled, Supabase will return a user but NO session.
      // In that case, the user must confirm email then log in.
      const sessionUser = data.session?.user;
      if (sessionUser?.email) {
        setUser({
          id: sessionUser.id,
          email: sessionUser.email,
          name: (sessionUser.user_metadata?.name as string | undefined) ?? sessionUser.email.split("@")[0],
        });
        return { needsEmailConfirmation: false };
      }
      // Not authenticated yet (email confirmation flow)
      setUser(null);
      return { needsEmailConfirmation: true };
    } finally {
      setIsLoading(false);
    }
  }, [allowedEmails, inviteOnly]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isAdmin,
      isLoading,
      login,
      requestLoginCode,
      verifyLoginCode,
      logout,
      signup,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
