/* =========================================================================
   MODULE: _lib/ai-access.js — does this caller's plan include AI?

   Runs on both the Express dev server and the Vercel functions, after the
   abuse guard and before any money is spent. The browser sends the user's
   Supabase access token as a Bearer header; we ask Supabase who that token
   belongs to (which also verifies it), then read their own profile row with
   the same token — RLS lets a user read only themselves — and apply the
   shared plan rules from src/lib/entitlements.js.

   The plan is read FRESH on every call (only the identity is cached, in
   supabase-server.js): a customer who has just paid must get AI at once,
   and one who cancelled must lose it at once.

   Plan-read LIMITS are not checked here any more — metering.js reserves a
   read atomically right before the model call, which is the only race-free
   place to enforce a cap.

   No service-role key is used here. If the server has no Supabase settings
   at all, the check is skipped (local dev without accounts).
   ========================================================================= */
import { entitlementsFor, AI_ADDON } from "../../src/lib/entitlements.js";
import { supaUrl, supabaseConfigured, getUser, userHeaders } from "./supabase-server.js";

export { supabaseConfigured as aiAccessConfigured };

/**
 * Who is calling and what their plan allows.
 * @returns {Promise<{ denied: null | { status, code, error }, user?: { id, email, token }, ent?: object }>}
 *   `user` is undefined when accounts aren't configured (dev).
 */
export async function authorizeAi(req) {
  if (!supabaseConfigured()) return { denied: null };

  const who = await getUser(req, { what: "the AI assistant" });
  if (!who.ok) return { denied: { status: who.status, code: who.code, error: who.error } };

  let rows;
  try {
    const prof = await fetch(
      `${supaUrl()}/rest/v1/profiles?select=tier,ai_addon,plan_reads_used,period_started_at&id=eq.${encodeURIComponent(who.id)}`,
      { headers: userHeaders(who.token) },
    );
    rows = prof.ok ? await prof.json() : [];
  } catch {
    // Fail closed: if we can't confirm the plan, don't spend.
    return { denied: { status: 503, code: "unavailable", error: "Couldn't confirm your plan right now. Try again in a moment." } };
  }
  const ent = entitlementsFor(rows[0] || null);
  const user = { id: who.id, email: who.email, token: who.token };

  if (!ent.ai) {
    return {
      user, ent,
      denied: {
        status: 402, code: "upgrade",
        error: `AI assistance isn't part of the Homeowner plan. Add the ${AI_ADDON.label} (A$${AI_ADDON.price}/mo) or move to Tradie or Builder.`,
      },
    };
  }
  return { denied: null, user, ent };
}

/** Back-compatible: null when the call may proceed, else the denial. */
export async function checkAiAccess(req) {
  return (await authorizeAi(req)).denied;
}
