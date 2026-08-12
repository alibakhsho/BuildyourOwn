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
import { readPlanWithClaude, planReaderError } from "../api/_lib/plan-reader.js";
import { preflight, LIMITS, clampModel, clampTokens, promptSize, mapAnthropicError } from "../api/_lib/guard.js";
import { mountAccounting } from "./accounting/routes.js";

// Load server/.env regardless of the cwd the process was started from.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env") });

const app = express();
app.use(cors());
// Plan images arrive base64-encoded and routinely exceed the old 1 MB cap.
app.use(express.json({ limit: "12mb" }));

const hasKey = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
// Default model for every AI feature. Override per request with `model`.
const DEFAULT_MODEL = process.env.BYO_AI_MODEL || "claude-opus-5";

app.get("/api/health", (_req, res) => res.json({ ok: true, hasKey: hasKey() }));

app.post("/api/ai/chat", async (req, res) => {
  if (!hasKey()) {
    return res.status(503).json({
      error: "The AI backend has no ANTHROPIC_API_KEY set. Add it to server/.env and restart the backend.",
    });
  }
  // Same guard as production (api/ai/chat.js) so limits are exercised in dev
  // rather than discovered live.
  const blocked = preflight(req, "chat");
  if (blocked) {
    if (blocked.retryAfter) res.setHeader("Retry-After", String(blocked.retryAfter));
    return res.status(blocked.status).json({ error: blocked.error });
  }

  const { system, messages, maxTokens = 1500, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
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
    res.json({ text });
  } catch (e) {
    const { status, error } = mapAnthropicError(e);
    res.status(status).json({ error });
  }
});

/* ---- Plan reader: POST /api/ai/vision ----------------------------------
   Takes a base64 plan image and returns structured takeoff data. Shares its
   prompt and schema with the Vercel route via api/_lib/plan-reader.js. */
app.post("/api/ai/vision", async (req, res) => {
  if (!hasKey()) {
    return res.status(503).json({
      error: "The AI backend has no ANTHROPIC_API_KEY set. Add it to server/.env and restart the backend.",
    });
  }
  const blocked = preflight(req, "vision");
  if (blocked) {
    if (blocked.retryAfter) res.setHeader("Retry-After", String(blocked.retryAfter));
    return res.status(blocked.status).json({ error: blocked.error });
  }

  const { image, imageWidth, imageHeight, pxPerMetre, model } = req.body || {};
  if (!image?.data || !image?.mediaType) {
    return res.status(400).json({ error: "An image (base64 data + mediaType) is required." });
  }
  if (String(image.data).length > LIMITS.vision.maxImageBytes) {
    return res.status(413).json({ error: "That plan image is too large. Downscale it and try again." });
  }
  try {
    const client = new Anthropic();
    const data = await readPlanWithClaude(client, {
      image, imageWidth, imageHeight, pxPerMetre, model: clampModel(model, DEFAULT_MODEL),
    });
    res.json(data);
  } catch (e) {
    const { status, error } = planReaderError(e);
    res.status(status).json({ error });
  }
});

/* ---- Xero / MYOB OAuth + sync ---- */
mountAccounting(app);

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`BYO AI backend listening on http://localhost:${PORT}`);
  if (!hasKey()) console.warn("  ⚠  ANTHROPIC_API_KEY is not set — add it to server/.env");
});
