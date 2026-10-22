/* =========================================================================
   POST /api/account/delete — delete the caller's account.

   Paid accounts first have every Stripe subscription cancelled, so deleting
   an account can never leave a card being charged for it. Then the
   database function delete_my_account() runs AS THE USER (their token), so
   this route can only ever delete the account that called it; the profile,
   cloud projects and marketplace records go with it (on delete cascade).
   Then the account's marketplace photos (storage marketplace/<user id>/…)
   are deleted with the server key, as the Privacy Policy promises.
   If Stripe can't be reached the account is NOT deleted — better to ask
   the user to retry than to leave a subscription billing a deleted account.
   Works from the phone app too: the app stores require in-app deletion.
   ========================================================================= */
import { getUser, rpc, userHeaders, supaUrl, serviceKey, serviceHeaders } from "../_lib/supabase-server.js";
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
    // The account is gone either way; photo clean-up is best effort and logged.
    await removeMarketplacePhotos(who.id).catch((e) => console.error("[account delete] photos:", e?.message || e));
    return res.status(200).json({ deleted: true });
  } catch (e) {
    console.error("[account delete]", e?.message || e);
    return res.status(502).json({ error: "Your account couldn't be deleted just now — nothing was removed. Try again in a moment.", code: "unavailable" });
  }
}

/* Every file under marketplace/<userId>/ — the only place a user can upload
   (storage policy). Listed and deleted in pages of 1000. */
export async function removeMarketplacePhotos(userId) {
  if (!serviceKey() || !/^[0-9a-f-]{36}$/i.test(userId)) return 0;
  const base = `${supaUrl()}/storage/v1/object`;
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    const list = await fetch(`${base}/list/marketplace`, {
      method: "POST", headers: serviceHeaders(),
      body: JSON.stringify({ prefix: userId, limit: 1000, offset: 0 }),
    });
    if (!list.ok) throw new Error(`list failed (${list.status})`);
    const files = (await list.json()).filter((f) => f?.name && f.id !== null).map((f) => `${userId}/${f.name}`);
    if (!files.length) return removed;
    const del = await fetch(`${base}/marketplace`, { method: "DELETE", headers: serviceHeaders(), body: JSON.stringify({ prefixes: files }) });
    if (!del.ok) throw new Error(`delete failed (${del.status})`);
    removed += files.length;
    if (files.length < 1000) return removed;
  }
  return removed;
}
