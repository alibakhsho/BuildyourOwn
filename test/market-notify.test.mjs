/* Enquiry alert email: the template (pure) and the route, with Supabase and
   Resend replaced by a fake fetch. Nothing leaves the machine. */
let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";

const { enquiryEmail } = await import("../api/_lib/market-email.js");
const { default: notify } = await import("../api/market/notify.js");
const { __resetIdentityCache } = await import("../api/_lib/supabase-server.js");

/* ---- template ---- */
const enquiry = { contact_name: "Priya <script>", contact_email: "priya@example.com", contact_phone: "0400 000 000", postcode: "4870", message: "Can you build <b>this</b>?\nThanks" };
const mail = enquiryEmail({ sellerName: "Coastline Homes", listingTitle: "The Kauri", enquiry, siteUrl: "https://buildyourown.dev/" });
ok("subject names buyer and listing", mail.subject === "New enquiry from Priya <script>: The Kauri", mail.subject);
ok("buyer text is escaped in HTML", !mail.html.includes("<script>") && mail.html.includes("&lt;script&gt;") && mail.html.includes("&lt;b&gt;this&lt;/b&gt;"));
ok("reply goes to the buyer", mail.replyTo === "priya@example.com");
ok("link opens the seller's inbox", mail.text.includes("https://buildyourown.dev/?open=market"));
ok("newlines can't split the subject", !enquiryEmail({ enquiry: { ...enquiry, contact_name: "A\r\nBcc: x@y.z" }, siteUrl: "x" }).subject.includes("\n"));

/* ---- route ---- */
const ENQ = "f0000000-0000-4000-8000-000000000001";
const BUYER = "b0000000-0000-4000-8000-000000000001";
let calls, claimRows, resendOk, adminDown = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || "GET", body: init.body, headers: init.headers });
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith("/auth/v1/user")) return init.headers?.Authorization === "Bearer good" ? json(200, { id: BUYER, email: "priya@example.com" }) : json(401, {});
  if (u.includes("/rest/v1/enquiries") && init.method === "PATCH") {
    const body = JSON.parse(init.body);
    return body.notified_at === null ? json(200, []) : json(200, claimRows);
  }
  if (u.includes("/auth/v1/admin/users/")) return adminDown ? json(401, {}) : json(200, { email: "seller@example.com" });
  if (u.includes("/rest/v1/pro_profiles")) return json(200, [{ display_name: "Coastline Homes" }]);
  if (u.includes("/rest/v1/listings")) return json(200, [{ title: "The Kauri" }]);
  if (u.startsWith("https://api.resend.com")) return resendOk ? json(200, { id: "em_1" }) : json(422, { message: "domain not verified" });
  return json(404, {});
};
const run = async (body, token = "good") => {
  __resetIdentityCache();
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() {} };
  await notify({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return res;
};
const reset = () => { calls = []; claimRows = [{ id: ENQ, seller_id: "s1", listing_id: "l1", ...enquiry }]; resendOk = true; };

reset(); let r = await run({ enquiryId: ENQ }, null);
ok("signed out → 401", r.code === 401);
reset(); r = await run({ enquiryId: "not-a-uuid" });
ok("bad id → 400", r.code === 400);

delete process.env.RESEND_API_KEY;
reset(); r = await run({ enquiryId: ENQ });
ok("no email key → not sent, nothing claimed", r.code === 200 && r.body.reason === "email_not_configured" && !calls.some((c) => c.method === "PATCH"));

process.env.RESEND_API_KEY = "re_test";
reset(); r = await run({ enquiryId: ENQ });
const claim = calls.find((c) => c.method === "PATCH");
ok("claim is scoped to this buyer, un-notified, recent", claim && claim.url.includes(`buyer_id=eq.${BUYER}`) && claim.url.includes("notified_at=is.null") && claim.url.includes("created_at=gte."), claim?.url);
const sent = calls.find((c) => c.url.startsWith("https://api.resend.com"));
const payload = sent ? JSON.parse(sent.body) : {};
ok("email sent to the seller, reply-to the buyer", r.body.sent === true && payload.to?.[0] === "seller@example.com" && payload.reply_to === "priya@example.com", JSON.stringify(r.body));

reset(); claimRows = []; r = await run({ enquiryId: ENQ });
ok("already notified (or not theirs) → nothing sent", r.body.sent === false && r.body.reason === "nothing_to_send" && !calls.some((c) => c.url.startsWith("https://api.resend.com")));

reset(); resendOk = false; r = await run({ enquiryId: ENQ });
const released = calls.filter((c) => c.method === "PATCH").some((c) => JSON.parse(c.body).notified_at === null);
ok("email refused → claim released so a retry can send", r.code === 502 && released);

reset(); adminDown = true; r = await run({ enquiryId: ENQ });
const releasedAgain = calls.filter((c) => c.method === "PATCH").some((c) => JSON.parse(c.body).notified_at === null);
ok("secret key refused by Auth → 503, logged, claim released", r.code === 503 && r.body.reason === "unavailable" && releasedAgain);
adminDown = false;

/* ---- account deletion removes the user's marketplace photos ---- */
const { removeMarketplacePhotos } = await import("../api/account/delete.js");
const UID = "c0000000-0000-4000-8000-000000000001";
let storageCalls = [];
globalThis.fetch = async (url, init = {}) => {
  storageCalls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
  if (String(url).includes("/storage/v1/object/list/marketplace")) {
    const listed = storageCalls.filter((c) => c.url.includes("/list/")).length;
    return { ok: true, json: async () => (listed === 1 ? [{ name: "a.jpg", id: "1" }, { name: "b.jpg", id: "2" }] : []) };
  }
  return { ok: true, json: async () => ({}) };
};
const n = await removeMarketplacePhotos(UID);
const del = storageCalls.find((c) => c.method === "DELETE");
ok("deletes every photo in the user's own folder, and only there", n === 2 && JSON.stringify(del?.body?.prefixes) === JSON.stringify([`${UID}/a.jpg`, `${UID}/b.jpg`]) && storageCalls[0].body.prefix === UID);
storageCalls = [];
ok("refuses anything that isn't a user id", (await removeMarketplacePhotos("../other")) === 0 && storageCalls.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
