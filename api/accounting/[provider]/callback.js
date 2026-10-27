/* GET /api/accounting/:provider/callback — the provider sends the builder's
   browser back here after consent. See _lib/accounting.js */
import { callback } from "../../_lib/accounting.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  return callback(req, res);
}
