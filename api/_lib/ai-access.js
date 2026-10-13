/* =========================================================================
   MODULE: _lib/ai-access.js — does this caller's plan include AI?

   Runs on both the Express dev server and the Vercel functions, after the
   abuse guard and before any money is spent. The browser sends the user's
   Supabase access token as a Bearer header; we ask Supabase who that token
   belongs to (which also verifies it), then read their own profile row with
   the same token — RLS lets a user read only themselves — and apply the
   shared plan rules from src/lib/entitlements.js.

   No service-role key is needed or used. If the server has no Supabase
   settings at all, the check is skipped (local dev without accounts) — set
   SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (or the VITE_ ones) to enforce.
   ========================================================================= */
import { entitlementsFor, AI_ADDON } from "../../src/lib/entitlements.js";
import { PUBLIC_SUPABASE } from "../../src/lib/public-config.js";

/* Env wins when set (an empty SUPABASE_URL switches the check off for local
   dev); otherwise the committed public project — so production is always
   enforced, even with no Supabase variables configured on Vercel. */
const pick = (...keys) => {
  for (const k of keys) if (process.env[k] !== undefined) return process.env[k].trim();
  return undefined;
};
const supaUrl = () => pick("SUPABASE_URL", "VITE_SUPABASE_URL") ?? PUBLIC_SUPABASE.url;
const supaKey = () => pick("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY") || PUBLIC_SUPABASE.publishableKey;

export function aiAccessConfigured() {
  return !!(supaUrl() && supaKey());
}

/* Tiny cache so a chat session doesn't hit Supabase twice per message. */
const cache = new Map(); // token -> { at, result }
const TTL_MS = 60_000;

/**
 * @returns {Promise<null | { status: number, error: string, code: string }>}
 *   null when the call may proceed.
 */
export async function checkAiAccess(req, kind = "chat") {
  if (!aiAccessConfigured()) return null;
  const url = supaUrl().replace(/\/$/, "");
  const key = supaKey();

  const auth = String(req.headers?.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return { status: 401, code: "sign_in", error: "Sign in to use the AI assistant." };
  }

  const hit = cache.get(token);
  let ent;
  if (hit && Date.now() - hit.at < TTL_MS) {
    ent = hit.ent;
  } else {
    try {
      const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
      if (!who.ok) return { status: 401, code: "sign_in", error: "Your session has expired. Sign in again to use the AI assistant." };
      const user = await who.json();
      const prof = await fetch(
        `${url}/rest/v1/profiles?select=tier,ai_addon,plan_reads_used&id=eq.${encodeURIComponent(user.id)}`,
        { headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: "application/json" } },
      );
      const rows = prof.ok ? await prof.json() : [];
      ent = entitlementsFor(rows[0] || null);
      ent.planReadsUsed = rows[0]?.plan_reads_used || 0;
      cache.set(token, { at: Date.now(), ent });
      if (cache.size > 500) cache.delete(cache.keys().next().value);
    } catch {
      // Fail closed: if we can't confirm the plan, don't spend.
      return { status: 503, code: "unavailable", error: "Couldn't confirm your plan right now. Try again in a moment." };
    }
  }

  if (!ent.ai) {
    return {
      status: 402, code: "upgrade",
      error: `AI assistance isn't part of the Homeowner plan. Add the ${AI_ADDON.label} (A$${AI_ADDON.price}/mo) or move to Tradie or Builder.`,
    };
  }
  if (kind === "vision" && Number.isFinite(ent.planReads) && ent.planReadsUsed >= ent.planReads) {
    return { status: 402, code: "limit", error: `You've used this month's ${ent.planReads} AI plan reads.` };
  }
  return null;
}
