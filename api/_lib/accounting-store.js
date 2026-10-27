/* =========================================================================
   MODULE: _lib/accounting-store.js — each builder's Xero / MYOB tokens.

   Rows in public.accounting_connections (one per account per provider),
   read and written with the server's secret key only. The token bundle is
   encrypted here with AES-256-GCM before it leaves the server, using
   ACCOUNTING_TOKEN_KEY (32 bytes, base64 or hex) — generate one with
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ========================================================================= */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { supaUrl, serviceKey, serviceHeaders } from "./supabase-server.js";

const TABLE = "accounting_connections";

/** The 32-byte key, or null when not configured. */
export function tokenKey() {
  const raw = (process.env.ACCOUNTING_TOKEN_KEY || "").trim();
  if (!raw) return null;
  let buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  // a passphrase of any other length still works: stretch it to 32 bytes
  if (buf.length !== 32) buf = createHash("sha256").update(raw).digest();
  return buf;
}

/** Per-account storage is possible: a key to encrypt with and a database to write to. */
export const perAccountReady = () => !!(tokenKey() && serviceKey() && supaUrl());

export function encrypt(obj, key = tokenKey()) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(text, key = tokenKey()) {
  const [iv, tag, ct] = String(text).split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
}

/** { xero: tokens|null, myob: tokens|null } for one account. */
export async function loadConnections(userId, f = fetch) {
  const res = await f(`${supaUrl()}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=provider,secret`, { headers: serviceHeaders() });
  if (!res.ok) throw Object.assign(new Error(`Couldn't read your accounting connections (${res.status}).`), { status: 503 });
  const rows = await res.json();
  const out = { xero: null, myob: null };
  for (const r of rows) {
    try { out[r.provider] = decrypt(r.secret); } catch { out[r.provider] = null; }   // a key rotation: treat as disconnected
  }
  return out;
}

/** Write back what changed during a request (a refresh rotates tokens). */
export async function saveConnections(userId, scope, f = fetch) {
  for (const provider of scope.dirty) {
    const t = scope.data[provider];
    if (!t || !t.refreshToken) {
      const res = await f(`${supaUrl()}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}`, { method: "DELETE", headers: serviceHeaders() });
      if (!res.ok) throw Object.assign(new Error(`Couldn't update your ${provider} connection (${res.status}).`), { status: 503 });
      continue;
    }
    const row = {
      user_id: userId, provider, secret: encrypt(t),
      organisation: t.tenantName || t.businessName || null,
      connected_at: new Date(t.connectedAt || Date.now()).toISOString(), updated_at: new Date().toISOString(),
    };
    const res = await f(`${supaUrl()}/rest/v1/${TABLE}?on_conflict=user_id,provider`, {
      method: "POST", headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row),
    });
    // Xero rotates the refresh token on every use: if this write fails the
    // connection is lost, so fail the request loudly rather than pretend.
    if (!res.ok) throw Object.assign(new Error(`Couldn't save your ${provider} connection (${res.status}). Reconnect it from Settings.`), { status: 503 });
  }
  scope.dirty.clear();
}
