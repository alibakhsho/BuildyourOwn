/* =========================================================================
   POST /api/market/notify { enquiryId } → { sent, reason? }
   Emails the seller about an enquiry the caller has just sent.

   Called by the app straight after the enquiry is saved. Only the buyer who
   sent it can trigger the email, only once (enquiries.notified_at is claimed
   atomically before sending, and released if sending fails), and only in the
   first 15 minutes — so this can't be used to spam a seller, or anyone else.

   If email isn't set up (no RESEND_API_KEY) or the server has no Supabase
   secret key, this answers { sent: false } and nothing breaks: the enquiry
   is already in the seller's inbox in the app.
   ========================================================================= */
import { getUser, supaUrl, serviceKey, serviceHeaders } from "../_lib/supabase-server.js";
import { nativeCors } from "../_lib/guard.js";
import { enquiryEmail, DEFAULT_FROM } from "../_lib/market-email.js";
import { SITE_URL } from "../../src/lib/public-config.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_MS = 15 * 60 * 1000;

async function rest(path, init = {}) {
  const res = await fetch(`${supaUrl()}/rest/v1/${path}`, { ...init, headers: { ...serviceHeaders(), ...(init.headers || {}) } });
  if (!res.ok) throw Object.assign(new Error(`supabase ${res.status}`), { status: res.status });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const who = await getUser(req, { what: "enquiries" });
  if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });

  const id = String(req.body?.enquiryId || "");
  if (!UUID.test(id)) return res.status(400).json({ error: "Which enquiry?", code: "bad_request" });

  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return res.status(200).json({ sent: false, reason: "email_not_configured" });
  if (!serviceKey()) return res.status(200).json({ sent: false, reason: "server_not_configured" });

  // Claim: one row, sent by this caller, recent, not yet notified. A second
  // call (double tap, retry) finds nothing to claim and sends nothing.
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  let claimed;
  try {
    claimed = await rest(
      `enquiries?id=eq.${id}&buyer_id=eq.${who.id}&notified_at=is.null&created_at=gte.${encodeURIComponent(since)}` +
        "&select=id,seller_id,listing_id,contact_name,contact_email,contact_phone,postcode,message",
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ notified_at: new Date().toISOString() }) },
    );
  } catch {
    return res.status(503).json({ sent: false, reason: "unavailable" });
  }
  const enquiry = claimed?.[0];
  if (!enquiry) return res.status(200).json({ sent: false, reason: "nothing_to_send" });

  const release = () =>
    rest(`enquiries?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ notified_at: null }) }).catch(() => {});

  try {
    const [sellerRes, sellerRows, listingRows] = await Promise.all([
      fetch(`${supaUrl()}/auth/v1/admin/users/${enquiry.seller_id}`, { headers: serviceHeaders() }),
      rest(`pro_profiles?user_id=eq.${enquiry.seller_id}&select=display_name`),
      enquiry.listing_id ? rest(`listings?id=eq.${enquiry.listing_id}&select=title`) : Promise.resolve([]),
    ]);
    const seller = sellerRes.ok ? await sellerRes.json() : null;
    if (!seller?.email) { await release(); return res.status(200).json({ sent: false, reason: "seller_has_no_email" }); }

    const mail = enquiryEmail({
      sellerName: sellerRows?.[0]?.display_name,
      listingTitle: listingRows?.[0]?.title || null,
      enquiry,
      siteUrl: SITE_URL,
    });
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: (process.env.MARKET_EMAIL_FROM || "").trim() || DEFAULT_FROM,
        to: [seller.email],
        reply_to: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!sent.ok) {
      await release();
      console.error("[market/notify] Resend refused:", sent.status, await sent.text().catch(() => ""));
      return res.status(502).json({ sent: false, reason: "email_failed" });
    }
    return res.status(200).json({ sent: true });
  } catch (e) {
    await release();
    console.error("[market/notify]", e.message);
    return res.status(503).json({ sent: false, reason: "unavailable" });
  }
}
