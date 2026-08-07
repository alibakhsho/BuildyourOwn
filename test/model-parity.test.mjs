/* =========================================================================
   server/index.js (dev, Express) and api/ai/chat.js (prod, Vercel) implement
   the same route. They are separate files, so they drift silently — and the
   drift only shows up in production, where it is most expensive.

   This caught api/ai/chat.js sitting on "claude-opus-4-8" long after every
   other call site had moved to claude-opus-5: locally the AI worked fine,
   and the deployed site would have failed on any request that didn't pass an
   explicit model.
   ========================================================================= */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let pass = 0, fail = 0;
const ok = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}\n        expected ${e}\n        actual   ${a}`); }
};

/** Pull the fallback model id out of `... process.env.BYO_AI_MODEL || "<id>"`. */
const defaultModel = (src) => (src.match(/BYO_AI_MODEL\s*\|\|\s*"([^"]+)"/) || [])[1] || null;

const devModel  = defaultModel(read("server/index.js"));
const prodModel = defaultModel(read("api/ai/chat.js"));

ok("dev handler declares a default model", typeof devModel, "string");
ok("prod handler declares a default model", typeof prodModel, "string");
ok("dev and prod default to the same model", prodModel, devModel);

// Model ids the app is allowed to name. Anything outside this set is either a
// typo or a retired id — both fail as a 404 from the API at request time.
const KNOWN = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5"];
ok("dev default is a known model", KNOWN.includes(devModel), true);
ok("prod default is a known model", KNOWN.includes(prodModel), true);

// The frontend's tier map must not name a retired id either.
const tiers = [...read("src/ai/client.js").matchAll(/"(claude-[a-z0-9-]+)"/g)].map((m) => m[1]);
ok("every model id in ai/client.js is known", tiers.filter((t) => !KNOWN.includes(t)), []);

// The plan reader pins its own model for high-res vision; it must be real too.
const planModels = [...read("api/_lib/plan-reader.js").matchAll(/"(claude-[a-z0-9-]+)"/g)].map((m) => m[1]);
ok("every model id in plan-reader.js is known", planModels.filter((t) => !KNOWN.includes(t)), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
