import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

const DEMO_KEY = "studyspace.demoAccount";

function randomId() {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initialising, setInitialising] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const me = await api.get("/me");
      setProfile(me);
      if (me?.theme) {
        document.documentElement.setAttribute("data-theme", me.theme);
        try {
          localStorage.setItem("studyspace.theme", me.theme);
        } catch {
          /* ignore */
        }
      }
      return me;
    } catch {
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      if (next) {
        loadProfile();
      } else {
        setProfile(null);
      }
      setInitialising(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      if (data.session) loadProfile();
      setInitialising(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback(async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || "Student" } },
    });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  /**
   * One-click demo: creates (first visit) or reuses a private demo account,
   * then seeds the workspace server-side. No signup form for the visitor.
   */
  const startDemo = useCallback(
    async ({ reset = false } = {}) => {
      let account = null;
      try {
        account = JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
      } catch {
        account = null;
      }
      if (!account?.email) {
        account = {
          email: `demo-${randomId()}@studyspace.demo`,
          password: `Demo!${randomId()}${randomId()}`,
        };
        try {
          localStorage.setItem(DEMO_KEY, JSON.stringify(account));
        } catch {
          /* ignore */
        }
      }

      // sign in first (returning demo), otherwise create it
      let signedIn = false;
      try {
        await signIn(account.email, account.password);
        signedIn = true;
      } catch {
        signedIn = false;
      }
      if (!signedIn) {
        try {
          await signUp(account.email, account.password, "Demo Student");
        } catch (err) {
          throw new Error(
            `Could not start the demo: ${err.message}. If email confirmation is enabled in Supabase, disable it (Authentication → Providers → Email) so the demo can sign in automatically.`
          );
        }
        // confirmation may be required — try signing in once anyway
        try {
          await signIn(account.email, account.password);
          signedIn = true;
        } catch {
          throw new Error(
            "Demo account created but sign-in was blocked. Enable email confirmation off in Supabase Auth settings and retry."
          );
        }
      }

      const result = await api.post("/demo/session", { reset });
      await loadProfile();
      return result;
    },
    [signIn, signUp, loadProfile]
  );

  const value = useMemo(
    () => ({
      session,
      profile,
      initialising,
      isAuthenticated: Boolean(session),
      isDemo: Boolean(profile?.email?.endsWith("@studyspace.demo")),
      loadProfile,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      startDemo,
      setProfile,
    }),
    [session, profile, initialising, loadProfile, signUp, signIn, signInWithGoogle, signOut, startDemo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
