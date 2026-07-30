/* =========================================================================
   MODULE: server/accounting/tokens.js
   Token store for accounting connections (Xero, MYOB).

   Tokens live SERVER-SIDE ONLY and are never sent to the browser — the
   frontend only ever learns whether a provider is connected and which
   organisation it points at. A refresh token in localStorage would be a
   standing invitation to drain a builder's accounting file.

   Storage is a JSON file next to server/.env, which is gitignored. That is
   right for a single-builder deployment and wrong the moment this becomes
   multi-tenant: swap this module for a per-user encrypted row in the
   database and nothing else in the integration has to change.
   ========================================================================= */

import { readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const STORE = join(here, "..", ".tokens.json");

function readAll() {
  if (!existsSync(STORE)) return {};
  try {
    return JSON.parse(readFileSync(STORE, "utf8"));
  } catch {
    console.error("[accounting] Token store is corrupt — starting empty. Reconnect your accounting package.");
    return {};
  }
}

function writeAll(data) {
  writeFileSync(STORE, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    // Re-assert permissions: writeFileSync's mode only applies on create.
    chmodSync(STORE, 0o600);
  } catch {
    /* Windows has no POSIX mode — the file still sits outside the web root. */
  }
}

/**
 * @param {"xero"|"myob"} provider
 * @param {object} tokens { accessToken, refreshToken, expiresAt, tenantId, tenantName, ... }
 */
export function saveTokens(provider, tokens) {
  const all = readAll();
  all[provider] = { ...(all[provider] || {}), ...tokens, updatedAt: Date.now() };
  writeAll(all);
  return all[provider];
}

export function getTokens(provider) {
  return readAll()[provider] || null;
}

export function clearTokens(provider) {
  const all = readAll();
  delete all[provider];
  writeAll(all);
}

/** Browser-safe view: connection state only, never token material. */
export function publicStatus(provider) {
  const t = getTokens(provider);
  if (!t || !t.refreshToken) return { connected: false };
  return {
    connected: true,
    organisation: t.tenantName || t.businessName || "",
    tenantId: t.tenantId || t.businessId || null,
    connectedAt: t.connectedAt || null,
    // Surfaced so the UI can warn before an idle connection lapses.
    expiresAt: t.expiresAt || null,
    lastRefreshedAt: t.updatedAt || null,
  };
}

/* ---- CSRF state for the OAuth round trip ------------------------------
   In-memory rather than persisted: a pending authorisation that does not
   survive a server restart should fail closed, not be resumable. */
const pending = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

export function issueState(provider, extra = {}) {
  const state = `${provider}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  pending.set(state, { provider, createdAt: Date.now(), ...extra });
  // Opportunistic sweep — this map is tiny and short-lived.
  for (const [k, v] of pending) if (Date.now() - v.createdAt > STATE_TTL_MS) pending.delete(k);
  return state;
}

export function consumeState(state) {
  const entry = pending.get(state);
  if (!entry) return null;
  pending.delete(state); // single use
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}
