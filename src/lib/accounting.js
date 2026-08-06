/* =========================================================================
   MODULE: lib/accounting.js
   Frontend client for the Xero / MYOB connections.

   The browser never handles OAuth tokens — it only asks the backend what is
   connected, sends the builder off to the provider's consent screen, and
   posts documents to push. Everything sensitive stays server-side.
   ========================================================================= */

const BASE = import.meta.env?.VITE_AI_BACKEND || "";

async function req(path, options) {
  let resp;
  try {
    resp = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("Couldn't reach the backend — is it running? Start it with `npm run server`.");
  }
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("The backend returned an unreadable response.");
  }
  if (!resp.ok) throw new Error(data?.error || `Request failed (${resp.status}).`);
  return data;
}

/** { xero: {configured, connected, organisation, ...}, myob: {...} } */
export const getStatus = () => req("/api/accounting/status");

/**
 * Send the builder to the provider's consent screen. A full navigation, not
 * a popup — OAuth consent screens routinely refuse to render in one, and a
 * blocked popup is a support ticket we don't need.
 */
export function startConnect(provider) {
  window.location.href = `${BASE}/api/accounting/${provider}/connect`;
}

export const disconnect = (provider) =>
  req(`/api/accounting/${provider}/disconnect`, { method: "POST" });

/**
 * Push a progress claim as a draft invoice.
 * Draft is deliberate — the builder reviews and sends it from their
 * accounting package, so nothing reaches a client from inside this app.
 */
export const pushClaim = (provider, payload) =>
  req(`/api/accounting/${provider}/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const pushPurchaseOrder = (provider, payload) =>
  req(`/api/accounting/${provider}/purchase-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** Turn a claim + its totals into the invoice lines the backend expects. */
export function claimToLineItems(claim, job, totals) {
  const lines = (claim.lines || [])
    .filter((l) => Number(l.percentComplete) > 0)
    .map((l) => ({
      description: `${l.name}${l.percentComplete < 100 ? ` — ${l.percentComplete}% complete` : ""}`,
      amount: (Number(l.value) || 0) * ((Number(l.percentComplete) || 0) / 100),
    }));

  // Previously certified work is deducted as its own line so the invoice
  // reconciles against the claim schedule the client already holds.
  if (totals.previouslyClaimed > 0) {
    lines.push({ description: "Less previously claimed", amount: -totals.previouslyClaimed });
  }
  if (totals.retention > 0) {
    lines.push({
      description: `Less retention (${((Number(claim.retentionRate) || 0) * 100).toFixed(1)}%)`,
      amount: -totals.retention,
    });
  }
  return lines;
}
