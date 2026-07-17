/* =========================================================================
   MODULE: ai/client.js
   Shared Anthropic client for every AI feature (quote-builder parser,
   high-rise parser, and the AI crew personas). BYO-key model: the key is
   entered once in the app, lives ONLY in this browser's localStorage, and
   is attached to direct browser→Anthropic calls. Swap `chat` for a proxy
   endpoint before any public deployment.
   ========================================================================= */

const LS_KEY = "byo.ai.apiKey.v1";

export function getAiKey() {
  try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; }
}
export function setAiKey(k) {
  try { k ? localStorage.setItem(LS_KEY, k.trim()) : localStorage.removeItem(LS_KEY); } catch {}
}
export function hasAiKey() { return getAiKey().length > 10; }

/* chat({ system, messages, maxTokens, model }) → assistant text.
   Throws Error with a human-readable message on any failure. */
export async function chat({ system, messages, maxTokens = 1500, model = "claude-sonnet-4-6" }) {
  const key = getAiKey();
  if (!key) throw new Error("NO_KEY");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (resp.status === 401) throw new Error("Your API key was rejected (401). Check it in AI settings.");
  if (resp.status === 429) throw new Error("Rate limited (429) — wait a few seconds and try again.");
  if (!resp.ok) throw new Error(`AI service error (${resp.status}). Try again shortly.`);
  const data = await resp.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text) throw new Error("The model returned an empty response.");
  return text;
}
