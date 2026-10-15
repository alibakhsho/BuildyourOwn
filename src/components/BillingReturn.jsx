/* =========================================================================
   BillingReturn — what happens when Stripe sends someone back.

   Checkout and the billing portal return to /?billing=success|cancel|portal.
   On success we ask the server to re-read the plan from Stripe straight
   away (the webhook does the same, but may land a few seconds later), then
   refresh the profile and say what they're on now. Mounted once at the app
   root; renders nothing the rest of the time.
   ========================================================================= */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { colors as TOKENS } from "../design/system.js";
import { PLANS, AI_ADDON } from "../lib/entitlements.js";
import { billingReturn, clearBillingReturn, syncBilling } from "../lib/billing.js";
import { useAuth } from "../state/auth.jsx";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");

export default function BillingReturn() {
  const { enabled, loading, user, refreshProfile } = useAuth();
  const [kind] = useState(() => billingReturn.kind);
  const [phase, setPhase] = useState(kind ? "waiting" : "idle"); // waiting | syncing | done | error | idle
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (phase !== "waiting" || loading) return;
    const sessionId = billingReturn.sessionId;
    clearBillingReturn();
    if (!enabled || !user || kind === "cancel") { setPhase(kind === "cancel" ? "done" : "idle"); return; }
    setPhase("syncing");
    syncBilling(kind === "success" ? sessionId : undefined)
      .then(async (r) => { await refreshProfile(); setResult(r); setPhase(kind === "portal" ? "idle" : "done"); })
      .catch(() => setPhase(kind === "portal" ? "idle" : "error"));
  }, [phase, loading, enabled, user, kind, refreshProfile]);

  if (phase === "idle" || phase === "waiting" || !kind || kind === "portal") return null;
  const close = () => setPhase("idle");

  let title, body;
  if (kind === "cancel") {
    title = "Checkout cancelled";
    body = "Nothing was charged. Your plan hasn't changed.";
  } else if (phase === "syncing") {
    title = "Confirming your payment…";
    body = "This takes a second.";
  } else if (phase === "error") {
    title = "Payment received";
    body = "We couldn't confirm your new plan just yet — it'll switch on by itself within a minute. Refresh if it hasn't.";
  } else {
    const label = result?.tier && result.tier !== "free" ? `${PLANS[result.tier].label} plan`
      : result?.aiAddon ? AI_ADDON.label : "your plan";
    title = `You're on the ${label}.`;
    body = result?.status === "trialing" && result?.renewsAt
      ? `Your free trial carries on — your card is first charged on ${fmtDate(result.renewsAt)}. Receipts and tax invoices are emailed to you.`
      : "Thanks! Receipts and tax invoices are emailed to you, and are always in Manage billing in your account.";
  }

  return createPortal(
    <div role="status" aria-live="polite"
      style={{ position: "fixed", left: "50%", bottom: "calc(20px + env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 240,
        width: "min(460px, calc(100vw - 32px))", background: TOKENS.card, color: TOKENS.ink, border: `1px solid ${TOKENS.rule}`,
        borderLeft: `4px solid ${kind === "cancel" ? TOKENS.steel : phase === "error" ? TOKENS.alert : TOKENS.hivis}`,
        boxShadow: "0 18px 44px rgba(0,0,0,0.28)", padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <div className="ec-display" style={{ fontSize: 17, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: TOKENS.inkSoft }}>{body}</div>
      </div>
      {phase !== "syncing" && (
        <button onClick={close} aria-label="Dismiss" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: TOKENS.steel, lineHeight: 1 }}>×</button>
      )}
    </div>,
    document.body
  );
}
