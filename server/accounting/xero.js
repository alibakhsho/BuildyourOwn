/* =========================================================================
   MODULE: server/accounting/xero.js — Xero OAuth 2.0 + Accounting API

   Flow: authorization code grant.
     1. /api/accounting/xero/connect     → redirect the builder to Xero
     2. Xero redirects back with ?code   → we exchange it for tokens
     3. GET /connections                 → resolve which organisation (tenant)
     4. Every API call carries Bearer + Xero-tenant-id

   Two Xero facts drive the design here:
     - Access tokens live 30 minutes. Every call therefore goes through
       withAccessToken(), which refreshes on demand rather than on a timer.
     - Refresh tokens ROTATE. Each refresh returns a new refresh token and
       invalidates the old one, so we must persist the new one immediately
       or the connection is dead. An unused refresh token expires after 60
       days, which is why publicStatus() surfaces the expiry.

   Setup (one-off, by the builder):
     1. Create an app at developer.xero.com/app/manage
     2. Add redirect URI  <BYO_PUBLIC_URL>/api/accounting/xero/callback
     3. Put XERO_CLIENT_ID / XERO_CLIENT_SECRET in server/.env
   ========================================================================= */

import { saveTokens, getTokens, clearTokens } from "./tokens.js";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";

/**
 * Scopes. Xero replaced its two broad scopes with fine-grained ones for apps
 * created on or after 2 March 2026; apps created before then keep the broad
 * scopes until September 2027. Rather than hard-code either generation, read
 * the exact scope string the builder's own app was registered with — it is
 * shown on the app's page in the Xero developer portal.
 */
const DEFAULT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access", // required for a refresh token
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
].join(" ");

export const xeroConfig = () => ({
  clientId: process.env.XERO_CLIENT_ID || "",
  clientSecret: process.env.XERO_CLIENT_SECRET || "",
  redirectUri:
    process.env.XERO_REDIRECT_URI ||
    `${process.env.BYO_PUBLIC_URL || "http://localhost:8787"}/api/accounting/xero/callback`,
  scopes: process.env.XERO_SCOPES || DEFAULT_SCOPES,
});

export const xeroConfigured = () => {
  const c = xeroConfig();
  return !!(c.clientId && c.clientSecret);
};

const basicAuth = () => {
  const { clientId, clientSecret } = xeroConfig();
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
};

/* ---- OAuth ------------------------------------------------------------- */

export function buildAuthUrl(state) {
  const c = xeroConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    scope: c.scopes,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function postToken(body) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw Object.assign(new Error(`Xero token request failed (${resp.status}): ${text.slice(0, 300)}`), {
      status: resp.status === 400 ? 400 : 502,
    });
  }
  return JSON.parse(text);
}

export async function exchangeCode(code) {
  const c = xeroConfig();
  const tok = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: c.redirectUri,
  });
  const saved = persist(tok);
  await resolveTenant(saved.accessToken);
  return getTokens("xero");
}

/**
 * Refresh. Persists the ROTATED refresh token before returning — if the
 * process dies between the HTTP call and the write, the connection is gone
 * and the builder has to reconnect, so this write is the critical section.
 */
async function refresh() {
  const t = getTokens("xero");
  if (!t?.refreshToken) throw Object.assign(new Error("Xero is not connected."), { status: 401 });
  try {
    const tok = await postToken({ grant_type: "refresh_token", refresh_token: t.refreshToken });
    return persist(tok).accessToken;
  } catch (e) {
    // A rejected refresh token is terminal: 60 days idle, revoked in Xero,
    // or already rotated. Clear it so the UI prompts a reconnect instead of
    // retrying a token that will never work again.
    if (e.status === 400) {
      clearTokens("xero");
      throw Object.assign(
        new Error("The Xero connection has expired or was revoked. Reconnect from Settings → Integrations."),
        { status: 401 }
      );
    }
    throw e;
  }
}

function persist(tok) {
  return saveTokens("xero", {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    // 60s safety margin so a call started just before expiry doesn't 401.
    expiresAt: Date.now() + (tok.expires_in || 1800) * 1000 - 60_000,
    connectedAt: getTokens("xero")?.connectedAt || Date.now(),
  });
}

async function resolveTenant(accessToken) {
  const resp = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Could not list Xero organisations (${resp.status}).`);
  const list = await resp.json();
  if (!list.length) throw new Error("That Xero login has no organisation connected to this app.");
  // First tenant wins. A builder with multiple entities can re-run connect
  // and pick a different org in Xero's own consent screen.
  saveTokens("xero", { tenantId: list[0].tenantId, tenantName: list[0].tenantName });
  return list[0];
}

async function withAccessToken() {
  const t = getTokens("xero");
  if (!t?.refreshToken) throw Object.assign(new Error("Xero is not connected."), { status: 401 });
  if (!t.accessToken || Date.now() >= (t.expiresAt || 0)) return refresh();
  return t.accessToken;
}

/* ---- API --------------------------------------------------------------- */

async function api(path, { method = "GET", body } = {}) {
  const accessToken = await withAccessToken();
  const t = getTokens("xero");
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": t.tenantId,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    // Xero returns validation detail in a nested shape that is genuinely
    // useful to the builder ("Account code 200 is not valid"), so dig it out
    // rather than surfacing a bare status code.
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      const el = j.Elements?.[0]?.ValidationErrors?.map((v) => v.Message).join("; ");
      detail = el || j.Detail || j.Message || detail;
    } catch {}
    throw Object.assign(new Error(`Xero: ${detail}`), { status: resp.status === 401 ? 401 : 400 });
  }
  return text ? JSON.parse(text) : {};
}

export const getOrganisation = () => api("/Organisation");

/** Create or update a contact, matching on name so we don't duplicate. */
export async function upsertContact(client) {
  const payload = {
    Contacts: [
      {
        ...(client.xeroContactId ? { ContactID: client.xeroContactId } : {}),
        Name: client.company || client.name,
        FirstName: client.company ? client.name : undefined,
        EmailAddress: client.email || undefined,
        TaxNumber: client.abn || undefined,
        Phones: client.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: client.phone }] : undefined,
        Addresses: client.address
          ? [{ AddressType: "STREET", AddressLine1: client.address }]
          : undefined,
      },
    ],
  };
  const out = await api("/Contacts", { method: "POST", body: payload });
  return out.Contacts?.[0] || null;
}

/**
 * Push a progress claim as an ACCREC (sales) invoice.
 * Sent as DRAFT deliberately: a claim that appears in the builder's ledger
 * as authorised without them looking at it is a reconciliation problem, not
 * a feature. They approve and send from Xero.
 */
export async function createInvoice({ contactId, contactName, claim, totals, job, lineItems }) {
  const payload = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: contactId ? { ContactID: contactId } : { Name: contactName },
        Date: claim.periodTo,
        DueDate: addDays(claim.periodTo, Number(process.env.XERO_PAYMENT_TERMS_DAYS) || 14),
        Reference: `${job.jobNo} ${claim.claimNo}`,
        Status: "DRAFT",
        // Our claim maths already excludes GST, so tell Xero the line
        // amounts are tax-exclusive rather than letting it assume.
        LineAmountTypes: "Exclusive",
        LineItems: lineItems.map((l) => ({
          Description: l.description,
          Quantity: 1,
          UnitAmount: round2(l.amount),
          AccountCode: l.accountCode || process.env.XERO_SALES_ACCOUNT_CODE || "200",
          TaxType: l.taxType || process.env.XERO_SALES_TAX_TYPE || "OUTPUT",
          ...(l.trackingName && l.trackingOption
            ? { Tracking: [{ Name: l.trackingName, Option: l.trackingOption }] }
            : {}),
        })),
      },
    ],
  };
  const out = await api("/Invoices", { method: "POST", body: payload });
  return out.Invoices?.[0] || null;
}

/** Push a purchase order so committed cost shows up against the job in Xero. */
export async function createPurchaseOrder({ po, job, supplierContactId }) {
  const payload = {
    PurchaseOrders: [
      {
        Contact: supplierContactId ? { ContactID: supplierContactId } : { Name: po.supplier },
        Date: todayISO(),
        DeliveryDate: po.requiredBy || undefined,
        Reference: `${job.jobNo} ${po.poNo}`,
        Status: "DRAFT",
        LineAmountTypes: "Exclusive",
        DeliveryAddress: job.siteAddress || undefined,
        LineItems: (po.lines || []).map((l) => ({
          Description: l.description,
          Quantity: Number(l.qty) || 0,
          UnitAmount: round2(Number(l.rate) || 0),
          AccountCode: l.accountCode || process.env.XERO_COGS_ACCOUNT_CODE || "300",
          TaxType: l.taxType || process.env.XERO_PURCHASE_TAX_TYPE || "INPUT",
        })),
      },
    ],
  };
  const out = await api("/PurchaseOrders", { method: "POST", body: payload });
  return out.PurchaseOrders?.[0] || null;
}

/* ---- helpers ----------------------------------------------------------- */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayISO = () => new Date().toISOString().slice(0, 10);
function addDays(iso, days) {
  const d = new Date(iso || todayISO());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
