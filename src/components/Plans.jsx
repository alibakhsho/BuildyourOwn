/* =========================================================================
   Plans — the plan table, used in three places so it can't drift:
     PlanCards     landing-page pricing + inside the upgrade prompt
     UpgradeModal  shown when someone reaches for a feature their plan lacks
                   (or "see plans") — the one place a plan choice is acted on
     AiUpsell      the AI crew page for a plan without AI

   Everything reads lib/entitlements.js. Picking a paid plan:
     guest                      → sign up, which starts that plan's trial
     never trialled             → start the 14-day trial (no card)
     trial used / on a trial    → Stripe Checkout (lib/billing.js)
     already paying             → Stripe billing portal to switch
     in the phone app           → no purchase (app-store rules)
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors as TOKENS } from "../design/system.js";
import { PLANS, PUBLIC_PLANS, AI_ADDON, MODE_LABEL, TRIAL_DAYS, planFor, withGst, GST_RATE } from "../lib/entitlements.js";
import { canPayHere, startCheckout, openBillingPortal, hasSubscription } from "../lib/billing.js";
import { useAuth } from "../state/auth.jsx";
import AuthModal from "./AuthModal.jsx";

const FEATURES = {
  free:     ["House estimates, priced line by line", "Live 3D model of your build", "Timeline & client-ready quote", "3 projects saved to your account", `AI assistant add-on · A$${withGst(AI_ADDON.price)}/mo`],
  pro:      ["Everything in Homeowner", "Custom quotes for any job", "AI crew & AI plan reading (25/mo)", "Unlimited projects", "Your own rates", "Marketplace profile & portfolio"],
  business: ["Everything in Tradie", "Multi-dwelling quoting", "Developer: apartments & towers", "Site Office — jobs, POs, claims", "100 AI plan reads · Xero / MYOB soon", "List house plans & prefab modules"],
};

/* The segment that trials each paid plan (see SEGMENT_PLAN). */
export const PLAN_SEGMENT = { pro: "tradie", business: "builder" };

const FEATURE_NAME = {
  ai: "The AI crew",
  siteOffice: "Site Office",
  marketProfile: "A marketplace profile and portfolio",
  marketListing: "Listing plans and prefab modules",
  ...Object.fromEntries(Object.entries(MODE_LABEL).map(([k, v]) => [k, `${v} quoting`])),
};

/** Monthly / yearly switch. Yearly = 10 × monthly (two months free). */
export function IntervalToggle({ value, onChange }) {
  const opt = (v, label) => (
    <button type="button" onClick={() => onChange(v)} aria-pressed={value === v}
      style={{ padding: "7px 14px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
        background: value === v ? TOKENS.ink : "transparent", color: value === v ? TOKENS.paper : TOKENS.ink }}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Billing period" style={{ display: "inline-flex", border: `1px solid ${TOKENS.rule}`, borderRadius: 999, overflow: "hidden" }}>
      {opt("month", "Monthly")}{opt("year", "Yearly · 2 months free")}
    </div>
  );
}

/* current: the plan in effect (a trial counts) · onTrial: it's a trial ·
   trialAvailable: paid plans can still be tried free · subscribed: already
   paying (other plans become "Switch to") · interval: "month" | "year". */
export function PlanCards({ current, highlight, onChoose, onTrial = false, trialAvailable = false, subscribed = false, interval = "month", tone = "light" }) {
  const dark = tone === "dark";
  const yearly = interval === "year";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      {PUBLIC_PLANS.map((id) => {
        const p = PLANS[id];
        const hot = id === highlight;
        const mine = id === current;
        const amount = yearly ? p.priceYear : p.price;
        const label = mine ? (onTrial ? (canPayHere ? "Subscribe to keep it" : "On free trial") : "Current plan")
          : id === "free" ? "Start free"
          : trialAvailable ? `Try ${p.label} free for ${TRIAL_DAYS} days`
          : subscribed ? `Switch to ${p.label}`
          : `Choose ${p.label}`;
        return (
          <div key={id} style={{
            background: dark ? "rgba(255,255,255,0.04)" : TOKENS.card,
            border: `${hot ? 2 : 1}px solid ${hot ? TOKENS.hivis : dark ? "rgba(255,255,255,0.14)" : TOKENS.rule}`,
            padding: "22px 20px", display: "flex", flexDirection: "column", gap: 10, position: "relative",
          }}>
            {(hot || mine) && <span className="ec-tag ec-tag-hivis" style={{ position: "absolute", top: -11, left: 18 }}>{mine ? (onTrial ? "Your trial" : "Your plan") : "Unlocks this"}</span>}
            <div className="ec-display" style={{ fontSize: 22 }}>{p.label}</div>
            <div>
              <span className="ec-display" style={{ fontSize: 30 }}>{amount ? `A$${amount.toLocaleString()}` : "Free"}</span>
              {amount ? <span className="ec-mono" style={{ fontSize: 11, opacity: 0.7 }}> /{yearly ? "year" : "month"}{GST_RATE ? ` + GST (A$${withGst(amount)} incl. GST)` : ""}</span> : null}
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
              <button className={hot || (mine && onTrial) ? "ec-btn ec-btn-hivis" : "ec-btn ec-btn-ghost"} style={{ marginTop: "auto", justifyContent: "center" }}
                disabled={mine && !(onTrial && canPayHere)} onClick={() => onChoose(id, interval)}>
                {label}
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

/* In the phone app nothing is sold — say so plainly, without a purchase
   link (app-store rules). */
function AppNotice({ onBack }) {
  return (
    <div style={{ marginTop: 18, padding: 16, border: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight, fontSize: 13, lineHeight: 1.6 }}>
      Plans can't be bought or changed in the app. Any plan on your account works here as soon as it's active.
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
  const [interval, setBillingInterval] = useState("month");
  const [appNotice, setAppNotice] = useState(false);
  const [started, setStarted] = useState(null);
  const [busy, setBusy] = useState("");             // what we're doing, while doing it
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(null);           // { mode, intent } — signs a guest up for the trial
  const need = feature ? planFor(feature) : null;
  const subscribed = hasSubscription(profile);
  // This modal sent a guest to sign up. Kept in a ref, not in `auth`: the
  // sign-up form closes itself on success, before the account has loaded.
  const viaAuth = useRef(false);

  const act = async (doing, fn) => {
    setBusy(doing); setError("");
    try { await fn(); }
    catch (e) { setError(e.message || "Something went wrong. Try again."); setBusy(""); }
    // on success the browser is usually leaving for Stripe — keep "busy"
  };

  const choose = (id, iv = interval) => {
    if (id === "free") return onClose();
    if (enabled && !user) {
      viaAuth.current = true;
      return setAuth({ mode: "signup", intent: id === "ai" ? null : PLAN_SEGMENT[id] });
    }
    if (can.trialAvailable && id !== "ai") {
      return act("Starting your trial…", async () => { await choosePlan(PLAN_SEGMENT[id]); setStarted(id); setBusy(""); });
    }
    if (!canPayHere) return setAppNotice(true);
    if (subscribed) return act("Opening billing…", openBillingPortal);
    return act("Opening secure checkout…", () => startCheckout(id, iv));
  };

  // A guest who signs up (or in) from here: once the account has loaded,
  // drop the sign-in form; when the trial it asked for is in effect — with
  // the account on sign-up, a moment later on sign-in — say so.
  const unlocked = !feature ? can.onTrial : feature === "ai" ? can.ai : feature === "siteOffice" ? can.siteOffice
    : feature === "marketProfile" ? can.marketProfile : feature === "marketListing" ? can.marketListing : can.canUseMode(feature);
  useEffect(() => {
    if (auth && user && profile) setAuth(null);
  }, [auth, user, profile]);
  useEffect(() => {
    if (viaAuth.current && unlocked && can.onTrial && !started) setStarted(need || can.tier);
  }, [unlocked, can.onTrial, can.tier, started, need]);

  // Homeowners can buy just the AI assistant.
  const offerAddon = (feature === "ai" || !feature) && can.paidTier === "free" && !can.aiAddon;

  return (
    <Backdrop onClose={onClose} wide>
      <div className="ec-eyebrow" style={{ marginBottom: 6 }}>{feature ? "Upgrade" : "Plans"}</div>
      <h2 className="ec-display" style={{ fontSize: 26, margin: "0 0 6px" }}>
        {feature ? `${FEATURE_NAME[feature] || "This feature"} is part of the ${PLANS[need].label} plan` : "Pick the plan that fits your work"}
      </h2>
      <p style={{ fontSize: 13, color: TOKENS.steel, margin: "0 0 16px", maxWidth: "70ch" }}>
        {feature === "ai"
          ? `Homeowners can add just the AI assistant for A$${withGst(AI_ADDON.price)}/month${GST_RATE ? " including GST" : ""}, or move to Tradie or Builder where AI is included.`
          : "Everything you've already built stays as it is — upgrading only adds."}
        {can.trialAvailable ? ` Tradie and Builder can be tried free for ${TRIAL_DAYS} days, no card needed.` : ""}
        {canPayHere ? (GST_RATE ? " Prices in AUD. Tradie and Builder are shown before GST, which is added at checkout. Cancel any time." : " Prices in AUD. Cancel any time.") : ""}
      </p>
      {started ? <TrialStarted plan={started} onClose={onClose} />
        : appNotice ? <AppNotice onBack={() => setAppNotice(false)} />
        : (
        <>
          {canPayHere && !can.trialAvailable && (
            <div style={{ marginBottom: 16 }}><IntervalToggle value={interval} onChange={setBillingInterval} /></div>
          )}
          <div style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>
            <PlanCards current={user ? can.tier : null} onTrial={can.onTrial} trialAvailable={can.trialAvailable}
              subscribed={subscribed} interval={interval} highlight={need} onChoose={choose} />
          </div>
          {offerAddon && canPayHere && (
            <div style={{ marginTop: 16, padding: "14px 16px", border: `1px dashed ${TOKENS.rule}`, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong>Just want the AI?</strong> Keep Homeowner and add the AI assistant — the AI crew plus {AI_ADDON.planReads} AI plan reads a month.
              </div>
              <button className="ec-btn ec-btn-ghost" disabled={!!busy} onClick={() => choose("ai")}>
                Add AI · A${interval === "year" ? `${withGst(AI_ADDON.priceYear)}/yr` : `${withGst(AI_ADDON.price)}/mo`}{GST_RATE ? " incl. GST" : ""}
              </button>
            </div>
          )}
          {subscribed && canPayHere && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: TOKENS.steel }}>
              Already subscribed — plan changes, invoices and cancelling are in{" "}
              <button className="ec-btn ec-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} disabled={!!busy}
                onClick={() => act("Opening billing…", openBillingPortal)}>Manage billing</button>
            </div>
          )}
        </>
      )}
      {busy && <div role="status" className="ec-mono" style={{ marginTop: 12, fontSize: 12, color: TOKENS.steel }}>{busy}</div>}
      {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: TOKENS.alert }}>{error}</div>}
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
        <button className="ec-btn ec-btn-hivis" onClick={() => setOpen(true)}>{canPayHere ? `Add the AI assistant · A$${withGst(AI_ADDON.price)}/mo${GST_RATE ? " incl. GST" : ""}` : "See plans"}</button>
        <button className="ec-btn ec-btn-ghost" onClick={() => setOpen(true)}>Compare plans</button>
      </div>
      {open && <UpgradeModal feature="ai" onClose={() => setOpen(false)} />}
    </main>
  );
}
