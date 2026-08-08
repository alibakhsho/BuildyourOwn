/* =========================================================================
   MODULE: _lib/guard.js — abuse and cost protection for the AI routes.

   The threat is specific: BYO's link goes on Facebook, the AI endpoints need
   no login, and every call spends real money on someone else's key. A single
   script pointed at /api/ai/vision can run Opus over full-page plan scans
   thousands of times before anyone notices the bill.

   Four layers, cheapest and most reliable first:

     1. Kill switch      — BYO_AI_ENABLED=false stops all AI instantly,
                           without pulling the key out of Vercel.
     2. Origin check     — browser requests carry Origin/Referer. Rejecting
                           anything not from our own host stops casual curl
                           and scraped-endpoint abuse, which is the realistic
                           attack on a public marketing link.
     3. Input clamps     — deterministic ceilings on max_tokens, prompt size
                           and image bytes, plus a model allowlist. These
                           cap the cost of any SINGLE call no matter what the
                           caller asks for, and they never fail open.
     4. Rate limit       — per-IP requests per minute and per day.

   HONEST LIMITATION: layer 4 is in-memory, and serverless instances neither
   share memory nor live long. It reliably stops one browser hammering the
   endpoint; it does NOT stop a distributed attacker, and counters reset when
   an instance recycles. Layers 1–3 hold regardless. For a real distributed
   limit this needs Upstash/Vercel KV — see rateLimit()'s note. The only
   guaranteed ceiling on spend is a limit set on the Anthropic Console
   itself, which lives outside this codebase.
   ========================================================================= */

/** Per-route ceilings. Deliberately tight — a real user never hits these. */
export const LIMITS = {
  chat: {
    perMinute: 8,
    perDay: 80,
    maxTokens: 2000,      // one reply can't run away
    maxPromptChars: 24000,
  },
  vision: {
    perMinute: 3,         // plan reads are the expensive call
    perDay: 20,
    maxTokens: 4000,
    maxImageBytes: 9_000_000,
  },
};

/** Models a caller is allowed to name. Anything else falls back to the
 *  route default, so nobody can request something exotic on our key. */
export const ALLOWED_MODELS = new Set([
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
]);

export const aiEnabled = () =>
  String(process.env.BYO_AI_ENABLED ?? "true").toLowerCase() !== "false";

/* ---- Origin --------------------------------------------------------- */

/** True when running on Vercel. Local dev has to be more forgiving about
 *  Host headers because the Vite proxy rewrites them, but that leniency must
 *  never reach production — an attacker can spoof Origin from curl. */
const isDeployed = () => !!process.env.VERCEL;

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Hosts allowed to call the AI routes. Defaults to the request's own host,
 *  so it works on any Vercel preview URL without configuration. */
export function allowedOrigin(req) {
  const configured = (process.env.BYO_ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const raw = req.headers?.origin || req.headers?.referer || "";
  if (!raw) return false;                       // no browser context — refuse
  let host;
  try { host = new URL(raw).host.toLowerCase(); } catch { return false; }
  if (configured.length) return configured.includes(host);
  const self = String(req.headers?.host || "").toLowerCase();
  if (self && host === self) return true;
  // Dev only: the Vite proxy forwards /api to another port, so Origin
  // (:5173) and Host (:8787) legitimately disagree. Gated on VERCEL so this
  // branch cannot exist in production.
  if (!isDeployed() && LOCAL_HOSTS.test(host)) return true;
  return false;
}

/* ---- Rate limiting --------------------------------------------------- */

/** Best-effort in-process counters. Swap this Map for Upstash/Vercel KV to
 *  make the limit distributed — the call signature stays the same. */
const buckets = new Map();

export function clientKey(req) {
  const fwd = String(req.headers?.["x-forwarded-for"] || "");
  return (fwd.split(",")[0] || req.socket?.remoteAddress || "unknown").trim();
}

/**
 * @returns {{ok: true} | {ok: false, retryAfter: number, scope: "minute"|"day"}}
 */
export function rateLimit(route, key, limits, now = Date.now()) {
  const id = `${route}:${key}`;
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  let b = buckets.get(id);
  if (!b || b.day !== day) b = { minute, minuteCount: 0, day, dayCount: 0 };
  if (b.minute !== minute) { b.minute = minute; b.minuteCount = 0; }

  if (b.dayCount >= limits.perDay) {
    buckets.set(id, b);
    return { ok: false, scope: "day", retryAfter: 86_400 - Math.floor((now % 86_400_000) / 1000) };
  }
  if (b.minuteCount >= limits.perMinute) {
    buckets.set(id, b);
    return { ok: false, scope: "minute", retryAfter: 60 - Math.floor((now % 60_000) / 1000) };
  }
  b.minuteCount++; b.dayCount++;
  buckets.set(id, b);

  // Keep the Map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.day !== day) buckets.delete(k);
  }
  return { ok: true };
}

/** Test seam — resets the in-memory counters. */
export function __resetBuckets() { buckets.clear(); }

/* ---- Input clamps ---------------------------------------------------- */

export function clampModel(model, fallback) {
  return ALLOWED_MODELS.has(model) ? model : fallback;
}

export function clampTokens(requested, ceiling) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return ceiling;
  return Math.min(Math.floor(n), ceiling);
}

/** Total characters across a messages array, including array-form content. */
export function promptSize(messages, system = "") {
  let n = String(system || "").length;
  for (const m of messages || []) {
    const c = m?.content;
    if (typeof c === "string") n += c.length;
    else if (Array.isArray(c)) for (const part of c) n += String(part?.text || "").length;
  }
  return n;
}

/* ---- The one call a route makes -------------------------------------- */

/**
 * Runs layers 1, 2 and 4. Returns null when the request may proceed, or
 * `{status, error}` to send back. Input clamps (layer 3) are applied by the
 * route itself, because they rewrite the request rather than reject it.
 */
export function preflight(req, route) {
  if (!aiEnabled()) {
    return { status: 503, error: "AI is temporarily switched off. Everything else in the app still works." };
  }
  if (!allowedOrigin(req)) {
    return { status: 403, error: "This endpoint only accepts requests from the app itself." };
  }
  const limits = LIMITS[route];
  const rl = rateLimit(route, clientKey(req), limits);
  if (!rl.ok) {
    return {
      status: 429,
      retryAfter: rl.retryAfter,
      error: rl.scope === "day"
        ? "You've reached today's free AI limit. It resets at midnight UTC."
        : "That's a lot of requests at once — give it a minute and try again.",
    };
  }
  return null;
}
