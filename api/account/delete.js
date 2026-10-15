/* =========================================================================
   POST /api/account/delete — delete the caller's account.

   Paid accounts first have every Stripe subscription cancelled, so deleting
   an account can never leave a card being charged for it. Then the
   database function delete_my_account() runs AS THE USER (their token), so
   this route can only ever delete the account that called it; the profile
   and cloud projects go with it (on delete cascade).
   If Stripe can't be reached the account is NOT deleted — better to ask
   the user to retry than to leave a subscription billing a deleted account.
   Works from the phone app too: the app stores require in-app deletion.
   ========================================================================= */
import { getUser, rpc, userHeaders } from "../_lib/supabase-server.js";
import { nativeCors } from "../_lib/guard.js";
import { readOwnProfile, cancelAllSubscriptions, stripe } from "../_lib/billing.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const who = await getUser(req, { what: "your account" });
  if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });

  try {
    const profile = await readOwnProfile(who);
    if (profile?.stripe_customer_id) {
      if (!stripe()) {
        return res.status(503).json({ error: "Couldn't cancel your subscription right now, so your account wasn't deleted. Try again shortly.", code: "unavailable" });
      }
      await cancelAllSubscriptions(profile.stripe_customer_id);
    }
    await rpc("delete_my_account", {}, userHeaders(who.token));
    return res.status(200).json({ deleted: true });
  } catch (e) {
    console.error("[account delete]", e?.message || e);
    return res.status(502).json({ error: "Your account couldn't be deleted just now — nothing was removed. Try again in a moment.", code: "unavailable" });
  }
}
