/* =========================================================================
   Vercel serverless function — production equivalent of server/index.js.
   Vercel auto-routes POST /api/ai/chat here. The Anthropic key lives in the
   Vercel project's Environment Variables (never in the browser, never in git).
   Local dev still uses server/index.js via the Vite proxy; this file is what
   runs once deployed. Same request/response shape, so ai/client.js is unchanged.
   ========================================================================= */
import Anthropic from "@anthropic-ai/sdk";
import { preflight, LIMITS, clampModel, clampTokens, promptSize } from "../_lib/guard.js";

// Must track server/index.js — this is the DEV/PROD pair for the same route,
// and they drifted: this one was left on a model id that no longer exists, so
// any call that didn't pass an explicit model would have failed once deployed.
const DEFAULT_MODEL = process.env.BYO_AI_MODEL || "claude-opus-5";
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
  // Kill switch, origin check and rate limit. Runs before anything is spent.
  const blocked = preflight(req, "chat");
  if (blocked) {
    if (blocked.retryAfter) res.setHeader("Retry-After", String(blocked.retryAfter));
    return res.status(blocked.status).json({ error: blocked.error });
  }

  const { system, messages, maxTokens = 1500, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  // Ceilings on the cost of this single call, whatever the caller asked for.
  if (promptSize(messages, system) > LIMITS.chat.maxPromptChars) {
    return res.status(413).json({ error: "That request is too long. Trim it and try again." });
  }
  const safeModel = clampModel(model, DEFAULT_MODEL);
  const safeTokens = clampTokens(maxTokens, LIMITS.chat.maxTokens);
  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    const resp = await client.messages.create({ model: safeModel, max_tokens: safeTokens, system, messages });
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
