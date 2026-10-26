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
import { supabase, isAuthConfigured, redirectTo, authLinkState, onAuthLink, finishRecovery, clearLinkProblem } from "../lib/supabase.js";
import { isNative, openExternal, onAppResume } from "../lib/native.js";
import { startCloudSync, stopCloudSync } from "./cloud-sync.js";
import { deleteAccountOnServer, BillingError } from "../lib/billing.js";
import { PLANS, entitlementsFor, SEGMENT_PLAN, planRank } from "../lib/entitlements.js";

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
  { id: "tradie",    label: "Tradie",    hint: "Sole trader, subcontractor or designer" },
  { id: "builder",   label: "Builder",   hint: "Running jobs, or an architect selling plans & prefab" },
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

  // Password-reset links and failed email links (see lib/supabase.js).
  const [link, setLink] = useState(authLinkState);
  useEffect(() => onAuthLink(setLink), []);

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
      .select("id, email, full_name, company, segment, tier, ai_addon, plan_reads_used, period_started_at, trial_tier, trial_ends_at, stripe_customer_id, billing_status, billing_interval, plan_renews_at, plan_cancels_at")
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

  /* Someone signed in after a password-reset link sets a new one here. */
  const updatePassword = useCallback(async (password) => {
    if (!isAuthConfigured) throw new Error("Sign-in isn't configured yet.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    finishRecovery();
  }, []);

  /* App-store rule: an account you can make, you can delete. The server
     cancels any Stripe subscription first, then deletes the caller's own
     auth user; their profile and cloud projects go with it (on delete
     cascade). Only if the server can't be reached at all — local dev without
     it running — and there's no billing to cancel, the database function is
     called directly. The session is then dead, so only clear it locally. */
  const deleteAccount = useCallback(async () => {
    if (!isAuthConfigured || !userId) throw new Error("Not signed in.");
    try {
      await deleteAccountOnServer();
    } catch (e) {
      if (!(e instanceof BillingError && e.code === "network") || profile?.stripe_customer_id) throw e;
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw new Error(error.message);
    }
    stopCloudSync();
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    setProfile(null);
  }, [userId, profile]);

  /* "Choose Tradie" / "Choose Builder". Saving the segment is what starts a
     trial (database trigger, once per account), so the choice is stored
     until a profile is loaded — straight away when signed in (the returned
     promise resolves with the updated profile), or right after the sign-in it
     prompted. It only ever moves someone UP: a Builder who taps the Tradie
     card isn't switched down. Re-saving the same segment is fine — the
     trigger then starts a trial if the account never had one. */
  const applyPlan = useCallback(async (segment, prof) => {
    if (planRank(SEGMENT_PLAN[segment]) <= planRank(entitlementsFor(prof).tier)) return prof;
    return updateProfile({ segment });
  }, [updateProfile]);
  const [intent, setIntent] = useState(() => {
    try { return sessionStorage.getItem("byo.plan-intent"); } catch { return null; }
  });
  const choosePlan = useCallback(async (segment) => {
    if (!SEGMENT_PLAN[segment]) return null;
    if (userId && profile) return applyPlan(segment, profile);
    try { sessionStorage.setItem("byo.plan-intent", segment); } catch { /* private mode */ }
    setIntent(segment);
    return null;
  }, [userId, profile, applyPlan]);
  useEffect(() => {
    if (!intent || !profile || !userId) return;
    try { sessionStorage.removeItem("byo.plan-intent"); } catch { /* ignore */ }
    setIntent(null);
    applyPlan(intent, profile).catch((e) => console.error("Couldn't switch plan:", e.message));
  }, [intent, profile, userId, applyPlan]);

  const value = useMemo(() => {
    const can = isAuthConfigured ? entitlementsFor(session ? profile : null) : entitlementsFor({ tier: "enterprise" });
    // The plan in effect right now — a trial counts.
    const tierId = can.tier;
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
      can,
      trial: can.trial,
      // Email-link outcomes: show "set a new password" / explain a dead link.
      recovering: link.recovering && !!session,
      linkProblem: link.problem,
      finishRecovery, clearLinkProblem,
      pendingPlan: intent,
      signUp, signIn, signInWithGoogle, signOut, resetPassword, updateProfile, refreshProfile,
      updatePassword, deleteAccount, choosePlan,
    };
  }, [loading, session, profile, link, intent, signUp, signIn, signInWithGoogle, signOut, resetPassword, updateProfile, refreshProfile, updatePassword, deleteAccount, choosePlan]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
