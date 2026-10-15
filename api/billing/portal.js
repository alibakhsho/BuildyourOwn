/* =========================================================================
   POST /api/billing/portal → { url }  Stripe's customer portal: change plan,
   switch monthly/yearly, update the card, download tax invoices, cancel.
   What the portal allows is set by its configuration in Stripe (created
   with the products; it's the account default).
   Signed-in users with a Stripe customer only, website only.
   ========================================================================= */
import { getUser } from "../_lib/supabase-server.js";
import { nativeCors } from "../_lib/guard.js";
import { stripe, readOwnProfile, billingPreflight, billingError, returnOrigin } from "../_lib/billing.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const blocked = billingPreflight(req, "portal");
  if (blocked) return res.status(blocked.status).json(blocked.body);

  const who = await getUser(req, { what: "billing" });
  if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });

  try {
    const profile = await readOwnProfile(who);
    if (!profile?.stripe_customer_id) {
      return res.status(404).json({ error: "There's no billing on this account yet.", code: "no_customer" });
    }
    const session = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${returnOrigin(req)}/?billing=portal`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    const { status, body } = billingError(e);
    return res.status(status).json(body);
  }
}
