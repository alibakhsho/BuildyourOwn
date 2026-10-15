/* =========================================================================
   MODULE: lib/billing.js — the browser side of paid plans.

   Payment happens on Stripe-hosted pages (Checkout, the billing portal), so
   no card details ever touch this app. These helpers ask our server for a
   page URL and send the browser there; the server decides what's allowed.
   Plans are bought on the website only: the phone app can see its plan
   (and refresh it) but never starts a purchase.
   ========================================================================= */
import { supabase } from "./supabase.js";
import { isNative } from "./native.js";

const BASE = import.meta.env?.VITE_AI_BACKEND || "";

/** Purchases are web-only (app-store rules). */
export const canPayHere = !isNative;

export class BillingError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function call(path, body = {}) {
  const headers = { "Content-Type": "application/json" };
  try {
    const { data } = (await supabase?.auth.getSession()) || {};
    if (data?.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  } catch { /* the server will say "sign in" */ }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new BillingError("Couldn't reach the server. Check your connection and try again.", "network");
  }
  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new BillingError(json.error || `Something went wrong (${res.status}).`, json.code);
  return json;
}

/** Go to Stripe Checkout for a plan ("pro" | "business" | "ai"). */
export async function startCheckout(plan, interval = "month") {
  const { url } = await call("/api/billing/checkout", { plan, interval });
  window.location.assign(url);
}

/** Go to the Stripe billing portal (change plan, card, invoices, cancel). */
export async function openBillingPortal() {
  const { url } = await call("/api/billing/portal");
  window.location.assign(url);
}

/** Ask the server to re-read this account's plan from Stripe. */
export const syncBilling = (sessionId) => call("/api/billing/sync", sessionId ? { sessionId } : {});

/** Delete the account, cancelling any subscription first (server side). */
export const deleteAccountOnServer = () => call("/api/account/delete");

/** Subscription states in which the account is (still) paying. */
export const LIVE_BILLING = ["active", "trialing", "past_due"];
export const hasSubscription = (profile) =>
  !!profile?.stripe_customer_id && LIVE_BILLING.includes(profile?.billing_status);

/* Read once at load: where Stripe sent us back to, if anywhere. */
const params = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const billingReturn = {
  kind: params.get("billing"),              // "success" | "cancel" | "portal" | null
  sessionId: params.get("session_id"),
};
export function clearBillingReturn() {
  billingReturn.kind = null;
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("billing");
    u.searchParams.delete("session_id");
    window.history.replaceState(window.history.state, "", u.toString());
  } catch { /* not fatal */ }
}
