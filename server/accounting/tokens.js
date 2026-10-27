/* =========================================================================
   MODULE: server/accounting/tokens.js
   Token store for accounting connections (Xero, MYOB).

   Tokens live SERVER-SIDE ONLY and are never sent to the browser — the
   frontend only ever learns whether a provider is connected and which
   organisation it points at. A refresh token in localStorage would be a
   standing invitation to drain a builder's accounting file.

   Two stores, same API (getTokens / saveTokens / clearTokens):
     - per account (production): the request runs inside withTokenScope(),
       whose scope holds THIS builder's tokens, loaded from the database
       (api/_lib/accounting-store.js) and written back after the request.
       xero.js and myob.js never know which builder they are serving.
     - single builder (local dev): a JSON file next to server/.env, which
       is gitignored — used only when no scope is active.
   ========================================================================= */

import { readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const STORE = join(here, "..", ".tokens.json");

/* ---- per-account scope ------------------------------------------------- */
const scopeStore = new AsyncLocalStorage();

/**
 * Run fn with an account's tokens as the store.
 * @param scope { data: { xero?, myob? }, dirty: Set }
 */
export const withTokenScope = (scope, fn) => scopeStore.run(scope, fn);

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
  const sc = scopeStore.getStore();
  if (sc) {
    sc.data[provider] = { ...(sc.data[provider] || {}), ...tokens, updatedAt: Date.now() };
    sc.dirty.add(provider);
    return sc.data[provider];
  }
  const all = readAll();
  all[provider] = { ...(all[provider] || {}), ...tokens, updatedAt: Date.now() };
  writeAll(all);
  return all[provider];
}

export function getTokens(provider) {
  const sc = scopeStore.getStore();
  if (sc) return sc.data[provider] || null;
  return readAll()[provider] || null;
}

export function clearTokens(provider) {
  const sc = scopeStore.getStore();
  if (sc) {
    sc.data[provider] = null;
    sc.dirty.add(provider);
    return;
  }
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

/* ---- signed state (stateless, for per-account connections) -------------
   Serverless functions share no memory, so the pending-state map above
   can't work there. Instead the state carries who is connecting, which
   provider and until when, signed with the server's secret: it can't be
   forged for another account, and it expires in ten minutes. */
const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function signState(secret, { provider, userId, returnTo = "" }) {
  const body = b64u(JSON.stringify({ p: provider, u: userId, r: returnTo, e: Date.now() + STATE_TTL_MS, n: randomBytes(9).toString("base64url") }));
  const sig = b64u(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

/** @returns { provider, userId, returnTo } or null if tampered / expired */
export function verifyState(secret, state) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!j.e || Date.now() > j.e) return null;
    return { provider: j.p, userId: j.u, returnTo: j.r || "" };
  } catch {
    return null;
  }
}
