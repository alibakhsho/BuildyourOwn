/* The member-by-member building model (src/logic/structure) — the rules a
   builder would check on a frame, plus the contract with the estimate and
   the drawings. */
import { buildStructure, schedule, scheduleCsv, SYSTEMS, quantityOf } from "../src/logic/structure/index.js";
import { drawingSet } from "../src/logic/drawings.js";
import { placeOpenings, envelope, STD } from "../src/logic/house-geometry.js";
import { CRS } from "../src/logic/structure/standards.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const base = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", floorFinish: "timber",
  hasGarage: true, solar: true, staircaseType: "none",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [
    { id: 1, name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8, floorFinish: "carpet" },
    { id: 2, name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet" },
    { id: 3, name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet" },
    { id: 4, name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber" },
    { id: 5, name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile" },
  ],
  kitchens: [{ id: 6, benchLengthM: 7, island: true }],
  bathrooms: [{ id: 7, label: "Main bathroom", widthM: 3.0, lengthM: 2.4 }, { id: 8, label: "Ensuite", widthM: 2.6, lengthM: 2.0 }],
};

const VARIANTS = [
  ["default (brick, sheet, timber, garage)", base],
  ["two-storey", { ...base, floors: 2, staircaseType: "timber" }],
  ["steel frame, weatherboard, tiles", { ...base, framingType: "steel", claddingType: "weatherboard", roofType: "tile" }],
  ["render, no garage", { ...base, claddingType: "render", hasGarage: false }],
  ["wide 16 m span, 30°", { ...base, widthM: 16, lengthM: 18, roofPitch: 30, openings: { windowsCount: 14, windowsM2: 20, doors: 3 } }],
  ["small cabin", { ...base, widthM: 6, lengthM: 8, hasGarage: false, rooms: [], kitchens: [], bathrooms: [], openings: { windowsCount: 4, windowsM2: 5, doors: 1 } }],
];

const sOf = (W, p) => (p[0] - W.start[0]) * W.dir[0] + (p[2] - W.start[1]) * W.dir[1];

for (const [label, spec] of VARIANTS) {
  const S = buildStructure(spec);
  const M = S.members;
  const env = envelope(spec);

  /* ---- sanity ---- */
  const bad = M.filter((m) => [...m.a, ...m.b, m.d, m.w, m.len].some((v) => !Number.isFinite(v)) || !(m.d > 0) || !(m.w > 0) || !(m.len > 0));
  ok(`${label}: every piece has finite, positive geometry`, bad.length === 0, bad.slice(0, 2).map((m) => m.mark).join(", "));
  ok(`${label}: every piece belongs to a known system`, M.every((m) => SYSTEMS[m.sys]));
  ok(`${label}: marks are unique`, new Set(M.map((m) => m.mark)).size === M.length);
  const span = Math.max(...M.flatMap((m) => [m.a[0], m.b[0], m.a[2], m.b[2]].map(Math.abs)));
  ok(`${label}: nothing strays off the site`, span < Math.max(env.w, env.l) / 2 + STD.garage.w + 2, `max ${span.toFixed(2)}`);

  /* ---- wall framing around every opening ---- */
  const T = (spec.framingType === "steel" ? 0.041 : 0.045);
  let openingsChecked = 0, lintelOk = true, noStudInOpening = true, jambsOk = true;
  for (const storey of S.extWalls) {
    for (const W of storey) {
      const mine = M.filter((m) => m.host === W.host && m.sys === "wallFrame");
      for (const o of W.ops) {
        openingsChecked++;
        const lintels = mine.filter((m) => m.kind === "lintel" && Math.min(sOf(W, m.a), sOf(W, m.b)) <= o.s0 - T + 1e-3 && Math.max(sOf(W, m.a), sOf(W, m.b)) >= o.s1 + T - 1e-3);
        if (!lintels.length) lintelOk = false;
        const commons = mine.filter((m) => m.name === "Common stud" && sOf(W, m.a) > o.s0 && sOf(W, m.a) < o.s1);
        if (commons.length) noStudInOpening = false;
        const jamb = (s) => mine.some((m) => m.kind === "stud" && Math.abs(sOf(W, m.a) - s) < T * 1.2 && Math.abs(m.b[1] - m.a[1]) > W.h * 0.8);
        if (!(jamb(o.s0 - 1.5 * T) || o.s0 < 0.25) || !(jamb(o.s1 + 1.5 * T) || o.s1 > W.len - 0.25)) jambsOk = false;
      }
    }
  }
  const nOpen = placeOpenings(spec).length;
  ok(`${label}: every window and door is framed (${openingsChecked}/${nOpen})`, openingsChecked === nOpen);
  ok(`${label}: every opening has a lintel bearing on both sides`, lintelOk);
  ok(`${label}: no common stud runs through an opening`, noStudInOpening);
  ok(`${label}: full-height jamb studs beside every opening`, jambsOk);

  /* ---- stud centres ---- */
  let worstGap = 0;
  for (const W of S.extWalls[0]) {
    const studs = [...new Set(M.filter((m) => m.host === W.host && m.kind === "stud" && Math.abs(m.b[1] - m.a[1]) > W.h * 0.8).map((m) => Math.round(sOf(W, m.a) * 1000) / 1000))].sort((a, b) => a - b);
    for (let i = 0; i < studs.length - 1; i++) {
      const a = studs[i], b = studs[i + 1];
      if (W.ops.some((o) => b > o.s0 - 0.2 && a < o.s1 + 0.2)) continue;   // across an opening
      worstGap = Math.max(worstGap, b - a);
    }
  }
  ok(`${label}: full-height studs at <= 450 centres (worst ${(worstGap * 1000).toFixed(0)} mm)`, worstGap <= CRS.extStud + 1e-6);

  /* ---- tie-downs (slab floor) ---- */
  let tieOk = true;
  for (const W of S.extWalls[0]) {
    const rods = M.filter((m) => m.kind === "rod" && m.host === W.host).map((m) => sOf(W, m.a)).sort((a, b) => a - b);
    if (!rods.length) { tieOk = false; continue; }
    for (let i = 0; i < rods.length - 1; i++) {
      const a = rods[i], b = rods[i + 1];
      const door = W.ops.some((o) => o.sill <= 0.05 && b > o.s0 && a < o.s1);
      if (!door && b - a > CRS.tieDown + 0.06) tieOk = false;
    }
    for (const o of W.ops) {
      if (!rods.some((s) => Math.abs(s - (o.s0 - 0.15)) < 0.08) && o.s0 > 0.4) tieOk = false;
    }
  }
  ok(`${label}: M12 tie-downs at <= 1200 and beside every opening`, tieOk);

  /* ---- roof ---- */
  const bottomChords = M.filter((m) => /bottom chord/.test(m.name) && m.host === "Main roof");
  const tz = [...S.roof.trussZ].sort((a, b) => a - b);
  const crs = spec.roofType === "tile" || spec.roofType === "shingle" ? CRS.truss.tile : CRS.truss.sheet;
  ok(`${label}: one truss per position (${bottomChords.length})`, bottomChords.length === tz.length);
  ok(`${label}: truss centres <= ${crs * 1000} mm`, tz.every((z, i) => i === 0 || z - tz[i - 1] <= crs + 1e-6));
  ok(`${label}: gable trusses at both ends`, M.filter((m) => /Gable truss — bottom chord/.test(m.name) && m.host === "Main roof").length === 2);
  const plates = M.filter((m) => m.kind === "nailplate");
  ok(`${label}: nail plates in pairs (both faces)`, plates.length > 0 && plates.length % 2 === 0);
  ok(`${label}: a triple-grip at both heels of every truss`, M.filter((m) => m.name === "Triple-grip" && m.host === "Main roof").length === 2 * tz.length);
  if (spec.roofType !== "tile") {
    const sheets = M.filter((m) => m.kind === "sheet" && m.host === "Main roof");
    const area = sheets.reduce((a, m) => a + m.len * m.w, 0);
    const slope = S.roof.xFs(1) / Math.cos((spec.roofPitch * Math.PI) / 180);
    const expect = 2 * slope * (S.roof.zV1 - S.roof.zV0);
    ok(`${label}: roof sheets cover both slopes, verge to verge`, Math.abs(area - expect) / expect < 0.04, `${area.toFixed(1)} vs ${expect.toFixed(1)} m²`);
  } else {
    ok(`${label}: tiles laid`, M.filter((m) => m.kind === "tile").length > 500);
  }

  /* ---- cladding ---- */
  if (spec.claddingType === "brick") {
    const ops = placeOpenings(spec);
    const sideOf = { front: [1, 0], back: [-1, 0] };
    void sideOf;
    const bricks = M.filter((m) => m.kind === "brick" && m.name === "Face brick" && m.host.startsWith("Front"));
    const clash = bricks.filter((b) => ops.some((o) => {
      if (o.side !== "front") return false;
      const x0 = -env.w / 2 + o.u - o.w / 2, x1 = -env.w / 2 + o.u + o.w / 2;
      const y0 = env.levelY(o.floor) + (o.kind === "door" ? 0 : o.sill), y1 = env.levelY(o.floor) + (o.kind === "door" ? o.h : o.sill + o.h);
      const bx0 = Math.min(b.a[0], b.b[0]), bx1 = Math.max(b.a[0], b.b[0]), by = b.a[1];
      return bx1 > x0 + 0.01 && bx0 < x1 - 0.01 && by > y0 + 0.04 && by < y1 - 0.04;
    }));
    ok(`${label}: no brick laid across a window or door`, clash.length === 0, `${clash.length} clashes`);
    ok(`${label}: brickwork laid (${M.filter((m) => m.kind === "brick").length} bricks)`, M.filter((m) => m.kind === "brick").length > 2000);
  }

  /* ---- schedule ---- */
  const rows = schedule(M);
  const lm = rows.filter((r) => r.unit === "lm").reduce((a, r) => a + r.qty, 0);
  const lmDirect = M.filter((m) => m.unit === "lm" && !m.noSchedule).reduce((a, m) => a + quantityOf(m), 0);
  ok(`${label}: schedule totals equal the model (lin. m)`, Math.abs(lm - lmDirect) < 0.5, `${lm.toFixed(2)} vs ${lmDirect.toFixed(2)}`);
  ok(`${label}: cut lists add up to their pieces`, rows.filter((r) => r.unit === "lm").every((r) => r.cuts.reduce((a, c) => a + c.n, 0) === r.pieces));
  const csv = scheduleCsv(rows);
  ok(`${label}: CSV has a header and a line per item`, csv.split("\n").length === rows.length + 1 && csv.startsWith("System,"));

  /* ---- drawings ---- */
  const set = drawingSet(S, { project: "Test", projectNo: "T-1", date: "today" });
  ok(`${label}: drawing set has ${env.floors + 8} sheets`, set.length === env.floors + 8 - (S.extWalls[0].length <= 2 ? 1 : 0), `${set.length}`);
  const broken = set.filter((sh) => { const svg = sh.svg(); return !svg.startsWith("<svg") || /NaN|undefined|Infinity/.test(svg); });
  ok(`${label}: every sheet draws cleanly`, broken.length === 0, broken.map((b) => b.number).join(", "));
}

/* ---- two-storey specifics ---- */
{
  const spec = { ...base, floors: 2, staircaseType: "timber" };
  const S = buildStructure(spec);
  const env = envelope(spec);
  const joists = S.members.filter((m) => m.kind === "joist" && m.name === "Floor joist");
  ok("two-storey: upper floor joists at <= 4.2 m spans", joists.length > 20 && joists.every((m) => m.len <= 4.2 + 0.01));
  ok("two-storey: stair void trimmed", S.members.some((m) => /stair void/.test(m.name)));
  const top = Math.max(...S.members.filter((m) => m.kind === "flooring").map((m) => m.a[1] + m.d / 2));
  ok("two-storey: first floor walls stand on the flooring", Math.abs(top - env.levelY(1)) < 0.006, `floor top ${top.toFixed(3)} vs FFL ${env.levelY(1).toFixed(3)}`);
  ok("two-storey: stair has a tread for every riser", S.members.filter((m) => m.kind === "tread").length === S.layout.stair.risers);
}

/* ---- lite detail (multi-dwelling streets) ---- */
{
  const S = buildStructure(base, { detail: "lite" });
  ok("lite: no reinforcement, fixings, linings or fit-out", !S.members.some((m) => ["reo", "fixings", "linings", "interior"].includes(m.sys)));
  ok("lite: cladding as panels, not bricks", !S.members.some((m) => m.kind === "brick") && S.members.some((m) => m.sys === "cladding"));
  ok("lite: far fewer pieces", S.members.length < buildStructure(base).members.length / 3);
}

/* ---- steel frame uses steel sections ---- */
{
  const S = buildStructure({ ...base, framingType: "steel" });
  const studs = S.members.filter((m) => m.name === "Common stud");
  ok("steel: studs are C-sections", studs.length > 0 && studs.every((m) => m.shape === "channel" && /C-stud/.test(m.profile)));
}

/* ---- the garage opened up at the back, and a full-width deck ---- */
{
  const doors = (s) => s.members.filter((m) => m.kind === "garageDoor").map((m) => m.mark);
  const g = { ...base, hasGarage: true };
  ok("garage: one door by default", doors(buildStructure(g)).length === 1, doors(buildStructure(g)));
  const rear = buildStructure({ ...g, garageRearDoor: true });
  ok("garage: rear door adds a second door (GD2)", doors(rear).length === 2 && doors(rear).some((d) => d.startsWith("GD2")), doors(rear));
  const gd2 = rear.members.find((m) => m.kind === "garageDoor" && m.mark.startsWith("GD2"));
  ok("garage: the second door is in the back wall", gd2 && gd2.a[2] < rear.garage.z0 + 0.5, gd2?.a);
  ok("garage: the record says so (drawings read it)", rear.garage.rearDoor === true);
  const sheets = drawingSet(rear);
  let drawn = 0;
  try { for (const sh of sheets) if (String(sh.svg()).length > 100) drawn++; } catch (e) { drawn = -1; }
  ok("garage: every drawing sheet still draws with the rear door", drawn === sheets.length, `${drawn}/${sheets.length}`);

  const w = g.widthM;
  const full = buildStructure({ ...g, landscape: { enabled: true, deck: true, deckWidthM: w } });
  const d = full.landscape.deck;
  ok("deck: full width runs (almost) the whole back wall", d && d.x1 - d.x0 >= w - 0.7, d && d.x1 - d.x0);
  const hwu = full.members.find((m) => m.kind === "hwu");
  ok("deck: the hot-water unit moves to the side wall", /Right side wall/.test(hwu.host) && hwu.a[0] > w / 2, hwu.host);
  const small = buildStructure({ ...g, landscape: { enabled: true, deck: true, deckWidthM: 4 } });
  ok("deck: a small deck leaves the hot-water unit on the back wall", /Rear wall/.test(small.members.find((m) => m.kind === "hwu").host));
}

/* ---- deterministic ---- */
ok("same spec → identical model", JSON.stringify(buildStructure(base).members) === JSON.stringify(buildStructure(base).members));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
