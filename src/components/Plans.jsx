/* =========================================================================
   Plans — the plan table, used in three places so it can't drift:
     PlanCards     landing-page pricing + inside the upgrade prompt
     UpgradeModal  shown when someone reaches for a feature their plan lacks
     AiUpsell      the AI crew page for a plan without AI

   Everything reads lib/entitlements.js. Billing isn't live yet: a paid plan
   starts its 14-day free trial if the account (or a guest, by signing up)
   can still get one; otherwise the call to action says payment is coming
   rather than showing a dead "Buy" button.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors as TOKENS } from "../design/system.js";
import { PLANS, PUBLIC_PLANS, AI_ADDON, MODE_LABEL, TRIAL_DAYS, planFor } from "../lib/entitlements.js";
import { useAuth } from "../state/auth.jsx";
import AuthModal from "./AuthModal.jsx";

const FEATURES = {
  free:     ["House estimates, priced line by line", "Live 3D model of your build", "Timeline & client-ready quote", "3 projects saved to your account", `AI assistant add-on · A$${AI_ADDON.price}/mo`],
  pro:      ["Everything in Homeowner", "Custom quotes for any job", "AI crew & AI plan reading (25/mo)", "Unlimited projects", "Your own rates"],
  business: ["Everything in Tradie", "Multi-dwelling quoting", "Developer: apartments & towers", "Site Office — jobs, POs, claims", "Xero / MYOB · 100 AI plan reads"],
};

/* The segment that trials each paid plan (see SEGMENT_PLAN). */
export const PLAN_SEGMENT = { pro: "tradie", business: "builder" };

const FEATURE_NAME = {
  ai: "The AI crew",
  siteOffice: "Site Office",
  ...Object.fromEntries(Object.entries(MODE_LABEL).map(([k, v]) => [k, `${v} quoting`])),
};

/* current: the plan in effect (a trial counts) · onTrial: it's a trial ·
   trialAvailable: paid plans can still be tried free. */
export function PlanCards({ current, highlight, onChoose, onTrial = false, trialAvailable = false, tone = "light" }) {
  const dark = tone === "dark";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      {PUBLIC_PLANS.map((id) => {
        const p = PLANS[id];
        const hot = id === highlight;
        const mine = id === current;
        return (
          <div key={id} style={{
            background: dark ? "rgba(255,255,255,0.04)" : TOKENS.card,
            border: `${hot ? 2 : 1}px solid ${hot ? TOKENS.hivis : dark ? "rgba(255,255,255,0.14)" : TOKENS.rule}`,
            padding: "22px 20px", display: "flex", flexDirection: "column", gap: 10, position: "relative",
          }}>
            {(hot || mine) && <span className="ec-tag ec-tag-hivis" style={{ position: "absolute", top: -11, left: 18 }}>{mine ? (onTrial ? "Your trial" : "Your plan") : "Unlocks this"}</span>}
            <div className="ec-display" style={{ fontSize: 22 }}>{p.label}</div>
            <div>
              <span className="ec-display" style={{ fontSize: 30 }}>{p.price ? `A$${p.price}` : "Free"}</span>
              {p.price ? <span className="ec-mono" style={{ fontSize: 11, opacity: 0.7 }}> /month</span> : null}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, opacity: 0.8 }}>{p.blurb}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "flex", flexDirection: "column", gap: 7 }}>
              {FEATURES[id].map((f) => (
                <li key={f} style={{ fontSize: 13.5, display: "flex", gap: 9, alignItems: "flex-start", lineHeight: 1.45 }}>
                  <span style={{ color: TOKENS.ok, display: "inline-flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}><path d="M20 6L9 17l-5-5" /></svg></span>{f}
                </li>
              ))}
            </ul>
            {onChoose && (
              <button className={hot ? "ec-btn ec-btn-hivis" : "ec-btn ec-btn-ghost"} style={{ marginTop: "auto", justifyContent: "center" }}
                disabled={mine} onClick={() => onChoose(id)}>
                {mine ? (onTrial ? "On free trial" : "Current plan")
                  : id === "free" ? "Start free"
                  : trialAvailable ? `Try ${p.label} free for ${TRIAL_DAYS} days`
                  : `Choose ${p.label}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Portalled to <body> so a fixed overlay opened from the sticky header
// (backdrop-filter = containing block) covers the page, not just the header.
function Backdrop({ onClose, children, wide }) {
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(10,12,16,0.6)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: wide ? 980 : 520, background: TOKENS.paper, border: `1px solid ${TOKENS.rule}`, padding: "28px 26px", margin: "auto", position: "relative", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
        <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: TOKENS.steel }}>×</button>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* What happens when someone picks a paid plan they can't trial, until
   billing is live. */
function ChosenNotice({ plan, onBack, trialUsed }) {
  return (
    <div style={{ marginTop: 18, padding: 16, border: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight, fontSize: 13, lineHeight: 1.6 }}>
      {trialUsed && <>You've already had your free trial. </>}
      <strong>Paid {PLANS[plan].label} plans are opening soon.</strong> Online payment isn't switched on yet. During launch, upgrades are set up by hand — reply to your welcome email or contact us and we'll turn {PLANS[plan].label} on for your account.
      <div><button className="ec-btn ec-btn-ghost" style={{ marginTop: 10, fontSize: 11 }} onClick={onBack}>Back to plans</button></div>
    </div>
  );
}

function TrialStarted({ plan, onClose }) {
  const { can } = useAuth();
  return (
    <div style={{ marginTop: 18, padding: 18, border: `2px solid ${TOKENS.hivis}`, background: TOKENS.paperLight, fontSize: 13.5, lineHeight: 1.6 }}>
      <div className="ec-display" style={{ fontSize: 20, marginBottom: 4 }}>Your {PLANS[plan].label} trial is on.</div>
      Everything in {PLANS[plan].label} is unlocked for {can.trial?.daysLeft ?? TRIAL_DAYS} days — no card needed. When it ends you go back to the free Homeowner plan; nothing you've built is lost.
      <div><button className="ec-btn ec-btn-hivis" style={{ marginTop: 12 }} onClick={onClose}>Carry on</button></div>
    </div>
  );
}

/* feature: what the user reached for (a mode id, "ai", "siteOffice"), or
   nothing for a plain "see plans". */
export function UpgradeModal({ feature, onClose }) {
  const { enabled, user, profile, can, choosePlan } = useAuth();
  const [chosen, setChosen] = useState(null);
  const [started, setStarted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(null);         // { mode, intent } — signs a guest up for the trial
  const need = feature ? planFor(feature) : null;
  // This modal sent a guest to sign up. Kept in a ref, not in `auth`: the
  // sign-up form closes itself on success, before the account has loaded.
  const viaAuth = useRef(false);

  const choose = async (id) => {
    if (id === "free") return onClose();
    if (enabled && !user) { viaAuth.current = true; return setAuth({ mode: "signup", intent: PLAN_SEGMENT[id] }); }
    if (!can.trialAvailable) return setChosen(id);
    setBusy(true); setError("");
    try { await choosePlan(PLAN_SEGMENT[id]); setStarted(id); }
    catch (e) { setError(e.message || "Couldn't start the trial. Try again."); }
    finally { setBusy(false); }
  };
  // A guest who signs up (or in) from here: once the account has loaded,
  // drop the sign-in form; when the trial it asked for is in effect — with
  // the account on sign-up, a moment later on sign-in — say so.
  const unlocked = !feature ? can.onTrial : feature === "ai" ? can.ai : feature === "siteOffice" ? can.siteOffice : can.canUseMode(feature);
  useEffect(() => {
    if (auth && user && profile) setAuth(null);
  }, [auth, user, profile]);
  useEffect(() => {
    if (viaAuth.current && unlocked && can.onTrial && !started) setStarted(need || can.tier);
  }, [unlocked, can.onTrial, can.tier, started, need]);

  return (
    <Backdrop onClose={onClose} wide>
      <div className="ec-eyebrow" style={{ marginBottom: 6 }}>{feature ? "Upgrade" : "Plans"}</div>
      <h2 className="ec-display" style={{ fontSize: 26, margin: "0 0 6px" }}>
        {feature ? `${FEATURE_NAME[feature] || "This feature"} is part of the ${PLANS[need].label} plan` : "Pick the plan that fits your work"}
      </h2>
      <p style={{ fontSize: 13, color: TOKENS.steel, margin: "0 0 22px", maxWidth: "70ch" }}>
        {feature === "ai"
          ? `Homeowners can add just the AI assistant for A${AI_ADDON.price}/month, or move to Tradie or Builder where AI is included.`
          : "Everything you've already built stays as it is — upgrading only adds."}
        {can.trialAvailable ? ` Tradie and Builder can be tried free for ${TRIAL_DAYS} days, no card needed.` : ""}
      </p>
      {started ? <TrialStarted plan={started} onClose={onClose} />
        : chosen ? <ChosenNotice plan={chosen} trialUsed={!!can.trial} onBack={() => setChosen(null)} />
        : (
        <div style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>
          <PlanCards current={user ? can.tier : null} onTrial={can.onTrial} trialAvailable={can.trialAvailable}
            highlight={need} onChoose={choose} />
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: 12, fontSize: 12, color: TOKENS.alert }}>{error}</div>}
      {auth && <AuthModal initialMode={auth.mode} intent={auth.intent} onClose={() => setAuth(null)} />}
    </Backdrop>
  );
}

export function AiUpsell() {
  const [open, setOpen] = useState(false);
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px 64px" }}>
      <div className="ec-eyebrow" style={{ marginBottom: 8 }}>AI crew</div>
      <h2 className="ec-display" style={{ fontSize: 32, lineHeight: 1.05, margin: "0 0 12px" }}>Six specialists who read your project and answer back.</h2>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: TOKENS.inkSoft, maxWidth: "62ch" }}>
        A quantity surveyor, an estimator, a scheduler, a compliance advisor and more — each one sees your live estimate and can change it for you.
        AI isn't part of the free Homeowner plan because every answer costs us to run.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
        <button className="ec-btn ec-btn-hivis" onClick={() => setOpen(true)}>Add the AI assistant · A${AI_ADDON.price}/mo</button>
        <button className="ec-btn ec-btn-ghost" onClick={() => setOpen(true)}>Compare plans</button>
      </div>
      {open && <UpgradeModal feature="ai" onClose={() => setOpen(false)} />}
    </main>
  );
}
