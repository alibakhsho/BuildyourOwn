/* =========================================================================
   MODULE: _lib/billing.js — Stripe subscriptions → the account's plan.

   Used by api/billing/* (checkout, portal, sync, webhook) and the account
   deletion route, on both runtimes (Express dev server + Vercel).

   The rule that keeps this safe: Stripe is the source of truth, and we never
   trust an event's payload for the plan. Every webhook, and every return
   from Checkout, just says "this customer changed" — syncCustomer() then
   reads the customer's subscriptions from Stripe and writes the result
   through the service-role function apply_billing(), which ignores a read
   older than the one already stored. Duplicate, replayed or out-of-order
   events therefore can't leave a stale plan behind.

   Prices are found by lookup key (byo_<plan>_<interval>), never by id, so
   the same code runs against the sandbox and live mode.
   Env (server only, never VITE_): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   SUPABASE_SECRET_KEY. Read inside functions, never at import time.
   ========================================================================= */
import Stripe from "stripe";
import { serviceKey, serviceHeaders, rpc, supaUrl, userHeaders } from "./supabase-server.js";
import { NATIVE_APP_HOST, allowedOrigin, rateLimit, clientKey } from "./guard.js";
import { SITE_URL } from "../../src/lib/public-config.js";

/* What can be bought. "ai" is the Homeowner AI add-on. */
export const BUYABLE = ["pro", "business", "ai"];
export const INTERVALS = ["month", "year"];
export const lookupKey = (plan, interval) => `byo_${plan}_${interval}`;

const RANK = { free: 0, pro: 1, business: 2 };
/* Subscription states that keep the plan on. past_due keeps access while
   Stripe retries the card; when retries run out the subscription becomes
   canceled/unpaid and the plan drops. */
const LIVE = new Set(["active", "trialing", "past_due"]);

/* ---- clients ---------------------------------------------------------- */

const stripeKey = () => (process.env.STRIPE_SECRET_KEY || "").trim();
let client = null, clientFor = "";
export function stripe() {
  const key = stripeKey();
  if (!key) return null;
  if (!client || clientFor !== key) {
    client = new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "BuildYourOwn", url: SITE_URL } });
    clientFor = key;
  }
  return client;
}
/** test seam */
export function __setStripe(fake) { client = fake; clientFor = stripeKey(); }

/** Payments need the Stripe key AND the Supabase secret key (to write the plan). */
export const billingConfigured = () => !!stripeKey() && !!serviceKey();

/* ---- pure: subscriptions → plan ------------------------------------------ */

/** Which of our plans a Stripe price is: "pro" | "business" | "ai" | null. */
export function planOfPrice(price) {
  const key = price?.lookup_key || "";
  const m = /^byo_(pro|business|ai)_(month|year)$/.exec(key);
  if (m) return m[1];
  const meta = price?.metadata?.byo_plan;
  if (meta === "ai_addon") return "ai";
  return RANK[meta] ? meta : null;
}

const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);

/**
 * Reduce a customer's subscriptions to what the account should have.
 * @returns {{ tier: "free"|"pro"|"business", aiAddon: boolean, status: string|null,
 *            interval: string|null, renewsAt: string|null, cancelsAt: string|null }}
 */
export function entitlementFromSubscriptions(subs = []) {
  let tier = "free", aiAddon = false, carrier = null, aiCarrier = null;
  for (const sub of subs) {
    if (!LIVE.has(sub?.status)) continue;
    for (const item of sub.items?.data || []) {
      const plan = planOfPrice(item.price);
      if (plan === "ai") { aiAddon = true; aiCarrier = aiCarrier || { sub, item }; }
      else if (plan && RANK[plan] > RANK[tier]) { tier = plan; carrier = { sub, item }; }
    }
  }
  // Report status / renewal from the subscription that carries the plan;
  // with nothing live, from the most recent one (e.g. "canceled").
  const ref = carrier || aiCarrier;
  const latest = [...subs].sort((a, b) => (b?.created || 0) - (a?.created || 0))[0];
  const sub = ref?.sub || latest || null;
  const item = ref?.item || sub?.items?.data?.[0] || null;
  // Since API 2025-03-31 the billing period lives on the item.
  const periodEnd = item?.current_period_end ?? sub?.current_period_end ?? null;
  const live = !!ref;
  return {
    tier,
    aiAddon,
    status: sub?.status ?? null,
    interval: live ? item?.price?.recurring?.interval ?? null : null,
    renewsAt: live && !sub.cancel_at && !sub.cancel_at_period_end ? iso(periodEnd) : null,
    cancelsAt: live ? (sub.cancel_at ? iso(sub.cancel_at) : sub.cancel_at_period_end ? iso(periodEnd) : null) : null,
  };
}

/* ---- Stripe lookups ---------------------------------------------------- */

const priceCache = new Map(); // lookup key -> { at, price }
const PRICE_TTL_MS = 5 * 60_000;
export async function priceFor(plan, interval) {
  const key = lookupKey(plan, interval);
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;
  const { data } = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = data?.[0] || null;
  if (price) priceCache.set(key, { at: Date.now(), price });
  return price;
}

/** The caller's own billing row (RLS: their token can only see their row). */
export async function readOwnProfile(user) {
  const res = await fetch(
    `${supaUrl()}/rest/v1/profiles?select=id,tier,ai_addon,stripe_customer_id,billing_status,trial_tier,trial_ends_at&id=eq.${encodeURIComponent(user.id)}`,
    { headers: userHeaders(user.token) },
  );
  if (!res.ok) throw Object.assign(new Error("Couldn't read your account."), { status: 503 });
  const rows = await res.json();
  return rows[0] || null;
}

/** The account's Stripe customer — created (once) on first checkout. */
export async function customerFor(user, profile) {
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const created = await stripe().customers.create(
    { email: user.email || undefined, metadata: { supabase_user_id: user.id } },
    // a double-click within 24 h returns the same customer, not a second one
    { idempotencyKey: `byo-customer-${user.id}` },
  );
  // first link wins: if a parallel request linked another customer, use that
  const linked = await rpc("link_stripe_customer", { p_user: user.id, p_customer: created.id }, serviceHeaders());
  return linked || created.id;
}

/**
 * Re-read a customer from Stripe and write their plan to the account.
 * @param {string} customerId
 * @param {string} [userHint]  account id when the caller already knows it
 *                             (checkout return); otherwise from customer metadata
 */
export async function syncCustomer(customerId, userHint) {
  const s = stripe();
  // Taken BEFORE reading: apply_billing() keeps the newest read.
  const syncedAt = new Date().toISOString();
  const [customer, subs] = await Promise.all([
    s.customers.retrieve(customerId),
    s.subscriptions.list({ customer: customerId, status: "all", limit: 20 }),
  ]);
  const userId = customer?.metadata?.supabase_user_id || userHint;
  if (!userId) return { applied: false, reason: "no_account" };
  const ent = entitlementFromSubscriptions(customer?.deleted ? [] : subs.data || []);
  const applied = await rpc("apply_billing", {
    p_user: userId, p_customer: customerId, p_tier: ent.tier, p_ai_addon: ent.aiAddon,
    p_status: ent.status, p_interval: ent.interval, p_renews_at: ent.renewsAt,
    p_cancels_at: ent.cancelsAt, p_synced_at: syncedAt,
  }, serviceHeaders());
  return { applied: applied === true, userId, ...ent };
}

/** Cancel every subscription this customer has that's still billing. */
export async function cancelAllSubscriptions(customerId) {
  const s = stripe();
  const { data } = await s.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  for (const sub of data || []) {
    if (!["canceled", "incomplete_expired"].includes(sub.status)) await s.subscriptions.cancel(sub.id);
  }
}

/* ---- request helpers ---------------------------------------------------- */

const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return ""; } };

/** The phone app. Plans are bought on the website only (app-store rules). */
export const fromNativeApp = (req) => hostOf(req.headers?.origin || "") === NATIVE_APP_HOST;

/** Where Stripe sends people back to: the site they came from (localhost,
 *  a preview URL, production), never a host the request merely claims. */
export function returnOrigin(req) {
  const origin = req.headers?.origin || "";
  const host = hostOf(origin);
  const self = String(req.headers?.host || "").toLowerCase();
  if (host && (host === self || host === hostOf(SITE_URL) || /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host))) {
    return origin.replace(/\/$/, "");
  }
  return SITE_URL;
}

/**
 * The checks every billing route makes before touching Stripe. Returns null
 * to proceed, or { status, body } to send back.
 * webOnly: buying and the billing portal stay on the website — the app
 * stores don't allow paying for digital plans outside their own billing.
 */
const BILLING_LIMITS = { perMinute: 10, perDay: 120 };
export function billingPreflight(req, route, { webOnly = true } = {}) {
  if (webOnly && fromNativeApp(req)) {
    return { status: 403, body: { code: "web_only", error: "Plans are managed on buildyourown.dev — open it in your browser." } };
  }
  if (!billingConfigured()) {
    return { status: 503, body: { code: "unavailable", error: "Online payments aren't switched on yet. Nothing was charged." } };
  }
  if (!allowedOrigin(req)) return { status: 403, body: { error: "This endpoint only accepts requests from the app itself." } };
  const rl = rateLimit(`billing-${route}`, clientKey(req), BILLING_LIMITS);
  if (!rl.ok) return { status: 429, body: { error: "Too many attempts — wait a minute and try again." } };
  return null;
}

/** Map a thrown Stripe / Supabase error to a safe { status, body }. */
export function billingError(e) {
  if (e?.status && e?.code && e?.message && !e?.type) return { status: e.status, body: { error: e.message, code: e.code } };
  console.error("[billing]", e?.type || "", e?.message || e);
  if (e?.type === "StripeAuthenticationError") {
    return { status: 503, body: { error: "Payments are misconfigured on the server (Stripe key). Nothing was charged.", code: "unavailable" } };
  }
  return { status: 502, body: { error: "Couldn't reach the payment provider. Nothing was charged — try again in a moment.", code: "unavailable" } };
}
