/* =========================================================================
   Vercel serverless function — production equivalent of server/index.js.
   Vercel auto-routes POST /api/ai/chat here. The Anthropic key lives in the
   Vercel project's Environment Variables (never in the browser, never in git).
   Local dev still uses server/index.js via the Vite proxy; this file is what
   runs once deployed. Same request/response shape, so ai/client.js is unchanged.
   ========================================================================= */
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = process.env.BYO_AI_MODEL || "claude-opus-4-8";
const hasKey = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!hasKey()) {
    return res.status(503).json({
      error: "The AI backend has no ANTHROPIC_API_KEY set. Add it in the Vercel project's Settings → Environment Variables, then redeploy.",
    });
  }
  const { system, messages, maxTokens = 1500, model = DEFAULT_MODEL } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    const resp = await client.messages.create({ model, max_tokens: maxTokens, system, messages });
    const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text) return res.status(502).json({ error: "The model returned an empty response." });
    return res.status(200).json({ text });
  } catch (e) {
    const status = e?.status || 500;
    const msg = status === 401 ? "The server's API key was rejected (401). Check the Vercel env var."
      : status === 429 ? "Rate limited (429) — wait a few seconds and try again."
      : e?.message || "AI service error.";
    return res.status(status).json({ error: msg });
  }
}
