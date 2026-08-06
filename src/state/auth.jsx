/* =========================================================================
   MODULE: state/auth.jsx
   Session + profile state for the whole app.

   Deliberately degrades to a no-op when Supabase env vars are absent:
   `enabled` is false, `user` is null, and every screen behaves exactly as
   it does today on localStorage. Nothing in the estimator is gated behind
   sign-in — accounts exist so work can follow you between devices and so a
   subscription tier has somewhere to live, not to put a wall in front of
   the product.
   ========================================================================= */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, isAuthConfigured, redirectTo } from "../lib/supabase.js";

const AuthCtx = createContext(null);

/* Plan entitlements. The server is the authority on what an account may do
   — this table is only for rendering the UI (showing caps, disabling
   buttons). Never let it be the sole gate on anything that costs money. */
export const TIERS = {
  free:       { label: "Homeowner",  price: 0,   projects: 3,        planReads: 2,   aiMessages: 20 },
  pro:        { label: "Tradie",     price: 49,  projects: Infinity, planReads: 25,  aiMessages: Infinity },
  business:   { label: "Builder",    price: 149, projects: Infinity, planReads: 100, aiMessages: Infinity },
  enterprise: { label: "Developer",  price: 599, projects: Infinity, planReads: Infinity, aiMessages: Infinity },
};

export const SEGMENTS = [
  { id: "homeowner", label: "Homeowner", hint: "Planning a build or renovation" },
  { id: "tradie",    label: "Tradie",    hint: "Sole trader or subcontractor" },
  { id: "builder",   label: "Builder",   hint: "Running multiple jobs" },
  { id: "developer", label: "Developer", hint: "Volume residential or commercial" },
];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  // `loading` starts true only when auth is actually configured, so the
  // unconfigured case never shows a spinner that would never resolve.
  const [loading, setLoading] = useState(isAuthConfigured);

  useEffect(() => {
    if (!isAuthConfigured) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next ?? null);
      setLoading(false);
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  /* Load the profile row whenever the signed-in user changes. The row is
     created by the on_auth_user_created trigger, so it should always
     exist; if it doesn't we leave profile null rather than inventing a
     tier, because guessing "free" here could mask a real failure. */
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!isAuthConfigured || !userId) { setProfile(null); return; }
    let alive = true;
    supabase
      .from("profiles")
      .select("id, email, full_name, company, segment, tier, plan_reads_used, period_started_at")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error("Couldn't load profile:", error.message); return; }
        setProfile(data ?? null);
      });
    return () => { alive = false; };
  }, [userId]);

  const signUp = useCallback(async ({ email, password, fullName, segment }) => {
    if (!isAuthConfigured) throw new Error("Sign-in isn't configured yet.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // These land in raw_user_meta_data and are picked up by the signup
        // trigger. They are self-declared and carry no privileges.
        data: { full_name: fullName ?? null, segment: segment ?? null },
        emailRedirectTo: redirectTo(),
      },
    });
    if (error) throw new Error(error.message);
    // With email confirmation on, there is a user but no session yet.
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    if (!isAuthConfigured) throw new Error("Sign-in isn't configured yet.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isAuthConfigured) throw new Error("Sign-in isn't configured yet.");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (!isAuthConfigured) return;
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!isAuthConfigured) throw new Error("Sign-in isn't configured yet.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo(),
    });
    if (error) throw new Error(error.message);
  }, []);

  /* Only the columns the RLS grant actually allows. Attempting to write
     `tier` here would fail at the database, which is the point. */
  const updateProfile = useCallback(async (patch) => {
    if (!isAuthConfigured || !userId) throw new Error("Not signed in.");
    const allowed = (({ full_name, company, segment }) => ({ full_name, company, segment }))(patch);
    Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
    const { data, error } = await supabase
      .from("profiles").update(allowed).eq("id", userId).select().maybeSingle();
    if (error) throw new Error(error.message);
    setProfile(data ?? null);
    return data;
  }, [userId]);

  const value = useMemo(() => {
    const tierId = profile?.tier ?? "free";
    return {
      enabled: isAuthConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      tier: tierId,
      limits: TIERS[tierId] ?? TIERS.free,
      signUp, signIn, signInWithGoogle, signOut, resetPassword, updateProfile,
    };
  }, [loading, session, profile, signUp, signIn, signInWithGoogle, signOut, resetPassword, updateProfile]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
