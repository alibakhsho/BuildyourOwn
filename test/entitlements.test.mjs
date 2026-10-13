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

/* ---- server check, against a fake Supabase ---- */
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
const profiles = { "tok-home": { id: "u1", tier: "free" }, "tok-tradie": { id: "u2", tier: "pro" }, "tok-addon": { id: "u3", tier: "free", ai_addon: true }, "tok-maxed": { id: "u4", tier: "pro", plan_reads_used: 25 } };
globalThis.fetch = async (url, init) => {
  const tok = (init.headers.Authorization || "").replace("Bearer ", "");
  const row = profiles[tok];
  if (url.endsWith("/auth/v1/user")) return row ? { ok: true, json: async () => ({ id: row.id }) } : { ok: false, json: async () => ({}) };
  return { ok: true, json: async () => (row ? [row] : []) };
};
const { checkAiAccess } = await import("../api/_lib/ai-access.js");
const req = (tok) => ({ headers: tok ? { authorization: `Bearer ${tok}` } : {} });

ok("server: no token → 401 sign in", (await checkAiAccess(req(null)))?.status === 401);
ok("server: bad token → 401", (await checkAiAccess(req("tok-forged")))?.status === 401);
ok("server: Homeowner → 402 upgrade", (await checkAiAccess(req("tok-home")))?.code === "upgrade");
ok("server: Tradie → allowed", (await checkAiAccess(req("tok-tradie"))) === null);
ok("server: Homeowner with add-on → allowed", (await checkAiAccess(req("tok-addon"))) === null);
ok("server: plan reads used up → 402 on vision", (await checkAiAccess(req("tok-maxed"), "vision"))?.code === "limit");
ok("server: plan reads used up → chat still fine", (await checkAiAccess(req("tok-maxed"), "chat")) === null);
globalThis.fetch = async () => { throw new Error("network down"); };
ok("server: Supabase unreachable → fails closed (503)", (await checkAiAccess(req("tok-new-session")))?.status === 503);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
