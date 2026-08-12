/* =========================================================================
   AuthModal + AccountButton — the sign-up / sign-in surface.

   The auth BACKEND (state/auth.jsx) was already complete; this is the UI that
   was missing, so there was no way for anyone to actually make an account.

   Guest-first, deliberately: signing in is never required to use the app.
   The button reads "Save your work" rather than "Sign in", because that is
   the honest reason a homeowner or tradie would want an account — their
   projects follow them to the next device. When Supabase isn't configured
   (`enabled` false) the whole surface renders nothing, so a local build is
   unchanged.
   ========================================================================= */
import { useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { useAuth, SEGMENTS, TIERS } from "../state/auth.jsx";

export function AccountButton() {
  const { enabled, user, profile, tier } = useAuth();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;                      // no Supabase → no account UI

  const tierLabel = TIERS[tier]?.label ?? "Homeowner";

  return (
    <>
      <button className="ec-btn ec-btn-ghost" onClick={() => setOpen(true)} style={{ fontSize: 11 }}>
        {user ? `${profile?.full_name || user.email?.split("@")[0]} · ${tierLabel}` : "Save your work"}
      </button>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  );
}

export default function AuthModal({ onClose }) {
  const { user, profile, signIn, signUp, signInWithGoogle, signOut, resetPassword } = useAuth();
  const [mode, setMode] = useState("signup");     // signup | signin | reset | done
  // No segment here — it's chosen after signup on the Onboarding page, so the
  // profile is created with segment null and the welcome step knows to ask.
  const [form, setForm] = useState({ email: "", password: "", fullName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const run = async (fn) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (e) { setError(e.message || "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    if (mode === "signin") return run(() => signIn(form));
    if (mode === "reset") return run(async () => {
      await resetPassword(form.email);
      setNotice("Check your email for a reset link.");
    });
    return run(async () => {
      const { needsEmailConfirmation } = await signUp(form);
      if (needsEmailConfirmation) { setMode("done"); }
      else onClose();
    });
  };

  // Signed in already → a compact account panel, not the form.
  if (user) {
    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={H2}>Your account</h2>
        <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 4 }}>{user.email}</div>
        <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 18 }}>
          Plan: {TIERS[profile?.tier ?? "free"]?.label ?? "Homeowner"}
        </div>
        <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center" }}
          onClick={() => run(async () => { await signOut(); onClose(); })} disabled={busy}>
          Sign out
        </button>
      </Backdrop>
    );
  }

  if (mode === "done") {
    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={H2}>Almost there</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft }}>
          We've sent a confirmation link to <strong>{form.email}</strong>. Click it to finish
          creating your account — then sign in here.
        </p>
        <button className="ec-btn ec-btn-hivis" style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => setMode("signin")}>Back to sign in</button>
      </Backdrop>
    );
  }

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  return (
    <Backdrop onClose={onClose}>
      <h2 className="ec-display" style={H2}>
        {isReset ? "Reset your password" : isSignup ? "Save your work" : "Welcome back"}
      </h2>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: TOKENS.steel, marginBottom: 16 }}>
        {isReset
          ? "We'll email you a link to set a new one."
          : isSignup
          ? "Free for homeowners. Your projects follow you to any device — nothing you've built is lost."
          : "Sign in to pick up where you left off."}
      </p>

      {!isReset && (
        <button type="button" className="ec-btn ec-btn-ghost" disabled={busy}
          style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}
          onClick={() => run(signInWithGoogle)}>
          Continue with Google
        </button>
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isSignup && (
          <label style={LBL}>
            <span className="ec-label">Your name</span>
            <input className="ec-input" value={form.fullName} onChange={set("fullName")}
              placeholder="Jordan Fielding" autoComplete="name" />
          </label>
        )}
        <label style={LBL}>
          <span className="ec-label">Email</span>
          <input className="ec-input" type="email" required value={form.email} onChange={set("email")}
            placeholder="you@example.com" autoComplete="email" />
        </label>
        {!isReset && (
          <label style={LBL}>
            <span className="ec-label">Password</span>
            <input className="ec-input" type="password" required minLength={6} value={form.password}
              onChange={set("password")} placeholder="At least 6 characters"
              autoComplete={isSignup ? "new-password" : "current-password"} />
          </label>
        )}

        {/* Segment is asked AFTER signup, on its own page (see Onboarding),
            so the sign-up form stays to the three fields people expect. */}

        {error && <div className="ec-mono" style={MSG(TOKENS.alert)}>{error}</div>}
        {notice && <div className="ec-mono" style={MSG(TOKENS.ok)}>{notice}</div>}

        <button type="submit" className="ec-btn ec-btn-hivis" disabled={busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
          {busy ? "Working…" : isReset ? "Send reset link" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {isSignup ? (
          <button style={LINK} onClick={() => { setMode("signin"); setError(""); }}>Already have an account? Sign in</button>
        ) : isReset ? (
          <button style={LINK} onClick={() => { setMode("signin"); setError(""); }}>Back to sign in</button>
        ) : (
          <>
            <button style={LINK} onClick={() => { setMode("signup"); setError(""); }}>Create an account</button>
            <button style={LINK} onClick={() => { setMode("reset"); setError(""); }}>Forgot password?</button>
          </>
        )}
      </div>
    </Backdrop>
  );
}

/* =========================================================================
   Onboarding — the "who are you / how will you use BYO" page, shown once
   after signup. Kept OUT of the signup form on purpose: three fields to make
   an account, then a friendlier full-page choice that also explains what each
   kind of user gets. Everything is free right now, so this is about routing
   and expectation, not a paywall — the copy says so.

   Shows only when a signed-in user has no segment yet. Picking one writes it
   via updateProfile (segment is a user-writable column) and closes.
   ========================================================================= */
const SEGMENT_DETAIL = {
  homeowner: {
    blurb: "Planning a build or renovation. Price it yourself before you talk to a builder — see exactly where the money goes and walk in informed.",
    plan: "Free — 3 projects and 2 AI plan reads a month.",
  },
  tradie: {
    blurb: "Sole trader or subbie. Quote jobs fast from your own rates, send a clean priced quote, and save presets for the jobs you do again and again.",
    plan: "Free to start · Tradie plan later — unlimited quotes and more AI.",
  },
  builder: {
    blurb: "Running several jobs at once. Estimate, quote, then manage the build — budgets, purchase orders and progress claims in one place.",
    plan: "Free to start · Builder plan later — the full management side and Xero / MYOB.",
  },
  developer: {
    blurb: "Volume residential or commercial. High-rise cost planning, custom rate cards, and API access to run it at scale.",
    plan: "Free to start · Developer plan later — high-rise, API and priority support.",
  },
};

export function Onboarding() {
  const { enabled, user, profile, updateProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only for a signed-in user whose profile exists but has no segment yet.
  const needs = enabled && user && profile && !profile.segment && !dismissed;
  if (!needs) return null;

  const choose = async (segment) => {
    setBusy(true);
    try { await updateProfile({ segment }); setDismissed(true); }
    catch { setDismissed(true); }   // never trap someone on this screen
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "grid", placeItems: "center",
      background: "rgba(10,12,16,0.6)", backdropFilter: "blur(4px)", padding: 20, overflowY: "auto" }}>
      <div role="dialog" aria-modal="true"
        style={{ width: "100%", maxWidth: 640, background: TOKENS.card, border: `1px solid ${TOKENS.rule}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)", padding: "30px 30px 24px", margin: "auto" }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</div>
        <h2 className="ec-display" style={{ fontSize: 24, margin: "0 0 6px" }}>How will you use BuildYourOwn?</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: TOKENS.steel, marginBottom: 18, maxWidth: "62ch" }}>
          Pick the one that fits best — it tailors what you see first. Everything's free while we're
          getting started; you can change this any time from your account.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {SEGMENTS.map((s) => {
            const d = SEGMENT_DETAIL[s.id] || {};
            return (
              <button key={s.id} onClick={() => choose(s.id)} disabled={busy}
                style={{ textAlign: "left", cursor: busy ? "default" : "pointer", background: TOKENS.paperLight,
                  border: `1px solid ${TOKENS.rule}`, borderLeft: `3px solid ${TOKENS.hivis}`, padding: "14px 16px",
                  display: "flex", flexDirection: "column", gap: 6, font: "inherit", color: "inherit",
                  opacity: busy ? 0.6 : 1, transition: "border-color 0.15s" }}
                onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = TOKENS.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.rule; e.currentTarget.style.borderLeftColor = TOKENS.hivis; }}>
                <span className="ec-display" style={{ fontSize: 17 }}>{s.label}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: TOKENS.inkSoft }}>{d.blurb}</span>
                <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.04em", color: TOKENS.steel, marginTop: 2 }}>{d.plan}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button onClick={() => setDismissed(true)} disabled={busy}
            style={{ border: "none", background: "none", color: TOKENS.steel, cursor: "pointer",
              textDecoration: "underline", fontSize: 11, fontFamily: "inherit" }}>
            I'll decide later
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- presentation helpers ---- */
const H2 = { fontSize: 22, margin: "0 0 6px" };
const LBL = { display: "flex", flexDirection: "column", gap: 4 };
const LINK = { border: "none", background: "none", color: TOKENS.steel, cursor: "pointer", textDecoration: "underline", fontSize: 11, fontFamily: "inherit" };
const MSG = (c) => ({ fontSize: 11, lineHeight: 1.4, color: c, padding: "8px 10px", border: `1px solid ${c}`, background: "transparent" });

function Backdrop({ children, onClose }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center",
        background: "rgba(10,12,16,0.55)", backdropFilter: "blur(3px)", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: "100%", maxWidth: 380, background: TOKENS.card, border: `1px solid ${TOKENS.rule}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)", padding: "26px 26px 22px", position: "relative" }}>
        <button onClick={onClose} aria-label="Close" className="ec-mono"
          style={{ position: "absolute", top: 12, right: 14, border: "none", background: "none",
            cursor: "pointer", fontSize: 16, color: TOKENS.steel, lineHeight: 1 }}>×</button>
        {children}
      </div>
    </div>
  );
}
