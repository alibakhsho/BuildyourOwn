/* =========================================================================
   MODULE: server/accounting/myob.js — MYOB Business API OAuth 2.0 + sync

   Same authorization-code shape as Xero, with three MYOB-specific wrinkles:

   1. The token endpoint is  secure.myob.com/oauth2/v1/authorize  — the same
      path segment as the authorize step but on a different host and verb.
      That is not a typo; it catches everyone once.

   2. `prompt=consent` is required on the authorize URL, and the company file
      GUID (`businessId`) comes back on the REDIRECT, not from a later API
      call. MYOB's 1 September 2026 change deprecated the legacy CompanyFile
      scope and made this the supported way to obtain it. We still fall back
      to listing company files for keys that predate the change.

   3. Every API call needs x-myobapi-key and x-myobapi-version headers, and
      AccountRight files secured with a user/password also need
      x-myobapi-cftoken (base64 of username:password). Cloud files without
      file-level credentials do not.

   Setup (one-off, by the builder):
     1. my.myob.com.au → Developer → Register app
     2. Redirect URL   <BYO_PUBLIC_URL>/api/accounting/myob/callback
     3. Put MYOB_CLIENT_ID / MYOB_CLIENT_SECRET in server/.env
     4. Paste the exact scope string your app was registered with into
        MYOB_SCOPES — scopes changed with the September 2026 update, so the
        developer portal is the authority, not a value hard-coded here.
   ========================================================================= */

import { saveTokens, getTokens, clearTokens } from "./tokens.js";

const AUTHORIZE_URL = "https://secure.myob.com/oauth2/account/authorize";
const TOKEN_URL = "https://secure.myob.com/oauth2/v1/authorize";
const API_ROOT = "https://api.myob.com/accountright";

export const myobConfig = () => ({
  clientId: process.env.MYOB_CLIENT_ID || "",
  clientSecret: process.env.MYOB_CLIENT_SECRET || "",
  redirectUri:
    process.env.MYOB_REDIRECT_URI ||
    `${process.env.BYO_PUBLIC_URL || "http://localhost:8787"}/api/accounting/myob/callback`,
  scopes: process.env.MYOB_SCOPES || "offline_access",
  // Only needed for AccountRight company files that carry a user/password.
  cfToken:
    process.env.MYOB_CF_USERNAME != null
      ? Buffer.from(`${process.env.MYOB_CF_USERNAME}:${process.env.MYOB_CF_PASSWORD || ""}`).toString("base64")
      : "",
});

export const myobConfigured = () => {
  const c = myobConfig();
  return !!(c.clientId && c.clientSecret);
};

/* ---- OAuth ------------------------------------------------------------- */

export function buildAuthUrl(state) {
  const c = myobConfig();
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: c.scopes,
    state,
    // Required for businessId to be returned on the redirect.
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function postToken(extra) {
  const c = myobConfig();
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: c.scopes,
      ...extra,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw Object.assign(new Error(`MYOB token request failed (${resp.status}): ${text.slice(0, 300)}`), {
      status: resp.status === 400 ? 400 : 502,
    });
  }
  return JSON.parse(text);
}

/**
 * @param {string} code       authorization code (expires in 2–5 minutes)
 * @param {string} businessId company file GUID from the redirect, if present
 */
export async function exchangeCode(code, businessId) {
  const c = myobConfig();
  const tok = await postToken({
    code,
    redirect_uri: c.redirectUri,
    grant_type: "authorization_code",
  });
  persist(tok);
  if (businessId) {
    saveTokens("myob", { businessId });
    await resolveBusinessName().catch(() => {});
  } else {
    // Pre-September-2026 keys don't get businessId on the redirect; the
    // company-file list still works for them.
    await resolveBusinessFromList();
  }
  return getTokens("myob");
}

async function refresh() {
  const t = getTokens("myob");
  if (!t?.refreshToken) throw Object.assign(new Error("MYOB is not connected."), { status: 401 });
  try {
    const tok = await postToken({ refresh_token: t.refreshToken, grant_type: "refresh_token" });
    return persist(tok).accessToken;
  } catch (e) {
    if (e.status === 400) {
      clearTokens("myob");
      throw Object.assign(
        new Error("The MYOB connection has expired or was revoked. Reconnect from Settings → Integrations."),
        { status: 401 }
      );
    }
    throw e;
  }
}

function persist(tok) {
  return saveTokens("myob", {
    accessToken: tok.access_token,
    // MYOB rotates refresh tokens too — keep the new one, fall back to the
    // stored one only if the response omitted it.
    refreshToken: tok.refresh_token || getTokens("myob")?.refreshToken,
    expiresAt: Date.now() + (tok.expires_in || 1200) * 1000 - 60_000,
    connectedAt: getTokens("myob")?.connectedAt || Date.now(),
  });
}

async function withAccessToken() {
  const t = getTokens("myob");
  if (!t?.refreshToken) throw Object.assign(new Error("MYOB is not connected."), { status: 401 });
  if (!t.accessToken || Date.now() >= (t.expiresAt || 0)) return refresh();
  return t.accessToken;
}

/* ---- API --------------------------------------------------------------- */

async function api(path, { method = "GET", body, absolute = false } = {}) {
  const accessToken = await withAccessToken();
  const t = getTokens("myob");
  const c = myobConfig();
  const url = absolute ? path : `${API_ROOT}/${t.businessId}${path}`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "x-myobapi-key": c.clientId,
    "x-myobapi-version": "v2",
    Accept: "application/json",
    // MYOB gzips by default; asking for identity keeps the response readable
    // to fetch without a decompression step.
    "Accept-Encoding": "identity",
    ...(c.cfToken ? { "x-myobapi-cftoken": c.cfToken } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
  };

  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await resp.text();

  if (!resp.ok) {
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      detail = j.Errors?.map((e) => e.Message).join("; ") || j.Message || detail;
    } catch {}
    throw Object.assign(new Error(`MYOB: ${detail}`), { status: resp.status === 401 ? 401 : 400 });
  }

  // Creates return 201 with a Location header and no body.
  if (!text) return { location: resp.headers.get("location") || null };
  return JSON.parse(text);
}

async function resolveBusinessFromList() {
  const list = await api(API_ROOT, { absolute: true });
  const files = Array.isArray(list) ? list : list?.Items || [];
  if (!files.length) throw new Error("That MYOB login has no company file available to this app.");
  saveTokens("myob", { businessId: files[0].Id, businessName: files[0].Name });
  return files[0];
}

async function resolveBusinessName() {
  const info = await api("/Company/Info");
  if (info?.CompanyName) saveTokens("myob", { businessName: info.CompanyName });
  return info;
}

export const getCompanyInfo = () => api("/Company/Info");

/** Find an account UID by its account number, e.g. "4-1000". */
async function findAccountUid(displayId, fallbackEnv) {
  const code = displayId || fallbackEnv;
  if (!code) return null;
  const out = await api(`/GeneralLedger/Account?$filter=DisplayID eq '${encodeURIComponent(code)}'`);
  return out?.Items?.[0]?.UID || null;
}

/** Find a customer/supplier UID by name, creating the record if absent. */
async function findOrCreateContact(kind, { name, email, phone, address, abn }) {
  const filter = `$filter=CompanyName eq '${encodeURIComponent(String(name).replace(/'/g, "''"))}'`;
  const found = await api(`/Contact/${kind}?${filter}`);
  if (found?.Items?.[0]?.UID) return found.Items[0].UID;

  await api(`/Contact/${kind}`, {
    method: "POST",
    body: {
      CompanyName: name,
      IsIndividual: false,
      IsActive: true,
      ABN: abn || undefined,
      Addresses: [
        {
          Location: 1,
          Street: address || undefined,
          Email: email || undefined,
          Phone1: phone || undefined,
        },
      ],
    },
  });
  // MYOB's create returns no body, so re-query for the UID it assigned.
  const again = await api(`/Contact/${kind}?${filter}`);
  const uid = again?.Items?.[0]?.UID;
  if (!uid) throw new Error(`Created the ${kind.toLowerCase()} in MYOB but could not read back its ID.`);
  return uid;
}

/**
 * Push a progress claim as a Service sale invoice.
 * Service (not Item) is the right shape for construction: lines are
 * descriptions and amounts, not stocked goods.
 */
export async function createInvoice({ claim, job, client, lineItems }) {
  const customerUid = await findOrCreateContact("Customer", {
    name: client?.company || client?.name || "Client",
    email: client?.email,
    phone: client?.phone,
    address: client?.address,
    abn: client?.abn,
  });
  const accountUid = await findAccountUid(null, process.env.MYOB_INCOME_ACCOUNT);
  if (!accountUid) {
    throw Object.assign(
      new Error("Set MYOB_INCOME_ACCOUNT in server/.env to the income account number you post claims to (e.g. 4-1000)."),
      { status: 400 }
    );
  }
  const taxCode = process.env.MYOB_SALES_TAX_CODE || "GST";
  const taxUid = await findTaxCodeUid(taxCode);

  const res = await api("/Sale/Invoice/Service", {
    method: "POST",
    body: {
      Date: claim.periodTo,
      Customer: { UID: customerUid },
      CustomerPurchaseOrderNumber: job.jobNo,
      Comment: `${job.name} — claim ${claim.claimNo}`,
      IsTaxInclusive: false,
      Status: "Open",
      Lines: lineItems.map((l) => ({
        Type: "Transaction",
        Description: l.description,
        Total: round2(l.amount),
        Account: { UID: accountUid },
        ...(taxUid ? { TaxCode: { UID: taxUid } } : {}),
      })),
    },
  });
  return res;
}

/** Push a purchase order as a Service purchase order. */
export async function createPurchaseOrder({ po, job }) {
  const supplierUid = await findOrCreateContact("Supplier", {
    name: po.supplier || "Supplier",
    email: po.supplierEmail,
  });
  const accountUid = await findAccountUid(null, process.env.MYOB_COS_ACCOUNT);
  if (!accountUid) {
    throw Object.assign(
      new Error("Set MYOB_COS_ACCOUNT in server/.env to the cost-of-sales account number (e.g. 5-1000)."),
      { status: 400 }
    );
  }
  const taxUid = await findTaxCodeUid(process.env.MYOB_PURCHASE_TAX_CODE || "GST");

  return api("/Purchase/Order/Service", {
    method: "POST",
    body: {
      Date: todayISO(),
      Supplier: { UID: supplierUid },
      SupplierInvoiceNumber: po.poNo,
      Comment: `${job.jobNo} — ${job.name}`,
      IsTaxInclusive: false,
      PromisedDate: po.requiredBy || undefined,
      Lines: (po.lines || []).map((l) => ({
        Type: "Transaction",
        Description: `${l.description}${l.qty ? ` (${l.qty} ${l.unit || ""})`.trimEnd() : ""}`,
        Total: round2((Number(l.qty) || 0) * (Number(l.rate) || 0)),
        Account: { UID: accountUid },
        ...(taxUid ? { TaxCode: { UID: taxUid } } : {}),
      })),
    },
  });
}

async function findTaxCodeUid(code) {
  if (!code) return null;
  try {
    const out = await api(`/GeneralLedger/TaxCode?$filter=Code eq '${encodeURIComponent(code)}'`);
    return out?.Items?.[0]?.UID || null;
  } catch {
    // A missing tax code shouldn't block the push — MYOB will apply the
    // account's default and the builder can correct it on the draft.
    return null;
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayISO = () => new Date().toISOString().slice(0, 10);
