/* =========================================================================
   MODULE: carport.js
   Parametric build engine — skillion carport. buildCarport(spec, region)
   is a PURE FUNCTION: given parameters it returns ONE list of components.
   Each component knows what it is, where it sits, what it costs, and which
   build stage it belongs to. The 3D, the estimate, and the build animation
   ALL read from this one array — change a formula once, everything updates.
   ========================================================================= */
import { round } from "../lib/format.js";

/* Indicative trade rates per region — swap for catalogue/live rates later. */
const RATES = {
  footingEach: { AU: 145, US: 95, UK: 106 },  // bored pier: dig + concrete + labour
  postPerM:    { AU: 58,  US: 38, UK: 42 },   // 90x90 galv SHS supply+erect
  beamPerM:    { AU: 74,  US: 48, UK: 54 },   // side beam / bearer
  rafterPerM:  { AU: 36,  US: 24, UK: 26 },   // rafter
  roofPerM2:   { AU: 62,  US: 41, UK: 45 },   // Colorbond sheet + install
  fixingsPct: 0.08,                           // fixings/brackets/sundries % of materials
};

/* Fixed build assumptions */
const MAX_POST_SPACING = 3.0;   // m — posts no further apart than this
const RAFTER_SPACING = 1.1;     // m — rafter centres along the length
const SHEET_COVER = 0.762;      // m — effective cover width of one roof sheet
const PIER_DIA = 0.40, PIER_DEPTH = 0.90; // m — footing pier (indicative)

/* Stage names match Engine3D.stageOrder so the existing construction
   scrubber / play sequence works unmodified. */
const STAGE = { footings: "foundation", posts: "frame", beams: "walls", rafters: "roof", sheeting: "finishes" };

export const DEFAULT_CARPORT_SPEC = { L: 6, W: 6, H: 2.4, pitchDeg: 8 };

export const CARPORT_PARAMS = [
  { k: "L", label: "Length", min: 3, max: 12, step: 0.5, unit: "m" },
  { k: "W", label: "Width (span)", min: 3, max: 8, step: 0.5, unit: "m" },
  { k: "H", label: "Post height", min: 2.1, max: 3.6, step: 0.1, unit: "m" },
  { k: "pitchDeg", label: "Roof pitch", min: 3, max: 15, step: 1, unit: "°" },
];

export function buildCarport(spec, region = "AU") {
  const { L, W, H, pitchDeg } = spec;
  const r = (k) => (typeof RATES[k] === "number" ? RATES[k] : RATES[k][region] ?? RATES[k].AU);
  const th = (pitchDeg * Math.PI) / 180;
  const rise = W * Math.tan(th);          // how much the high side lifts
  const slopeLen = W / Math.cos(th);      // true rafter length down the slope
  const comps = [];
  // centre the structure on the origin so the engine's orbit target frames it
  const ox = -W / 2, oz = -L / 2;

  // ---- 1. POSTS + FOOTINGS ----
  const postsPerSide = Math.ceil(L / MAX_POST_SPACING) + 1;
  const spacing = L / (postsPerSide - 1);
  const sides = [
    { x: ox, h: H, col: 0x9aa4b0 },              // low side
    { x: ox + W, h: H + rise, col: 0x9aa4b0 },   // high side
  ];
  let postLenTotal = 0, footingCount = 0;
  for (const s of sides) {
    for (let i = 0; i < postsPerSide; i++) {
      const z = oz + i * spacing;
      comps.push({ cat: "Footings", stage: STAGE.footings, kind: "cyl",
        args: [PIER_DIA / 2, PIER_DIA / 2, PIER_DEPTH], pos: [s.x, -PIER_DEPTH / 2 + 0.05, z],
        col: 0xb8b2a7, cost: r("footingEach") });
      footingCount++;
      comps.push({ cat: "Posts", stage: STAGE.posts, kind: "box",
        args: [0.09, s.h, 0.09], pos: [s.x, s.h / 2, z], col: s.col,
        cost: s.h * r("postPerM") });
      postLenTotal += s.h;
    }
  }

  // ---- 2. SIDE BEAMS ----
  for (const s of sides) {
    comps.push({ cat: "Beams", stage: STAGE.beams, kind: "box",
      args: [0.09, 0.19, L], pos: [s.x, s.h - 0.095, oz + L / 2], col: 0x828c98,
      cost: L * r("beamPerM") });
  }

  // ---- 3. RAFTERS (span the width, tilted to the pitch) ----
  const rafterCount = Math.ceil(L / RAFTER_SPACING) + 1;
  const rSpacing = L / (rafterCount - 1);
  const midY = H + rise / 2 + 0.16;
  for (let j = 0; j < rafterCount; j++) {
    const z = oz + j * rSpacing;
    comps.push({ cat: "Rafters", stage: STAGE.rafters, kind: "box",
      args: [slopeLen, 0.14, 0.045], pos: [ox + W / 2, midY, z], rot: [0, 0, th],
      col: 0x77828f, cost: slopeLen * r("rafterPerM") });
  }

  // ---- 4. ROOF SHEETING ----
  const sheetsAcross = Math.ceil(L / SHEET_COVER);
  const roofArea = L * slopeLen * 1.10; // +10% waste/overlap
  const sheetY = H + rise / 2 + 0.30;
  for (let k = 0; k < sheetsAcross; k++) {
    const z = oz + k * SHEET_COVER + SHEET_COVER / 2;
    comps.push({ cat: "Roof sheeting", stage: STAGE.sheeting, kind: "box",
      args: [slopeLen, 0.02, SHEET_COVER * 0.96], pos: [ox + W / 2, sheetY, z], rot: [0, 0, th],
      col: 0x4c5a63, cost: SHEET_COVER * slopeLen * r("roofPerM2") });
  }

  // ---- ESTIMATE SUMMARY: aggregated from the SAME component array ----
  const byCat = {};
  for (const c of comps) {
    byCat[c.cat] = byCat[c.cat] || { total: 0, count: 0, stage: c.stage };
    byCat[c.cat].total += c.cost; byCat[c.cat].count++;
  }
  const qtyText = {
    "Footings": `${footingCount} piers · ${(footingCount * Math.PI * (PIER_DIA / 2) ** 2 * PIER_DEPTH).toFixed(2)} m³`,
    "Posts": `${postsPerSide * 2} posts · ${postLenTotal.toFixed(1)} m`,
    "Beams": `2 beams · ${(2 * L).toFixed(1)} m`,
    "Rafters": `${rafterCount} rafters · ${(rafterCount * slopeLen).toFixed(1)} m`,
    "Roof sheeting": `${sheetsAcross} sheets · ${roofArea.toFixed(1)} m²`,
  };
  const order = ["Footings", "Posts", "Beams", "Rafters", "Roof sheeting"];
  const summary = order.map((cat) => ({
    cat, stage: byCat[cat].stage, qty: qtyText[cat], total: round(byCat[cat].total, 2),
  }));
  const matSubtotal = summary.reduce((a, s) => a + s.total, 0);
  const fixings = round(matSubtotal * RATES.fixingsPct, 2);
  summary.push({ cat: "Fixings & sundries", stage: "finishes", qty: `${RATES.fixingsPct * 100}% of materials`, total: fixings, dim: true });

  return {
    components: comps, summary,
    grandTotal: round(matSubtotal + fixings, 2),
    roofAreaM2: round(roofArea, 1),
    planAreaM2: round(L * W, 1),
  };
}

export const CarportEstimator = {
  buildEstimate(spec, region) {
    const model = buildCarport(spec, region);
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    return {
      mode: "carport", region, spec,
      components: model.components,
      summary: model.summary,
      total: model.grandTotal,
      roofAreaM2: model.roofAreaM2,
      planAreaM2: model.planAreaM2,
      ratePerM2: model.planAreaM2 > 0 ? round(model.grandTotal / model.planAreaM2, 0) : 0,
      taxRate, taxLabel,
    };
  },
};
