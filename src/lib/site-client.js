/* =========================================================================
   MODULE: lib/site-client.js — the browser side of /api/site/* (see
   api/_lib/site.js). Same-origin in dev (Vite proxies /api) and on Vercel;
   the phone app points VITE_AI_BACKEND at the deployed origin.
   ========================================================================= */
import { imageryPlan, imagerySpan } from "../logic/site.js";

const BASE = import.meta.env?.VITE_AI_BACKEND || "";

async function get(op, params) {
  let r;
  try {
    r = await fetch(`${BASE}/api/site/${op}?${new URLSearchParams(params)}`);
  } catch {
    throw new Error("Couldn't reach the land lookup — is the backend running? (`npm run dev:all`)");
  }
  let j = null;
  try { j = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(j?.error || `Land lookup failed (${r.status}).`);
  return j;
}

export const searchAddress = (q) => get("search", { q });
export const lookupLot = (lat, lng) => get("lot", { lat, lng });
export const lookupElevation = (points) => get("elevation", { points: points.map((p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`).join("|") });

/**
 * The satellite picture for a saved land record, and how many metres of
 * ground it covers — the same plan the server uses, so the texture is laid
 * down at true scale.
 */
export function imageryFor(land) {
  if (!land?.center) return null;
  const [lat, lng] = land.center;
  const want = imagerySpan(land.lot);
  const plan = imageryPlan(land.imagery === "google" ? "google" : "esri", lat, want);
  return {
    url: `${BASE}/api/site/imagery?${new URLSearchParams({ lat: lat.toFixed(7), lng: lng.toFixed(7), span: String(want) })}`,
    spanM: plan.spanM,
  };
}
