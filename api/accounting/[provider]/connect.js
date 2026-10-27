/* POST /api/accounting/:provider/connect — see _lib/accounting.js */
import { connect } from "../../_lib/accounting.js";
import { nativeCors } from "../../_lib/guard.js";

export default async function handler(req, res) {
  if (nativeCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return connect(req, res);
}
