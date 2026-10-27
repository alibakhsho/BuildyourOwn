/* POST /api/accounting/:provider/invoice — see _lib/accounting.js */
import { invoice } from "../../_lib/accounting.js";
import { nativeCors } from "../../_lib/guard.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return invoice(req, res);
}
