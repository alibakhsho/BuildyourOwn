/* =========================================================================
   MODULE: _lib/accounting.js — the Xero / MYOB routes, for both runtimes
   (Vercel functions under api/accounting/, and the Express dev server).

     GET  /api/accounting/status                    which providers are set up / connected
     POST /api/accounting/:provider/connect         → { url } of the consent screen
     GET  /api/accounting/:provider/callback        the provider sends the builder back here
     POST /api/accounting/:provider/disconnect      forget the tokens
     POST /api/accounting/:provider/invoice         push a progress claim (DRAFT)
     POST /api/accounting/:provider/purchase-order  push a purchase order (DRAFT)

   Per account: every builder signs up with BuildYourOwn, then connects THEIR
   OWN Xero organisation or MYOB company file. Requests carry the Supabase
   session; the tokens for that account are loaded (decrypted), the provider
   code runs against them, and anything that changed (a rotated refresh
   token) is written back before the response.

   Local single-builder mode: with no ACCOUNTING_TOKEN_KEY (and not on
   Vercel) the dev server keeps using server/.tokens.json, no sign-in needed.

   Nothing here sends anything to a client or supplier: invoices and POs
   arrive in Xero/MYOB as drafts for the builder to review and send.
   ========================================================================= */
import * as xero from "../../server/accounting/xero.js";
import * as myob from "../../server/accounting/myob.js";
import { publicStatus, clearTokens, issueState, consumeState, withTokenScope, signState, verifyState } from "../../server/accounting/tokens.js";
import { getUser } from "./supabase-server.js";
import { perAccountReady, loadConnections, saveConnections, tokenKey } from "./accounting-store.js";

const PROVIDERS = { xero, myob };
const LABEL = { xero: "Xero", myob: "MYOB" };
const configured = (p) => (p === "xero" ? xero.xeroConfigured() : myob.myobConfigured());
const appUrl = () => (process.env.BYO_APP_URL || process.env.BYO_PUBLIC_URL || "http://localhost:5173").replace(/\/$/, "");
const onVercel = () => !!process.env.VERCEL;
/* per account unless this is the local dev server without a key */
const perAccount = () => perAccountReady() || onVercel();

const providerOf = (req) => (req.params?.provider || req.query?.provider || "").toString();

/**
 * Run fn (which returns the JSON body) with the caller's connections in
 * scope, write back whatever changed — a refresh rotates Xero's token, and
 * losing that write loses the connection — and only then answer.
 */
async function asAccount(req, res, fn) {
  if (!perAccount()) return res.status(200).json(await fn(null));
  if (!perAccountReady()) {
    return res.status(503).json({ error: "Accounting connections aren't switched on for this site yet (ACCOUNTING_TOKEN_KEY and the Supabase secret key are needed on the server).", code: "not_configured" });
  }
  const who = await getUser(req, { what: "Xero and MYOB" });
  if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });
  const scope = { data: await loadConnections(who.id), dirty: new Set() };
  let body, err;
  await withTokenScope(scope, async () => { try { body = await fn(who); } catch (e) { err = e; } });
  await saveConnections(who.id, scope);   // even after a failure: a refresh may have rotated, or a dead token been cleared
  if (err) throw err;
  return res.status(200).json(body);
}

const fail = (res, e) => res.status(e.status || 500).json({ error: e.message || "Something went wrong." });

/* ---- status ------------------------------------------------------------ */
export async function status(req, res) {
  const view = () => ({
    perAccount: perAccount(),
    xero: { provider: "xero", label: "Xero", configured: xero.xeroConfigured(), ...publicStatus("xero") },
    myob: { provider: "myob", label: "MYOB", configured: myob.myobConfigured(), ...publicStatus("myob") },
  });
  try {
    if (perAccount() && !req.headers?.authorization) {
      // signed out: say what's possible without touching anyone's tokens
      const v = { perAccount: true, signedIn: false, xero: { provider: "xero", label: "Xero", configured: xero.xeroConfigured(), connected: false }, myob: { provider: "myob", label: "MYOB", configured: myob.myobConfigured(), connected: false } };
      return res.status(200).json(v);
    }
    return await asAccount(req, res, () => ({ ...view(), signedIn: true }));
  } catch (e) { return fail(res, e); }
}

/* ---- connect: hand back the consent-screen URL ------------------------- */
export async function connect(req, res) {
  const name = providerOf(req);
  if (!PROVIDERS[name]) return res.status(404).json({ error: "Unknown accounting provider." });
  if (!configured(name)) {
    return res.status(400).json({ error: `${LABEL[name]} isn't set up on the server yet: it needs ${name.toUpperCase()}_CLIENT_ID and ${name.toUpperCase()}_CLIENT_SECRET.`, code: "not_configured" });
  }
  try {
    if (!perAccount()) {
      const url = PROVIDERS[name].buildAuthUrl(issueState(name));
      // the old dev flow navigated here directly; keep that working
      return req.method === "GET" ? res.redirect(url) : res.status(200).json({ url });
    }
    if (!perAccountReady()) return res.status(503).json({ error: "Accounting connections aren't switched on for this site yet.", code: "not_configured" });
    const who = await getUser(req, { what: "Xero and MYOB" });
    if (!who.ok) return res.status(who.status).json({ error: who.error, code: who.code });
    const state = signState(tokenKey(), { provider: name, userId: who.id, returnTo: String(req.body?.returnTo || "").slice(0, 200) });
    return res.status(200).json({ url: PROVIDERS[name].buildAuthUrl(state) });
  } catch (e) { return fail(res, e); }
}

/* ---- callback: the builder's browser lands here from the provider ------ */
export async function callback(req, res) {
  const name = providerOf(req);
  const send = (code, title, body, back) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(code).send(page(title, body, back)); };
  if (!PROVIDERS[name]) return send(404, "Unknown provider", "That callback does not match a provider we support.");
  const q = req.query || {};
  if (q.error) return send(400, `${LABEL[name]} declined the connection`, q.error_description || String(q.error), appUrl());
  if (!q.code) return send(400, "Missing authorisation code", "The provider redirected without a code.", appUrl());

  const back = (st) => `${appUrl()}${st?.returnTo?.startsWith("/") ? st.returnTo : "/"}`;
  const exchange = async () => {
    if (name === "myob") await myob.exchangeCode(q.code, q.businessId || q.cf_uri || null);
    else await xero.exchangeCode(q.code);
    return publicStatus(name);
  };
  try {
    if (!perAccount()) {
      if (!consumeState(q.state)) return send(400, "That connection attempt expired", "Start again from Settings. Links are single-use and valid for ten minutes.", appUrl());
      const s = await exchange();
      return send(200, `${LABEL[name]} connected`, `BuildYourOwn is now linked to ${s.organisation || "your organisation"}. You can close this tab.`, appUrl());
    }
    const st = perAccountReady() ? verifyState(tokenKey(), q.state) : null;
    if (!st || st.provider !== name) return send(400, "That connection attempt expired", "Start again from Site Office → Settings. A connection link works once, for ten minutes.", appUrl());
    const scope = { data: await loadConnections(st.userId), dirty: new Set() };
    const s = await withTokenScope(scope, exchange);
    await saveConnections(st.userId, scope);
    return send(200, `${LABEL[name]} connected`, `BuildYourOwn is now linked to ${s.organisation || "your organisation"}. Progress claims and purchase orders will arrive there as drafts.`, back(st));
  } catch (e) {
    return send(e.status && e.status < 500 ? e.status : 502, `Couldn't finish connecting ${LABEL[name]}`, e.message, appUrl());
  }
}

/* ---- disconnect -------------------------------------------------------- */
export async function disconnect(req, res) {
  const name = providerOf(req);
  if (!PROVIDERS[name]) return res.status(404).json({ error: "Unknown accounting provider." });
  try {
    return await asAccount(req, res, () => { clearTokens(name); return { ok: true, connected: false }; });
  } catch (e) { return fail(res, e); }
}

/* ---- push a progress claim --------------------------------------------- */
export async function invoice(req, res) {
  const name = providerOf(req);
  if (!PROVIDERS[name]) return res.status(404).json({ error: "Unknown accounting provider." });
  const { claim, totals, job, client, lineItems } = req.body || {};
  if (!claim || !job || !Array.isArray(lineItems) || !lineItems.length) {
    return res.status(400).json({ error: "A claim, its job, and at least one line item are required." });
  }
  try {
    return await asAccount(req, res, async () => {
      if (name === "xero") {
        let contactId = client?.xeroContactId || null;
        if (!contactId && client) contactId = (await xero.upsertContact(client))?.ContactID || null;
        const inv = await xero.createInvoice({ contactId, contactName: client?.company || client?.name, claim, totals, job, lineItems });
        return { ok: true, provider: "xero", invoiceId: inv?.InvoiceID || null, invoiceNumber: inv?.InvoiceNumber || null, contactId, status: inv?.Status || "DRAFT" };
      }
      const out = await myob.createInvoice({ claim, job, client, lineItems });
      return { ok: true, provider: "myob", location: out?.location || null, status: "Open" };
    });
  } catch (e) { return fail(res, e); }
}

/* ---- push a purchase order --------------------------------------------- */
export async function purchaseOrder(req, res) {
  const name = providerOf(req);
  if (!PROVIDERS[name]) return res.status(404).json({ error: "Unknown accounting provider." });
  const { po, job } = req.body || {};
  if (!po || !job) return res.status(400).json({ error: "A purchase order and its job are required." });
  if (!(po.lines || []).length) return res.status(400).json({ error: "That purchase order has no lines." });
  try {
    return await asAccount(req, res, async () => {
      if (name === "xero") {
        const out = await xero.createPurchaseOrder({ po, job });
        return { ok: true, provider: "xero", purchaseOrderId: out?.PurchaseOrderID || null, purchaseOrderNumber: out?.PurchaseOrderNumber || null, status: out?.Status || "DRAFT" };
      }
      const out = await myob.createPurchaseOrder({ po, job });
      return { ok: true, provider: "myob", location: out?.location || null };
    });
  } catch (e) { return fail(res, e); }
}

/** Minimal self-contained result page for the OAuth redirect. */
function page(title, body, backUrl) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#EDEEF0;color:#14171A;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  .card{background:#fff;border:1px solid #D5D8DC;padding:32px;max-width:520px}
  h1{font-size:20px;margin:0 0 10px} p{line-height:1.6;color:#3B414A;margin:0 0 18px}
  a{display:inline-block;background:#14171A;color:#F5C518;padding:10px 18px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.06em}
</style></head><body><div class="card">
  <h1>${esc(title)}</h1><p>${esc(body)}</p>
  ${backUrl ? `<a href="${esc(backUrl)}">Back to BuildYourOwn</a>` : ""}
</div></body></html>`;
}
