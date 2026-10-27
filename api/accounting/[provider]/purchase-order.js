/* POST /api/accounting/:provider/purchase-order — see _lib/accounting.js */
import { purchaseOrder } from "../../_lib/accounting.js";
import { nativeCors } from "../../_lib/guard.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return purchaseOrder(req, res);
}
