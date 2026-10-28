/* =========================================================================
   /api/accounting/* — every Xero / MYOB route in ONE serverless function.

   Vercel's Hobby plan allows 12 functions per deployment, so the six
   accounting routes share this one: vercel.json rewrites
   /api/accounting/<path> here with ?route=<path>, and the path picks the
   handler in _lib/accounting.js (the Express dev server mounts those
   handlers directly).

     status                       GET|POST
     <provider>/connect           POST
     <provider>/callback          GET   (the provider sends the browser back here)
     <provider>/disconnect        POST
     <provider>/invoice           POST
     <provider>/purchase-order    POST
   ========================================================================= */
import * as A from "./_lib/accounting.js";
import { nativeCors } from "./_lib/guard.js";

const ROUTES = {
  connect: ["POST", A.connect],
  callback: ["GET", A.callback],
  disconnect: ["POST", A.disconnect],
  invoice: ["POST", A.invoice],
  "purchase-order": ["POST", A.purchaseOrder],
};

/* "xero/callback" from the rewrite's ?route=, or from the URL itself */
export function routeOf(req) {
  let r = req.query?.route;
  if (Array.isArray(r)) r = r.join("/");
  if (!r) {
    const path = String(req.url || "").split("?")[0];
    r = path.replace(/^\/api\/accounting\/?/, "");
  }
  return String(r || "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

export default async function handler(req, res) {
  const [a, b] = routeOf(req);
  if (a === "status" && !b) {
    if (nativeCors(req, res)) return;
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    return A.status(req, res);
  }
  const route = ROUTES[b];
  if (!a || !route) return res.status(404).json({ error: "Not found" });
  if (route[0] === "POST" && nativeCors(req, res)) return;
  if (req.method !== route[0]) return res.status(405).json({ error: "Method not allowed" });
  req.query = { ...(req.query || {}), provider: a };
  return route[1](req, res);
}
