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
  const [form, setForm] = useState({ email: "", password: "", fullName: "", segment: "homeowner" });
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

        {isSignup && (
          <label style={LBL}>
            <span className="ec-label">What best describes you?</span>
            <select className="ec-select" value={form.segment} onChange={set("segment")} style={{ width: "100%" }}>
              {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.hint}</option>)}
            </select>
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
