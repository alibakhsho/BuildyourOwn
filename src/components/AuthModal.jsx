/* =========================================================================
   AuthModal + AccountButton — the sign-up / sign-in surface.

   Guest-first, deliberately: signing in is never required to use the app.
   When Supabase isn't configured (`enabled` false) the whole surface renders
   nothing, so a local build is unchanged.

   The whole account lifecycle lives in this file:
     AccountButton  header / landing button
     AuthModal      sign up (optionally for a Tradie / Builder trial), sign in,
                    forgotten password — and, when signed in, the account
                    panel: profile, change password, delete account
     Onboarding     "how will you use BYO" after a plain sign-up
     AuthLinks      what an emailed link did: "set a new password" after a
                    reset link, or why a link didn't work
   ========================================================================= */
import { useEffect, useState } from "react";
import { SITE_URL } from "../lib/public-config.js";
import { createPortal } from "react-dom";
import { colors as TOKENS } from "../design/system.js";
import { useAuth, SEGMENTS, TIERS } from "../state/auth.jsx";
import { PLANS, SEGMENT_PLAN, TRIAL_DAYS } from "../lib/entitlements.js";
import { canPayHere, openBillingPortal } from "../lib/billing.js";

const MIN_PASSWORD = 6;   // Supabase Auth's minimum; keep in step with the dashboard setting

/* tone="dark" is for the landing hero, where the normal ghost button would be
   dark-on-dark. onSignedIn fires once a sign-in/up started here succeeds, and
   is also what a signed-in user's button does there (go to the dashboard). */
export function AccountButton({ tone, onSignedIn } = {}) {
  const { enabled, user, profile, tier, can } = useAuth();
  const [open, setOpenRaw] = useState(null);      // null | "signin" | "signup"
  // "armed" outlives the modal: a successful sign-up closes the modal itself
  // before the session arrives, and we still want to land on the dashboard.
  const [armed, setArmed] = useState(false);
  const setOpen = (m) => { setOpenRaw(m); if (m && !user) setArmed(true); };
  useEffect(() => {
    if (armed && user && onSignedIn) { setArmed(false); setOpenRaw(null); onSignedIn(); }
  }, [armed, user, onSignedIn]);
  if (!enabled) return null;                      // no Supabase → no account UI

  const tierLabel = `${TIERS[tier]?.label ?? "Homeowner"}${can.onTrial ? " trial" : ""}`;
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

/* intent: "tradie" | "builder" when opened from a plan card. Sign-up then
   records that segment (which starts the trial in the database), and
   sign-in switches the account to it once the profile loads. */
export default function AuthModal({ onClose, initialMode = "signup", intent = null }) {
  const { user, signIn, signUp, signInWithGoogle, resetPassword, choosePlan } = useAuth();
  const [mode, setMode] = useState(initialMode);  // signup | signin | reset | done
  const [form, setForm] = useState({ email: "", password: "", fullName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const planId = intent ? SEGMENT_PLAN[intent] : null;
  const planLabel = planId ? PLANS[planId].label : null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const go = (m) => { setMode(m); setError(""); setNotice(""); };

  const run = async (fn) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (e) { setError(friendly(e.message)); }
    finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    if (mode === "signin") return run(async () => {
      if (intent) choosePlan(intent);
      await signIn(form);
      onClose();
    });
    if (mode === "reset") return run(async () => {
      await resetPassword(form.email);
      setNotice("If there's an account for that email, a reset link is on its way. Open it on this device.");
    });
    return run(async () => {
      const { needsEmailConfirmation } = await signUp({ ...form, segment: intent || null });
      if (needsEmailConfirmation) go("done");
      else onClose();
    });
  };

  // Signed in already → the account panel.
  if (user) return <AccountPanel onClose={onClose} />;

  if (mode === "done") {
    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={H2}>Check your email</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft }}>
          We've sent a confirmation link to <strong>{form.email}</strong>. Click it to finish
          creating your account{planLabel ? ` — your ${planLabel} trial starts straight away` : ""}.
        </p>
        <button className="ec-btn ec-btn-hivis" style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => go("signin")}>Back to sign in</button>
      </Backdrop>
    );
  }

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  const title = isReset ? "Reset your password"
    : isSignup ? (planLabel ? `Start your ${TRIAL_DAYS}-day ${planLabel} trial` : "Save your work")
    : "Welcome back";
  const lead = isReset
    ? "We'll email you a link to set a new one."
    : isSignup
    ? (planLabel
      ? `Everything in ${planLabel}, free for ${TRIAL_DAYS} days — no card needed. After that you stay on the free Homeowner plan unless you subscribe, and nothing you've built is lost.`
      : "Free for homeowners. Your projects follow you to any device — nothing you've built is lost.")
    : planLabel ? `Sign in to continue to ${planLabel}.` : "Sign in to pick up where you left off.";

  return (
    <Backdrop onClose={onClose}>
      {planLabel && !isReset && <div className="ec-eyebrow" style={{ marginBottom: 6 }}>{planLabel} plan</div>}
      <h2 className="ec-display" style={H2}>{title}</h2>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: TOKENS.steel, marginBottom: 16 }}>{lead}</p>

      {/* Above both ways in, so it covers Google sign-in too. Agreeing is to
          the Terms; the Privacy Policy is information, not a consent. */}
      {!isReset && (
        <p style={{ fontSize: 11, lineHeight: 1.5, color: TOKENS.steel, margin: "-6px 0 14px" }}>
          By {GOOGLE_ENABLED ? "continuing with Google or " : ""}{isSignup ? "creating an account" : "signing in"} you agree to our{" "}
          <a href={`${SITE_URL}/?page=terms`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>Terms of Use</a>.
          Our <a href={`${SITE_URL}/?page=privacy`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>Privacy Policy</a> explains how we handle your information.
        </p>
      )}

      {!isReset && GOOGLE_ENABLED && (
        <button type="button" className="ec-btn ec-btn-ghost" disabled={busy}
          style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}
          onClick={() => run(async () => { if (intent) choosePlan(intent); await signInWithGoogle(); })}>
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
            <input className="ec-input" type="password" required minLength={MIN_PASSWORD} value={form.password}
              onChange={set("password")} placeholder={`At least ${MIN_PASSWORD} characters`}
              autoComplete={isSignup ? "new-password" : "current-password"} />
          </label>
        )}

        {error && <div className="ec-mono" role="alert" style={MSG(TOKENS.alert)}>{error}</div>}
        {notice && <div className="ec-mono" role="status" style={MSG(TOKENS.ok)}>{notice}</div>}

        <button type="submit" className="ec-btn ec-btn-hivis" disabled={busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
          {busy ? "Working…" : isReset ? "Send reset link" : isSignup ? (planLabel ? "Start free trial" : "Create account") : "Sign in"}
        </button>
      </form>

      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {isSignup ? (
          <button style={LINK} onClick={() => go("signin")}>Already have an account? Sign in</button>
        ) : isReset ? (
          <button style={LINK} onClick={() => go("signin")}>Back to sign in</button>
        ) : (
          <>
            <button style={LINK} onClick={() => go("signup")}>{planLabel ? "New here? Start the free trial" : "Create an account"}</button>
            <button style={LINK} onClick={() => go("reset")}>Forgot password?</button>
          </>
        )}
      </div>
    </Backdrop>
  );
}

/* Supabase's messages are written for developers; reword the common ones. */
function friendly(msg = "") {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match an account. Check them, or reset your password.";
  if (/already registered|already exists/i.test(msg)) return "There's already an account with that email — sign in instead.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — the link is in your inbox.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  if (/should be different/i.test(msg)) return "That's your current password — choose a new one.";
  if (/password should be|weak password/i.test(msg)) return msg.replace(/^.*?password/i, "Password");
  return msg || "Something went wrong. Try again.";
}

/* ---- the signed-in account panel ---------------------------------------- */
function AccountPanel({ onClose }) {
  const { user, profile, can, signOut, updateProfile, updatePassword, deleteAccount } = useAuth();
  const [view, setView] = useState("main");       // main | edit | password | delete
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: profile?.full_name || "",
    company: profile?.company || "",
    segment: profile?.segment || "homeowner",
  });
  const [pw, setPw] = useState({ next: "", again: "" });
  const [confirmText, setConfirmText] = useState("");

  const show = (v) => { setView(v); setError(""); setNotice(""); };
  const run = async (fn) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch (e) { setError(friendly(e.message)); }
    finally { setBusy(false); }
  };
  const setProf = (k) => (e) => setProfileForm((f) => ({ ...f, [k]: e.target.value }));

  const trial = can.trial;
  const planText = `${TIERS[can.tier]?.label ?? "Homeowner"}${can.onTrial ? ` · trial, ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left` : ""}`;

  if (view === "edit") {
    const save = (e) => {
      e.preventDefault();
      run(async () => {
        await updateProfile({ full_name: profileForm.fullName, company: profileForm.company, segment: profileForm.segment });
        show("main");
      });
    };
    const startsTrial = can.trialAvailable && SEGMENT_PLAN[profileForm.segment] !== "free" && profileForm.segment !== profile?.segment;
    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={H2}>Edit profile</h2>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          <label style={LBL}>
            <span className="ec-label">Full name</span>
            <input className="ec-input" value={profileForm.fullName} onChange={setProf("fullName")} placeholder="Jordan Fielding" autoComplete="name" />
          </label>
          <label style={LBL}>
            <span className="ec-label">Company</span>
            <input className="ec-input" value={profileForm.company} onChange={setProf("company")} placeholder="Company name" autoComplete="organization" />
          </label>
          <label style={LBL}>
            <span className="ec-label">Role</span>
            <select className="ec-input" value={profileForm.segment} onChange={setProf("segment")}>
              {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {startsTrial && (
            <div className="ec-mono" style={MSG(TOKENS.ok)}>
              Saving starts your {TRIAL_DAYS}-day {PLANS[SEGMENT_PLAN[profileForm.segment]].label} trial.
            </div>
          )}
          {error && <div className="ec-mono" role="alert" style={MSG(TOKENS.alert)}>{error}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => show("main")} disabled={busy}>Cancel</button>
            <button type="submit" className="ec-btn ec-btn-hivis" style={{ flex: 1, justifyContent: "center" }} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Backdrop>
    );
  }

  if (view === "password") {
    const save = (e) => {
      e.preventDefault();
      if (pw.next !== pw.again) { setError("The two passwords don't match."); return; }
      run(async () => {
        await updatePassword(pw.next);
        setPw({ next: "", again: "" });
        setView("main");
        setNotice("Password changed.");
      });
    };
    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={H2}>Change password</h2>
        <PasswordFields pw={pw} setPw={setPw} onSubmit={save} busy={busy} error={error}
          submitLabel="Change password" onCancel={() => show("main")} />
      </Backdrop>
    );
  }

  if (view === "delete") {
    const ok = confirmText.trim().toUpperCase() === "DELETE";
    return (
      <Backdrop onClose={onClose}>
        <h2 className="ec-display" style={{ ...H2, color: TOKENS.alert }}>Delete your account</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft, margin: "8px 0 12px" }}>
          This permanently deletes your account, every project saved to it in the cloud, and any marketplace profile, listings and photos. It can't be undone.
          {profile?.stripe_customer_id ? " Any subscription is cancelled first, so you won't be charged again. Your paid plan ends now, and the rest of the period isn't refunded unless our Terms or the law say otherwise. To use it until then, cancel under Manage billing and delete later." : ""}
          {" "}Projects saved in this browser stay on this device until you remove them.
        </p>
        <label style={LBL}>
          <span className="ec-label">Type DELETE to confirm</span>
          <input className="ec-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </label>
        {error && <div className="ec-mono" role="alert" style={{ ...MSG(TOKENS.alert), marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => show("main")} disabled={busy}>Keep my account</button>
          <button className="ec-btn" disabled={!ok || busy}
            style={{ flex: 1, justifyContent: "center", background: TOKENS.alert, color: "#fff", borderColor: TOKENS.alert, opacity: ok ? 1 : 0.5 }}
            onClick={() => run(async () => { await deleteAccount(); onClose(); })}>
            {busy ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <h2 className="ec-display" style={H2}>Your account</h2>
      <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 12 }}>{user.email}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
        <Row label="Plan" value={planText} strong />
        {trial && !trial.active && can.paidTier === "free" && (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.steel }}>
            Your {trial.label} trial ended on {trial.endsAt.toLocaleDateString()}.
          </div>
        )}
        {profile?.stripe_customer_id && profile?.billing_status && (
          <Row label="Billing" value={billingText(profile)} alert={profile.billing_status === "past_due"} />
        )}
        <Row label="Name" value={profile?.full_name || "Not set"} />
        <Row label="Company" value={profile?.company || "Not set"} />
        <Row label="Role" value={SEGMENTS.find((s) => s.id === profile?.segment)?.label || "Not set"} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => show("edit")}>Edit profile</button>
          <button className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => show("password")}>Change password</button>
        </div>
      </div>

      {profile?.stripe_customer_id && canPayHere && (
        <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} disabled={busy}
          onClick={() => run(openBillingPortal)}>
          Manage billing · invoices · cancel
        </button>
      )}
      {notice && <div className="ec-mono" role="status" style={{ ...MSG(TOKENS.ok), marginBottom: 10 }}>{notice}</div>}
      {error && <div className="ec-mono" role="alert" style={{ ...MSG(TOKENS.alert), marginBottom: 10 }}>{error}</div>}

      <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center", borderTop: `1px solid ${TOKENS.rule}`, paddingTop: 16, marginTop: 8 }}
        onClick={() => run(async () => { await signOut(); onClose(); })} disabled={busy}>
        Sign out
      </button>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button style={{ ...LINK, color: TOKENS.alert }} onClick={() => show("delete")}>Delete account</button>
      </div>
    </Backdrop>
  );
}

/* One line about the subscription, from the columns the server keeps in
   step with Stripe. */
export function billingText(p) {
  const d = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const every = p.billing_interval === "year" ? "Yearly" : "Monthly";
  if (p.billing_status === "past_due") return "Payment failed — update your card";
  if (p.plan_cancels_at) return `Cancelled · ends ${d(p.plan_cancels_at)}`;
  if (p.billing_status === "trialing" && p.plan_renews_at) return `Trial · first charge ${d(p.plan_renews_at)}`;
  if (["active"].includes(p.billing_status) && p.plan_renews_at) return `${every} · renews ${d(p.plan_renews_at)}`;
  if (p.billing_status === "canceled") return "No active subscription";
  return p.billing_status;
}

function Row({ label, value, strong, alert }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{label}</div>
      <div className="ec-mono" style={{ fontSize: 12, fontWeight: strong || alert ? 700 : 400, textAlign: "right", color: alert ? TOKENS.alert : undefined }}>{value}</div>
    </div>
  );
}

function PasswordFields({ pw, setPw, onSubmit, busy, error, submitLabel, onCancel }) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <label style={LBL}>
        <span className="ec-label">New password</span>
        <input className="ec-input" type="password" required minLength={MIN_PASSWORD} value={pw.next} autoFocus
          onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" />
      </label>
      <label style={LBL}>
        <span className="ec-label">Type it again</span>
        <input className="ec-input" type="password" required minLength={MIN_PASSWORD} value={pw.again}
          onChange={(e) => setPw((p) => ({ ...p, again: e.target.value }))} autoComplete="new-password" />
      </label>
      {error && <div className="ec-mono" role="alert" style={MSG(TOKENS.alert)}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {onCancel && <button type="button" className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="ec-btn ec-btn-hivis" style={{ flex: 1, justifyContent: "center" }} disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

/* =========================================================================
   AuthLinks — mounted once at the app root, on every screen (the landing
   page included, which is where emailed links land).
   - After a password-reset link: the user is signed in with a recovery
     session and must choose a new password. Shown until they do or skip.
   - After a link that didn't work: say why and offer the next step.
   ========================================================================= */
export function AuthLinks() {
  const { enabled, recovering, linkProblem, finishRecovery, clearLinkProblem, updatePassword } = useAuth();
  const [pw, setPw] = useState({ next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [next, setNext] = useState(null);         // AuthModal mode after a dead link

  if (!enabled) return null;

  if (next) return <AuthModal initialMode={next} onClose={() => setNext(null)} />;

  if (done) {
    return (
      <Backdrop onClose={() => setDone(false)}>
        <h2 className="ec-display" style={H2}>Password updated</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft }}>You're signed in. Use the new password next time.</p>
        <button className="ec-btn ec-btn-hivis" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={() => setDone(false)}>Continue</button>
      </Backdrop>
    );
  }

  if (recovering) {
    const save = async (e) => {
      e.preventDefault();
      if (pw.next !== pw.again) { setError("The two passwords don't match."); return; }
      setBusy(true); setError("");
      try { await updatePassword(pw.next); setPw({ next: "", again: "" }); setDone(true); }
      catch (err) { setError(friendly(err.message)); }
      finally { setBusy(false); }
    };
    return (
      <Backdrop onClose={finishRecovery}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Password reset</div>
        <h2 className="ec-display" style={H2}>Set a new password</h2>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: TOKENS.steel, margin: 0 }}>You're signed in from the reset link. Choose a new password to finish.</p>
        <PasswordFields pw={pw} setPw={setPw} onSubmit={save} busy={busy} error={error} submitLabel="Save new password" />
      </Backdrop>
    );
  }

  if (linkProblem) {
    const then = (mode) => { clearLinkProblem(); setNext(mode); };
    return (
      <Backdrop onClose={clearLinkProblem}>
        <h2 className="ec-display" style={H2}>That link didn't sign you in</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft }}>{linkProblem}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="ec-btn ec-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => then("reset")}>Send a new reset link</button>
          <button className="ec-btn ec-btn-hivis" style={{ flex: 1, justifyContent: "center" }} onClick={() => then("signin")}>Sign in</button>
        </div>
      </Backdrop>
    );
  }

  return null;
}

/* =========================================================================
   Onboarding — the "who are you / how will you use BYO" page, shown once
   after a plain signup (one from a plan card already knows the answer).
   Picking Tradie or Builder starts that plan's free trial — the copy says so
   only while this account can still get one.
   ========================================================================= */
const SEGMENT_DETAIL = {
  homeowner: {
    blurb: "Planning a build or renovation. Price it yourself before you talk to a builder — see exactly where the money goes and walk in informed.",
    plan: "Free: estimates, 3D and full cost breakdowns.",
  },
  tradie: {
    blurb: "Sole trader or subbie. Quote houses and any custom job from your own rates, and send a clean priced quote — with the AI crew on hand.",
    plan: "Tradie plan: custom quotes, AI, unlimited projects.",
  },
  builder: {
    blurb: "Running jobs, small to large. Multi-dwelling and developer quoting, then run the build from Site Office — budgets, purchase orders and progress claims.",
    plan: "Builder plan: everything, plus Site Office. Xero / MYOB coming soon.",
  },
};

export function Onboarding() {
  const { enabled, user, profile, can, updateProfile } = useAuth();
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
          Pick the one that fits best — it sets up what you see first.
          {can.trialAvailable ? ` Tradie and Builder start with a ${TRIAL_DAYS}-day free trial, no card needed.` : ""} You can change this any time from your account.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {SEGMENTS.map((s) => {
            const d = SEGMENT_DETAIL[s.id] || {};
            const trial = can.trialAvailable && SEGMENT_PLAN[s.id] !== "free";
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
                <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.04em", color: TOKENS.steel, marginTop: 2 }}>
                  {d.plan}{trial ? ` ${TRIAL_DAYS} days free.` : ""}
                </span>
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
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 230, display: "grid", placeItems: "center",
        background: "rgba(10,12,16,0.55)", backdropFilter: "blur(3px)", padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: "100%", maxWidth: 400, background: TOKENS.card, color: TOKENS.ink, border: `1px solid ${TOKENS.rule}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)", padding: "26px 26px 22px", position: "relative", margin: "auto" }}>
        <button onClick={onClose} aria-label="Close" className="ec-mono"
          style={{ position: "absolute", top: 12, right: 14, border: "none", background: "none",
            cursor: "pointer", fontSize: 16, color: TOKENS.steel, lineHeight: 1 }}>×</button>
        {children}
      </div>
    </div>,
    document.body
  );
}
