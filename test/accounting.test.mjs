/* Xero / MYOB per account: each builder's tokens encrypted in their own row,
   a signed connect link, and the provider code running against the right
   account. Xero and Supabase are a fake fetch; nothing leaves the machine. */
let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
process.env.ACCOUNTING_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.XERO_CLIENT_ID = "xero-client";
process.env.XERO_CLIENT_SECRET = "xero-secret";
process.env.BYO_PUBLIC_URL = "https://byo.example";
process.env.BYO_APP_URL = "https://byo.example";
process.env.VERCEL = "1";

const S = await import("../api/_lib/accounting-store.js");
const T = await import("../server/accounting/tokens.js");
const A = await import("../api/_lib/accounting.js");

/* ---- encryption ---- */
const sealed = S.encrypt({ refreshToken: "r1", tenantName: "Smith Builders" });
ok("tokens round-trip through AES-GCM", S.decrypt(sealed).refreshToken === "r1");
ok("ciphertext doesn't contain the token", !sealed.includes("r1") && !Buffer.from(sealed.split(".")[2], "base64").toString().includes("r1"));
let threw = false;
try { const parts = sealed.split("."); const ct = Buffer.from(parts[2], "base64"); ct[0] ^= 1; S.decrypt([parts[0], parts[1], ct.toString("base64")].join(".")); } catch { threw = true; }
ok("tampered ciphertext is rejected", threw);
threw = false;
try { S.decrypt(sealed, Buffer.alloc(32, 9)); } catch { threw = true; }
ok("the wrong key can't read it", threw);

/* ---- signed state ---- */
const key = S.tokenKey();
const st = T.signState(key, { provider: "xero", userId: "user-a", returnTo: "/office" });
ok("state verifies and carries who and where", JSON.stringify(T.verifyState(key, st)) === JSON.stringify({ provider: "xero", userId: "user-a", returnTo: "/office" }));
ok("state signed with another key is refused", T.verifyState(Buffer.alloc(32, 1), st) === null);
const [body] = st.split(".");
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url")), u: "user-b" })).toString("base64url") + "." + st.split(".")[1];
ok("state can't be re-pointed at another account", T.verifyState(key, forged) === null);
const realNow = Date.now;
Date.now = () => realNow() + 11 * 60 * 1000;
ok("state expires after ten minutes", T.verifyState(key, st) === null);
Date.now = realNow;

/* ---- scopes don't leak between concurrent requests ---- */
{
  const a = { data: { xero: { refreshToken: "A" } }, dirty: new Set() };
  const b = { data: { xero: { refreshToken: "B" } }, dirty: new Set() };
  const seen = await Promise.all([
    T.withTokenScope(a, async () => { await new Promise((r) => setTimeout(r, 10)); return T.getTokens("xero").refreshToken; }),
    T.withTokenScope(b, async () => { T.saveTokens("xero", { accessToken: "b-access" }); return T.getTokens("xero").refreshToken; }),
  ]);
  ok("two builders at once each see their own tokens", seen.join() === "A,B" && !a.data.xero.accessToken && b.dirty.has("xero"));
}

/* ---- the routes, against a fake Supabase + Xero ---- */
const db = new Map();   // `${user}|${provider}` → row
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  calls.push(`${init.method || "GET"} ${u.host}${u.pathname}`);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (u.pathname === "/auth/v1/user") {
    const tok = (init.headers?.Authorization || "").slice(7);
    return tok === "token-a" ? json(200, { id: "user-a", email: "a@x" }) : tok === "token-b" ? json(200, { id: "user-b", email: "b@x" }) : json(401, {});
  }
  if (u.pathname === "/rest/v1/accounting_connections") {
    if ((init.headers?.apikey || "") !== "sb_secret_test") return json(401, {});
    const user = (u.searchParams.get("user_id") || "").replace("eq.", "");
    if (!init.method || init.method === "GET") return json(200, [...db.values()].filter((r) => r.user_id === user).map((r) => ({ provider: r.provider, secret: r.secret })));
    if (init.method === "POST") { const r = JSON.parse(init.body); db.set(`${r.user_id}|${r.provider}`, r); return new Response(null, { status: 201 }); }
    if (init.method === "DELETE") { db.delete(`${user}|${(u.searchParams.get("provider") || "").replace("eq.", "")}`); return new Response(null, { status: 204 }); }
  }
  if (u.host === "identity.xero.com") {
    const p = new URLSearchParams(init.body);
    if (p.get("grant_type") === "authorization_code" && p.get("code") === "good-code") return json(200, { access_token: "acc-1", refresh_token: "ref-1", expires_in: 1800 });
    if (p.get("grant_type") === "refresh_token" && p.get("refresh_token") === "ref-1") return json(200, { access_token: "acc-2", refresh_token: "ref-2", expires_in: 1800 });
    return json(400, { error: "invalid_grant" });
  }
  if (u.host === "api.xero.com" && u.pathname === "/connections") return json(200, [{ tenantId: "tenant-1", tenantName: "Smith Builders Pty Ltd" }]);
  if (u.host === "api.xero.com" && u.pathname.endsWith("/PurchaseOrders")) return json(200, { PurchaseOrders: [{ PurchaseOrderID: "po-1", PurchaseOrderNumber: "PO-0001", Status: "DRAFT" }] });
  return json(404, { url });
};

const mkRes = () => {
  const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; },
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; return r; }, redirect(u) { r.code = 302; r.headers.location = u; return r; }, end() { return r; } };
  return r;
};
const call = async (fn, { method = "POST", token, params = {}, query = {}, body } = {}) => {
  const res = mkRes();
  await fn({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, params, query, body }, res);
  return res;
};

let r = await call(A.status, {});
ok("signed out: status says sign in, connects nothing", r.code === 200 && r.body.perAccount && r.body.signedIn === false && r.body.xero.configured && !r.body.xero.connected);
r = await call(A.connect, { params: { provider: "xero" } });
ok("connect needs a session", r.code === 401);
r = await call(A.connect, { token: "token-a", params: { provider: "xero" }, body: { returnTo: "/office" } });
const consent = new URL(r.body.url);
ok("connect returns Xero's consent screen with our redirect", consent.host === "login.xero.com" && consent.searchParams.get("redirect_uri") === "https://byo.example/api/accounting/xero/callback");
const state = consent.searchParams.get("state");

r = await call(A.callback, { method: "GET", params: { provider: "xero" }, query: { code: "good-code", state: "forged.state" } });
ok("callback with a forged state connects nothing", r.code === 400 && db.size === 0);
r = await call(A.callback, { method: "GET", params: { provider: "xero" }, query: { code: "good-code", state } });
const row = db.get("user-a|xero");
ok("callback stores the connection on builder A's account", r.code === 200 && /Smith Builders/.test(r.body) && row && row.organisation === "Smith Builders Pty Ltd");
ok("…encrypted: no token in the row", row && !JSON.stringify(row).includes("ref-1") && S.decrypt(row.secret).refreshToken === "ref-1");
ok("…and sends them back where they started", /href="https:\/\/byo\.example\/office"/.test(r.body));

r = await call(A.status, { token: "token-a" });
ok("builder A sees their organisation", r.body.signedIn && r.body.xero.connected && r.body.xero.organisation === "Smith Builders Pty Ltd" && !JSON.stringify(r.body).includes("ref-1"));
r = await call(A.status, { token: "token-b" });
ok("builder B sees no connection", r.body.signedIn && !r.body.xero.connected);

// an expired access token: the push refreshes, and the ROTATED refresh token is saved
db.set("user-a|xero", { ...row, secret: S.encrypt({ ...S.decrypt(row.secret), expiresAt: 0 }) });
r = await call(A.purchaseOrder, { token: "token-a", params: { provider: "xero" }, body: { po: { number: "PO-0001", supplierName: "Bowens", lines: [{ description: "Frame timber", qty: 1, rate: 100 }] }, job: { name: "Smith", number: "J-1" } } });
ok("push a PO for builder A", r.code === 200 && r.body.purchaseOrderNumber === "PO-0001", JSON.stringify(r.body));
ok("…the rotated refresh token was written back", S.decrypt(db.get("user-a|xero").secret).refreshToken === "ref-2");
r = await call(A.purchaseOrder, { token: "token-b", params: { provider: "xero" }, body: { po: { lines: [{ description: "x", qty: 1, rate: 1 }] }, job: { name: "J" } } });
ok("builder B can't push into A's Xero", r.code === 401 && /not connected/i.test(r.body.error));

r = await call(A.disconnect, { token: "token-a", params: { provider: "xero" } });
ok("disconnect deletes the row", r.code === 200 && !db.has("user-a|xero"));

/* ---- the single Vercel function routes every path (Hobby plan: 12 functions max) ---- */
const R = (await import("../api/accounting.js"));
ok("router: path from the rewrite's ?route=", R.routeOf({ query: { route: "xero/callback" } }).join("/") === "xero/callback");
ok("router: path from the URL when there's no ?route=", R.routeOf({ url: "/api/accounting/myob/purchase-order?x=1" }).join("/") === "myob/purchase-order");
r = mkRes(); await R.default({ method: "POST", headers: { authorization: "Bearer token-b" }, query: { route: "status" } }, r);
ok("router: status", r.code === 200 && r.body.signedIn === true);
r = mkRes(); await R.default({ method: "POST", headers: { authorization: "Bearer token-a" }, query: { route: "xero/connect" }, body: {} }, r);
ok("router: <provider>/connect reaches the handler with the provider", r.code === 200 && /login\.xero\.com/.test(r.body.url));
r = mkRes(); await R.default({ method: "GET", headers: {}, query: { route: "xero/invoice" } }, r);
ok("router: wrong method → 405", r.code === 405);
r = mkRes(); await R.default({ method: "GET", headers: {}, query: { route: "xero/nothing" } }, r);
ok("router: unknown route → 404", r.code === 404);

delete process.env.ACCOUNTING_TOKEN_KEY;
r = await call(A.status, { token: "token-a" });
ok("on Vercel with no key: says it isn't switched on, rather than failing oddly", r.code === 503 && r.body.code === "not_configured");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
