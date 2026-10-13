/* =========================================================================
   Plans — the plan table, used in three places so it can't drift:
     PlanCards     landing-page pricing + inside the upgrade prompt
     UpgradeModal  shown when someone reaches for a feature their plan lacks
     AiUpsell      the AI crew page for a plan without AI

   Everything reads lib/entitlements.js. Billing isn't live yet, so the
   call to action is honest about it rather than a dead "Buy" button.
   ========================================================================= */
import { useState } from "react";
import { createPortal } from "react-dom";
import { colors as TOKENS } from "../design/system.js";
import { PLANS, PUBLIC_PLANS, AI_ADDON, MODE_LABEL, planFor } from "../lib/entitlements.js";
import { useAuth } from "../state/auth.jsx";
import AuthModal from "./AuthModal.jsx";

const FEATURES = {
  free:     ["House estimates, priced line by line", "Live 3D model of your build", "Timeline & client-ready quote", "3 projects saved to your account", `AI assistant add-on · A$${AI_ADDON.price}/mo`],
  pro:      ["Everything in Homeowner", "Custom quotes for any job", "AI crew & AI plan reading (25/mo)", "Unlimited projects", "Your own rates"],
  business: ["Everything in Tradie", "Multi-dwelling quoting", "Developer: apartments & towers", "Site Office — jobs, POs, claims", "Xero / MYOB · 100 AI plan reads"],
};

const FEATURE_NAME = {
  ai: "The AI crew",
  siteOffice: "Site Office",
  ...Object.fromEntries(Object.entries(MODE_LABEL).map(([k, v]) => [k, `${v} quoting`])),
};

export function PlanCards({ current, highlight, onChoose, tone = "light" }) {
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
            {hot && <span className="ec-tag ec-tag-hivis" style={{ position: "absolute", top: -11, left: 18 }}>{mine ? "Your plan" : "Unlocks this"}</span>}
            <div className="ec-display" style={{ fontSize: 22 }}>{p.label}</div>
            <div>
              <span className="ec-display" style={{ fontSize: 30 }}>{p.price ? `A$${p.price}` : "Free"}</span>
              {p.price ? <span className="ec-mono" style={{ fontSize: 11, opacity: 0.7 }}> /month</span> : null}
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, opacity: 0.8 }}>{p.blurb}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "flex", flexDirection: "column", gap: 7 }}>
              {FEATURES[id].map((f) => (
                <li key={f} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: TOKENS.hivisDeep || TOKENS.hivis, fontWeight: 700 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            {onChoose && (
              <button className={hot ? "ec-btn ec-btn-hivis" : "ec-btn ec-btn-ghost"} style={{ marginTop: "auto", justifyContent: "center" }}
                disabled={mine} onClick={() => onChoose(id)}>
                {mine ? "Current plan" : id === "free" ? "Start free" : `Choose ${p.label}`}
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

/* What happens when someone picks a paid plan, until billing is live. */
function ChosenNotice({ plan, onBack }) {
  return (
    <div style={{ marginTop: 18, padding: 16, border: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight, fontSize: 13, lineHeight: 1.6 }}>
      <strong>{PLANS[plan].label} is opening soon.</strong> Online payment isn't switched on yet. During launch, upgrades are set up by hand — reply to your welcome email or contact us and we'll turn {PLANS[plan].label} on for your account.
      <div><button className="ec-btn ec-btn-ghost" style={{ marginTop: 10, fontSize: 11 }} onClick={onBack}>Back to plans</button></div>
    </div>
  );
}

export function UpgradeModal({ feature, onClose }) {
  const { enabled, user, tier } = useAuth();
  const [chosen, setChosen] = useState(null);
  const [auth, setAuth] = useState(null);
  const need = planFor(feature);
  return (
    <Backdrop onClose={onClose} wide>
      <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Upgrade</div>
      <h2 className="ec-display" style={{ fontSize: 26, margin: "0 0 6px" }}>{FEATURE_NAME[feature] || "This feature"} is part of the {PLANS[need].label} plan</h2>
      <p style={{ fontSize: 13, color: TOKENS.steel, margin: "0 0 22px", maxWidth: "70ch" }}>
        {feature === "ai"
          ? `Homeowners can add just the AI assistant for A$${AI_ADDON.price}/month, or move to Tradie or Builder where AI is included.`
          : "Everything you've already built stays as it is — upgrading only adds."}
      </p>
      {chosen ? <ChosenNotice plan={chosen} onBack={() => setChosen(null)} /> : (
        <PlanCards current={user ? tier : null} highlight={need}
          onChoose={(id) => (id === "free" ? onClose() : enabled && !user ? setAuth("signup") : setChosen(id))} />
      )}
      {auth && <AuthModal initialMode={auth} onClose={() => setAuth(null)} />}
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
