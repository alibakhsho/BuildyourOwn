/* GET or POST /api/accounting/status — see _lib/accounting.js
   (POST so the phone app's CORS preflight, which allows POST, works too) */
import { status } from "../_lib/accounting.js";
import { nativeCors } from "../_lib/guard.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return status(req, res);
}
