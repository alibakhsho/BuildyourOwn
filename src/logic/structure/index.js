/* =========================================================================
   MODULE: structure/index.js
   buildStructure(spec) — the whole house as real pieces, assembled in
   construction order: slab → wall frames (per storey, upper floors between)
   → partitions → roof → ceilings → cladding → windows & doors → garage →
   fit-out → services (electrical, plumbing, drainage) → solar → the yard
   (fences, deck, paths & driveway, garden beds, lawn — landscape.js) →
   furniture & styling in every room (furniture.js). Driven by the same spec and the same geometry module
   (house-geometry.js) as the estimate, so openings, slab, rooms and solar
   are exactly the ones being priced.

   detail: "full" (default) — every brick, bolt and screw
           "lite" — no reinforcement, fixings, linings or fit-out, and
                    cladding as panels (used for multi-dwelling streets)
   ========================================================================= */
import { STD, envelope, placeOpenings, layoutFloors, solarLayout } from "../house-geometry.js";
import { Model, schedule } from "./model.js";
import { FRAME, CLADDING, buildUp } from "./standards.js";
import { frameWall, wallPt } from "./walls.js";
import { buildRoof } from "./roof.js";
import { buildSlab, buildUpperFloor } from "./foundation.js";
import { addWindow, addExternalDoor, addInternalDoor, addGarageDoor } from "./openings.js";
import { brickWall, weatherboardWall, sheetWall, gableInfill, wallLinings, ceiling } from "./cladding.js";
import { partitionsFor, floorFinishes, stairFlight, kitchenFitout, bathroomFitout } from "./interior.js";
import { buildServices } from "./services.js";
import { buildLandscape, landscapeSpec, lotOf } from "./landscape.js";
import { furnishHouse } from "./furniture.js";

export { schedule } from "./model.js";
export { SYSTEMS, STAGE_OF, scheduleCsv, unitLabel, basis, quantityOf } from "./model.js";
export { servicesCompliance, servicesTakeoff, SERVICE_RATES, ELEC_RULES } from "./services.js";
export { INTERIOR_STYLES } from "./furniture.js";
export { landscapeCompliance, landscapeTakeoff, landscapeEstimate, landscapeSpec, LANDSCAPE_REGION, lotOf as landscapeLot, LANDSCAPE_RATES, LANDSCAPE_DEFAULTS, LANDSCAPE_SYS, DAY_RATES, TRADE_LABEL, FENCES, DECK_BOARDS, SURFACES, PLANTINGS } from "./landscape.js";

const SIDE = { front: "Front", right: "Right side", back: "Rear", left: "Left side" };
const storeyName = (f) => (f === 0 ? "Ground floor" : f === 1 ? "First floor" : `Level ${f}`);
const lv = (f) => (f === 0 ? "G" : `L${f}`);

const SKIP_LITE = new Set(["reo", "fixings", "linings", "interior", "electrical", "plumbing", "drainage"]);

export function buildStructure(spec, { detail = "full" } = {}) {
  const lite = detail === "lite";
  const M = new Model();
  if (lite) {
    const add = M.add.bind(M);
    M.add = (m) => (SKIP_LITE.has(m.sys) || m.kind === "mortar" ? null : add(m));
  }
  const env = envelope(spec);
  const { w, l, floors, wallH, ffl, slabThk } = env;
  const bu = buildUp(spec);
  const o = bu.frameOff;
  const FR = FRAME[spec.framingType] || FRAME.timber;
  const fd = FR.ext.d;
  const clad = CLADDING[spec.claddingType] ? spec.claddingType : "brick";
  const cover = spec.roofType === "tile" || spec.roofType === "shingle" ? "tile" : "sheet";
  const pitch = (Math.max(5, Math.min(45, +spec.roofPitch || 22)) * Math.PI) / 180;
  const openings = placeOpenings(spec);
  const layout = layoutFloors(spec);
  const G = STD.garage;
  const garage = !!spec.hasGarage;
  const garagePlate = ffl + G.h;
  const counters = { W: 0, D: 0, ID: 0 };
  const markOf = (k) => `${k}${String(++counters[k]).padStart(2, "0")}`;

  /* ---------- 1. slab ---------- */
  buildSlab(M, { code: "SL", host: "House slab", x0: -w / 2, x1: w / 2, z0: -l / 2, z1: l / 2, top: ffl, thk: slabThk });

  /* ---------- 2. wall frames, storey by storey ---------- */
  const extWalls = [];   // per storey: the four frame walls (for linings / drawings)
  const partitions = [];  // per storey: partition runs with their door marks (drawings)
  for (let f = 0; f < floors; f++) {
    const y0 = env.levelY(f);
    if (f > 0) {
      const st = layout.stair;
      const voidRect = st ? { x0: st.x - st.width / 2 - 0.05, x1: st.x + st.width / 2 + 0.05, z0: st.z0 + 0.6, z1: st.z0 + st.risers * st.going + 0.05 } : null;
      buildUpperFloor(M, { code: `${lv(f)}FL`, host: `${storeyName(f)} floor`, x0: -w / 2 + o, x1: w / 2 - o, z0: -l / 2 + o, z1: l / 2 - o,
        bear: env.levelY(f - 1) + wallH, frameD: fd, void: voidRect, slabTop: ffl });
    }
    const defs = [
      { side: "front", start: [-w / 2 + o, l / 2 - o], dir: [1, 0], out: [0, 1], len: w - 2 * o, sOff: o },
      { side: "right", start: [w / 2 - o, l / 2 - o - fd], dir: [0, -1], out: [1, 0], len: l - 2 * o - 2 * fd, sOff: o + fd },
      { side: "back", start: [w / 2 - o, -l / 2 + o], dir: [-1, 0], out: [0, -1], len: w - 2 * o, sOff: o },
      { side: "left", start: [-w / 2 + o, -l / 2 + o + fd], dir: [0, 1], out: [-1, 0], len: l - 2 * o - 2 * fd, sOff: o + fd },
    ];
    const storeyWalls = [];
    defs.forEach((d, i) => {
      const host = `${SIDE[d.side]} wall · ${storeyName(f)}`;
      const mine = openings.filter((op) => op.side === d.side && op.floor === f);
      const ops = mine.map((op) => {
        const s = op.u - d.sOff;
        const door = op.kind === "door";
        return { s0: s - op.w / 2 - 0.01, s1: s + op.w / 2 + 0.01, sill: door ? 0 : op.sill - 0.01, head: (door ? op.h : op.sill + op.h) + 0.01, kind: op.kind, src: op, s };
      });
      const W = { ...d, code: `${lv(f)}W${i + 1}`, host, y0, h: wallH, kind: "ext", frame: FR.ext, plateT: FR.plateT,
        tieDown: f === 0 ? "rod" : "strap", brace: true, ops };
      frameWall(M, W);
      for (const op of ops) {
        // the mark goes back on the opening so plans, elevations and the
        // schedule all call it the same thing
        const mark = markOf(op.kind === "window" ? "W" : "D");
        op.src.mark = mark;
        if (op.kind === "window") addWindow(M, W, op.s, op.src, y0, fd + 0.01, mark, host);
        else addExternalDoor(M, W, op.s, op.src, y0, fd + 0.01, mark, host);
      }
      wallLinings(M, W, true, 0, ops.map((op) => ({ u: (op.s0 + op.s1) / 2, w: op.s1 - op.s0, sill: op.sill, h: op.head - op.sill })));
      storeyWalls.push(W);
    });
    extWalls.push(storeyWalls);

    /* partitions on this storey */
    const fl = layout.floors[f];
    const IF = FR.int, D = IF.d;
    partitions[f] = [];
    for (const run of partitionsFor(fl, layout.inner)) {
      const W = run.axis === "z"
        ? { start: [run.at + D / 2, run.from], dir: [0, 1], out: [1, 0] }
        : { start: [run.from, run.at + D / 2], dir: [1, 0], out: [0, 1] };
      Object.assign(W, {
        code: `${lv(f)}P`, host: `Partition · ${storeyName(f)}`, len: run.to - run.from, y0, h: wallH, kind: "int", frame: IF, plateT: IF.t,
        ops: run.doors.map((c) => ({ s0: c - run.from - 0.435, s1: c - run.from + 0.435, sill: 0, head: 2.07, kind: "door", s: c - run.from })),
      });
      frameWall(M, W);
      const marks = W.ops.map(() => markOf("ID"));
      W.ops.forEach((op, k) => addInternalDoor(M, W, op.s, y0, D, marks[k], W.host));
      partitions[f].push({ ...run, thickness: D + 0.02, doorMarks: marks });
      wallLinings(M, W, false, 0, W.ops.map((op) => ({ u: op.s, w: op.s1 - op.s0, sill: 0, h: op.head })));
    }
  }

  /* ---------- 3. roof ---------- */
  const roof = buildRoof(M, {
    code: "R", host: "Main roof", xc: 0, xh: w / 2 - o, xE: w / 2, eave: STD.eave, verge: STD.eave,
    zA: -l / 2 + o, zB: l / 2 - o, envZ0: -l / 2, envZ1: l / 2, plateY: env.plateY, pitch, cover,
    frameMat: spec.framingType === "steel" ? "steelFrame" : undefined,
  });

  /* ---------- 4. ceilings ---------- */
  for (let f = 0; f < floors; f++) {
    ceiling(M, { x0: -w / 2 + o + fd, x1: w / 2 - o - fd, z0: -l / 2 + o + fd, z1: l / 2 - o - fd, y: env.levelY(f) + wallH,
      host: `Ceiling · ${storeyName(f)}`, code: `${lv(f)}C`, batts: f === floors - 1 });
  }

  /* ---------- 5. cladding on the building line ---------- */
  const env4 = [
    { side: "front", start: [-w / 2, l / 2], dir: [1, 0], out: [0, 1], len: w, gable: true },
    { side: "right", start: [w / 2, l / 2], dir: [0, -1], out: [1, 0], len: l, gable: false },
    { side: "back", start: [w / 2, -l / 2], dir: [-1, 0], out: [0, -1], len: w, gable: true },
    { side: "left", start: [-w / 2, -l / 2], dir: [0, 1], out: [-1, 0], len: l, gable: false },
  ];
  const yBase = ffl - 0.05;
  const yApex = roof.yU(0);
  for (const E0 of env4) {
    const mine = openings.filter((op) => op.side === E0.side);
    const ops = mine.map((op) => {
      const y = env.levelY(op.floor);
      const win = op.kind === "window";
      return { u0: op.u - op.w / 2 - 0.005, u1: op.u + op.w / 2 + 0.005, y0: win ? y + op.sill - (clad === "brick" ? 0.12 : 0) : y, y1: y + (win ? op.sill + op.h : op.h) + 0.005, window: win };
    });
    const blocked = garage && E0.side === "left" ? [{ u0: l - G.l - 0.01, u1: l + 0.01, y1: garagePlate + 0.12 }] : [];
    const E = { ...E0, code: `C-${E0.side[0].toUpperCase()}`, host: `${SIDE[E0.side]} elevation`, yBase, yTop: roof.soffitY, ops, blocked, frameT: o, ties: true };
    if (clad === "brick" && !lite) {
      E.trim = (k) => {
        const yk = yBase + k * 0.086;
        const odd = k % 2 === 1;
        if (E0.gable) {
          // the garage brickwork continues the front wall's line past the corner
          if (garage && E0.side === "front" && yk < garagePlate + 0.12) return [0, odd ? 0.11 : 0];
          return odd ? [0.11, 0.11] : [0, 0];
        }
        return odd ? [0, 0] : [0.11, 0.11];
      };
      const topLaid = brickWall(M, E);
      if (E0.gable) gableInfill(M, E, topLaid, roof.gableBaseY, yApex, "fcSheet", "6 mm fibre-cement gable infill on battens", 0.012);
    } else if (clad === "weatherboard") {
      const tanp = Math.tan(pitch);
      E.yMax = E0.gable ? yApex : roof.soffitY;
      E.extent = (y) => {
        if (y <= roof.soffitY + 0.02) return [0, E0.len];
        if (!E0.gable) return null;
        const X = Math.min(w / 2, (w / 2 - o) - (y - env.plateY) / tanp);
        return X > 0.05 ? [w / 2 - X, w / 2 + X] : null;
      };
      weatherboardWall(M, E);
    } else {
      const mat = clad === "brick" ? "brickTex" : "render";
      sheetWall(M, E, mat, clad === "brick" ? "Brick veneer" : "Acrylic render on 7.5 mm fibre-cement", clad === "brick" ? 0.11 : 0.02);
      if (E0.gable) gableInfill(M, E, roof.soffitY, roof.gableBaseY, yApex, clad === "brick" ? "fcSheet" : "render", clad === "brick" ? "6 mm fibre-cement gable infill on battens" : "Rendered gable", 0.02);
    }
  }

  /* ---------- 6. garage ---------- */
  if (garage) buildGarage(M, { spec, env, G, o, fd, FR, clad, cover, pitch, lite, markOf });

  /* ---------- 7. fit-out ---------- */
  layout.floors.forEach((fl, f) => {
    floorFinishes(M, fl, storeyName(f));
    for (const c of fl.cells) {
      if (c.item.type === "Kitchen") kitchenFitout(M, c, fl.y, c.item.src || {});
      if (c.item.type === "Bathroom") bathroomFitout(M, c, fl.y);
    }
  });
  if (layout.stair) for (let f = 0; f < floors - 1; f++) stairFlight(M, layout.stair, env.levelY(f), spec.staircaseType);

  /* ---------- 8. services ---------- */
  const garageBox = garage ? { x0: -w / 2 - G.w, x1: -w / 2, z0: l / 2 - G.l, z1: l / 2, doorW: G.doorW, h: G.h } : null;
  const yard = !lite && landscapeSpec(spec).enabled;
  const services = lite ? null : buildServices(M, { env, layout, spec, roof, garage: garageBox, frontZ: yard ? lotOf(spec, env).Z1 : null });

  /* ---------- 9. solar ---------- */
  const solar = solarLayout(spec);
  addSolar(M, solar, roof, pitch, w, l, ffl);

  /* ---------- 10. the yard ---------- */
  const landscape = yard ? buildLandscape(M, { spec, env, openings, garage: garageBox }) : null;

  /* ---------- 11. furniture & styling ---------- */
  const furniture = !lite && spec.furnish !== false
    ? furnishHouse(M, { env, layout, partitions, openings, garage: garageBox, deck: landscape?.deck || null, storey: storeyName })
    : null;

  // walkthrough stops: the centre of every room at eye height
  const waypoints = [];
  for (const fl of layout.floors) for (const c of fl.cells) if (!c.item.circulation) waypoints.push({ x: c.x + c.w / 2, z: c.z + c.l / 2, y: fl.y + 1.55, name: c.item.name });

  return {
    members: M.members,
    env, buildUp: bu, roof, layout, openings, extWalls, partitions,
    garage: garage ? { x0: -w / 2 - G.w, x1: -w / 2, z0: l / 2 - G.l, z1: l / 2, doorW: G.doorW, doorH: G.doorH, h: G.h } : null,
    spec,
    landscape,
    waypoints,
    summary: {
      windows: openings.filter((op) => op.kind === "window").length,
      doors: openings.filter((op) => op.kind === "door").length,
      solarPanels: solar.fitted, solarKw: solar.kw,
      fit: Math.min(...layout.floors.map((x) => x.fit)),
      footprint: w * l, roofRidgeM: roof.ridgeY,
      members: M.members.length,
      services,
      landscape: landscape ? landscape.q : null,
      furniture,
    },
    schedule: () => schedule(M.members),
  };
}

function buildGarage(M, C) {
  const { env, G, o, fd, FR, clad, cover, pitch, lite } = C;
  const { w, l, ffl, slabThk } = env;
  const gx0 = -w / 2 - G.w, gx1 = -w / 2, gz0 = l / 2 - G.l, gz1 = l / 2;
  const host = "Garage";
  buildSlab(M, { code: "GS", host: "Garage slab", x0: gx0, x1: gx1, z0: gz0, z1: gz1, top: ffl, thk: slabThk });
  const doorS = G.w / 2 - o;
  const walls = [
    { code: "GAR1", side: "front", start: [gx0 + o, gz1 - o], dir: [1, 0], out: [0, 1], len: G.w,
      ops: [{ s0: doorS - G.doorW / 2 - 0.01, s1: doorS + G.doorW / 2 + 0.01, sill: 0, head: G.doorH + 0.01, kind: "garage", s: doorS }] },
    { code: "GAR2", side: "back", start: [gx1 + o, gz0 + o], dir: [-1, 0], out: [0, -1], len: G.w, ops: [] },
    { code: "GAR3", side: "left", start: [gx0 + o, gz0 + o + fd], dir: [0, 1], out: [-1, 0], len: G.l - 2 * o - 2 * fd, ops: [] },
  ];
  for (const d of walls) {
    const W = { ...d, host: `Garage ${SIDE[d.side].toLowerCase()} wall`, y0: ffl, h: G.h, kind: "ext", frame: FR.ext, plateT: FR.plateT, tieDown: "rod", brace: true };
    frameWall(M, W);
    if (d.side === "front") addGarageDoor(M, W, doorS, { w: G.doorW, h: G.doorH }, ffl, "GD1", host);
  }
  // trusses bear on a ledger bolted to the house frame on the house side
  M.add({ sys: "wallFrame", kind: "plate", name: "Roof ledger (bolted to house frame)", profile: "2/90×45 MGP10 ledger", mat: "pine", host,
    a: [gx1 - o - 0.045, ffl + G.h - 0.045, gz0 + o], b: [gx1 - o - 0.045, ffl + G.h - 0.045, gz1 - o], d: 0.09, w: 0.09, up: [0, 1, 0], code: "GLG" });
  const roof = buildRoof(M, { code: "GR", host: "Garage roof", xc: gx0 + G.w / 2, xh: G.w / 2 - o, xE: G.w / 2, eave: STD.eave, verge: STD.eave, eaveSides: [-1],
    zA: gz0 + o, zB: gz1 - o, envZ0: gz0, envZ1: gz1, plateY: ffl + G.h, pitch, cover, frameMat: C.spec.framingType === "steel" ? "steelFrame" : undefined });
  ceiling(M, { x0: gx0 + o + fd, x1: gx1, z0: gz0 + o + fd, z1: gz1 - o - fd, y: ffl + G.h, host: "Garage ceiling", code: "GC", batts: false });
  // garage brickwork / cladding
  const env3 = [
    { side: "front", start: [gx0, gz1], dir: [1, 0], out: [0, 1], len: G.w, gable: true,
      ops: [{ u0: G.w / 2 - G.doorW / 2 - 0.005, u1: G.w / 2 + G.doorW / 2 + 0.005, y0: ffl, y1: ffl + G.doorH + 0.005, window: false }] },
    { side: "back", start: [gx1, gz0], dir: [-1, 0], out: [0, -1], len: G.w, gable: true, ops: [] },
    { side: "left", start: [gx0, gz0], dir: [0, 1], out: [-1, 0], len: G.l, gable: false, ops: [] },
  ];
  const yBase = ffl - 0.05;
  for (const E0 of env3) {
    const E = { ...E0, code: `GC-${E0.side[0].toUpperCase()}`, host: `Garage ${SIDE[E0.side].toLowerCase()} elevation`, yBase, yTop: roof.soffitY, frameT: o, ties: true };
    if (clad === "brick" && !lite) {
      // the outer (left) corner is toothed; the house end runs straight on
      E.trim = (k) => {
        const odd = k % 2 === 1;
        if (E0.side === "front") return [odd ? 0.11 : 0, 0];
        if (E0.side === "back") return [0, odd ? 0.11 : 0];
        return odd ? [0, 0] : [0.11, 0.11];
      };
      const topLaid = brickWall(M, E);
      if (E0.gable) gableInfill(M, E, topLaid, roof.gableBaseY, roof.yU(0), "fcSheet", "6 mm fibre-cement gable infill on battens", 0.012);
    } else if (clad === "weatherboard") {
      const tanp = Math.tan(pitch);
      E.yMax = E0.gable ? roof.yU(0) : roof.soffitY;
      E.extent = (y) => {
        if (y <= roof.soffitY + 0.02) return [0, E0.len];
        if (!E0.gable) return null;
        const X = Math.min(G.w / 2, (G.w / 2 - o) - (y - (ffl + G.h)) / tanp);
        return X > 0.05 ? [G.w / 2 - X, G.w / 2 + X] : null;
      };
      weatherboardWall(M, E);
    } else {
      sheetWall(M, E, clad === "brick" ? "brickTex" : "render", clad === "brick" ? "Brick veneer" : "Acrylic render", clad === "brick" ? 0.11 : 0.02);
      if (E0.gable) gableInfill(M, E, roof.soffitY, roof.gableBaseY, roof.yU(0), clad === "brick" ? "fcSheet" : "render", "Gable infill", 0.02);
    }
  }
  void wallPt;
}

function addSolar(M, solar, roof, pitch, w, l, ffl) {
  if (!solar.panels.length) return;
  const cosp = Math.cos(pitch);
  const host = "Solar PV";
  const at = (side, sl, lift) => {
    const xr = roof.xFs(side) - sl * cosp;
    const n = roof.slopeN(side);
    const y = roof.coverTop(xr);
    return [side * xr + n[0] * lift, y + n[1] * lift];
  };
  const rows = new Map();
  for (const p of solar.panels) {
    const [x0, y0] = at(p.side, p.s - p.up / 2 + 0.01, 0.075);
    const [x1, y1] = at(p.side, p.s + p.up / 2 - 0.01, 0.075);
    M.add({ sys: "solar", kind: "panel", name: "Solar panel", profile: "415 W monocrystalline PV module", mat: "pvPanel", shape: "pv", unit: "ea", host, skin: false,
      a: [x0, y0, p.t], b: [x1, y1, p.t], d: 0.035, w: p.along - 0.01, up: roof.slopeN(p.side), code: "PV" });
    const key = `${p.side}:${p.s.toFixed(3)}`;
    const r = rows.get(key) || { side: p.side, s: p.s, up: p.up, t0: Infinity, t1: -Infinity, edges: [] };
    r.t0 = Math.min(r.t0, p.t - p.along / 2); r.t1 = Math.max(r.t1, p.t + p.along / 2);
    r.edges.push(p.t - p.along / 2, p.t + p.along / 2);
    rows.set(key, r);
  }
  for (const r of rows.values()) {
    for (const f of [-0.25, 0.25]) {
      const [x, y] = at(r.side, r.s + f * r.up, 0.035);
      M.add({ sys: "solar", kind: "rail", name: "Mounting rail", profile: "Aluminium PV mounting rail", mat: "alu", host,
        a: [x, y, r.t0 - 0.1], b: [x, y, r.t1 + 0.1], d: 0.04, w: 0.04, up: roof.slopeN(r.side), code: "PVR" });
      // tilt-leg-free L-feet at every truss under the rail
      for (const z of roof.trussZ.filter((zz) => zz > r.t0 - 0.05 && zz < r.t1 + 0.05)) {
        const [xa, ya] = at(r.side, r.s + f * r.up, 0.0);
        const [xb, yb] = at(r.side, r.s + f * r.up, 0.05);
        M.add({ sys: "solar", kind: "bracket", name: "L-foot bracket", profile: "PV L-foot + hanger bolt", mat: "alu", unit: "ea", host,
          a: [xa, ya, z], b: [xb, yb, z], d: 0.04, w: 0.004, up: [0, 0, 1], code: "PVL" });
      }
      for (const z of [...new Set(r.edges.map((e) => Math.round(e * 1000) / 1000))]) {
        const [xc, yc] = at(r.side, r.s + f * r.up, 0.095);
        M.add({ sys: "solar", kind: "clamp", name: "Panel clamp", profile: "Mid / end clamp", mat: "alu", unit: "ea", host,
          a: [xc, yc, z - 0.02], b: [xc, yc, z + 0.02], d: 0.012, w: 0.045, up: roof.slopeN(r.side), code: "PVC" });
      }
    }
  }
  // inverter + isolator on the right-hand wall, near the meter box
  M.add({ sys: "solar", kind: "inverter", name: "Inverter", profile: "5 kW hybrid inverter", mat: "plasticGrey", unit: "ea", host,
    a: [w / 2 + 0.1, ffl + 1.3, -l / 4], b: [w / 2 + 0.1, ffl + 1.75, -l / 4], d: 0.2, w: 0.42, up: [1, 0, 0], code: "PVI" });
}
