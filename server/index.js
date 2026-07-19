/* =========================================================================
   BYO AI backend — a thin proxy that holds the Anthropic API key
   SERVER-SIDE so the browser never sees it. The frontend calls
   POST /api/ai/chat; this process adds the auth headers and forwards to
   the Anthropic Messages API via the official SDK.

   Setup:
     1. cd server && npm install   (or run `npm install` at the repo root)
     2. copy server/.env.example -> server/.env and paste your key
     3. npm run server   (or `npm run dev:all` to run frontend + backend)
   ========================================================================= */
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load server/.env regardless of the cwd the process was started from.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const hasKey = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
// Default model for every AI feature. Override per request with `model`.
const DEFAULT_MODEL = process.env.BYO_AI_MODEL || "claude-opus-4-8";

app.get("/api/health", (_req, res) => res.json({ ok: true, hasKey: hasKey() }));

app.post("/api/ai/chat", async (req, res) => {
  if (!hasKey()) {
    return res.status(503).json({
      error: "The AI backend has no ANTHROPIC_API_KEY set. Add it to server/.env and restart the backend.",
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
    res.json({ text });
  } catch (e) {
    const status = e?.status || 500;
    const msg = status === 401 ? "The server's API key was rejected (401). Check server/.env."
      : status === 429 ? "Rate limited (429) — wait a few seconds and try again."
      : e?.message || "AI service error.";
    res.status(status).json({ error: msg });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`BYO AI backend listening on http://localhost:${PORT}`);
  if (!hasKey()) console.warn("  ⚠  ANTHROPIC_API_KEY is not set — add it to server/.env");
});
