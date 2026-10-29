/* The yard in the building model (src/logic/structure/landscape.js) — the
   things a landscaper, fencer and deck builder would check on a layout,
   plus the priced take-off, the estimate and the landscape plan. */
import { buildStructure, schedule, landscapeTakeoff, landscapeCompliance, landscapeEstimate, LANDSCAPE_RATES, LANDSCAPE_SYS } from "../src/logic/structure/index.js";
import { Estimator } from "../src/logic/estimator.js";
import { drawingSet } from "../src/logic/drawings.js";
import { exportIfc } from "../src/logic/bim/ifc.js";
import { planDxf } from "../src/logic/bim/dxf.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const base = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", hasGarage: true, solar: true, staircaseType: "none",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [
    { id: 1, name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8 },
    { id: 2, name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5 },
  ],
  kitchens: [{ id: 5, benchLengthM: 7, island: true }],
  bathrooms: [{ id: 6, label: "Main bathroom", widthM: 3.0, lengthM: 2.4 }],
};
const yard = (patch = {}) => ({ ...base, landscape: { enabled: true, ...patch } });
const isYard = (m) => LANDSCAPE_SYS.has(m.sys);
const inside = (p, lot, pad = 0.01) => p[0] >= lot.X0 - pad && p[0] <= lot.X1 + pad && p[2] >= lot.Z0 - pad && p[2] <= lot.Z1 + pad;
const ovl = (a, b) => a.x0 < b.x1 - 1e-3 && b.x0 < a.x1 - 1e-3 && a.z0 < b.z1 - 1e-3 && b.z0 < a.z1 - 1e-3;

/* ---------- off by default: the house model is unchanged ---------- */
{
  const S0 = buildStructure(base);
  const S1 = buildStructure({ ...base, landscape: { enabled: false, deck: true } });
  ok("off: no yard pieces and no landscape summary", !S0.members.some(isYard) && S0.landscape == null && S1.landscape == null);
  ok("off: the estimate has no landscaping line", !(Estimator.buildEstimate(base, "AU").landscapeTotal > 0));
  ok("off: no landscape sheet in the drawing set", !drawingSet(S0).some((s) => s.id === "landscape"));
}

const VARIANTS = [
  ["defaults (steel fence, merbau deck, concrete)", yard()],
  ["paling fence, pavers, composite deck, picket front, retaining", yard({ fence: "paling", path: "pavers", driveway: "pavers", deckBoard: "composite", frontFence: "picket", retainingM: 0.8, lawn: "synthetic", edging: "brick", planting: "dry" })],
  ["no garage, stepping stones, pine deck", { ...yard({ path: "stepping", deckBoard: "pine", planting: "cottage", edging: "timber" }), hasGarage: false }],
  ["gravel paths, no deck, no beds, no fence", yard({ path: "gravel", deck: false, beds: false, fence: "none" })],
  ["small cabin, tight lot", { ...yard({ rearYardM: 2.5, frontSetbackM: 3, sideLeftM: 0.6, sideRightM: 0.8 }), widthM: 6, lengthM: 8, hasGarage: false, rooms: [], kitchens: [], bathrooms: [], openings: { windowsCount: 4, windowsM2: 5, doors: 1 } }],
  ["two-storey", { ...yard(), floors: 2, staircaseType: "timber" }],
];

for (const [label, spec] of VARIANTS) {
  const S = buildStructure(spec);
  const Y = S.landscape;
  const M = S.members.filter(isYard);
  const rows = schedule(M);
  const L = Y.L;

  ok(`${label}: yard pieces have positive, finite geometry`, M.every((m) => [...m.a, ...m.b, m.d, m.w].every(Number.isFinite) && m.d > 0 && m.w > 0));
  ok(`${label}: every yard piece has a price`, rows.every((r) => LANDSCAPE_RATES[r.profile] > 0), rows.filter((r) => !(LANDSCAPE_RATES[r.profile] > 0)).map((r) => r.profile).join(", "));
  ok(`${label}: everything sits on the lot`, M.every((m) => inside(m.a, Y.lot) && inside(m.b, Y.lot)), M.filter((m) => !(inside(m.a, Y.lot) && inside(m.b, Y.lot))).slice(0, 3).map((m) => `${m.name} ${m.host}`).join("; "));

  // nothing is built on the house, and the surfaces don't overlap each other
  const surfaces = [Y.deck, Y.driveway, ...Y.paths.map((p) => p.r), ...Y.beds.map((b) => b.r), ...Y.lawn, ...Y.gravel].filter(Boolean);
  ok(`${label}: no deck, path, bed or lawn on the house or garage`, surfaces.every((r) => !ovl(r, Y.house) && !(Y.garage && ovl(r, Y.garage))));
  let clash = 0;
  for (let i = 0; i < surfaces.length; i++) for (let j = i + 1; j < surfaces.length; j++) if (ovl(surfaces[i], surfaces[j])) clash++;
  ok(`${label}: yard surfaces don't overlap`, clash === 0, `${clash} overlaps`);
  const covered = surfaces.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0) + (Y.house.x1 - Y.house.x0) * (Y.house.z1 - Y.house.z0) + (Y.garage ? (Y.garage.x1 - Y.garage.x0) * (Y.garage.z1 - Y.garage.z0) : 0) + (Y.retainZ != null ? (Y.lot.X1 - Y.lot.X0) * (Y.retainZ - Y.lot.Z0) : 0);
  const lotA = (Y.lot.X1 - Y.lot.X0) * (Y.lot.Z1 - Y.lot.Z0);
  ok(`${label}: the whole lot is accounted for (within 2%)`, Math.abs(covered - lotA) / lotA < 0.02, `${covered.toFixed(1)} of ${lotA.toFixed(1)} m²`);

  // finishes at or below finished ground; slab edge stands proud
  const surfaceTop = M.filter((m) => ["turf", "mulch", "slab", "paver", "gravel"].includes(m.kind) && !m.noRender).map((m) => m.a[1] + m.d / 2);
  ok(`${label}: lawn, beds and paving finish at ground level (≤ 0)`, surfaceTop.every((y) => y <= 0.013));
  const checks = landscapeCompliance(S);
  ok(`${label}: slab edge 150 above soft ground, 50 above paving`, checks.find((c) => c.key === "slab-edge")?.ok === true);

  if (L.fence !== "none") {
    const posts = M.filter((m) => m.sys === "fencing" && m.kind === "post");
    const keys = new Set(posts.map((m) => `${m.a[0].toFixed(2)},${m.a[2].toFixed(2)}`));
    ok(`${label}: no doubled fence posts at the corners`, keys.size === posts.length);
    ok(`${label}: every fence post has a footing`, posts.length === M.filter((m) => m.sys === "fencing" && m.kind === "footing").length);
    ok(`${label}: fence posts no more than 2.4 m apart along each run`, [...Y.fences, ...Y.frontFences].every((run) => {
      const ps = posts.filter((m) => Math.abs((m.a[0] - run.a[0]) * (run.b[1] - run.a[1]) - (m.a[2] - run.a[1]) * (run.b[0] - run.a[0])) < 1e-3 * Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1])
        && Math.min(run.a[0], run.b[0]) - 1e-3 <= m.a[0] && m.a[0] <= Math.max(run.a[0], run.b[0]) + 1e-3 && Math.min(run.a[1], run.b[1]) - 1e-3 <= m.a[2] && m.a[2] <= Math.max(run.a[1], run.b[1]) + 1e-3);
      const s = ps.map((m) => Math.hypot(m.a[0] - run.a[0], m.a[2] - run.a[1])).sort((a, b) => a - b);
      const gaps = [...(run.gates || []), ...(run.open || [])];
      return s.every((v, i) => i === 0 || v - s[i - 1] <= 2.4 + 1e-3 || gaps.some((g) => Math.abs(g.s0 - s[i - 1]) < 0.01 && Math.abs(g.s1 - v) < 0.01));
    }));
    ok(`${label}: a side gate on each return wide enough for one`, M.filter((m) => m.kind === "gate").length >= Y.fences.filter((f) => (f.gates || []).length).length && Y.fences.some((f) => (f.gates || []).length));
    ok(`${label}: boundary fences ${L.fenceHeightM} m high`, M.filter((m) => m.sys === "fencing" && m.kind === "post" && !/90×90/.test(m.profile)).every((m) => Math.abs(m.b[1] - (L.fenceHeightM + 0.02)) < 1e-3));
  } else {
    ok(`${label}: no fence, no fence pieces`, !M.some((m) => m.sys === "fencing" && m.host !== "Front fence"));
  }

  if (Y.deck) {
    const d = Y.deck;
    const boards = M.filter((m) => m.sys === "decking" && m.kind === "board");
    const joists = M.filter((m) => m.kind === "joist");
    ok(`${label}: deck sits just below the floor (step-down 30 mm)`, Math.abs(d.top - (S.env.ffl - 0.03)) < 1e-6 && boards.every((m) => Math.abs(m.a[1] + m.d / 2 - d.top) < 1e-4));
    ok(`${label}: deck boards no longer than 5.4 m stock`, boards.every((m) => m.len <= 5.4 + 1e-3));
    const joistX = joists.map((m) => m.a[0]);
    ok(`${label}: deck board joints land on joists`, boards.every((m) => [m.a[0], m.b[0]].every((x) => Math.abs(x - d.x0) < 0.01 || Math.abs(x - d.x1) < 0.01 || joistX.some((j) => Math.abs(j - x) < 0.01))));
    ok(`${label}: joists at 450 centres or closer`, joistX.sort((a, b) => a - b).every((x, i, a) => i === 0 || x - a[i - 1] <= 0.45 + 1e-3));
    ok(`${label}: boards cover the deck (within one board)`, Math.abs(boards.filter((m) => Math.abs(m.a[0] - d.x0) < 0.01).reduce((a, m) => a + m.w, 0) + boards.filter((m) => Math.abs(m.a[0] - d.x0) < 0.01).length * 0.005 - (d.z1 - d.z0)) < 0.15);
    ok(`${label}: deck clear of the hot-water unit`, !(d.x0 < S.env.w / 3 + 0.45 && d.x1 > S.env.w / 3 - 0.45));
    ok(`${label}: deck ${checks.find((c) => c.key === "deck-vent")?.ok ? "has" : "lacks"} 150 clear under the bearers`, checks.find((c) => c.key === "deck-vent")?.ok === true);
    ok(`${label}: deck fixed at every board-joist crossing`, M.filter((m) => m.kind === "screw" || m.kind === "clamp").length >= boards.length * 2);
  }

  if (Y.driveway) ok(`${label}: driveway runs from the garage door to the street`, Math.abs(Y.driveway.z0 - Y.house.z1) < 1e-6 && Math.abs(Y.driveway.z1 - Y.lot.Z1) < 1e-6 && Y.driveway.x0 >= Y.garage.x0 && Y.driveway.x1 <= Y.garage.x1);
  const front = Y.paths.find((p) => p.host === "Front path");
  if (front) ok(`${label}: front path starts at the house`, Math.abs(front.r.z0 - Y.house.z1) < 1e-6);
  if (L.beds) ok(`${label}: plants are in beds`, M.filter((m) => m.kind === "plant" && !m.noSchedule).every((m) => Y.beds.some((b) => m.a[0] >= b.r.x0 - 1e-3 && m.a[0] <= b.r.x1 + 1e-3 && m.a[2] >= b.r.z0 - 1e-3 && m.a[2] <= b.r.z1 + 1e-3)));

  // services meet the street at the real front boundary
  const kerb = S.members.find((m) => m.kind === "kerb");
  if (kerb) ok(`${label}: stormwater reaches the front boundary`, Math.abs(kerb.a[2] - Y.lot.Z1) < 1e-6);

  // pricing: labour on top of supply, estimate agrees with the full model
  const T = landscapeTakeoff(S);
  ok(`${label}: take-off has supply and labour`, T.materials > 0 && T.labour > 0 && T.total === T.materials + T.labour);
  const E = landscapeEstimate(spec);
  ok(`${label}: quick estimate prices the same yard as the full model`, E && E.total === T.total, `${E?.total} vs ${T.total}`);
  const est = Estimator.buildEstimate(spec, "AU");
  ok(`${label}: estimate total includes landscaping at cost`, Math.abs(est.total - (est.buildTotal + est.extrasTotal + T.total)) < 1 && est.landscapeTotal === T.total);
  ok(`${label}: programme has a landscaping stage before handover`, est.timeline.stages.at(-2)?.key === "landscape" && est.timeline.stages.at(-1).startWeek === est.timeline.stages.at(-2).endWeek + 1);

  // drawings and exports
  const sheet = drawingSet(S, { project: "Test" }).find((s) => s.id === "landscape");
  const svg = sheet?.svg() || "";
  ok(`${label}: landscape plan sheet L01 renders`, sheet?.number === "L01" && svg.startsWith("<svg") && /LANDSCAPE PLAN/.test(svg) && !/NaN|undefined/.test(svg));
  const dxf = planDxf(S, 0);
  ok(`${label}: DXF ground plan carries the yard layers`, (L.fence === "none" || /\nL-FENC\r?\n/.test(dxf)) && /\nL-PAVE\r?\n/.test(dxf));
}

/* ---------- a landscaper's own rates ---------- */
{
  const spec = yard();
  const S = buildStructure(spec);
  const T0 = landscapeTakeoff(S);
  const S2 = buildStructure(yard({ rates: { "Soft-leaf buffalo turf": 20 }, dayRates: { landscaper: 700 } }));
  const T2 = landscapeTakeoff(S2);
  const turf0 = T0.groups.find((g) => g.sys === "lawn"), turf2 = T2.groups.find((g) => g.sys === "lawn");
  ok("custom rate: turf at the landscaper's price", turf2.lines.find((r) => r.profile === "Soft-leaf buffalo turf").rate === 20 && turf2.lines.find((r) => r.custom));
  ok("custom day rate: landscaper labour re-priced", turf2.labourLines[0].rate === 700 && turf2.labour > turf0.labour);
  const us = landscapeTakeoff(S, { factor: 0.64 });
  ok("region: US prices scale from AU", Math.abs(us.total / T0.total - 0.64) < 0.02);
  const ifc = exportIfc(S, { project: "T", date: "2026-10-29T00:00:00Z" });
  ok("IFC: yard exported as proper classes", /IFCGEOGRAPHICELEMENT\(/.test(ifc) && /IFCPLATE\(/.test(ifc) && /'Landscaping'/.test(ifc));
  ok("IFC: quantity-only pieces (dig-out, mesh) not exported as solids", !/Excavation & spoil removal/.test(ifc) && !/SL72 mesh/.test(ifc));
  const checks = landscapeCompliance(buildStructure(yard({ retainingM: 1.0, deckWidthM: 8, deckDepthM: 4 })));
  ok("checks: tall retaining wall needs an engineer", checks.find((c) => c.key === "retaining")?.ok === false);
  ok("checks: big deck flagged for approval", checks.find((c) => c.key === "deck-approval")?.ok === false);
  ok("checks: dial-before-you-dig is a site task", checks.find((c) => c.key === "dig")?.ok === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
