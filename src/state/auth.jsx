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
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import { supabase, isAuthConfigured, redirectTo } from "../lib/supabase.js";
import { isNative, openExternal, onAppResume } from "../lib/native.js";
import { startCloudSync, stopCloudSync } from "./cloud-sync.js";
import { PLANS, entitlementsFor } from "../lib/entitlements.js";

const AuthCtx = createContext(null);

/* Plans and what they unlock live in lib/entitlements.js, shared with the
   AI routes so the server enforces exactly what the UI shows. TIERS is kept
   as the label/limit table older screens read. */
export const TIERS = Object.fromEntries(Object.entries(PLANS).map(([id, p]) => [id,
  { label: p.label, price: p.price, projects: p.projects, planReads: p.planReads, aiMessages: p.ai ? Infinity : 0 }]));

/* Three audiences for now. "developer" stays a valid value in the database
   enum for the future, but it isn't offered at signup yet — its heavier tools
   (high-rise, volume) are folded into Builder until there's a reason to
   target developers directly. */
export const SEGMENTS = [
  { id: "homeowner", label: "Homeowner", hint: "Planning a build or renovation" },
  { id: "tradie",    label: "Tradie",    hint: "Sole trader or subcontractor" },
  { id: "builder",   label: "Builder",   hint: "Running jobs, small to large" },
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

  // Mirror local projects to the account while signed in.
  useEffect(() => {
    if (!isAuthConfigured) return;
    if (userId) startCloudSync(userId); else stopCloudSync();
  }, [userId]);

  /* The plan can change server-side at any time (a payment, a cancellation,
     an AI plan read using up the allowance), so the profile is re-read when
     the user comes back to the tab or the app, and on demand. */
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const refreshProfile = useCallback(async () => {
    const id = userIdRef.current;
    if (!isAuthConfigured || !id) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, company, segment, tier, ai_addon, plan_reads_used, period_started_at, stripe_customer_id")
      .eq("id", id)
      .maybeSingle();
    if (userIdRef.current !== id) return null;            // signed out / switched meanwhile
    if (error) { console.error("Couldn't load profile:", error.message); return null; }
    setProfile(data ?? null);
    return data ?? null;
  }, []);

  useEffect(() => {
    if (!isAuthConfigured || !userId) { setProfile(null); return; }
    refreshProfile();
    let last = Date.now();
    const maybe = () => { if (Date.now() - last > 3000) { last = Date.now(); refreshProfile(); } };
    const onVis = () => { if (document.visibilityState === "visible") maybe(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", maybe);
    window.addEventListener("byo:profile-stale", refreshProfile);
    const offResume = onAppResume(refreshProfile);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", maybe);
      window.removeEventListener("byo:profile-stale", refreshProfile);
      offResume();
    };
  }, [userId, refreshProfile]);

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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // In the app, Google won't sign in inside the webview: get the URL
      // and open it in the system browser; lib/native.js catches the return.
      options: { redirectTo: redirectTo(), skipBrowserRedirect: isNative },
    });
    if (error) throw new Error(error.message);
    if (isNative && data?.url) await openExternal(data.url);
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
      // What this account (or a guest) may use — modes, AI, Site Office.
      // With no accounts configured (local dev) there is nothing to check
      // against — the server skips its check too — so everything is open.
      can: isAuthConfigured ? entitlementsFor(session ? profile : null) : entitlementsFor({ tier: "enterprise" }),
      signUp, signIn, signInWithGoogle, signOut, resetPassword, updateProfile, refreshProfile,
    };
  }, [loading, session, profile, signUp, signIn, signInWithGoogle, signOut, resetPassword, updateProfile, refreshProfile]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
