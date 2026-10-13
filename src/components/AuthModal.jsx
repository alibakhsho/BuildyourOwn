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
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { colors as TOKENS } from "../design/system.js";
import { useAuth, SEGMENTS, TIERS } from "../state/auth.jsx";

/* tone="dark" is for the landing hero, where the normal ghost button would be
   dark-on-dark. onSignedIn fires once a sign-in/up started here succeeds, and
   is also what a signed-in user's button does there (go to the dashboard). */
export function AccountButton({ tone, onSignedIn } = {}) {
  const { enabled, user, profile, tier } = useAuth();
  const [open, setOpenRaw] = useState(null);      // null | "signin" | "signup"
  // "armed" outlives the modal: a successful sign-up closes the modal itself
  // before the session arrives, and we still want to land on the dashboard.
  const [armed, setArmed] = useState(false);
  const setOpen = (m) => { setOpenRaw(m); if (m && !user) setArmed(true); };
  useEffect(() => {
    if (armed && user && onSignedIn) { setArmed(false); setOpenRaw(null); onSignedIn(); }
  }, [armed, user, onSignedIn]);
  if (!enabled) return null;                      // no Supabase → no account UI

  const tierLabel = TIERS[tier]?.label ?? "Homeowner";
  const ghost = tone === "dark"
    ? { fontSize: 11, color: "#fff", borderColor: "rgba(255,255,255,0.45)", background: "rgba(5,7,11,0.35)" }
    : { fontSize: 11 };

  return (
    <>
      {user ? (
        <button className="ec-btn ec-btn-ghost" onClick={() => (onSignedIn ? onSignedIn() : setOpen("signin"))} style={ghost}>
          {onSignedIn ? "Your dashboard →" : `${profile?.full_name || user.email?.split("@")[0]} · ${tierLabel}`}
        </button>
      ) : (
        <>
          <button className="ec-btn ec-btn-ghost" onClick={() => setOpen("signin")} style={ghost}>Sign in</button>
          <button className="ec-btn ec-btn-hivis" onClick={() => setOpen("signup")} style={{ fontSize: 11 }}>Create account</button>
        </>
      )}
      {open && <AuthModal initialMode={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/* Google sign-in needs the provider switched on in Supabase (Authentication →
   Providers → Google, with a Google Cloud OAuth client). Until it is, the
   button would only produce an "Unsupported provider" error, so it stays
   hidden unless VITE_AUTH_GOOGLE=1. */
const GOOGLE_ENABLED = import.meta.env?.VITE_AUTH_GOOGLE === "1";

export default function AuthModal({ onClose, initialMode = "signup" }) {
  const { user, profile, signIn, signUp, signInWithGoogle, signOut, resetPassword, updateProfile } = useAuth();
  const [mode, setMode] = useState(initialMode);  // signup | signin | reset | done
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

  // Profile-editing state lives up here, not inside the `if (user)` branch:
  // hooks must run in the same order on every render, and the modal flips
  // between signed-out and signed-in while open.
  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: profile?.full_name || "",
    company: profile?.company || "",
    segment: profile?.segment || "homeowner",
  });

  // Signed in already → a compact account panel with profile editing.
  if (user) {

    const setProf = (k) => (e) => setProfileForm((f) => ({ ...f, [k]: e.target.value }));

    const save = async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        await updateProfile({
          full_name: profileForm.fullName,
          company: profileForm.company,
          segment: profileForm.segment,
        });
        setEditing(false);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    };

    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={H2}>Your account</h2>
        <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 12 }}>{user.email}</div>
        
        {!editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>Plan</div>
              <div className="ec-mono" style={{ fontSize: 12, fontWeight: 700 }}>{TIERS[profile?.tier ?? "free"]?.label ?? "Homeowner"}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>Name</div>
              <div className="ec-mono" style={{ fontSize: 12 }}>{profile?.full_name || "Not set"}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>Company</div>
              <div className="ec-mono" style={{ fontSize: 12 }}>{profile?.company || "Not set"}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>Role</div>
              <div className="ec-mono" style={{ fontSize: 12 }}>{SEGMENTS.find(s => s.id === profile?.segment)?.label || "Homeowner"}</div>
            </div>
            <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => setEditing(true)}>
              Edit profile
            </button>
          </div>
        ) : (
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            <label style={LBL}>
              <span className="ec-label">Full Name</span>
              <input className="ec-input" value={profileForm.fullName} onChange={setProf("fullName")} placeholder="Jordan Fielding" />
            </label>
            <label style={LBL}>
              <span className="ec-label">Company</span>
              <input className="ec-input" value={profileForm.company} onChange={setProf("company")} placeholder="Company Name" />
            </label>
            <label style={LBL}>
              <span className="ec-label">Role</span>
              <select className="ec-input" value={profileForm.segment} onChange={setProf("segment")}>
                {SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="ec-btn ec-btn-hivis" style={{ flex: 1, justifyContent: "center" }} disabled={busy}>Save</button>
            </div>
          </form>
        )}

        {error && <div className="ec-mono" style={MSG(TOKENS.alert)}>{error}</div>}
        
        <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center", borderTop: `1px solid ${TOKENS.rule}`, paddingTop: 16, marginTop: 8 }}
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

      {!isReset && GOOGLE_ENABLED && (
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
    plan: "Projects, 3D and full cost breakdowns.",
  },
  tradie: {
    blurb: "Sole trader or subbie. Quote jobs fast from your own rates, send a clean priced quote, and save presets for the jobs you do again and again.",
    plan: "Unlimited quotes, your own rates, saved presets.",
  },
  builder: {
    blurb: "Running jobs, small to large. Estimate, quote, then manage the build — budgets, purchase orders and progress claims — plus high-rise cost planning and custom rate cards when you need them.",
    plan: "The full management side, Xero / MYOB, and high-rise cost planning.",
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

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "grid", placeItems: "center",
      background: "rgba(10,12,16,0.6)", backdropFilter: "blur(4px)", padding: 20, overflowY: "auto" }}>
      <div role="dialog" aria-modal="true"
        style={{ width: "100%", maxWidth: 640, background: TOKENS.card, border: `1px solid ${TOKENS.rule}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)", padding: "30px 30px 24px", margin: "auto" }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</div>
        <h2 className="ec-display" style={{ fontSize: 24, margin: "0 0 6px" }}>How will you use BuildYourOwn?</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: TOKENS.steel, marginBottom: 18, maxWidth: "62ch" }}>
          Pick the one that fits best — it tailors what you see first. You can change this any time
          from your account.
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
    </div>,
    document.body
  );
}

/* ---- presentation helpers ---- */
const H2 = { fontSize: 22, margin: "0 0 6px" };
const LBL = { display: "flex", flexDirection: "column", gap: 4 };
const LINK = { border: "none", background: "none", color: TOKENS.steel, cursor: "pointer", textDecoration: "underline", fontSize: 11, fontFamily: "inherit" };
const MSG = (c) => ({ fontSize: 11, lineHeight: 1.4, color: c, padding: "8px 10px", border: `1px solid ${c}`, background: "transparent" });

/* Portalled to <body>: the sticky header uses backdrop-filter, which makes
   it the containing block for position:fixed — a modal opened from the
   header would otherwise be clipped to the header strip. */
function Backdrop({ children, onClose }) {
  return createPortal(
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
    </div>,
    document.body
  );
}
