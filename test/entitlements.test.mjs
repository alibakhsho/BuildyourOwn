/* Plan rules — and the server check that enforces AI access with them. */
import { entitlementsFor, planFor, PLANS } from "../src/lib/entitlements.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const guest = entitlementsFor(null);
const home = entitlementsFor({ tier: "free" });
const homeAi = entitlementsFor({ tier: "free", ai_addon: true });
const tradie = entitlementsFor({ tier: "pro" });
const builder = entitlementsFor({ tier: "business" });

ok("guest = Homeowner, residential only", guest.tier === "free" && guest.modes.join() === "residential");
ok("guest has no AI", guest.ai === false);
ok("Homeowner: residential only", home.canUseMode("residential") && !home.canUseMode("materials") && !home.canUseMode("multi") && !home.canUseMode("highrise"));
ok("Homeowner: no AI without the add-on", home.ai === false);
ok("Homeowner + add-on: AI on", homeAi.ai === true && homeAi.aiAddon === true);
ok("Homeowner + add-on: still residential only", !homeAi.canUseMode("materials"));
ok("Homeowner + add-on: gets plan reads", homeAi.planReads > 0);
ok("Tradie: residential + custom quotes", tradie.canUseMode("residential") && tradie.canUseMode("materials"));
ok("Tradie: no developer, no multi-dwelling", !tradie.canUseMode("highrise") && !tradie.canUseMode("multi"));
ok("Tradie: AI included", tradie.ai);
ok("Tradie: no Site Office", !tradie.siteOffice);
ok("Builder: every mode", ["residential", "materials", "highrise", "multi"].every((m) => builder.canUseMode(m)));
ok("Builder: AI + Site Office", builder.ai && builder.siteOffice);
ok("add-on flag ignored on paid plans", entitlementsFor({ tier: "pro", ai_addon: true }).aiAddon === false);
ok("unknown tier falls back to Homeowner", entitlementsFor({ tier: "hacker" }).tier === "free");
ok("upgrade target: AI → Tradie", planFor("ai") === "pro");
ok("upgrade target: custom quote → Tradie", planFor("materials") === "pro");
ok("upgrade target: multi-dwelling → Builder", planFor("multi") === "business");
ok("upgrade target: developer → Builder", planFor("highrise") === "business");
ok("upgrade target: Site Office → Builder", planFor("siteOffice") === "business");
ok("Developer is the label for highrise", (await import("../src/lib/entitlements.js")).MODE_LABEL.highrise === "Developer");
ok("Homeowner is free", PLANS.free.price === 0);

/* ---- this month's plan-read usage (mirrors reserve_plan_read's window) ---- */
{
  const { planReadsUsedNow } = await import("../src/lib/entitlements.js");
  const p = { plan_reads_used: 7, period_started_at: "2026-10-05T00:00:00Z" };
  ok("usage: same month → stored count", planReadsUsedNow(p, new Date("2026-10-30T00:00:00Z")) === 7);
  ok("usage: a month later → 0 (window rolled)", planReadsUsedNow(p, new Date("2026-11-05T00:00:01Z")) === 0);
  ok("usage: no anchor → stored count", planReadsUsedNow({ plan_reads_used: 3 }) === 3);
  ok("usage: no profile → 0", planReadsUsedNow(null) === 0);
}

/* ---- server check, against a fake Supabase ---- */
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
const profiles = { "tok-home": { id: "u1", tier: "free" }, "tok-tradie": { id: "u2", tier: "pro" }, "tok-addon": { id: "u3", tier: "free", ai_addon: true }, "tok-builder": { id: "u4", tier: "business" } };
// fake PostgREST: auth/v1/user, the profiles select, and the two metering RPCs
const calls = [];
let reserveReply = { ok: true, used: 1, cap: 25, window_start: "2026-10-01T00:00:00Z", window_end: "2026-11-01T00:00:00Z" };
globalThis.fetch = async (url, init = {}) => {
  const h = init.headers || {};
  const tok = (h.Authorization || "").replace("Bearer ", "");
  calls.push({ url, h, body: init.body });
  const row = profiles[tok];
  if (url.endsWith("/auth/v1/user")) return row ? { ok: true, json: async () => ({ id: row.id, email: `${row.id}@x.test` }) } : { ok: false, json: async () => ({}) };
  if (url.endsWith("/rpc/reserve_plan_read")) return { ok: true, text: async () => JSON.stringify(reserveReply) };
  if (url.endsWith("/rpc/refund_plan_read")) return { ok: true, text: async () => "" };
  return { ok: true, json: async () => (row ? [row] : []) };
};
const { checkAiAccess, authorizeAi } = await import("../api/_lib/ai-access.js");
const { withPlanRead } = await import("../api/_lib/metering.js");
const req = (tok) => ({ headers: tok ? { authorization: `Bearer ${tok}` } : {} });

ok("server: no token → 401 sign in", (await checkAiAccess(req(null)))?.status === 401);
ok("server: bad token → 401", (await checkAiAccess(req("tok-forged")))?.status === 401);
ok("server: Homeowner → 402 upgrade", (await checkAiAccess(req("tok-home")))?.code === "upgrade");
ok("server: Tradie → allowed", (await checkAiAccess(req("tok-tradie"))) === null);
ok("server: Homeowner with add-on → allowed", (await checkAiAccess(req("tok-addon"))) === null);

/* the plan is read fresh: an upgrade or cancellation applies on the very next call */
profiles["tok-home"].tier = "pro";
ok("server: plan read fresh — upgrade applies immediately", (await checkAiAccess(req("tok-home"))) === null);
profiles["tok-home"].tier = "free";
ok("server: plan read fresh — downgrade applies immediately", (await checkAiAccess(req("tok-home")))?.code === "upgrade");

/* metering */
{
  const access = await authorizeAi(req("tok-tradie"));
  calls.length = 0;
  const out = await withPlanRead(access, async () => "plan");
  const reserve = calls.find((c) => c.url.endsWith("/rpc/reserve_plan_read"));
  ok("metering: success returns the model result", out === "plan");
  ok("metering: reserves with the USER's token, not a server key", reserve?.h.Authorization === "Bearer tok-tradie");
  ok("metering: passes the Tradie cap (25)", reserve && JSON.parse(reserve.body).p_cap === 25);
  ok("metering: no refund on success", !calls.some((c) => c.url.endsWith("/rpc/refund_plan_read")));
}
{
  const access = await authorizeAi(req("tok-tradie"));
  reserveReply = { ok: false, used: 25, cap: 25, window_end: "2026-11-01T00:00:00Z" };
  let ran = false, err;
  try { await withPlanRead(access, async () => { ran = true; }); } catch (e) { err = e; }
  ok("metering: at the cap → 402 limit", err?.status === 402 && err?.code === "limit");
  ok("metering: at the cap → the model is never called", ran === false);
  ok("metering: the limit says when it resets", err?.resetsAt === "2026-11-01T00:00:00Z");
  reserveReply = { ok: true, used: 1, cap: 25, window_start: "2026-10-01T00:00:00Z" };
}
{
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const access = await authorizeAi(req("tok-tradie"));
  calls.length = 0;
  let err;
  try { await withPlanRead(access, async () => { throw new Error("model down"); }); } catch (e) { err = e; }
  const refund = calls.find((c) => c.url.endsWith("/rpc/refund_plan_read"));
  ok("metering: failed model call → original error rethrown", err?.message === "model down");
  ok("metering: failed model call → read refunded", !!refund);
  ok("metering: refund uses the SERVER key in apikey, never the user's token", refund?.h.apikey === "sb_secret_test" && !refund?.h.Authorization);
  ok("metering: refund is for the reserved window", refund && JSON.parse(refund.body).p_window_start === "2026-10-01T00:00:00Z");
  delete process.env.SUPABASE_SECRET_KEY;
}
{
  const access = await authorizeAi(req("tok-builder"));
  calls.length = 0;
  await withPlanRead(access, async () => "ok");
  const reserve = calls.find((c) => c.url.endsWith("/rpc/reserve_plan_read"));
  ok("metering: Builder cap 100", reserve && JSON.parse(reserve.body).p_cap === 100);
}
ok("metering: no accounts configured (dev) → just runs", (await withPlanRead({ denied: null }, async () => 7)) === 7);

globalThis.fetch = async () => { throw new Error("network down"); };
ok("server: Supabase unreachable → fails closed (503)", (await checkAiAccess(req("tok-new-session")))?.status === 503);
{
  let err;
  try { await withPlanRead({ user: { id: "u2", token: "tok-tradie" }, ent: { planReads: 25 } }, async () => "x"); } catch (e) { err = e; }
  ok("metering: can't reserve → fails closed (503), no model call", err?.status === 503 && err?.code === "unavailable");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
