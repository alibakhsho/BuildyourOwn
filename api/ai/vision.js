/* =========================================================================
   Vercel serverless function — POST /api/ai/vision
   Production equivalent of the /api/ai/vision route in server/index.js.
   Both call the same reader in api/_lib/plan-reader.js.
   ========================================================================= */
import Anthropic from "@anthropic-ai/sdk";
import { readPlanWithClaude, planReaderError } from "../_lib/plan-reader.js";

const hasKey = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());

export const config = {
  api: {
    // Plan scans are large even after downscaling; the default 1 MB body
    // limit rejects them before the handler ever runs.
    bodyParser: { sizeLimit: "12mb" },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!hasKey()) {
    return res.status(503).json({
      error: "The AI backend has no ANTHROPIC_API_KEY set. Add it in the Vercel project's Settings → Environment Variables, then redeploy.",
    });
  }
  const { image, imageWidth, imageHeight, pxPerMetre, model } = req.body || {};
  if (!image?.data || !image?.mediaType) {
    return res.status(400).json({ error: "An image (base64 data + mediaType) is required." });
  }
  try {
    const client = new Anthropic();
    const data = await readPlanWithClaude(client, { image, imageWidth, imageHeight, pxPerMetre, model });
    return res.status(200).json(data);
  } catch (e) {
    const { status, error } = planReaderError(e);
    return res.status(status).json({ error });
  }
}
