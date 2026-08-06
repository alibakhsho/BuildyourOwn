/* =========================================================================
   Vercel serverless function — public estimate API.
   POST /api/estimate → returns an itemised construction cost estimate.

   Used by:
   - Custom GPT in the ChatGPT Store (primary use case)
   - Perplexity / Claude integrations
   - Third-party embeds
   - SEO cost page generation

   This imports the Estimator directly — no AI calls, no API key needed.
   The estimator is pure functions, so this endpoint is fast and free.
   ========================================================================= */

/* Vercel bundles serverless functions from the repo root, so these imports
   resolve against the same node_modules the frontend uses. The estimator
   is pure JS with no DOM or React dependencies. */
import { Estimator } from "../src/logic/estimator.js";
import { LabourRates } from "../src/data/labour.js";
import { round } from "../src/lib/format.js";

/* ---- Defaults for a reasonable residential estimate ---- */
const DEFAULTS = {
  widthM: 12, lengthM: 10, floors: 1, wallHeightM: 2.7,
  roofPitch: 22, roofType: "colorbond", claddingType: "brick",
  framingType: "timber", siteCondition: "flat", floorFinish: "timber",
  hasGarage: false, staircaseType: "none", slabThicknessM: 0.1,
  openings: { windowsM2: 12, windowsCount: 8, doors: 2 },
  rooms: [], kitchens: [], bathrooms: [],
};

/* ---- CORS headers (allow ChatGPT and any origin to call) ---- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  /* Preflight */
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const body = req.body || {};
    const region = ["AU", "US", "UK"].includes(body.region) ? body.region : "AU";

    /* Merge user input with sensible defaults */
    const spec = {
      ...DEFAULTS,
      ...body,
      region: undefined, // not part of spec
      openings: { ...DEFAULTS.openings, ...(body.openings || {}) },
      rooms: body.rooms || DEFAULTS.rooms,
      kitchens: body.kitchens || DEFAULTS.kitchens,
      bathrooms: body.bathrooms || DEFAULTS.bathrooms,
    };

    /* Run the estimator */
    const est = Estimator.buildEstimate(spec, region);
    const currency = { AU: "A$", US: "$", UK: "£" }[region];

    /* Build a clean response (strip internal fields the GPT doesn't need) */
    const response = {
      region,
      currency,
      dimensions: {
        widthM: spec.widthM,
        lengthM: spec.lengthM,
        floors: spec.floors,
        grossFloorAreaM2: est.takeoff.gfaM2,
      },
      configuration: {
        cladding: spec.claddingType,
        roof: spec.roofType,
        framing: spec.framingType,
        siteCondition: spec.siteCondition,
      },
      materials: est.materialLines.map((l) => ({
        item: l.label,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        total: l.total,
      })),
      materialsTotal: round(est.materialsTotal, 0),
      labour: est.labourLines.map((l) => ({
        trade: l.trade,
        hours: l.hours,
        rate: l.rate,
        total: l.total,
      })),
      labourTotal: round(est.labourTotal, 0),
      equipment: est.equipmentLines.map((l) => ({
        item: l.name,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        total: l.total,
      })),
      equipmentTotal: round(est.equipmentTotal, 0),
      summary: {
        subtotal: round(est.materialsTotal + est.labourTotal + est.equipmentTotal, 0),
        preliminaries: round(est.prelims, 0),
        builderMargin: round(est.margin, 0),
        contingency: round(est.contingency, 0),
        total: round(est.total, 0),
        ratePerM2: est.takeoff.gfaM2 > 0
          ? round(est.total / est.takeoff.gfaM2, 0)
          : 0,
      },
      timeline: {
        totalWeeks: est.timeline.totalWeeks,
        stages: est.timeline.stages.map((s) => ({
          stage: s.name,
          weeks: s.weeks,
          startWeek: s.startWeek,
          endWeek: s.endWeek,
        })),
      },
      disclaimer: "This is an indicative estimate based on market-rate guides. Real costs vary by supplier, region, season, and scope. Engage a licensed builder and quantity surveyor before relying on these numbers.",
      interactive: `https://buildyour-own.vercel.app/?w=${spec.widthM}&l=${spec.lengthM}&f=${spec.floors}&r=${region}`,
    };

    return res.status(200).json(response);
  } catch (e) {
    console.error("[api/estimate]", e);
    return res.status(500).json({
      error: "Failed to generate estimate",
      detail: e?.message,
    });
  }
}
