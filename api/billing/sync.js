/* =========================================================================
   POST /api/billing/sync   { sessionId? } → { tier, aiAddon, status, ... }

   Called by the app when someone comes back from Checkout or the billing
   portal, so the new plan shows straight away instead of waiting for the
   webhook. It reads Stripe — the request can't name a plan — so calling it
   any number of times is harmless. With a Checkout session id, the session
   must belong to the caller (client_reference_id) before its customer is
   linked to the account.
   Works from the phone app too (it only reads), so the app can refresh a
   plan bought on the website.
   ========================================================================= */
import { getUser } from "../_lib/supabase-server.js";
import { nativeCors } from "../_lib/guard.js";
import { stripe, readOwnProfile, syncCustomer, billingPreflight, billingError } from "../_lib/billing.js";
import { rpc, serviceHeaders } from "../_lib/supabase-server.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const blocked = billingPreflight(req, "sync", { webOnly: false });
  if (blocked) return res.status(blocked.status).json(blocked.body);

  const who = await getUser(req, { what: "billing" });
  if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });

  try {
    const profile = await readOwnProfile(who);
    let customer = profile?.stripe_customer_id || null;

    const sessionId = String(req.body?.sessionId || "");
    if (!customer && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      if (session?.client_reference_id !== who.id) {
        return res.status(403).json({ error: "That checkout belongs to a different account." });
      }
      if (session.customer) {
        customer = await rpc("link_stripe_customer", { p_user: who.id, p_customer: session.customer }, serviceHeaders());
      }
    }
    if (!customer) return res.status(200).json({ tier: profile?.tier || "free", status: null, synced: false });

    const out = await syncCustomer(customer, who.id);
    return res.status(200).json({
      synced: out.applied, tier: out.tier, aiAddon: out.aiAddon, status: out.status,
      interval: out.interval, renewsAt: out.renewsAt, cancelsAt: out.cancelsAt,
    });
  } catch (e) {
    const { status, body } = billingError(e);
    return res.status(status).json(body);
  }
}
