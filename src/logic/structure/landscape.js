/* =========================================================================
   MODULE: structure/landscape.js
   The yard around the house as real pieces, laid out on the lot the same
   way the house is laid out on its slab:

     fencing   — side and rear boundary fences (steel sheet, timber paling)
                 with side returns and gates, and an optional front fence:
                 every post, footing, rail, sheet / paling / picket and gate
     decking   — a rear deck off the back door: pad footings, stirrups,
                 stumps, bearers, joists, boards (joints on joists, rows
                 staggered), screws or hidden clips, fascia, oil
     paving    — the front path, a side path through the side gate, the
                 driveway (concrete, exposed aggregate, pavers, gravel or
                 stepping stones) with road base, mesh, bedding sand,
                 edging, control joints and the dig-out; gravel side strips
     garden    — garden beds along the house front and the back and side
                 fences: dig-out, soil, mulch, edging, every plant, trees
     lawn      — turf (or synthetic) on everything that is left over
     retaining — an optional sleeper wall across the back of the lot

   Everything sits on finished ground (y = 0) with the slab edge left
   150 mm proud. Prices are supply-only material rates per schedule unit
   plus labour days from output rates, so a landscaper can swap in their
   own numbers (spec.landscape.rates / dayRates). INDICATIVE: the
   landscaper / fencer / carpenter set out and certify the real thing —
   landscapeCompliance() lists what to check.
   ========================================================================= */
import { STD, envelope, placeOpenings } from "../house-geometry.js";
import { Model, schedule } from "./model.js";

export const LANDSCAPE_DEFAULTS = {
  enabled: false,
  // the lot, as setbacks from the house (and garage)
  frontSetbackM: 6, rearYardM: 8, sideLeftM: 1.2, sideRightM: 1.5,
  // fences
  fence: "colorbond",          // colorbond | paling | none
  fenceHeightM: 1.8,
  frontFence: "none",          // none | picket
  // deck
  deck: true, deckWidthM: 5, deckDepthM: 3.6, deckBoard: "merbau",   // merbau | pine | composite
  // paths & driveway
  path: "concrete",            // concrete | exposed | pavers | gravel | stepping
  pathWidthM: 1.2, sidePath: true,
  driveway: "concrete",        // concrete | exposed | pavers
  // garden
  beds: true, bedDepthM: 1.0,
  edging: "steel",             // steel | timber | brick
  planting: "native",          // native | cottage | dry
  lawn: "turf",                // turf | synthetic | none
  retainingM: 0,               // retaining wall height across the back (0 = none)
  // a landscaper's own numbers: { [profile]: $ per unit }, { [trade]: $ per day }
  rates: {}, dayRates: {},
};

const num = (v, d, lo, hi) => { const x = +v; return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };

/** The landscape settings for a spec, with defaults filled and numbers kept sane. */
export function landscapeSpec(spec) {
  const L = { ...LANDSCAPE_DEFAULTS, ...((spec && spec.landscape) || {}) };
  const D = LANDSCAPE_DEFAULTS;
  return {
    ...L,
    enabled: !!L.enabled,
    frontSetbackM: num(L.frontSetbackM, D.frontSetbackM, 1.5, 30),
    rearYardM: num(L.rearYardM, D.rearYardM, 1, 40),
    sideLeftM: num(L.sideLeftM, D.sideLeftM, 0.45, 15),
    sideRightM: num(L.sideRightM, D.sideRightM, 0.45, 15),
    fenceHeightM: num(L.fenceHeightM, D.fenceHeightM, 0.9, 2.4),
    deckWidthM: num(L.deckWidthM, D.deckWidthM, 1.2, 20),
    deckDepthM: num(L.deckDepthM, D.deckDepthM, 1.2, 10),
    pathWidthM: num(L.pathWidthM, D.pathWidthM, 0.6, 2.4),
    bedDepthM: num(L.bedDepthM, D.bedDepthM, 0.4, 4),
    retainingM: num(L.retainingM, 0, 0, 2.4),
    rates: L.rates || {}, dayRates: L.dayRates || {},
  };
}

/* ---------- products ---------- */

export const FENCES = {
  colorbond: { label: "Steel sheet fence (Colorbond-style)", spacing: 2.36, trade: "fencer", perDay: 12 },
  paling:    { label: "Timber paling fence", spacing: 2.4, trade: "fencer", perDay: 8 },
  picket:    { label: "Timber picket fence", spacing: 2.4, trade: "fencer", perDay: 7 },
};

export const DECK_BOARDS = {
  merbau:    { label: "Merbau hardwood", profile: "Merbau decking 90×19", fascia: "Merbau fascia 140×19", w: 0.09, t: 0.019, gap: 0.005, mat: "merbau", fix: "screw", oil: true },
  pine:      { label: "Treated pine", profile: "Treated pine decking 90×22 (H3)", fascia: "Treated pine fascia 140×22 (H3)", w: 0.09, t: 0.022, gap: 0.005, mat: "deckPine", fix: "screw", oil: true },
  composite: { label: "Composite", profile: "Composite decking 137×23", fascia: "Composite fascia 140×15", w: 0.137, t: 0.023, gap: 0.006, mat: "composite", fix: "clip", oil: false },
};

export const SURFACES = {
  concrete: { label: "Plain concrete", kind: "concrete", path: "Concrete path slab 25 MPa, broom finish (100 mm)", drive: "Concrete driveway slab 32 MPa (125 mm)", mat: "concrete" },
  exposed:  { label: "Exposed aggregate", kind: "concrete", path: "Exposed aggregate path slab (100 mm)", drive: "Exposed aggregate driveway slab (125 mm)", mat: "exposedAgg", seal: true },
  pavers:   { label: "Concrete pavers", kind: "pavers", path: "Concrete paver 400×400×40", drive: "Driveway paver 230×115×60" },
  gravel:   { label: "Decomposed granite", kind: "gravel", path: "Decomposed granite, compacted (75 mm)" },
  stepping: { label: "Stepping stones in pebble", kind: "stepping", path: "Stepping stone 450×450×40" },
};

export const PLANTINGS = {
  native:  { label: "Native",
    shrub: { profile: "Westringia fruticosa (coastal rosemary) — 200 mm pot", spacing: 0.9, h: 0.9, dia: 0.8 },
    low:   { profile: "Lomandra 'Tanika' — 140 mm pot", spacing: 0.6, h: 0.45, dia: 0.5, grass: true },
    tree:  { profile: "Water gum (Tristaniopsis laurina) — 45 L", h: 4.5 } },
  cottage: { label: "Cottage",
    shrub: { profile: "Murraya paniculata (orange jessamine) — 200 mm pot", spacing: 0.9, h: 1.0, dia: 0.8 },
    low:   { profile: "English lavender — 140 mm pot", spacing: 0.5, h: 0.4, dia: 0.45 },
    tree:  { profile: "Crepe myrtle (Lagerstroemia) — 45 L", h: 4 } },
  dry:     { label: "Low water",
    shrub: { profile: "Agave attenuata — 200 mm pot", spacing: 0.9, h: 0.7, dia: 0.8 },
    low:   { profile: "Dianella 'Little Rev' — 140 mm pot", spacing: 0.5, h: 0.4, dia: 0.4, grass: true },
    tree:  { profile: "Fruitless olive 'Swan Hill' — 45 L", h: 4 } },
};

const EDGINGS = {
  steel:  { profile: "Galvanised steel edging 100 mm", d: 0.1, w: 0.004, mat: "galv" },
  timber: { profile: "H4 treated pine edging 150×25", d: 0.15, w: 0.025, mat: "pine" },
  brick:  { profile: "Brick mowing strip on mortar (230 wide)", d: 0.076, w: 0.23, mat: "brickTex" },
};

/* Supply rates, AUD ex GST, per schedule unit (ea / lin. m / m² / m³). */
export const LANDSCAPE_RATES = {
  // fencing
  "Steel fence post 50×50 (2.4 m)": 32,
  "Steel fence rail (top / bottom)": 9,
  "Steel fence infill sheet": 28,
  "H4 treated pine post 125×75 (2.4 m)": 38,
  "H3 treated pine rail 75×38": 4.2,
  "Treated pine paling 100×12": 2.6,
  "H4 treated pine plinth 150×25": 5.5,
  "H4 treated pine post 90×90 (1.5 m)": 22,
  "Pine rail 70×35 (picket fence)": 3.6,
  "Primed pine picket 70×19": 3.2,
  "Post footing — 20 MPa concrete": 14,
  "Gate leaf to suit fence (900 wide)": 260,
  "Gate hinges, latch & drop bolt": 85,
  // deck
  "Merbau decking 90×19": 9.5,
  "Treated pine decking 90×22 (H3)": 3.6,
  "Composite decking 137×23": 16,
  "Merbau fascia 140×19": 16,
  "Treated pine fascia 140×22 (H3)": 6,
  "Composite fascia 140×15": 18,
  "H3 MGP10 joist 90×45": 6.2,
  "H3 bearer 2/90×45": 12.4,
  "H4 treated pine stump 90×90": 13,
  "Concrete pad footing 400×400×300": 30,
  "Galvanised post stirrup": 18,
  "Galvanised framing anchor (joist to bearer)": 1.6,
  "Stainless deck screw 10g × 65": 0.32,
  "Hidden deck clip + screw": 0.9,
  "Decking oil — 2 coats": 6.5,
  // paving
  "Concrete path slab 25 MPa, broom finish (100 mm)": 295,
  "Exposed aggregate path slab (100 mm)": 360,
  "Concrete driveway slab 32 MPa (125 mm)": 310,
  "Exposed aggregate driveway slab (125 mm)": 375,
  "SL72 mesh": 6.6,
  "SL82 mesh": 9,
  "Road base, compacted": 62,
  "Bedding sand (30 mm)": 58,
  "Concrete paver 400×400×40": 6.8,
  "Driveway paver 230×115×60": 1.25,
  "Concrete edge restraint (haunch)": 8,
  "Control joint (saw cut + sealant)": 4,
  "Penetrating concrete sealer — 2 coats": 4.5,
  "Decomposed granite, compacted (75 mm)": 120,
  "Stepping stone 450×450×40": 24,
  "20 mm pebble infill (50 mm)": 140,
  "20 mm gravel on weed mat (75 mm)": 110,
  "Weed mat / geofabric": 1.8,
  "Excavation & spoil removal": 68,
  // garden
  "Garden soil mix (225 mm)": 95,
  "Hardwood chip mulch (75 mm)": 70,
  "Galvanised steel edging 100 mm": 14,
  "H4 treated pine edging 150×25": 5.5,
  "Brick mowing strip on mortar (230 wide)": 22,
  "Westringia fruticosa (coastal rosemary) — 200 mm pot": 16,
  "Lomandra 'Tanika' — 140 mm pot": 8.5,
  "Water gum (Tristaniopsis laurina) — 45 L": 185,
  "Murraya paniculata (orange jessamine) — 200 mm pot": 17,
  "English lavender — 140 mm pot": 8.5,
  "Crepe myrtle (Lagerstroemia) — 45 L": 175,
  "Agave attenuata — 200 mm pot": 19,
  "Dianella 'Little Rev' — 140 mm pot": 8.5,
  "Fruitless olive 'Swan Hill' — 45 L": 195,
  "Tree stake & tie kit": 18,
  // lawn
  "Soft-leaf buffalo turf": 13,
  "Turf underlay soil (100 mm)": 75,
  "Synthetic turf 35 mm pile": 42,
  "Crushed rock base, compacted (75 mm)": 62,
  // retaining
  "Concrete sleeper 2000×200×75": 52,
  "Galvanised steel H-post 100 UC": 48,
  "Post footing — 20 MPa concrete (300 Ø)": 28,
  "Slotted ag pipe 100 mm with sock": 4.5,
  "20 mm drainage gravel": 120,
};

/* Rates are Australian; other regions scale like the materials table (AU 110 : US 70 : UK 78). */
export const LANDSCAPE_REGION = { AU: 1, US: 0.64, UK: 0.71 };

/* Day rates per person (or per machine with operator), AUD ex GST. */
export const DAY_RATES = { landscaper: 560, fencer: 560, carpenter: 640, concreter: 620, bobcat: 1150 };
export const TRADE_LABEL = { landscaper: "Landscaper", fencer: "Fencer", carpenter: "Carpenter", concreter: "Concreter", bobcat: "Bobcat + operator" };

/* ---------- rectangles (everything in the yard is axis-aligned) ---------- */
const R = (x0, x1, z0, z1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
export const areaOf = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlaps = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const minSide = (r) => Math.min(r.x1 - r.x0, r.z1 - r.z0);

/* rects minus h, as rectangles (slivers under 50 mm dropped) */
function cut(rects, h) {
  const out = [];
  for (const r of rects) {
    if (!overlaps(r, h)) { out.push(r); continue; }
    if (h.z0 > r.z0) out.push({ ...r, z1: h.z0 });
    if (h.z1 < r.z1) out.push({ ...r, z0: h.z1 });
    const z0 = Math.max(r.z0, h.z0), z1 = Math.min(r.z1, h.z1);
    if (h.x0 > r.x0) out.push({ x0: r.x0, x1: h.x0, z0, z1 });
    if (h.x1 < r.x1) out.push({ x0: h.x1, x1: r.x1, z0, z1 });
  }
  return out.filter((r) => r.x1 - r.x0 > 0.05 && r.z1 - r.z0 > 0.05);
}
const cutAll = (rects, holes) => holes.reduce((acc, h) => cut(acc, h), rects);

/** The lot and the house box on it (x across, z front-to-back, +z = street). */
export function lotOf(spec, env) {
  const L = landscapeSpec(spec);
  const gw = spec.hasGarage ? STD.garage.w : 0;
  const hx0 = -env.w / 2 - gw, hx1 = env.w / 2, hz0 = -env.l / 2, hz1 = env.l / 2;
  return { X0: hx0 - L.sideLeftM, X1: hx1 + L.sideRightM, Z0: hz0 - L.rearYardM, Z1: hz1 + L.frontSetbackM, hx0, hx1, hz0, hz1 };
}

/**
 * Where everything goes — pure, no pieces. Shared by the builder, the
 * landscape plan and the compliance checks.
 * ctx = { spec, env, openings, garage }  (garage = { x0, x1, z0, z1 } | null)
 */
export function yardLayout(ctx) {
  const { spec, env, openings = [], garage } = ctx;
  const L = landscapeSpec(spec);
  const lot = lotOf(spec, env);
  const { X0, X1, Z0, Z1 } = lot;
  const { w, l } = env;
  const HZ0 = -l / 2, HZ1 = l / 2;
  const house = R(-w / 2, w / 2, HZ0, HZ1);
  const gar = garage ? R(garage.x0, garage.x1, garage.z0, garage.z1) : null;
  const pw = L.pathWidthM, bd = L.bedDepthM;
  const zR = HZ1 - 1.0;                                    // side returns, 1 m back from the front wall
  const retainZ = L.retainingM > 0 ? Z0 + 0.55 : null;     // front face of the retaining wall (drainage zone behind it, inside the boundary)
  const backZ = retainZ ?? Z0;

  /* driveway: garage door to the street */
  const driveway = gar ? R(gar.x0 + 0.3, gar.x1 - 0.3, HZ1, Z1) : null;

  /* front path: front door to the street, or to the driveway when it is close */
  const fd = openings.find((o) => o.side === "front" && o.kind === "door" && (o.floor ?? 0) === 0);
  const paths = [];
  let frontGate = null;
  if (fd) {
    const dx = Math.max(-w / 2 + pw / 2, Math.min(w / 2 - pw / 2, -w / 2 + fd.u));
    if (driveway && dx - pw / 2 < driveway.x1 + 0.4) {
      if (dx + pw / 2 > driveway.x1 + 0.05) paths.push({ r: R(driveway.x1, dx + pw / 2, HZ1, HZ1 + pw), host: "Front path" });
    } else {
      paths.push({ r: R(dx - pw / 2, dx + pw / 2, HZ1, Z1), host: "Front path" });
      frontGate = { x0: dx - pw / 2, x1: dx + pw / 2 };
    }
  }
  /* side path: down the right side, through the side gate, to the back yard */
  const sideW = Math.min(pw, L.sideRightM - 0.1);
  if (L.sidePath && sideW >= 0.6) paths.push({ r: R(w / 2, w / 2 + sideW, HZ0, HZ1), host: "Side path", side: true });

  /* deck: off the back door, clear of the hot-water unit and the corners */
  let deck = null;
  const roomBehind = L.rearYardM - (L.beds ? bd : 0) - (retainZ != null ? 0.55 : 0) - 0.6;
  if (L.deck && roomBehind >= 1.2) {
    const depth = Math.min(L.deckDepthM, roomBehind);
    const bdoor = openings.find((o) => o.side === "back" && o.kind === "door" && (o.floor ?? 0) === 0);
    const lim0 = -w / 2 + 0.3, lim1 = w / 2 - 0.3;
    const dw = Math.min(L.deckWidthM, lim1 - lim0);
    const cx = bdoor ? w / 2 - bdoor.u : 0;
    let x0 = Math.max(lim0, Math.min(lim1 - dw, cx - dw / 2)), x1 = x0 + dw;
    const hw0 = w / 3 - 0.45, hw1 = w / 3 + 0.45;          // hot-water unit (services.js) on the back wall
    if (x0 < hw1 && x1 > hw0) {
      const left = [Math.max(lim0, hw0 - dw), hw0], right = [hw1, Math.min(lim1, hw1 + dw)];
      [x0, x1] = left[1] - left[0] >= right[1] - right[0] ? left : right;
    }
    if (x1 - x0 >= 1.2) deck = R(x0, x1, HZ0 - depth, HZ0 - 0.02);
  }

  /* beds */
  const beds = [];
  if (L.beds) {
    let front = [R(-w / 2, w / 2, HZ1, HZ1 + Math.min(bd, L.frontSetbackM - 0.5))];
    front = cutAll(front, [driveway, ...paths.map((p) => p.r)].filter(Boolean).map((r) => R(r.x0 - 0.0, r.x1 + 0.0, r.z0, r.z1)));
    for (const r of front) if (areaOf(r) > 0.3) beds.push({ r, host: "Front garden bed", back: "z0" });
    const rearDepth = Math.min(bd, (deck ? deck.z0 : HZ0) - backZ - 0.6);
    if (rearDepth >= 0.4) {
      beds.push({ r: R(X0, X1, backZ, backZ + rearDepth), host: "Rear garden bed", back: "z0" });
      const sz0 = backZ + rearDepth, sz1 = HZ0 - 1.5;
      if (sz1 - sz0 > 0.8) {
        beds.push({ r: R(X0, X0 + bd, sz0, sz1), host: "Rear garden bed · left fence", back: "x0" });
        beds.push({ r: R(X1 - bd, X1, sz0, sz1), host: "Rear garden bed · right fence", back: "x1" });
      }
    }
  }
  for (const b of beds) if (deck && overlaps(b.r, deck)) b.r = null;
  const bedList = beds.filter((b) => b.r);

  /* what is left: lawn on the open ground, gravel on narrow strips */
  const taken = [house, gar, driveway, deck, ...paths.map((p) => p.r), ...bedList.map((b) => b.r), retainZ != null ? R(X0, X1, Z0, retainZ) : null].filter(Boolean);
  const free = cutAll([R(X0, X1, Z0, Z1)], taken);
  // side setbacks beside the house (bins, A/C, hot water) get gravel; so do slivers
  const hx0 = gar ? Math.min(gar.x0, -w / 2) : -w / 2;
  const beside = (r) => r.z0 >= HZ0 - 1e-6 && r.z1 <= HZ1 + 1e-6 && (r.x1 <= hx0 + 1e-6 || r.x0 >= w / 2 - 1e-6);
  const lawn = [], gravel = [];
  for (const r of free) (minSide(r) < 0.5 || (beside(r) && minSide(r) < 2) ? gravel : lawn).push(r);

  /* fences */
  const fences = [];
  if (L.fence !== "none") {
    fences.push({ a: [X0, Z0], b: [X1, Z0], host: "Rear boundary fence" });
    fences.push({ a: [X0, zR], b: [X0, Z0], host: "Left boundary fence" });
    fences.push({ a: [X1, Z0], b: [X1, zR], host: "Right boundary fence" });
    const rx0 = gar ? Math.min(gar.x0, -w / 2) : -w / 2;
    const lLen = rx0 - X0, rLen = X1 - w / 2;
    // a side gate wherever a person fits through (700 clear at the least, 900 when there's room)
    fences.push({ a: [w / 2, zR], b: [X1, zR], host: "Right side return", gates: rLen >= 0.75 ? [{ s0: 0.05, s1: Math.min(0.95, rLen - 0.05) }] : [] });
    fences.push({ a: [X0, zR], b: [rx0, zR], host: "Left side return", gates: lLen >= 0.75 ? [{ s0: lLen - Math.min(0.95, lLen - 0.05), s1: lLen - 0.05 }] : [] });
  }
  const frontFences = [];
  if (L.frontFence === "picket") {
    const open = driveway ? [{ s0: driveway.x0 - X0, s1: driveway.x1 - X0 }] : [];
    const gates = frontGate ? [{ s0: frontGate.x0 - X0, s1: frontGate.x1 - X0 }] : [];
    frontFences.push({ a: [X0, Z1], b: [X1, Z1], host: "Front fence", open, gates });
    // drawn street-side out (+t to the street), so the rails sit inside the lot
    frontFences.push({ a: [X0, zR], b: [X0, Z1], host: "Front fence · left return" });
    frontFences.push({ a: [X1, Z1], b: [X1, zR], host: "Front fence · right return" });
  }

  /* feature trees: one in the biggest front lawn, one in the back bed */
  const trees = [];
  if (L.beds) {
    const fl = lawn.filter((r) => r.z0 >= HZ1 - 1e-6).sort((a, b) => areaOf(b) - areaOf(a))[0];
    if (fl && minSide(fl) >= 3) trees.push({ x: (fl.x0 + fl.x1) / 2, z: (fl.z0 + fl.z1) / 2, host: "Front lawn" });
    const rb = bedList.find((b) => b.host === "Rear garden bed");
    if (rb && rb.r.x1 - rb.r.x0 > 4) trees.push({ x: rb.r.x0 + 1.6, z: (rb.r.z0 + rb.r.z1) / 2, host: "Rear garden bed", inBed: true });
  }

  return { L, lot, house, garage: gar, zR, driveway, paths, deck, beds: bedList, lawn, gravel, fences, frontFences, trees, retainZ };
}

/* ---------- piece helpers ---------- */

/* A horizontal layer over rectangle r, between heights y0 and y1. */
function flat(M, r, y0, y1, p) {
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0, yc = (y0 + y1) / 2, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  return M.add({ unit: "m2", ...p,
    a: alongX ? [r.x0, yc, cz] : [cx, yc, r.z0], b: alongX ? [r.x1, yc, cz] : [cx, yc, r.z1],
    d: y1 - y0, w: alongX ? r.z1 - r.z0 : r.x1 - r.x0, up: [0, 1, 0] });
}
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const lin = (a, b, n) => (n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));
const dig = (M, r, depth, sys, host, code) => flat(M, r, -depth, 0, { sys, kind: "excavation", name: "Excavation", profile: "Excavation & spoil removal", mat: "soil", unit: "m3", host, code, noRender: true });

/* ---------- fences ---------- */

function fenceRun(M, type, run, H, seen) {
  const dx = run.b[0] - run.a[0], dz = run.b[1] - run.a[1], L = Math.hypot(dx, dz);
  if (L < 0.3) return;
  const u = [dx / L, dz / L], n = [-u[1], u[0]];
  const P = (s, y, t = 0) => [run.a[0] + u[0] * s + n[0] * t, y, run.a[1] + u[1] * s + n[1] * t];
  const host = run.host, code = "LF";
  const up = [n[0], 0, n[1]];
  const POST = {
    colorbond: { profile: "Steel fence post 50×50 (2.4 m)", d: 0.05, mat: "fenceSteel", embed: 0.6 },
    paling: { profile: "H4 treated pine post 125×75 (2.4 m)", d: 0.1, mat: "pine", embed: 0.6 },
    picket: { profile: "H4 treated pine post 90×90 (1.5 m)", d: 0.09, mat: "paintWhite", embed: 0.45 },
  }[type];
  const post = (s) => {
    const p = P(s, 0);
    const key = `${p[0].toFixed(2)},${p[2].toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    M.add({ sys: "fencing", kind: "post", name: "Fence post", profile: POST.profile, mat: POST.mat, unit: "ea", host,
      a: [p[0], -POST.embed, p[2]], b: [p[0], H + 0.02, p[2]], d: POST.d, w: POST.d, up, code });
    M.add({ sys: "fencing", kind: "footing", name: "Post footing", profile: "Post footing — 20 MPa concrete", mat: "concrete", shape: "cyl", unit: "ea", host,
      a: [p[0], -POST.embed - 0.05, p[2]], b: [p[0], -0.05, p[2]], d: 0.25, w: 0.25, up: [1, 0, 0], code });
  };
  const rail = (s0, s1, y, profile, d, w, t, mat) => M.add({ sys: "fencing", kind: "rail", name: "Fence rail", profile, mat, host,
    a: P(s0, y, t), b: P(s1, y, t), d, w, up: [0, 1, 0], code });
  const panel = (s0, s1) => {
    const h = POST.d / 2;
    if (type === "colorbond") {
      rail(s0 + h, s1 - h, 0.07, "Steel fence rail (top / bottom)", 0.04, 0.05, 0, "fenceSteel");
      rail(s0 + h, s1 - h, H - 0.02, "Steel fence rail (top / bottom)", 0.04, 0.05, 0, "fenceSteel");
      M.add({ sys: "fencing", kind: "sheet", name: "Fence infill sheet", profile: "Steel fence infill sheet", mat: "fenceSheet", unit: "m2", host,
        a: P(s0 + h, (0.07 + H - 0.02) / 2), b: P(s1 - h, (0.07 + H - 0.02) / 2), d: H - 0.09, w: 0.016, up: [0, 1, 0], code });
    } else if (type === "paling") {
      // runs are drawn so +t is the owner's side: rails inside the lot, palings on the line
      for (const y of [0.3, H / 2 + 0.05, H - 0.25]) rail(s0, s1, y, "H3 treated pine rail 75×38", 0.075, 0.038, 0.07, "pine");
      M.add({ sys: "fencing", kind: "plinth", name: "Plinth board", profile: "H4 treated pine plinth 150×25", mat: "pine", host,
        a: P(s0, 0.075, 0.02), b: P(s1, 0.075, 0.02), d: 0.15, w: 0.025, up: [0, 1, 0], code });
      // lapped palings: 100 wide at 75 centres, alternate faces
      let k = 0;
      for (let s = s0 + 0.05; s <= s1 - 0.05 + 1e-6; s += 0.075, k++) {
        M.add({ sys: "fencing", kind: "paling", name: "Paling", profile: "Treated pine paling 100×12", mat: "pine", unit: "ea", host, tint: hash(s, H),
          a: P(s, 0.15, k % 2 ? 0.006 : -0.006), b: P(s, H, k % 2 ? 0.006 : -0.006), d: 0.012, w: 0.1, up, code });
      }
    } else {
      for (const y of [0.22, H - 0.2]) rail(s0, s1, y, "Pine rail 70×35 (picket fence)", 0.07, 0.035, -0.04, "paintWhite");
      for (let s = s0 + 0.1; s <= s1 - 0.08 + 1e-6; s += 0.12) {
        M.add({ sys: "fencing", kind: "picket", name: "Picket", profile: "Primed pine picket 70×19", mat: "paintWhite", unit: "ea", host,
          a: P(s, 0.08, 0), b: P(s, H, 0), d: 0.019, w: 0.07, up, code });
      }
    }
  };
  const breaks = [...(run.gates || []).map((g) => ({ ...g, gate: true })), ...(run.open || [])].sort((p, q) => p.s0 - q.s0);
  let s = 0;
  const solids = [];
  for (const g of breaks) { if (g.s0 - s > 0.05) solids.push([s, g.s0]); s = Math.max(s, g.s1); }
  if (L - s > 0.05) solids.push([s, L]);
  for (const [s0, s1] of solids) {
    const nb = Math.max(1, Math.ceil((s1 - s0) / FENCES[type].spacing - 1e-6));
    const step = (s1 - s0) / nb;
    for (let i = 0; i <= nb; i++) post(s0 + i * step);
    for (let i = 0; i < nb; i++) panel(s0 + i * step, s0 + (i + 1) * step);
  }
  for (const g of breaks.filter((b) => b.gate)) {
    post(g.s0); post(g.s1);
    M.add({ sys: "fencing", kind: "gate", name: "Gate", profile: "Gate leaf to suit fence (900 wide)", mat: type === "colorbond" ? "fenceSheet" : type === "picket" ? "paintWhite" : "pine", unit: "ea", host,
      a: P(g.s0 + 0.04, (0.06 + H) / 2), b: P(g.s1 - 0.04, (0.06 + H) / 2), d: H - 0.08, w: 0.04, up: [0, 1, 0], code });
    M.add({ sys: "fencing", kind: "hardware", name: "Gate hardware", profile: "Gate hinges, latch & drop bolt", mat: "darkSteel", unit: "ea", host,
      a: P(g.s1 - 0.1, 1.0), b: P(g.s1 - 0.04, 1.0), d: 0.08, w: 0.06, up: [0, 1, 0], code });
  }
}

/* ---------- deck ---------- */

function splitRun(a, b, joists, max, stagger) {
  const out = [];
  let s = a, lim = b - a > max ? max - stagger : max;
  while (b - s > lim + 1e-6) {
    const j = joists.filter((x) => x > s + 0.3 && x <= s + lim).pop();
    if (j == null) break;
    out.push([s, j]); s = j; lim = max;
  }
  out.push([s, b]);
  return out;
}

function buildDeck(M, r, B, top) {
  const host = "Rear deck", code = "LD";
  const width = r.x1 - r.x0, depth = r.z1 - r.z0;
  const joistTop = top - B.t, joistBot = joistTop - 0.09, bearerBot = joistBot - 0.09;
  const ground = Math.min(0, bearerBot - 0.15);              // 150 clear under the bearers, dug out if need be
  if (ground < 0) dig(M, r, -ground, "decking", host, code);
  const bearersZ = lin(r.z0 + 0.15, r.z1 - 0.15, Math.max(2, Math.ceil((depth - 0.3) / 1.5) + 1));
  const postsX = lin(r.x0 + 0.15, r.x1 - 0.15, Math.max(2, Math.ceil((width - 0.3) / 1.8) + 1));
  for (const z of bearersZ) {
    M.add({ sys: "decking", kind: "bearer", name: "Bearer", profile: "H3 bearer 2/90×45", mat: "pine", host,
      a: [r.x0 + 0.08, (joistBot + bearerBot) / 2, z], b: [r.x1 - 0.08, (joistBot + bearerBot) / 2, z], d: 0.09, w: 0.09, up: [0, 1, 0], code });
    for (const x of postsX) {
      M.add({ sys: "decking", kind: "pad", name: "Pad footing", profile: "Concrete pad footing 400×400×300", mat: "concrete", unit: "ea", host,
        a: [x - 0.2, ground - 0.15, z], b: [x + 0.2, ground - 0.15, z], d: 0.3, w: 0.4, up: [0, 1, 0], code });
      M.add({ sys: "decking", kind: "bracket", name: "Post stirrup", profile: "Galvanised post stirrup", mat: "galv", unit: "ea", host,
        a: [x, ground, z], b: [x, ground + 0.075, z], d: 0.1, w: 0.1, up: [1, 0, 0], code });
      if (bearerBot - (ground + 0.075) > 0.03) {
        M.add({ sys: "decking", kind: "stump", name: "Stump", profile: "H4 treated pine stump 90×90", mat: "pine", host,
          a: [x, ground + 0.075, z], b: [x, bearerBot, z], d: 0.09, w: 0.09, up: [1, 0, 0], code });
      }
    }
  }
  const nJ = Math.max(2, Math.ceil((width - 0.045) / 0.45) + 1);
  const joistsX = lin(r.x0 + 0.0225, r.x1 - 0.0225, nJ);
  for (const x of joistsX) {
    M.add({ sys: "decking", kind: "joist", name: "Joist", profile: "H3 MGP10 joist 90×45", mat: "pine", host,
      a: [x, (joistTop + joistBot) / 2, r.z0], b: [x, (joistTop + joistBot) / 2, r.z1], d: 0.09, w: 0.045, up: [0, 1, 0], code });
    for (const z of bearersZ) {
      M.add({ sys: "decking", kind: "bracket", name: "Framing anchor", profile: "Galvanised framing anchor (joist to bearer)", mat: "galv", unit: "ea", host,
        a: [x + 0.03, joistBot + 0.02, z - 0.03], b: [x + 0.03, joistBot + 0.02, z + 0.03], d: 0.04, w: 0.002, up: [0, 1, 0], code });
    }
  }
  // boards along the house, from the house side out; the last row ripped to fit
  const pitch = B.w + B.gap;
  const rows = Math.max(1, Math.ceil((depth - 0.01) / pitch - 1e-6));
  for (let c = 0; c < rows; c++) {
    const zIn = r.z1 - c * pitch;
    const bw = Math.min(B.w, zIn - r.z0);
    if (bw < 0.03) break;
    const zc = zIn - bw / 2;
    for (const [s0, s1] of splitRun(r.x0, r.x1, joistsX, 5.4, c % 2 ? 1.8 : 0)) {
      M.add({ sys: "decking", kind: "board", name: "Deck board", profile: B.profile, mat: B.mat, host, tint: hash(c, s0),
        a: [s0 + (s0 > r.x0 ? 0.001 : 0), joistTop + B.t / 2, zc], b: [s1 - 0.001, joistTop + B.t / 2, zc], d: B.t, w: bw, up: [0, 1, 0], code });
      for (const x of joistsX.filter((j) => j >= s0 - 1e-6 && j <= s1 + 1e-6)) {
        if (B.fix === "screw") {
          for (const dz of [-bw / 4, bw / 4]) {
            M.add({ sys: "decking", kind: "screw", name: "Deck screw", profile: "Stainless deck screw 10g × 65", mat: "chrome", unit: "ea", host,
              a: [x, top - 0.065, zc + dz], b: [x, top + 0.001, zc + dz], d: 0.005, w: 0.005, up: [1, 0, 0], code });
          }
        } else {
          M.add({ sys: "decking", kind: "clamp", name: "Deck clip", profile: "Hidden deck clip + screw", mat: "darkSteel", unit: "ea", host,
            a: [x - 0.02, joistTop + 0.005, zIn - bw - B.gap / 2], b: [x + 0.02, joistTop + 0.005, zIn - bw - B.gap / 2], d: 0.01, w: B.gap, up: [0, 1, 0], code });
        }
      }
    }
  }
  // fascia on the three open sides
  const fy = top - B.t - 0.07;
  for (const [a, b] of [[[r.x0, fy, r.z0 - 0.01], [r.x1, fy, r.z0 - 0.01]], [[r.x0 - 0.01, fy, r.z0], [r.x0 - 0.01, fy, r.z1]], [[r.x1 + 0.01, fy, r.z0], [r.x1 + 0.01, fy, r.z1]]]) {
    M.add({ sys: "decking", kind: "fascia", name: "Deck fascia", profile: B.fascia, mat: B.mat, host, a, b, d: 0.14, w: 0.019, up: [0, 1, 0], code });
  }
  if (B.oil) flat(M, r, top, top + 0.001, { sys: "decking", kind: "finish", name: "Deck finish", profile: "Decking oil — 2 coats", mat: B.mat, host, code, noRender: true });
  return { top, ground, area: width * depth, heightAboveGround: top, joists: joistsX.length, bearers: bearersZ.length };
}

/* ---------- paths, driveway, gravel ---------- */

function hardSurface(M, r, key, host, drive) {
  const S = SURFACES[key] || SURFACES.concrete;
  const sys = "paving", code = drive ? "LV" : "LP";
  const along = r.x1 - r.x0 >= r.z1 - r.z0 ? "x" : "z";
  const len = along === "x" ? r.x1 - r.x0 : r.z1 - r.z0, wid = along === "x" ? r.z1 - r.z0 : r.x1 - r.x0;
  const sub = (s0, s1) => (along === "x" ? R(r.x0 + s0, r.x0 + s1, r.z0, r.z1) : R(r.x0, r.x1, r.z0 + s0, r.z0 + s1));
  const area = areaOf(r);
  if (S.kind === "concrete") {
    const thk = drive ? 0.125 : 0.1, base = drive ? 0.1 : 0.05, joint = drive ? 3 : 1.8;
    dig(M, r, thk + base, sys, host, code);
    flat(M, r, -thk - base, -thk, { sys, kind: "base", name: "Road base", profile: "Road base, compacted", mat: "gravel", unit: "m3", host, code, noRender: true });
    flat(M, r, -thk + 0.03, -thk + 0.035, { sys, kind: "mesh", name: "Reinforcing mesh", profile: drive ? "SL82 mesh" : "SL72 mesh", mat: "rebar", host, code, noRender: true });
    const n = Math.max(1, Math.ceil(len / joint - 1e-6));
    for (let i = 0; i < n; i++) {
      flat(M, sub((len * i) / n + (i ? 0.002 : 0), (len * (i + 1)) / n - (i < n - 1 ? 0.002 : 0)), -thk, 0, { sys, kind: "slab", name: drive ? "Driveway slab" : "Path slab", profile: drive ? S.drive : S.path, mat: S.mat, unit: "m3", host, code });
    }
    for (let i = 1; i < n; i++) {
      const s = (len * i) / n;
      M.add({ sys, kind: "joint", name: "Control joint", profile: "Control joint (saw cut + sealant)", mat: "black", host, code, noRender: true,
        a: along === "x" ? [r.x0 + s, -0.01, r.z0] : [r.x0, -0.01, r.z0 + s], b: along === "x" ? [r.x0 + s, -0.01, r.z1] : [r.x1, -0.01, r.z0 + s], d: 0.02, w: 0.004, up: [0, 1, 0] });
    }
    if (S.seal) flat(M, r, 0, 0.001, { sys, kind: "finish", name: "Sealer", profile: "Penetrating concrete sealer — 2 coats", mat: S.mat, host, code, noRender: true });
    return area;
  }
  if (S.kind === "pavers") {
    const [pa, pb, pt] = drive ? [0.23, 0.115, 0.06] : [0.4, 0.4, 0.04];
    const base = drive ? 0.15 : 0.1, sand = 0.03, j = 0.003;
    dig(M, r, pt + sand + base, sys, host, code);
    flat(M, r, -pt - sand - base, -pt - sand, { sys, kind: "base", name: "Road base", profile: "Road base, compacted", mat: "gravel", unit: "m3", host, code, noRender: true });
    flat(M, r, -pt - sand, -pt, { sys, kind: "sand", name: "Bedding sand", profile: "Bedding sand (30 mm)", mat: "gravel", unit: "m3", host, code, noRender: true });
    // pavers: long side across the path for drive bricks (stretcher bond), square slabs stack-bonded
    const du = drive ? pb : pa, dv = drive ? pa : pb;
    let k = 0;
    for (let s = 0; s < len - 0.02; s += du + j, k++) {
      const off = drive && k % 2 ? dv / 2 : 0;
      for (let t = -off; t < wid - 0.02; t += dv + j) {
        const s1 = Math.min(len, s + du), t0 = Math.max(0, t), t1 = Math.min(wid, t + dv);
        if (t1 - t0 < 0.02 || s1 - s < 0.02) continue;
        const rr = along === "x" ? R(r.x0 + s, r.x0 + s1, r.z0 + t0, r.z0 + t1) : R(r.x0 + t0, r.x0 + t1, r.z0 + s, r.z0 + s1);
        flat(M, rr, -pt, 0, { sys, kind: "paver", name: "Paver", profile: drive ? S.drive : S.path, mat: "paver", unit: "ea", host, code, tint: hash(s, t) });
      }
    }
    for (const t of [0, wid]) {
      M.add({ sys, kind: "edge", name: "Edge restraint", profile: "Concrete edge restraint (haunch)", mat: "concrete", host, code, noRender: true,
        a: along === "x" ? [r.x0, -pt - 0.05, r.z0 + t] : [r.x0 + t, -pt - 0.05, r.z0], b: along === "x" ? [r.x1, -pt - 0.05, r.z0 + t] : [r.x0 + t, -pt - 0.05, r.z1], d: 0.1, w: 0.1, up: [0, 1, 0] });
    }
    return area;
  }
  // gravel and stepping stones: compacted fines (or pebble) on weed mat, steel edges both sides
  const thk = S.kind === "gravel" ? 0.075 : 0.05;
  dig(M, r, thk + 0.05, sys, host, code);
  flat(M, r, -thk - 0.002, -thk, { sys, kind: "fabric", name: "Weed mat", profile: "Weed mat / geofabric", mat: "black", host, code, noRender: true });
  if (S.kind === "gravel") flat(M, r, -thk, 0, { sys, kind: "gravel", name: "Path surface", profile: S.path, mat: "gravel", unit: "m3", host, code });
  else {
    flat(M, r, -thk, -0.005, { sys, kind: "gravel", name: "Pebble infill", profile: "20 mm pebble infill (50 mm)", mat: "pebble", unit: "m3", host, code });
    for (let s = 0.3; s < len - 0.2; s += 0.6) {
      const half = Math.min(0.225, wid / 2 - 0.05);
      const rr = along === "x" ? R(r.x0 + s - 0.225, r.x0 + s + 0.225, r.z0 + wid / 2 - half, r.z0 + wid / 2 + half) : R(r.x0 + wid / 2 - half, r.x0 + wid / 2 + half, r.z0 + s - 0.225, r.z0 + s + 0.225);
      flat(M, rr, -0.04, 0.0, { sys, kind: "stone", name: "Stepping stone", profile: S.path, mat: "paver", unit: "ea", host, code, tint: hash(s, wid) });
    }
  }
  edgeLine(M, r, along === "x" ? ["z0", "z1"] : ["x0", "x1"], EDGINGS.steel, sys, host, code);
  return area;
}

function edgeLine(M, r, sides, E, sys, host, code) {
  let total = 0;
  for (const side of sides) {
    const y = -E.d / 2 + 0.01;
    const [a, b] = side === "z0" ? [[r.x0, y, r.z0], [r.x1, y, r.z0]] : side === "z1" ? [[r.x0, y, r.z1], [r.x1, y, r.z1]]
      : side === "x0" ? [[r.x0, y, r.z0], [r.x0, y, r.z1]] : [[r.x1, y, r.z0], [r.x1, y, r.z1]];
    const m = M.add({ sys, kind: "edging", name: "Edging", profile: E.profile, mat: E.mat, host, a, b, d: E.d, w: E.w, up: [0, 1, 0], code });
    if (m) total += m.len;
  }
  return total;
}

/* ---------- garden beds & planting ---------- */

function plant(M, x, z, P, host, code, seed) {
  const k = 0.85 + 0.3 * hash(x * 7.3, z * 3.1 + seed);
  M.add({ sys: "garden", kind: "plant", name: P.grass ? "Strappy plant" : "Shrub", profile: P.profile, mat: P.grass ? "leafGrass" : "leaf", shape: "shrub", unit: "ea", host,
    tint: hash(x, z), a: [x, 0, z], b: [x, P.h * k, z], d: P.dia * k, w: P.dia * k, up: [1, 0, 0], code });
}

function tree(M, t, T, host, code) {
  M.add({ sys: "garden", kind: "tree", name: "Feature tree", profile: T.profile, mat: "trunk", shape: "cyl", unit: "ea", host,
    a: [t.x, 0, t.z], b: [t.x, T.h * 0.45, t.z], d: 0.12, w: 0.12, up: [1, 0, 0], code });
  M.add({ sys: "garden", kind: "plant", name: "Tree canopy", profile: T.profile, mat: "leaf", shape: "shrub", host, noSchedule: true, tint: hash(t.x, t.z),
    a: [t.x, T.h * 0.3, t.z], b: [t.x, T.h, t.z], d: T.h * 0.6, w: T.h * 0.6, up: [1, 0, 0], code });
  M.add({ sys: "garden", kind: "stake", name: "Tree stakes", profile: "Tree stake & tie kit", mat: "pine", unit: "ea", host,
    a: [t.x + 0.25, -0.4, t.z], b: [t.x + 0.25, 1.2, t.z], d: 0.038, w: 0.038, up: [1, 0, 0], code });
  if (!t.inBed) flat(M, R(t.x - 0.5, t.x + 0.5, t.z - 0.5, t.z + 0.5), 0.0, 0.012, { sys: "garden", kind: "mulch", name: "Mulch ring", profile: "Hardwood chip mulch (75 mm)", mat: "mulch", unit: "m3", host, code });
}

function buildBed(M, b, pal, avoid) {
  const { r, host, back } = b;
  const code = "LG";
  dig(M, r, 0.3, "garden", host, code);
  flat(M, r, -0.3, -0.075, { sys: "garden", kind: "soil", name: "Garden soil", profile: "Garden soil mix (225 mm)", mat: "soil", unit: "m3", host, code });
  flat(M, r, -0.075, 0, { sys: "garden", kind: "mulch", name: "Mulch", profile: "Hardwood chip mulch (75 mm)", mat: "mulch", unit: "m3", host, code });
  const alongX = back[0] === "z";
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0, dep = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  const lo = back.endsWith("0");
  const at = (s, t) => (alongX ? [r.x0 + s, lo ? r.z0 + t : r.z1 - t] : [lo ? r.x0 + t : r.x1 - t, r.z0 + s]);
  const rows = dep >= 1.3 ? [[pal.shrub, Math.min(0.55, dep * 0.3)], [pal.low, dep - 0.3]] : [[null, dep / 2]];
  let n = 0;
  rows.forEach(([P, t], ri) => {
    const sp = P ? P.spacing : 0.75;
    const count = Math.max(1, Math.floor((len - sp * 0.6) / sp) + 1);
    const start = (len - (count - 1) * sp) / 2;
    for (let i = 0; i < count; i++) {
      const [x, z] = at(start + i * sp, t);
      if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 1.0)) continue;
      plant(M, x, z, P || (i % 2 ? pal.low : pal.shrub), host, code, ri);
      n++;
    }
  });
  return n;
}

/* ---------- retaining wall ---------- */

function buildRetaining(M, X0, X1, z, H) {
  const host = "Rear retaining wall", code = "LR";
  const x0 = X0 + 0.1, x1 = X1 - 0.1, len = x1 - x0;
  const bays = Math.max(1, Math.ceil(len / 2.0 - 1e-6));
  const embed = Math.max(0.6, H);
  const zc = z - 0.05;
  for (let i = 0; i <= bays; i++) {
    const x = x0 + Math.min(len, i * 2.0);
    M.add({ sys: "retaining", kind: "post", name: "Retaining post", profile: "Galvanised steel H-post 100 UC", mat: "darkSteel", host,
      a: [x, -embed, zc], b: [x, H, zc], d: 0.1, w: 0.1, up: [0, 0, 1], code });
    M.add({ sys: "retaining", kind: "footing", name: "Post footing", profile: "Post footing — 20 MPa concrete (300 Ø)", mat: "concrete", shape: "cyl", unit: "ea", host,
      a: [x, -embed - 0.1, zc], b: [x, -0.05, zc], d: 0.3, w: 0.3, up: [1, 0, 0], code });
  }
  const courses = Math.max(1, Math.ceil(H / 0.2 - 1e-6));
  for (let c = 0; c < courses; c++) {
    const y = 0.1 + c * 0.2;
    for (let i = 0; i < bays; i++) {
      const a = x0 + i * 2.0 + 0.05, b = Math.min(x1, x0 + (i + 1) * 2.0) - 0.05;
      if (b - a < 0.05) continue;
      M.add({ sys: "retaining", kind: "sleeper", name: "Sleeper", profile: "Concrete sleeper 2000×200×75", mat: "sleeper", unit: "ea", host, tint: hash(c, i),
        a: [a, y, zc], b: [b, y, zc], d: 0.198, w: 0.075, up: [0, 1, 0], code });
    }
  }
  M.add({ sys: "retaining", kind: "pipe", name: "Ag drain", profile: "Slotted ag pipe 100 mm with sock", mat: "black", shape: "cyl", host,
    a: [x0, 0.06, zc - 0.25], b: [x1, 0.06, zc - 0.25], d: 0.1, w: 0.1, up: [0, 1, 0], code });
  flat(M, R(x0, x1, zc - 0.4, zc - 0.1), 0, courses * 0.2, { sys: "retaining", kind: "gravel", name: "Drainage gravel", profile: "20 mm drainage gravel", mat: "gravel", unit: "m3", host, code, noRender: true });
  M.add({ sys: "retaining", kind: "fabric", name: "Geofabric", profile: "Weed mat / geofabric", mat: "black", unit: "m2", host, code, noRender: true,
    a: [x0, courses * 0.1, zc - 0.41], b: [x1, courses * 0.1, zc - 0.41], d: courses * 0.2, w: 0.002, up: [0, 1, 0] });
  return { length: len, height: courses * 0.2, face: len * courses * 0.2 };
}

/* ---------- the yard ---------- */

/**
 * Add the landscape to the model.
 * ctx = { spec, env, openings, garage }
 * Returns the layout plus quantities (for labour, the plan and the checks).
 */
export function buildLandscape(M, ctx) {
  const Y = yardLayout(ctx);
  const { L } = Y;
  const q = { fence: {}, gates: 0, deck: 0, path: {}, drive: 0, gravel: 0, bed: 0, edging: 0, plants: 0, trees: 0, lawn: 0, retaining: 0, dig: 0 };

  const seen = new Set();
  const H = L.fenceHeightM;
  for (const run of Y.fences) {
    fenceRun(M, L.fence, run, H, seen);
    q.fence[L.fence] = (q.fence[L.fence] || 0) + Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) - (run.gates || []).reduce((a, g) => a + g.s1 - g.s0, 0);
    q.gates += (run.gates || []).length;
  }
  for (const run of Y.frontFences) {
    fenceRun(M, "picket", run, 1.0, seen);
    const open = [...(run.gates || []), ...(run.open || [])].reduce((a, g) => a + g.s1 - g.s0, 0);
    q.fence.picket = (q.fence.picket || 0) + Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) - open;
    q.gates += (run.gates || []).length;
  }

  let deck = null;
  if (Y.deck) {
    deck = buildDeck(M, Y.deck, DECK_BOARDS[L.deckBoard] || DECK_BOARDS.merbau, ctx.env.ffl - 0.03);
    q.deck = deck.area;
  }

  for (const p of Y.paths) q.path[L.path] = (q.path[L.path] || 0) + hardSurface(M, p.r, L.path, p.host, false);
  if (Y.driveway) q.drive = hardSurface(M, Y.driveway, L.driveway === "pavers" || L.driveway === "exposed" ? L.driveway : "concrete", "Driveway", true);

  for (const r of Y.gravel) {
    dig(M, r, 0.1, "paving", "Gravel strip", "LP");
    flat(M, r, -0.077, -0.075, { sys: "paving", kind: "fabric", name: "Weed mat", profile: "Weed mat / geofabric", mat: "black", host: "Gravel strip", code: "LP", noRender: true });
    flat(M, r, -0.075, 0, { sys: "paving", kind: "gravel", name: "Gravel", profile: "20 mm gravel on weed mat (75 mm)", mat: "pebble", unit: "m3", host: "Gravel strip", code: "LP" });
    q.gravel += areaOf(r);
  }

  const pal = PLANTINGS[L.planting] || PLANTINGS.native;
  const edging = EDGINGS[L.edging] || EDGINGS.steel;
  for (const b of Y.beds) {
    q.plants += buildBed(M, b, pal, Y.trees.filter((t) => t.inBed));
    q.bed += areaOf(b.r);
    // edge only where the bed meets lawn
    const sides = ["x0", "x1", "z0", "z1"].filter((s) => {
      const r = b.r, e = 0.1;
      const strip = s === "x0" ? R(r.x0 - e, r.x0, r.z0, r.z1) : s === "x1" ? R(r.x1, r.x1 + e, r.z0, r.z1) : s === "z0" ? R(r.x0, r.x1, r.z0 - e, r.z0) : R(r.x0, r.x1, r.z1, r.z1 + e);
      return Y.lawn.some((lr) => overlaps(lr, strip));
    });
    q.edging += edgeLine(M, b.r, sides, edging, "garden", b.host, "LG");
  }
  for (const t of Y.trees) { tree(M, t, pal.tree, t.host, "LG"); q.trees++; }

  if (L.lawn !== "none") {
    for (const r of Y.lawn) {
      const host = r.z0 >= Y.house.z1 - 1e-6 ? "Front lawn" : r.z1 <= Y.house.z0 + 1e-6 ? "Back lawn" : "Side lawn";
      if (L.lawn === "synthetic") {
        dig(M, r, 0.1, "lawn", host, "LL");
        flat(M, r, -0.1, -0.025, { sys: "lawn", kind: "base", name: "Turf base", profile: "Crushed rock base, compacted (75 mm)", mat: "gravel", unit: "m3", host, code: "LL", noRender: true });
        flat(M, r, -0.025, 0, { sys: "lawn", kind: "turf", name: "Synthetic turf", profile: "Synthetic turf 35 mm pile", mat: "turf", host, code: "LL" });
      } else {
        flat(M, r, -0.13, -0.03, { sys: "lawn", kind: "soil", name: "Turf underlay", profile: "Turf underlay soil (100 mm)", mat: "soil", unit: "m3", host, code: "LL", noRender: true });
        flat(M, r, -0.03, 0, { sys: "lawn", kind: "turf", name: "Turf", profile: "Soft-leaf buffalo turf", mat: "turf", host, code: "LL" });
      }
      q.lawn += areaOf(r);
    }
  }

  let retaining = null;
  if (Y.retainZ != null) {
    retaining = buildRetaining(M, Y.lot.X0, Y.lot.X1, Y.retainZ, L.retainingM);
    q.retaining = retaining.face;
  }

  for (const m of M.members) if (m.kind === "excavation" && LANDSCAPE_SYS.has(m.sys)) q.dig += m.len * m.d * m.w;
  return { ...Y, deck: Y.deck ? { ...Y.deck, ...deck } : null, retaining, q };
}

export const LANDSCAPE_SYS = new Set(["fencing", "decking", "paving", "garden", "lawn", "retaining"]);
const GROUP_LABEL = { fencing: "Fencing & gates", decking: "Deck", paving: "Paths, driveway & gravel", garden: "Garden beds & planting", lawn: "Lawn", retaining: "Retaining wall" };

/* Labour: output per person-day (or machine-day) for each kind of work. */
export const LABOUR_OUTPUT = {
  fence: { colorbond: 12, paling: 8, picket: 7 },   // lin. m / day
  gate: 0.4,                                        // days each
  deck: { merbau: 2.5, pine: 2.8, composite: 3 },   // m² / day
  path: { concrete: 10, exposed: 8, pavers: 5, gravel: 14, stepping: 10 },
  drive: { concrete: 12, exposed: 9, pavers: 6 },
  gravel: 14, bed: 10, edging: 30, tree: 4, lawn: { turf: 60, synthetic: 25 }, retaining: 3.5,
  dig: 25,                                          // m³ / bobcat day
};

const halfDays = (d) => (d > 0 ? Math.max(0.5, Math.ceil(d * 2 - 1e-9) / 2) : 0);

function labourFor(Lq, L) {
  const out = { fencing: [], decking: [], paving: [], garden: [], lawn: [], retaining: [] };
  const O = LABOUR_OUTPUT;
  const push = (sys, item, trade, qty, unit, per) => { if (qty > 0) out[sys].push({ item, trade, qty, unit, per }); };
  for (const [t, lm] of Object.entries(Lq.fence)) push("fencing", `Install ${FENCES[t].label.toLowerCase()}`, "fencer", lm, "lin. m", O.fence[t]);
  if (Lq.gates) out.fencing.push({ item: "Hang gates", trade: "fencer", days: Lq.gates * O.gate, qty: Lq.gates, unit: "gates" });
  push("decking", "Build deck (footings, frame, boards, fascia)", "carpenter", Lq.deck, "m²", O.deck[L.deckBoard] || O.deck.merbau);
  for (const [s, a] of Object.entries(Lq.path)) push("paving", `Lay ${SURFACES[s].label.toLowerCase()} paths`, SURFACES[s].kind === "concrete" ? "concreter" : "landscaper", a, "m²", O.path[s]);
  const dk = L.driveway === "pavers" || L.driveway === "exposed" ? L.driveway : "concrete";
  push("paving", `Lay ${SURFACES[dk].label.toLowerCase()} driveway`, dk === "pavers" ? "landscaper" : "concreter", Lq.drive, "m²", O.drive[dk]);
  push("paving", "Spread gravel strips", "landscaper", Lq.gravel, "m²", O.gravel);
  push("paving", "Dig out & cart away (all hardscape, beds & deck)", "bobcat", Lq.dig, "m³", O.dig);
  push("garden", "Prepare beds, plant & mulch", "landscaper", Lq.bed, "m²", O.bed);
  push("garden", "Lay edging", "landscaper", Lq.edging, "lin. m", O.edging);
  if (Lq.trees) out.garden.push({ item: "Plant & stake feature trees", trade: "landscaper", days: Lq.trees / O.tree, qty: Lq.trees, unit: "trees" });
  push("lawn", L.lawn === "synthetic" ? "Lay synthetic turf" : "Prepare & lay turf", "landscaper", Lq.lawn, "m²", O.lawn[L.lawn] || O.lawn.turf);
  push("retaining", "Build sleeper retaining wall", "landscaper", Lq.retaining, "m² face", O.retaining);
  return out;
}

/**
 * The landscape, priced: supply lines from the schedule at LANDSCAPE_RATES
 * (or the landscaper's own rates) plus labour days at DAY_RATES.
 */
export function landscapeTakeoff(S, overrides) {
  const Y = S.landscape;
  if (!Y) return { groups: [], materials: 0, labour: 0, total: 0, labourDays: 0 };
  const L = Y.L;
  const k = overrides?.factor ?? 1;             // regional price level (rates are AU)
  const rates = { ...LANDSCAPE_RATES, ...(overrides?.rates || L.rates || {}) };
  const dayRates = { ...DAY_RATES, ...(overrides?.dayRates || L.dayRates || {}) };
  const labour = labourFor(Y.q, L);
  const groups = new Map();
  const g = (sys) => groups.get(sys) || groups.set(sys, { sys, label: GROUP_LABEL[sys], lines: [], labourLines: [], materials: 0, labour: 0, total: 0 }).get(sys);
  for (const r of schedule(S.members)) {
    if (!LANDSCAPE_SYS.has(r.sys)) continue;
    const custom = overrides?.rates?.[r.profile] != null || L.rates?.[r.profile] != null;
    const rate = (rates[r.profile] ?? 0) * (custom ? 1 : k);
    const amount = Math.round(rate * r.qty);
    const G = g(r.sys);
    G.lines.push({ ...r, rate, amount, custom });
    G.materials += amount;
  }
  for (const [sys, list] of Object.entries(labour)) {
    for (const x of list) {
      const days = halfDays(x.days ?? x.qty / x.per);
      const rate = dayRates[x.trade] * ((overrides?.dayRates || L.dayRates || {})[x.trade] != null ? 1 : k);
      const G = g(sys);
      G.labourLines.push({ item: x.item, trade: x.trade, tradeLabel: TRADE_LABEL[x.trade], qty: x.qty, unit: x.unit, per: x.per, days, rate, amount: Math.round(days * rate) });
      G.labour += Math.round(days * rate);
    }
  }
  const order = [...LANDSCAPE_SYS];
  const list = [...groups.values()].sort((a, b) => order.indexOf(a.sys) - order.indexOf(b.sys));
  for (const G of list) G.total = G.materials + G.labour;
  const materials = list.reduce((a, G) => a + G.materials, 0), lab = list.reduce((a, G) => a + G.labour, 0);
  const labourDays = list.reduce((a, G) => a + G.labourLines.filter((x) => x.trade !== "bobcat").reduce((b, x) => b + x.days, 0), 0);
  return { groups: list, materials, labour: lab, total: materials + lab, labourDays };
}

/**
 * The priced landscape for a spec without building the house — for the
 * estimate, which recalculates on every keystroke. Same pieces, same
 * prices as the full model.
 */
export function landscapeEstimate(spec, { factor = 1 } = {}) {
  if (!landscapeSpec(spec).enabled) return null;
  const env = envelope(spec);
  if (!(env.w > 0) || !(env.l > 0)) return null;
  const G = STD.garage;
  const garage = spec.hasGarage ? { x0: -env.w / 2 - G.w, x1: -env.w / 2, z0: env.l / 2 - G.l, z1: env.l / 2 } : null;
  const M = new Model();
  const landscape = buildLandscape(M, { spec, env, openings: placeOpenings(spec), garage });
  return { landscape, ...landscapeTakeoff({ landscape, members: M.members }, { factor }) };
}

/* ---------- what to check before and during the work ---------- */

/**
 * Compliance and good-practice checklist for this landscape. ok = true / false
 * when the model can tell, null when it is a site task to tick off.
 */
export function landscapeCompliance(S) {
  const Y = S.landscape;
  if (!Y) return [];
  const { L } = Y;
  const M = S.members.filter((m) => LANDSCAPE_SYS.has(m.sys));
  const ffl = S.env.ffl;
  const nearHouse = (m) => {
    const xs = [m.a[0], m.b[0]], zs = [m.a[2], m.b[2]];
    const hx = Y.house, pad = 0.3 + Math.max(m.w, m.d) / 2;
    return Math.min(...xs) < hx.x1 + pad && Math.max(...xs) > hx.x0 - pad && Math.min(...zs) < hx.z1 + pad && Math.max(...zs) > hx.z0 - pad;
  };
  const topOf = (m) => Math.max(m.a[1], m.b[1]) + (Math.abs(m.up?.[1] ?? 0) > 0.5 ? m.d / 2 : 0);
  const soft = M.filter((m) => ["mulch", "soil", "turf"].includes(m.kind) && !m.noRender && nearHouse(m));
  const hard = M.filter((m) => ["slab", "paver", "gravel"].includes(m.kind) && nearHouse(m));
  const softTop = Math.max(0, ...soft.map(topOf)), hardTop = Math.max(0, ...hard.map(topOf));
  const deck = Y.deck;
  const checks = [
    { key: "dig", rule: "Before You Dig Australia enquiry lodged before any digging (services located and marked)", ref: "BYDA · 1100.com.au", who: "Landscaper", ok: null },
    { key: "slab-edge", rule: "Slab edge stands 150 mm above lawn and garden beds, 50 mm above paving that falls away", ref: "NCC 2022 · ABCB Housing Provisions Part 3.3 (surface water)", who: "Landscaper",
      ok: ffl - softTop >= 0.15 - 1e-6 && ffl - hardTop >= 0.05 - 1e-6 },
    { key: "termite", rule: "Slab edge left exposed for termite inspection — no soil or mulch built up against it", ref: "AS 3660.1 · slab edge exposure", who: "Landscaper", ok: ffl - softTop >= 0.075 - 1e-6 },
    { key: "fall", rule: "Ground and paving fall away from the house (about 50 mm over the first metre)", ref: "NCC 2022 · ABCB Housing Provisions Part 3.3", who: "Landscaper / concreter", ok: null },
  ];
  if (deck) {
    checks.push(
      { key: "deck-barrier", rule: `Deck balustrade needed only where the deck is more than 1 m above the ground (this one is ${Math.round(deck.heightAboveGround * 1000)} mm)`, ref: "NCC 2022 · H5D3 / ABCB Housing Provisions Part 11.3", who: "Carpenter", ok: deck.heightAboveGround <= 1.0 },
      { key: "deck-timber", rule: "Timber in or near the ground H4 or better, deck frame H3, outdoor-rated (stainless / galvanised) fixings", ref: "AS 1604.1 · AS 1684.2", who: "Carpenter",
        ok: M.filter((m) => m.kind === "stump").every((m) => /H4/.test(m.profile)) && M.filter((m) => m.kind === "joist" || m.kind === "bearer").every((m) => /H3/.test(m.profile)) },
      { key: "deck-vent", rule: "At least 150 mm clear under the bearers so the frame stays dry and can be inspected", ref: "Good practice · AS 1684.2 durability", who: "Carpenter", ok: deck.top - 0.18 - (DECK_BOARDS[L.deckBoard] || DECK_BOARDS.merbau).t - deck.ground >= 0.15 - 1e-6 },
      { key: "deck-approval", rule: "Small, low deck (25 m² or less, under 1 m high) — usually exempt; otherwise lodge for approval", ref: "NSW SEPP (Exempt & Complying Development Codes) 2008 · decks — other states similar", who: "Owner / certifier",
        ok: deck.area <= 25 && deck.heightAboveGround <= 1 },
    );
  }
  if (L.fence !== "none") {
    checks.push({ key: "fence-height", rule: "Side and rear boundary fences 1.8 m high or lower — usually exempt; talk to the neighbours about cost sharing", ref: "NSW SEPP (Exempt & Complying Development Codes) 2008 · fences · Dividing Fences Act 1991 (NSW)", who: "Owner / fencer", ok: L.fenceHeightM <= 1.8 + 1e-6 });
  }
  if (L.frontFence !== "none") {
    checks.push({ key: "front-fence", rule: "Front fence 1.2 m or lower (councils set their own limit — check the DCP)", ref: "Council DCP", who: "Owner / fencer", ok: true });
  }
  if (Y.driveway) checks.push({ key: "crossover", rule: "Council approval for the driveway crossover (kerb and footpath) — council or its contractor builds it", ref: "Council · Roads Act 1993 (NSW) s138", who: "Owner / concreter", ok: null });
  if (Y.retainZ != null) {
    checks.push({ key: "retaining", rule: `Retaining wall 600 mm or lower, or designed by an engineer (this one is ${Math.round(L.retainingM * 1000)} mm)`, ref: "NSW SEPP (Exempt & Complying Development Codes) 2008 · earthworks & retaining", who: "Engineer / landscaper", ok: L.retainingM <= 0.6 + 1e-6 },
      { key: "ag", rule: "Ag drain and free-draining gravel behind the wall, connected to stormwater", ref: "Good practice · AS 4678", who: "Landscaper", ok: M.some((m) => m.name === "Ag drain") });
  }
  return checks;
}
