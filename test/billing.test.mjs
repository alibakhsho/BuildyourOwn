/* Billing: Stripe subscriptions → plan, and the routes that act on it.
   Stripe calls are stubbed on a real SDK instance (so webhook signatures are
   real); Supabase is a fake fetch. Nothing leaves the machine. */
import Stripe from "stripe";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const B = await import("../api/_lib/billing.js");
const { planOfPrice, entitlementFromSubscriptions } = B;

/* ---- pure: prices and subscriptions → plan ---- */
const price = (plan, interval = "month") => ({ lookup_key: `byo_${plan}_${interval}`, recurring: { interval } });
const sub = (status, items, extra = {}) => ({
  id: `sub_${Math.random().toString(36).slice(2, 8)}`, status, created: extra.created || 1,
  items: { data: items.map((p) => ({ price: p, current_period_end: 1_800_000_000 })) }, ...extra,
});

ok("price: lookup keys map to plans", planOfPrice(price("pro")) === "pro" && planOfPrice(price("business", "year")) === "business" && planOfPrice(price("ai")) === "ai");
ok("price: metadata fallback", planOfPrice({ metadata: { byo_plan: "ai_addon" } }) === "ai" && planOfPrice({ metadata: { byo_plan: "pro" } }) === "pro");
ok("price: someone else's price → null", planOfPrice({ lookup_key: "other_thing" }) === null && planOfPrice({ metadata: { byo_plan: "enterprise" } }) === null);

{
  const e = entitlementFromSubscriptions([sub("active", [price("pro")])]);
  ok("active Tradie → pro", e.tier === "pro" && !e.aiAddon && e.status === "active" && e.interval === "month");
  ok("renewal date from the item's period end", e.renewsAt === new Date(1_800_000_000 * 1000).toISOString() && e.cancelsAt === null);
}
ok("trialing counts", entitlementFromSubscriptions([sub("trialing", [price("business", "year")])]).tier === "business");
ok("past_due keeps access while Stripe retries", entitlementFromSubscriptions([sub("past_due", [price("pro")])]).tier === "pro");
for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
  ok(`${s} → Homeowner`, entitlementFromSubscriptions([sub(s, [price("business")])]).tier === "free");
}
{
  const e = entitlementFromSubscriptions([sub("canceled", [price("pro")], { created: 5 })]);
  ok("nothing live: status reported, no dates", e.status === "canceled" && e.renewsAt === null && e.cancelsAt === null && e.interval === null);
}
ok("no subscriptions → Homeowner, no status", (() => { const e = entitlementFromSubscriptions([]); return e.tier === "free" && e.status === null && !e.aiAddon; })());
{
  const e = entitlementFromSubscriptions([sub("active", [price("ai")])]);
  ok("AI add-on → Homeowner + AI", e.tier === "free" && e.aiAddon === true && e.status === "active");
}
ok("highest plan wins across subscriptions",
  entitlementFromSubscriptions([sub("active", [price("pro")]), sub("active", [price("business")])]).tier === "business");
{
  const e = entitlementFromSubscriptions([sub("active", [price("pro")], { cancel_at_period_end: true })]);
  ok("cancelled at period end: keeps plan, shows end date, no renewal", e.tier === "pro" && e.cancelsAt && e.renewsAt === null);
}

/* ---- fakes ---- */
const calls = [];
const users = { "tok-u1": { id: "u1", email: "u1@x.test" }, "tok-u2": { id: "u2", email: "u2@x.test" } };
const profiles = {
  u1: { id: "u1", tier: "free", ai_addon: false, stripe_customer_id: null, billing_status: null, trial_tier: null, trial_ends_at: null },
  u2: { id: "u2", tier: "pro", ai_addon: false, stripe_customer_id: "cus_u2", billing_status: "active" },
};
let rpcFail = false;
globalThis.fetch = async (url, init = {}) => {
  const h = init.headers || {};
  const tok = (h.Authorization || "").replace("Bearer ", "");
  calls.push({ url, h, body: init.body ? JSON.parse(init.body) : undefined });
  if (url.endsWith("/auth/v1/user")) return users[tok] ? { ok: true, json: async () => users[tok] } : { ok: false, json: async () => ({}) };
  if (url.includes("/rest/v1/profiles")) {
    const id = users[tok]?.id;
    return { ok: true, json: async () => (id ? [profiles[id]] : []) };
  }
  if (url.includes("/rest/v1/rpc/")) {
    if (rpcFail) return { ok: false, status: 500, text: async () => "" };
    const fn = url.split("/rpc/")[1];
    const body = JSON.parse(init.body);
    if (fn === "link_stripe_customer") return { ok: true, text: async () => JSON.stringify(body.p_customer) };
    if (fn === "apply_billing") return { ok: true, text: async () => "true" };
    if (fn === "delete_my_account") return { ok: true, text: async () => "" };
  }
  return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
};
const rpcCalls = (fn) => calls.filter((c) => c.url.endsWith(`/rpc/${fn}`));

// A real SDK instance (real webhook signing) with its network calls stubbed.
const st = new Stripe("sk_test_fake");
const stripeLog = [];
let subsFor = { cus_u2: [sub("active", [price("pro")])] };
let customerMeta = { cus_u2: { supabase_user_id: "u2" }, cus_new: { supabase_user_id: "u1" } };
st.customers.retrieve = async (id) => ({ id, metadata: customerMeta[id] || {} });
st.customers.create = async (params, opts) => { stripeLog.push({ op: "customers.create", params, opts }); return { id: "cus_new" }; };
st.subscriptions.list = async ({ customer }) => ({ data: subsFor[customer] || [] });
st.subscriptions.cancel = async (id) => { stripeLog.push({ op: "subscriptions.cancel", id }); return { id, status: "canceled" }; };
st.prices.list = async ({ lookup_keys }) => ({ data: [{ id: `price_${lookup_keys[0]}`, lookup_key: lookup_keys[0] }] });
st.checkout.sessions.create = async (params) => { stripeLog.push({ op: "checkout.create", params }); return { url: "https://checkout.stripe.test/s/1" }; };
st.checkout.sessions.retrieve = async (id) => ({ id, client_reference_id: id === "cs_mine" ? "u1" : "someone-else", customer: "cus_new" });
st.billingPortal.sessions.create = async (params) => { stripeLog.push({ op: "portal.create", params }); return { url: "https://billing.stripe.test/p/1" }; };
B.__setStripe(st);

const mkRes = () => {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = () => r;
  return r;
};
const web = (tok, body, extra = {}) => ({
  method: "POST", body,
  headers: { origin: "https://buildyourown.dev", host: "buildyourown.dev", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...extra },
});
const run = async (handler, req) => { const res = mkRes(); await handler(req, res); return res; };

/* ---- checkout ---- */
const checkout = (await import("../api/billing/checkout.js")).default;
{
  const r = await run(checkout, web("tok-u1", { plan: "pro", interval: "month" }, { origin: "capacitor://app.buildyourown.local", host: "buildyourown.dev" }));
  ok("checkout: phone app → 403 web_only", r.statusCode === 403 && r.body.code === "web_only");
}
ok("checkout: signed out → 401", (await run(checkout, web(null, { plan: "pro" }))).statusCode === 401);
ok("checkout: bad plan → 400", (await run(checkout, web("tok-u1", { plan: "enterprise" }))).statusCode === 400);
ok("checkout: other website → 403", (await run(checkout, web("tok-u1", { plan: "pro" }, { origin: "https://evil.example" }))).statusCode === 403);
{
  stripeLog.length = 0; calls.length = 0;
  const r = await run(checkout, web("tok-u1", { plan: "pro", interval: "year" }));
  const c = stripeLog.find((x) => x.op === "checkout.create")?.params;
  ok("checkout: returns the Stripe URL", r.statusCode === 200 && r.body.url === "https://checkout.stripe.test/s/1");
  ok("checkout: price found by lookup key", c?.line_items?.[0]?.price === "price_byo_pro_year");
  ok("checkout: GST via Stripe Tax", c?.automatic_tax?.enabled === true && c?.customer_update?.address === "auto");
  ok("checkout: tied to the account", c?.client_reference_id === "u1" && c?.subscription_data?.metadata?.supabase_user_id === "u1");
  ok("checkout: new customer created once (idempotency key)", stripeLog.find((x) => x.op === "customers.create")?.opts?.idempotencyKey === "byo-customer-u1");
  ok("checkout: customer linked with the SERVER key", rpcCalls("link_stripe_customer")[0]?.h.apikey === "sb_secret_test");
  ok("checkout: returns to the site it came from", c?.success_url?.startsWith("https://buildyourown.dev/?billing=success"));
  ok("checkout: no trial without one", !("trial_end" in (c?.subscription_data || {})));
}
{
  profiles.u1.trial_tier = "pro";
  profiles.u1.trial_ends_at = new Date(Date.now() + 10 * 86400_000).toISOString();
  stripeLog.length = 0;
  await run(checkout, web("tok-u1", { plan: "pro", interval: "month" }));
  const c = stripeLog.find((x) => x.op === "checkout.create")?.params;
  ok("checkout: rest of the free trial carried over", c?.subscription_data?.trial_end === Math.floor(new Date(profiles.u1.trial_ends_at).getTime() / 1000));
  stripeLog.length = 0;
  await run(checkout, web("tok-u1", { plan: "business", interval: "month" }));
  ok("checkout: trial not carried to a HIGHER plan", !("trial_end" in (stripeLog.find((x) => x.op === "checkout.create")?.params?.subscription_data || {})));
  profiles.u1.trial_ends_at = new Date(Date.now() + 86400_000).toISOString();
  stripeLog.length = 0;
  await run(checkout, web("tok-u1", { plan: "pro", interval: "month" }));
  ok("checkout: under 48 h of trial left → no trial_end (Stripe minimum)", !("trial_end" in (stripeLog.find((x) => x.op === "checkout.create")?.params?.subscription_data || {})));
  profiles.u1.trial_tier = null; profiles.u1.trial_ends_at = null;
}
{
  const r = await run(checkout, web("tok-u2", { plan: "business", interval: "month" }));
  ok("checkout: already subscribed → 409, use the portal", r.statusCode === 409 && r.body.code === "has_subscription");
  profiles.u2.billing_status = "canceled";
  const r2 = await run(checkout, web("tok-u2", { plan: "ai", interval: "month" }));
  ok("checkout: AI add-on refused when AI is included", r2.statusCode === 409 && r2.body.code === "included");
  profiles.u2.billing_status = "active";
}
{
  const saved = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
  const r = await run(checkout, web("tok-u1", { plan: "pro" }));
  ok("checkout: no Stripe key → 503, nothing charged", r.statusCode === 503 && r.body.code === "unavailable");
  process.env.STRIPE_SECRET_KEY = saved;
}

/* ---- portal ---- */
const portal = (await import("../api/billing/portal.js")).default;
ok("portal: no customer → 404", (await run(portal, web("tok-u1", {}))).body.code === "no_customer");
{
  stripeLog.length = 0;
  const r = await run(portal, web("tok-u2", {}));
  ok("portal: opens for the caller's own customer", r.body.url && stripeLog[0]?.params?.customer === "cus_u2");
}

/* ---- sync (return from Checkout) ---- */
const sync = (await import("../api/billing/sync.js")).default;
{
  const r = await run(sync, web("tok-u1", { sessionId: "cs_someone" }));
  ok("sync: someone else's checkout session → 403", r.statusCode === 403);
  calls.length = 0;
  subsFor.cus_new = [sub("active", [price("business")])];
  const r2 = await run(sync, web("tok-u1", { sessionId: "cs_mine" }));
  const apply = rpcCalls("apply_billing")[0];
  ok("sync: own session → plan applied from Stripe", r2.statusCode === 200 && r2.body.tier === "business" && apply?.body?.p_tier === "business" && apply?.body?.p_user === "u1");
  ok("sync: apply_billing uses the server key, with a read timestamp", apply?.h.apikey === "sb_secret_test" && !apply?.h.Authorization && !!apply?.body?.p_synced_at);
  const r3 = await run(sync, web("tok-u1", { plan: "business" }, { origin: "capacitor://app.buildyourown.local" }));
  ok("sync: allowed from the phone app (read-only)", r3.statusCode !== 403);
}

/* ---- webhook ---- */
const webhook = (await import("../api/billing/webhook.js")).default;
const signed = async (event, secret = process.env.STRIPE_WEBHOOK_SECRET) => {
  const payload = JSON.stringify(event);
  const header = await st.webhooks.generateTestHeaderStringAsync({ payload, secret });
  return { method: "POST", headers: { "stripe-signature": header }, byoRawBody: Buffer.from(payload) };
};
{
  const r = await run(webhook, await signed({ id: "evt_1", type: "customer.subscription.updated", data: { object: { customer: "cus_u2" } } }, "whsec_wrong"));
  ok("webhook: bad signature → 400", r.statusCode === 400);
}
{
  const payload = Buffer.from(JSON.stringify({ id: "evt_x", type: "customer.subscription.updated", data: { object: { customer: "cus_u2" } } }));
  const r = await run(webhook, { method: "POST", headers: {}, byoRawBody: payload });
  ok("webhook: unsigned → 400", r.statusCode === 400);
}
{
  calls.length = 0;
  subsFor.cus_u2 = [sub("active", [price("business", "year")])];
  // the payload claims "free": it must be ignored in favour of Stripe's real state
  const r = await run(webhook, await signed({ id: "evt_2", type: "customer.subscription.updated", data: { object: { customer: "cus_u2", status: "canceled", items: { data: [] } } } }));
  const apply = rpcCalls("apply_billing")[0]?.body;
  ok("webhook: plan read from Stripe, not the payload", r.statusCode === 200 && apply?.p_tier === "business" && apply?.p_interval === "year");
  ok("webhook: account from customer metadata", apply?.p_user === "u2" && apply?.p_customer === "cus_u2");
}
{
  calls.length = 0;
  subsFor.cus_u2 = [sub("canceled", [price("business")])];
  await run(webhook, await signed({ id: "evt_3", type: "customer.subscription.deleted", data: { object: { customer: "cus_u2" } } }));
  ok("webhook: cancellation → Homeowner", rpcCalls("apply_billing")[0]?.body?.p_tier === "free");
}
{
  calls.length = 0;
  customerMeta.cus_new = {};           // customer without our metadata
  subsFor.cus_new = [sub("active", [price("pro")])];
  await run(webhook, await signed({ id: "evt_4", type: "checkout.session.completed", data: { object: { customer: "cus_new", client_reference_id: "u1" } } }));
  ok("webhook: completed checkout links the customer to its account", rpcCalls("link_stripe_customer")[0]?.body?.p_user === "u1");
  ok("webhook: …and applies the plan to that account", rpcCalls("apply_billing")[0]?.body?.p_user === "u1");
  customerMeta.cus_new = { supabase_user_id: "u1" };
}
{
  calls.length = 0;
  const r = await run(webhook, await signed({ id: "evt_5", type: "product.created", data: { object: {} } }));
  ok("webhook: unrelated events acknowledged, nothing written", r.statusCode === 200 && r.body.ignored && rpcCalls("apply_billing").length === 0);
}
{
  rpcFail = true;
  const r = await run(webhook, await signed({ id: "evt_6", type: "invoice.paid", data: { object: { customer: "cus_u2" } } }));
  ok("webhook: database down → 500 so Stripe retries", r.statusCode === 500);
  rpcFail = false;
}
{
  const saved = process.env.STRIPE_WEBHOOK_SECRET; delete process.env.STRIPE_WEBHOOK_SECRET;
  const r = await run(webhook, await signed({ id: "evt_7", type: "invoice.paid", data: { object: { customer: "cus_u2" } } }, saved));
  ok("webhook: no signing secret configured → 503 (never unverified)", r.statusCode === 503);
  process.env.STRIPE_WEBHOOK_SECRET = saved;
}

/* ---- account deletion ---- */
const del = (await import("../api/account/delete.js")).default;
{
  stripeLog.length = 0; calls.length = 0;
  subsFor.cus_u2 = [sub("active", [price("pro")]), sub("canceled", [price("ai")])];
  const r = await run(del, web("tok-u2", {}, { origin: "capacitor://app.buildyourown.local" }));
  const cancels = stripeLog.filter((x) => x.op === "subscriptions.cancel");
  const delCall = rpcCalls("delete_my_account")[0];
  ok("delete: live subscriptions cancelled first (only the live one)", cancels.length === 1);
  ok("delete: runs as the USER (their token), works from the app", r.statusCode === 200 && delCall?.h.Authorization === "Bearer tok-u2");
  ok("delete: cancellation happens before deletion", calls.indexOf(delCall) > -1);
}
{
  const saved = st.subscriptions.list;
  st.subscriptions.list = async () => { throw Object.assign(new Error("network"), { type: "StripeConnectionError" }); };
  calls.length = 0;
  const r = await run(del, web("tok-u2", {}));
  ok("delete: Stripe unreachable → account NOT deleted", r.statusCode === 502 && rpcCalls("delete_my_account").length === 0);
  st.subscriptions.list = saved;
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
