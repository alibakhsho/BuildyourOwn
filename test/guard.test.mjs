/* =========================================================================
   Guard tests. This module is the only thing standing between a public link
   and someone else's Anthropic bill, so every layer is asserted rather than
   assumed — including the ones that must FAIL CLOSED.
   ========================================================================= */
import {
  LIMITS, ALLOWED_MODELS, aiEnabled, allowedOrigin, rateLimit, clientKey,
  clampModel, clampTokens, promptSize, preflight, __resetBuckets, mapAnthropicError,
} from "../api/_lib/guard.js";

let pass = 0, fail = 0;
const ok = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}\n        expected ${e}\n        actual   ${a}`); }
};
const req = (headers = {}) => ({ headers, socket: { remoteAddress: "1.2.3.4" } });

/* ---- Kill switch ---- */
delete process.env.BYO_AI_ENABLED;
ok("AI is on by default", aiEnabled(), true);
process.env.BYO_AI_ENABLED = "false";
ok("kill switch turns AI off", aiEnabled(), false);
process.env.BYO_AI_ENABLED = "true";

/* ---- Origin: must fail CLOSED ---- */
delete process.env.BYO_ALLOWED_ORIGINS;
// Default to asserting PRODUCTION behaviour; the dev-only leniency is
// exercised explicitly further down.
process.env.VERCEL = "1";
ok("same-origin request allowed",
  allowedOrigin(req({ host: "byo.app", origin: "https://byo.app" })), true);
ok("referer counts as origin",
  allowedOrigin(req({ host: "byo.app", referer: "https://byo.app/quote" })), true);
ok("foreign origin rejected",
  allowedOrigin(req({ host: "byo.app", origin: "https://evil.example" })), false);
// A bare curl sends no Origin at all — that is the actual attack, so it must
// be refused rather than waved through for lacking a header.
ok("no origin header at all is refused", allowedOrigin(req({ host: "byo.app" })), false);
ok("garbage origin is refused", allowedOrigin(req({ host: "byo.app", origin: "not a url" })), false);
process.env.BYO_ALLOWED_ORIGINS = "byo.app, staging.byo.app";
ok("configured allowlist admits listed host",
  allowedOrigin(req({ host: "whatever", origin: "https://staging.byo.app" })), true);
ok("configured allowlist excludes others",
  allowedOrigin(req({ host: "whatever", origin: "https://byo.app.evil.com" })), false);
delete process.env.BYO_ALLOWED_ORIGINS;

/* ---- Dev leniency, and that it CANNOT leak into production ----
   The Vite proxy makes Origin (:5173) and Host (:8787) disagree in dev, so
   localhost origins are accepted there. On Vercel that same request must be
   refused, or spoofing `Origin: http://localhost` from curl would walk
   straight past the check. */
delete process.env.VERCEL;
ok("dev accepts a localhost origin behind the proxy",
  allowedOrigin(req({ host: "localhost:8787", origin: "http://localhost:5173" })), true);
ok("dev still refuses a foreign origin",
  allowedOrigin(req({ host: "localhost:8787", origin: "https://evil.example" })), false);
process.env.VERCEL = "1";
ok("production refuses a spoofed localhost origin",
  allowedOrigin(req({ host: "byo.app", origin: "http://localhost:5173" })), false);
ok("production still allows its own host",
  allowedOrigin(req({ host: "byo.app", origin: "https://byo.app" })), true);

/* ---- Input clamps: cap the cost of a single call ---- */
ok("unknown model falls back", clampModel("gpt-4", "claude-opus-5"), "claude-opus-5");
ok("allowed model passes through", clampModel("claude-haiku-4-5", "claude-opus-5"), "claude-haiku-4-5");
ok("every allowed model is a claude id", [...ALLOWED_MODELS].every((m) => m.startsWith("claude-")), true);

ok("absurd token request is capped", clampTokens(1_000_000, LIMITS.chat.maxTokens), LIMITS.chat.maxTokens);
ok("missing tokens uses the ceiling", clampTokens(undefined, 2000), 2000);
ok("negative tokens uses the ceiling", clampTokens(-5, 2000), 2000);
ok("string token count is handled", clampTokens("50", 2000), 50);
ok("reasonable request survives", clampTokens(800, 2000), 800);

ok("prompt size counts system + messages",
  promptSize([{ role: "user", content: "abcde" }], "xyz"), 8);
ok("prompt size handles array content",
  promptSize([{ role: "user", content: [{ type: "text", text: "1234" }] }]), 4);
ok("prompt size tolerates junk", promptSize(null, null), 0);

/* ---- Rate limit ---- */
__resetBuckets();
const t0 = 1_700_000_000_000;
let allowed = 0;
for (let i = 0; i < LIMITS.chat.perMinute + 4; i++) {
  if (rateLimit("chat", "ip-a", LIMITS.chat, t0).ok) allowed++;
}
ok("per-minute limit caps the burst", allowed, LIMITS.chat.perMinute);
ok("a different IP is unaffected", rateLimit("chat", "ip-b", LIMITS.chat, t0).ok, true);
ok("next minute lets it through again",
  rateLimit("chat", "ip-a", LIMITS.chat, t0 + 61_000).ok, true);

__resetBuckets();
let dayAllowed = 0;
for (let i = 0; i < LIMITS.chat.perDay + 10; i++) {
  // step a minute each time so only the daily cap can bite
  if (rateLimit("chat", "ip-c", LIMITS.chat, t0 + i * 61_000).ok) dayAllowed++;
}
ok("per-day limit caps the total", dayAllowed, LIMITS.chat.perDay);

__resetBuckets();
ok("vision is limited separately from chat",
  rateLimit("vision", "ip-a", LIMITS.vision, t0).ok, true);
ok("vision is tighter than chat", LIMITS.vision.perDay < LIMITS.chat.perDay, true);

ok("client key prefers x-forwarded-for",
  clientKey(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
ok("client key falls back to socket", clientKey(req({})), "1.2.3.4");

/* ---- preflight: the whole chain ---- */
__resetBuckets();
const good = req({ host: "byo.app", origin: "https://byo.app" });
ok("a legitimate request passes preflight", preflight(good, "chat"), null);

__resetBuckets();
ok("preflight blocks a foreign origin with 403",
  preflight(req({ host: "byo.app", origin: "https://evil.example" }), "chat")?.status, 403);

__resetBuckets();
ok("preflight blocks a header-less curl with 403",
  preflight(req({ host: "byo.app" }), "chat")?.status, 403);

__resetBuckets();
process.env.BYO_AI_ENABLED = "false";
ok("kill switch short-circuits preflight with 503", preflight(good, "chat")?.status, 503);
process.env.BYO_AI_ENABLED = "true";

__resetBuckets();
for (let i = 0; i < LIMITS.chat.perMinute; i++) preflight(good, "chat");
const limited = preflight(good, "chat");
ok("preflight returns 429 once over the limit", limited?.status, 429);
ok("429 carries a Retry-After value", typeof limited?.retryAfter, "number");

/* ---- Anthropic error mapping: the "out of credit" path ----
   This is what keeps a capped balance from showing users a billing error. */
const credit = mapAnthropicError({ status: 400, error: { error: { message: "Your credit balance is too low to access the Anthropic API." } } });
ok("out-of-credit maps to a paused 503", credit.status, 503);
ok("out-of-credit is flagged paused", credit.paused, true);
ok("paused message never mentions billing", /billing|credit|balance/i.test(credit.error), false);
ok("paused message reassures the rest works", /still work/i.test(credit.error), true);
ok("a 402 is treated as out of credit", mapAnthropicError({ status: 402, message: "payment required" }).status, 503);
ok("a bad key maps to 401", mapAnthropicError({ status: 401, message: "invalid x-api-key" }).status, 401);
ok("an overload maps to 429", mapAnthropicError({ status: 429, message: "overloaded" }).status, 429);
ok("an unknown error stays a 500", mapAnthropicError({ message: "kaboom" }).status, 500);
ok("nested SDK message shape is read", mapAnthropicError({ status: 400, error: { message: "credit balance too low" } }).status, 503);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
