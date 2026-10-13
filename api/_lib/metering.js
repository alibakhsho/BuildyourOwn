/* =========================================================================
   MODULE: _lib/metering.js — count AI plan reads against the plan's cap.

   withPlanRead(access, run):
     1. reserve one read (SQL reserve_plan_read, called with the USER's own
        token — check-and-count is one locked statement, so parallel
        requests can't all slip under the cap);
     2. run the expensive model call;
     3. if it throws, refund the read (SQL refund_plan_read, server key
        only — users must never be able to refill their own allowance).
   A refund needs SUPABASE_SECRET_KEY; without it a failed read simply
   isn't given back (logged), which costs the user one read, never money.

   `access` is the result of authorizeAi(); when accounts aren't configured
   (local dev) it has no user and the call just runs.
   ========================================================================= */
import { rpc, userHeaders, serviceHeaders, serviceKey } from "./supabase-server.js";

export class PlanReadLimit extends Error {
  constructor(cap, windowEnd) {
    super(`You've used this month's ${cap} AI plan reads.`);
    this.status = 402; this.code = "limit"; this.resetsAt = windowEnd || null;
  }
}

export async function withPlanRead(access, run) {
  const { user, ent } = access || {};
  if (!user) return run();

  const cap = Number.isFinite(ent?.planReads) ? ent.planReads : null;
  let reservation;
  try {
    reservation = await rpc("reserve_plan_read", { p_cap: cap }, userHeaders(user.token));
  } catch {
    // Fail closed — no confirmed reservation, no model call.
    throw Object.assign(new Error("Couldn't check your plan-read allowance right now. Try again in a moment."), { status: 503, code: "unavailable" });
  }
  if (!reservation?.ok) {
    if (reservation?.reason === "no_profile") {
      throw Object.assign(new Error("Your account profile is missing. Sign out and back in, then try again."), { status: 409, code: "no_profile" });
    }
    throw new PlanReadLimit(cap, reservation?.window_end);
  }

  try {
    return await run();
  } catch (e) {
    if (serviceKey()) {
      try {
        await rpc("refund_plan_read", { p_user: user.id, p_window_start: reservation.window_start }, serviceHeaders());
      } catch (r) {
        console.error("[byo] plan-read refund failed", { user: user.id, error: r.message });
      }
    } else {
      console.warn("[byo] plan read failed but SUPABASE_SECRET_KEY is not set, so it was not refunded");
    }
    throw e;
  }
}
