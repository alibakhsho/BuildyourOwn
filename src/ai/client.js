/* =========================================================================
   MODULE: ai/client.js
   Frontend AI client. Calls the BYO backend proxy (server/index.js) which
   holds the Anthropic API key SERVER-SIDE — the browser never sees a key.
   In dev, Vite proxies /api to the backend (see vite.config.js). To point
   at a deployed backend, set VITE_AI_BACKEND to its origin.
   ========================================================================= */
const BASE = import.meta.env?.VITE_AI_BACKEND || ""; // "" = same origin (Vite proxy)

/* Model tiers — keep the cheap model on high-frequency structured tasks
   (spec/param extraction, job decomposition, build sequencing) and reserve
   the stronger model for the specialist conversations. Callers pass `tier`;
   an explicit `model` always wins; omitting both defers to the backend
   default. Swap these ids in one place to re-tier the whole app. */
export const MODELS = {
  fast: "claude-haiku-4-5-20251001", // cheapest — structured JSON, param extraction, quick tasks
  smart: "claude-sonnet-5",          // balanced — the AI crew conversations
  max: "claude-opus-4-8",            // most capable — heavy reasoning (opt-in)
};

/* chat({ system, messages, maxTokens, model, tier }) -> assistant text.
   Throws Error with a human-readable message on any failure. */
export async function chat({ system, messages, maxTokens = 1500, model, tier }) {
  const resolvedModel = model || (tier ? MODELS[tier] : undefined);
  let resp;
  try {
    resp = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages, maxTokens, model: resolvedModel }),
    });
  } catch {
    throw new Error("Couldn't reach the AI backend — is it running? Start it with `npm run server`.");
  }
  if (!resp.ok) {
    let msg = `AI service error (${resp.status}).`;
    try { const j = await resp.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const data = await resp.json();
  if (!data?.text) throw new Error("The model returned an empty response.");
  return data.text;
}
