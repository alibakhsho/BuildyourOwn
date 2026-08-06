/* =========================================================================
   MODULE: ai/vision.js
   Read a construction plan image with Claude and get structured takeoff data
   back — room names and dimensions, a door/window schedule, and where the
   scale bar or figured dimensions are.

   Same trust boundary as ai/client.js: the image is POSTed to our own
   backend, which holds the Anthropic key server-side. The browser never
   sees a key and never talks to api.anthropic.com directly.

   What this is NOT: a certified takeoff. The model reads a drawing the way
   a fast junior estimator would — it will misread a smudged dimension and
   it cannot see what is not on the sheet. Every number it returns is
   surfaced in the UI as a suggestion to check, never applied silently.
   ========================================================================= */

import { blobToDataURL } from "../state/blobstore.js";

const BASE = import.meta.env?.VITE_AI_BACKEND || "";

/**
 * Send a plan image to the backend plan reader.
 * @param {Blob} blob                 downscaled plan image (see downscaleForVision)
 * @param {object} ctx                { imageWidth, imageHeight, pxPerMetre }
 * @returns {Promise<{rooms, schedule, scaleNote, notes}>}
 */
export async function readPlan(blob, ctx = {}) {
  const dataUrl = await blobToDataURL(blob);
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error("Could not encode that image for the plan reader.");
  const [, mediaType, base64] = m;

  let resp;
  try {
    resp = await fetch(`${BASE}/api/ai/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: { mediaType, data: base64 },
        // The model needs the pixel dimensions to return polygons in the
        // same coordinate space the canvas measures in.
        imageWidth: ctx.imageWidth || 0,
        imageHeight: ctx.imageHeight || 0,
        pxPerMetre: ctx.pxPerMetre || null,
      }),
    });
  } catch {
    throw new Error("Couldn't reach the AI backend — is it running? Start it with `npm run server`.");
  }

  if (!resp.ok) {
    let msg = `Plan reader failed (${resp.status}).`;
    try {
      const j = await resp.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }

  const data = await resp.json();
  return normalise(data, ctx);
}

/**
 * Clamp anything the model returns into the shape the canvas expects.
 * Polygons that fall outside the image are dropped rather than clipped — an
 * out-of-bounds outline means the model lost the coordinate frame, and a
 * clipped version of a wrong answer is still a wrong answer.
 */
function normalise(data, ctx) {
  const W = ctx.imageWidth || 0;
  const H = ctx.imageHeight || 0;
  const inBounds = (p) => !W || !H || (p[0] >= -8 && p[1] >= -8 && p[0] <= W + 8 && p[1] <= H + 8);

  const rooms = (Array.isArray(data.rooms) ? data.rooms : []).map((r) => {
    const poly = Array.isArray(r.polygon)
      ? r.polygon.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      : [];
    const usable = poly.length >= 3 && poly.every(inBounds);
    return {
      name: String(r.name || "Room").slice(0, 60),
      dimensions: r.dimensions ? String(r.dimensions).slice(0, 40) : "",
      areaM2: Number.isFinite(r.areaM2) ? r.areaM2 : null,
      ceilingHeight: Number.isFinite(r.ceilingHeight) ? r.ceilingHeight : 0,
      confidence: Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : null,
      polygon: usable ? poly : null,
    };
  });

  const schedule = (Array.isArray(data.schedule) ? data.schedule : []).map((s) => ({
    type: String(s.type || "item").slice(0, 40),
    code: s.code ? String(s.code).slice(0, 20) : "",
    size: s.size ? String(s.size).slice(0, 30) : "",
    count: Number.isFinite(s.count) ? Math.max(0, Math.round(s.count)) : 0,
  }));

  return {
    rooms,
    schedule,
    scaleNote: data.scaleNote ? String(data.scaleNote).slice(0, 400) : "",
    notes: data.notes ? String(data.notes).slice(0, 600) : "",
  };
}
