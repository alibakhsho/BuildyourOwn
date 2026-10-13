/* =========================================================================
   MODULE: _lib/supabase-server.js — Supabase from the server side.

   One place for: where the project is, the public key, the SECRET key, and
   "who is calling". Shared by the AI routes (ai-access.js, metering.js) and
   the billing routes, on both runtimes (Express dev server + Vercel).

   Env is read inside functions, never at import time: server/index.js runs
   dotenv after ESM imports are hoisted, so a top-level read would see
   nothing in dev.
   ========================================================================= */
import { PUBLIC_SUPABASE } from "../../src/lib/public-config.js";

/* Env wins when set (an empty SUPABASE_URL switches accounts off for local
   dev); otherwise the committed public project — so production is always
   enforced, even with no Supabase variables configured on Vercel. */
const pick = (...keys) => {
  for (const k of keys) if (process.env[k] !== undefined) return process.env[k].trim();
  return undefined;
};
export const supaUrl = () => (pick("SUPABASE_URL", "VITE_SUPABASE_URL") ?? PUBLIC_SUPABASE.url).replace(/\/$/, "");
export const supaKey = () =>
  pick("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY") || PUBLIC_SUPABASE.publishableKey;
export const supabaseConfigured = () => !!(supaUrl() && supaKey());

/* The SECRET key (sb_secret_…, or a legacy service_role JWT). Server-only —
   never give it a VITE_ name. Returns "" when not configured. */
export const serviceKey = () => pick("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY") || "";

/* Headers for a call made AS THE SERVER. New sb_secret_ keys go in `apikey`
   only (Supabase rejects them as a Bearer token); a legacy JWT also needs
   the Authorization header. */
export function serviceHeaders() {
  const key = serviceKey();
  const h = { apikey: key, "Content-Type": "application/json", Accept: "application/json" };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

/* Headers for a call made AS THE USER — RLS applies. */
export const userHeaders = (token) => ({
  apikey: supaKey(), Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json",
});

export const bearer = (req) => {
  const auth = String(req.headers?.authorization || "");
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
};

/* Identity only (never the plan) is cached briefly: confirming a token is a
   network round trip, but a plan can change at any moment — a customer who
   just paid must not be refused for a minute. */
const who = new Map(); // token -> { at, user }
const WHO_TTL_MS = 60_000;

/**
 * Verify the caller's Supabase session.
 * @returns {Promise<{ ok: true, id: string, email: string, token: string }
 *                  | { ok: false, status: number, code: string, error: string }>}
 */
export async function getUser(req, { what = "this" } = {}) {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, code: "sign_in", error: `Sign in to use ${what}.` };
  const hit = who.get(token);
  if (hit && Date.now() - hit.at < WHO_TTL_MS) return { ok: true, ...hit.user, token };
  let res;
  try {
    res = await fetch(`${supaUrl()}/auth/v1/user`, { headers: { apikey: supaKey(), Authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, status: 503, code: "unavailable", error: "Couldn't confirm your account right now. Try again in a moment." };
  }
  if (!res.ok) return { ok: false, status: 401, code: "sign_in", error: `Your session has expired. Sign in again to use ${what}.` };
  const u = await res.json();
  const user = { id: u.id, email: u.email || "" };
  who.set(token, { at: Date.now(), user });
  if (who.size > 500) who.delete(who.keys().next().value);
  return { ok: true, ...user, token };
}

/* POST /rest/v1/rpc/<fn> with the given headers; returns parsed JSON or throws. */
export async function rpc(fn, args, headers) {
  const res = await fetch(`${supaUrl()}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args || {}) });
  if (!res.ok) throw Object.assign(new Error(`rpc ${fn} failed (${res.status})`), { status: res.status });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** test seam — forget cached identities */
export function __resetIdentityCache() { who.clear(); }
