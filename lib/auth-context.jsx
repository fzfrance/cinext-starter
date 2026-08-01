"use client";

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------
// This app is entirely client-rendered (no @supabase/ssr / middleware), so
// session state just lives in the browser client's localStorage and is
// exposed here via React context. useAuth() re-renders whenever sign-in/out
// happens anywhere in the tree.

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase fires this on plenty of no-op events too (token refresh,
      // tab-focus/visibility re-checks) — each one hands back a brand new
      // user object even when the signed-in user hasn't actually changed.
      // Every page in this app keys a data-fetch useEffect off `user`
      // itself, so a fresh reference here means the whole app refetches
      // everywhere, on every tab switch — reusing the previous object when
      // the id hasn't changed lets React bail out of re-rendering (and
      // every downstream effect) instead of treating it as a real change.
      setUser((prev) => {
        const next = session?.user ?? null;
        return prev?.id === next?.id ? prev : next;
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
