/* =========================================================================
   POST /api/billing/checkout   { plan: "pro"|"business"|"ai", interval: "month"|"year" }
   → { url }  a Stripe-hosted Checkout page for that plan.

   Signed-in users only, website only. GST is added at checkout by Stripe Tax
   (prices are tax-exclusive). Someone still in their free trial keeps the
   rest of it: the subscription starts with trial_end = the app trial's end,
   so the card is first charged when the free days run out.
   Mounted on the Express dev server too (server/index.js).
   ========================================================================= */
import { getUser } from "../_lib/supabase-server.js";
import { nativeCors } from "../_lib/guard.js";
import {
  stripe, BUYABLE, INTERVALS, priceFor, readOwnProfile, customerFor,
  billingPreflight, billingError, returnOrigin,
} from "../_lib/billing.js";

const RANK = { free: 0, pro: 1, business: 2 };
const MIN_TRIAL_MS = 48 * 3600_000;   // Checkout needs a trial_end at least 48 h away

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const blocked = billingPreflight(req, "checkout");
  if (blocked) return res.status(blocked.status).json(blocked.body);

  const who = await getUser(req, { what: "plans" });
  if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });

  const { plan, interval = "month" } = req.body || {};
  if (!BUYABLE.includes(plan) || !INTERVALS.includes(interval)) {
    return res.status(400).json({ error: "Pick a plan and monthly or yearly billing." });
  }

  try {
    const profile = await readOwnProfile(who);
    if (!profile) return res.status(409).json({ error: "Your account is still being set up — try again in a moment.", code: "no_profile" });

    // One subscription per account: changes go through the billing portal,
    // so nobody pays twice for overlapping plans.
    const live = ["active", "trialing", "past_due"].includes(profile.billing_status);
    if (live && (profile.tier !== "free" || profile.ai_addon)) {
      return res.status(409).json({ error: "You already have a plan — change it from Manage billing.", code: "has_subscription" });
    }
    if (plan === "ai" && profile.tier !== "free") {
      return res.status(409).json({ error: "AI is already included in your plan.", code: "included" });
    }

    const price = await priceFor(plan, interval);
    if (!price) return res.status(503).json({ error: "That plan isn't available to buy yet.", code: "unavailable" });

    const customer = await customerFor(who, profile);

    // Carry over what's left of the free trial (same plan or a lower one).
    const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at).getTime() : 0;
    const carryTrial = plan !== "ai"
      && trialEnds - Date.now() > MIN_TRIAL_MS
      && RANK[plan] <= (RANK[profile.trial_tier] ?? 0);

    const origin = returnOrigin(req);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: who.id,
      line_items: [{ price: price.id, quantity: 1 }],
      automatic_tax: { enabled: true },
      // Stripe Tax needs the customer's address; store it (and an ABN, if
      // they enter one) on the customer for future invoices.
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: who.id, byo_plan: plan },
        ...(carryTrial ? { trial_end: Math.floor(trialEnds / 1000) } : {}),
      },
      metadata: { supabase_user_id: who.id, byo_plan: plan },
      success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing=cancel`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    const { status, body } = billingError(e);
    return res.status(status).json(body);
  }
}
