/* =========================================================================
   MODULE: server/accounting/routes.js
   HTTP surface for the Xero and MYOB connections.

     GET  /api/accounting/status                  which providers are set up
     GET  /api/accounting/:provider/connect       start the OAuth round trip
     GET  /api/accounting/:provider/callback      finish it (hit by the provider)
     POST /api/accounting/:provider/disconnect    forget the tokens
     POST /api/accounting/:provider/invoice       push a progress claim
     POST /api/accounting/:provider/purchase-order  push a PO

   Everything that writes into the builder's ledger creates a DRAFT. Nothing
   here sends an invoice to a client or commits an order to a supplier — the
   builder does that in Xero/MYOB, where they can see it in full first.
   ========================================================================= */

import * as xero from "./xero.js";
import * as myob from "./myob.js";
import { publicStatus, clearTokens, issueState, consumeState } from "./tokens.js";

const PROVIDERS = { xero, myob };
const appUrl = () => process.env.BYO_APP_URL || "http://localhost:5173";

export function mountAccounting(app) {
  /* ---- Status ---------------------------------------------------------- */
  app.get("/api/accounting/status", (_req, res) => {
    res.json({
      xero: { provider: "xero", label: "Xero", configured: xero.xeroConfigured(), ...publicStatus("xero") },
      myob: { provider: "myob", label: "MYOB", configured: myob.myobConfigured(), ...publicStatus("myob") },
    });
  });

  /* ---- Start the OAuth flow -------------------------------------------- */
  app.get("/api/accounting/:provider/connect", (req, res) => {
    const p = PROVIDERS[req.params.provider];
    if (!p) return res.status(404).json({ error: "Unknown accounting provider." });
    const configured = req.params.provider === "xero" ? xero.xeroConfigured() : myob.myobConfigured();
    if (!configured) {
      return res.status(400).json({
        error: `${req.params.provider.toUpperCase()} is not set up on the server. Add its client ID and secret to server/.env, then restart the backend.`,
      });
    }
    // state is single-use and short-lived — it is what stops a third party
    // from walking a builder into connecting an account we control.
    const state = issueState(req.params.provider);
    res.redirect(p.buildAuthUrl(state));
  });

  /* ---- OAuth callback --------------------------------------------------
     The provider redirects the builder's browser here, so failures render
     as a page rather than JSON — nobody debugging a connection wants to
     read a raw 400 body. */
  app.get("/api/accounting/:provider/callback", async (req, res) => {
    const name = req.params.provider;
    const p = PROVIDERS[name];
    if (!p) return res.status(404).send(page("Unknown provider", "That callback does not match a provider we support."));

    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      return res.status(400).send(page(`${label(name)} declined the connection`, errorDescription || String(error)));
    }
    if (!code) return res.status(400).send(page("Missing authorisation code", "The provider redirected without a code."));
    if (!consumeState(state)) {
      return res
        .status(400)
        .send(page("That connection attempt expired", "Start again from Settings → Integrations. Links are single-use and valid for ten minutes."));
    }

    try {
      if (name === "myob") {
        // Post-Sept-2026 MYOB returns the company file GUID on the redirect.
        // Accept either spelling — the parameter name has moved around.
        const businessId = req.query.businessId || req.query.cf_uri || null;
        await myob.exchangeCode(code, businessId);
      } else {
        await xero.exchangeCode(code);
      }
      const status = publicStatus(name);
      res.send(
        page(
          `${label(name)} connected`,
          `BuildYourOwn is now linked to ${status.organisation || "your organisation"}. You can close this tab.`,
          appUrl()
        )
      );
    } catch (e) {
      res.status(e.status || 500).send(page(`Could not finish connecting ${label(name)}`, e.message));
    }
  });

  /* ---- Disconnect ------------------------------------------------------ */
  app.post("/api/accounting/:provider/disconnect", (req, res) => {
    if (!PROVIDERS[req.params.provider]) return res.status(404).json({ error: "Unknown accounting provider." });
    clearTokens(req.params.provider);
    res.json({ ok: true, ...publicStatus(req.params.provider) });
  });

  /* ---- Push a progress claim ------------------------------------------- */
  app.post("/api/accounting/:provider/invoice", async (req, res) => {
    const name = req.params.provider;
    if (!PROVIDERS[name]) return res.status(404).json({ error: "Unknown accounting provider." });

    const { claim, totals, job, client, lineItems } = req.body || {};
    if (!claim || !job || !Array.isArray(lineItems) || !lineItems.length) {
      return res.status(400).json({ error: "A claim, its job, and at least one line item are required." });
    }

    try {
      if (name === "xero") {
        let contactId = client?.xeroContactId || null;
        if (!contactId && client) {
          const c = await xero.upsertContact(client);
          contactId = c?.ContactID || null;
        }
        const inv = await xero.createInvoice({
          contactId,
          contactName: client?.company || client?.name,
          claim, totals, job, lineItems,
        });
        return res.json({
          ok: true,
          provider: "xero",
          invoiceId: inv?.InvoiceID || null,
          invoiceNumber: inv?.InvoiceNumber || null,
          contactId,
          status: inv?.Status || "DRAFT",
        });
      }
      const out = await myob.createInvoice({ claim, job, client, lineItems });
      return res.json({ ok: true, provider: "myob", location: out?.location || null, status: "Open" });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  /* ---- Push a purchase order ------------------------------------------- */
  app.post("/api/accounting/:provider/purchase-order", async (req, res) => {
    const name = req.params.provider;
    if (!PROVIDERS[name]) return res.status(404).json({ error: "Unknown accounting provider." });

    const { po, job } = req.body || {};
    if (!po || !job) return res.status(400).json({ error: "A purchase order and its job are required." });
    if (!(po.lines || []).length) return res.status(400).json({ error: "That purchase order has no lines." });

    try {
      if (name === "xero") {
        const out = await xero.createPurchaseOrder({ po, job });
        return res.json({
          ok: true,
          provider: "xero",
          purchaseOrderId: out?.PurchaseOrderID || null,
          purchaseOrderNumber: out?.PurchaseOrderNumber || null,
          status: out?.Status || "DRAFT",
        });
      }
      const out = await myob.createPurchaseOrder({ po, job });
      return res.json({ ok: true, provider: "myob", location: out?.location || null });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

const label = (p) => (p === "xero" ? "Xero" : "MYOB");

/** Minimal self-contained result page for the OAuth redirect. */
function page(title, body, backUrl) {
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#EDEEF0;color:#14171A;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  .card{background:#fff;border:1px solid #D5D8DC;padding:32px;max-width:520px}
  h1{font-size:20px;margin:0 0 10px}
  p{line-height:1.6;color:#3B414A;margin:0 0 18px}
  a{display:inline-block;background:#14171A;color:#F5C518;padding:10px 18px;
    text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.06em}
</style></head><body><div class="card">
  <h1>${esc(title)}</h1><p>${esc(body)}</p>
  ${backUrl ? `<a href="${esc(backUrl)}">Back to BuildYourOwn</a>` : ""}
</div></body></html>`;
}
