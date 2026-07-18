/* =========================================================================
   MODULE: ai/client.js
   Frontend AI client. Calls the BYO backend proxy (server/index.js) which
   holds the Anthropic API key SERVER-SIDE — the browser never sees a key.
   In dev, Vite proxies /api to the backend (see vite.config.js). To point
   at a deployed backend, set VITE_AI_BACKEND to its origin.
   ========================================================================= */
const BASE = import.meta.env?.VITE_AI_BACKEND || ""; // "" = same origin (Vite proxy)

/* chat({ system, messages, maxTokens, model }) -> assistant text.
   Throws Error with a human-readable message on any failure. */
export async function chat({ system, messages, maxTokens = 1500, model }) {
  let resp;
  try {
    resp = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages, maxTokens, model }),
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
