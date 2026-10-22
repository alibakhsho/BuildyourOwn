/* =========================================================================
   MODULE: _lib/market-email.js — the "you've got an enquiry" email.

   Pure: builds the subject and bodies from the enquiry; sending lives in
   api/market/notify.js. Everything the buyer typed is escaped before it goes
   into HTML, and the seller replies straight to the buyer (Reply-To), so the
   conversation leaves BuildYourOwn's inbox out of it.

   Email goes out through Resend (https://resend.com) when RESEND_API_KEY is
   set. MARKET_EMAIL_FROM must be an address on a domain verified in Resend.
   ========================================================================= */

export const DEFAULT_FROM = "BuildYourOwn <enquiries@buildyourown.dev>";

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* One line, no control characters: subjects and headers must not be split. */
const oneLine = (s = "", max = 120) => String(s).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * @param {{ sellerName?: string, listingTitle?: string|null,
 *           enquiry: { contact_name: string, contact_email: string, contact_phone?: string|null,
 *                      postcode?: string|null, message: string },
 *           siteUrl: string }} p
 */
export function enquiryEmail({ sellerName, listingTitle, enquiry, siteUrl }) {
  const who = oneLine(enquiry.contact_name, 80) || "A buyer";
  const about = listingTitle ? oneLine(listingTitle, 100) : null;
  const subject = about ? `New enquiry from ${who}: ${about}` : `New enquiry from ${who}`;
  const link = `${siteUrl.replace(/\/$/, "")}/?open=market`;
  const lines = [
    `Hi ${oneLine(sellerName, 80) || "there"},`,
    "",
    `${who} sent you an enquiry on BuildYourOwn${about ? ` about "${about}"` : ""}.`,
    "",
    enquiry.message,
    "",
    `Email: ${enquiry.contact_email}`,
    enquiry.contact_phone ? `Phone: ${enquiry.contact_phone}` : null,
    enquiry.postcode ? `Build site postcode: ${enquiry.postcode}` : null,
    "",
    "Reply to this email to answer them directly.",
    `Your enquiries: ${link}`,
    "",
    "When it turns into a signed contract, record it under My marketplace → Enquiries → Contract signed.",
  ].filter((l) => l !== null);

  const row = (k, v) => `<tr><td style="padding:2px 12px 2px 0;color:#5B6678">${k}</td><td style="padding:2px 0">${v}</td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0F172A;max-width:560px">
  <p>Hi ${esc(oneLine(sellerName, 80)) || "there"},</p>
  <p><b>${esc(who)}</b> sent you an enquiry on BuildYourOwn${about ? ` about <b>${esc(about)}</b>` : ""}.</p>
  <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #F5C518;background:#F8FAFC;white-space:pre-line">${esc(enquiry.message)}</blockquote>
  <table style="font-size:13px">${[
    row("Email", `<a href="mailto:${esc(enquiry.contact_email)}">${esc(enquiry.contact_email)}</a>`),
    enquiry.contact_phone ? row("Phone", esc(enquiry.contact_phone)) : "",
    enquiry.postcode ? row("Site postcode", esc(enquiry.postcode)) : "",
  ].join("")}</table>
  <p>Reply to this email to answer them directly.</p>
  <p><a href="${esc(link)}" style="display:inline-block;padding:8px 14px;background:#0F172A;color:#F5C518;text-decoration:none;font-weight:bold">Open your enquiries</a></p>
  <p style="font-size:12px;color:#5B6678">When it turns into a signed contract, record it under My marketplace → Enquiries → Contract signed.</p>
</div>`;

  return { subject, text: lines.join("\n"), html, replyTo: oneLine(enquiry.contact_email, 200) };
}
