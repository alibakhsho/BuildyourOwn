/* =========================================================================
   MODULE: structure/furniture.js
   Interior design for the model: every room furnished for what it is, laid
   out against its real walls — clear of its doors, beds and TVs off the
   windows — the way a designer would draft a furniture plan:

     bedroom   bed (queen / king in the main, king single in small rooms),
               bedsides + lamps, rug, art over the bedhead
     living    sofa facing a TV unit, coffee table, rug, armchair, floor
               lamp, plant;  media room the same with a corner sofa
     dining    table sized to the room with its chairs, pendant over
     kitchen   stools at the island
     study     desk + chair, bookcase with books
     laundry   washer + dryer;  hall a runner and console;  robe shelving
     garage    a car;  deck an outdoor setting and a BBQ
   plus curtains at the windows of the living spaces and bedrooms.

   Pieces go in the "furniture" system (its own layer, styled by
   spec.interiorStyle) with real sizes; they are listed in the schedule as
   an FF&E list but not priced into the build.
   ========================================================================= */

export const INTERIOR_STYLES = {
  modern:  { label: "Modern",  note: "Charcoal, oak and soft grey" },
  coastal: { label: "Coastal", note: "White, sand and blue" },
  warm:    { label: "Warm",    note: "Walnut, terracotta and olive" },
  scandi:  { label: "Scandi",  note: "Pale oak, white and mustard" },
};

const SYS = "furniture";
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- a room's walls, with the doors and windows on them ---------- */

/* Local frame on one wall: u along the wall, t out into the room from the
   wall face (room edges are partition centre lines, so faces sit 50 in). */
const FACE = 0.05;
function frameOf(c, side) {
  switch (side) {
    case "z0": return { len: c.w, depth: c.l - 2 * FACE, P: (u, t) => [c.x + u, c.z + FACE + t] };
    case "z1": return { len: c.w, depth: c.l - 2 * FACE, P: (u, t) => [c.x + u, c.z + c.l - FACE - t] };
    case "x0": return { len: c.l, depth: c.w - 2 * FACE, P: (u, t) => [c.x + FACE + t, c.z + u] };
    default:   return { len: c.l, depth: c.w - 2 * FACE, P: (u, t) => [c.x + c.w - FACE - t, c.z + u] };
  }
}

/* External opening → world point on the building line. */
function openingPoint(op, w, l) {
  switch (op.side) {
    case "front": return [-w / 2 + op.u, l / 2];
    case "back": return [w / 2 - op.u, -l / 2];
    case "right": return [w / 2, l / 2 - op.u];
    default: return [-w / 2, -l / 2 + op.u];
  }
}

function wallsOf(c, f, ctx) {
  const { env, partitions, openings } = ctx;
  const out = [];
  for (const side of ["z0", "z1", "x0", "x1"]) {
    const F = frameOf(c, side);
    const alongX = side[0] === "z";
    const line = side === "z0" ? c.z : side === "z1" ? c.z + c.l : side === "x0" ? c.x : c.x + c.w;
    const start = alongX ? c.x : c.z;
    const ops = [];
    // internal doors on this storey's partitions
    for (const run of partitions[f] || []) {
      if ((run.axis === "z") === alongX) continue;              // a z-run is a wall at fixed x: it's on an x-side
      if (Math.abs(run.at - line) > 0.15) continue;
      for (const d of run.doors || []) {
        const u = d - start;
        if (u > -0.2 && u < F.len + 0.2) ops.push({ u, w: 0.87, kind: "door" });
      }
    }
    // external doors and windows (the building line is a wall build-up beyond the room's edge)
    for (const op of openings) {
      if ((op.floor ?? 0) !== f) continue;
      const [ox, oz] = openingPoint(op, env.w, env.l);
      const onX = op.side === "front" || op.side === "back";
      if (onX !== alongX) continue;
      const perp = alongX ? oz : ox;
      if (Math.abs(perp - line) > 0.45) continue;
      const u = (alongX ? ox : oz) - start;
      if (u < -op.w / 2 || u > F.len + op.w / 2) continue;
      ops.push({ u, w: op.w, kind: op.kind, sill: op.sill, h: op.h });
    }
    out.push({ side, ...F, ops, doors: ops.filter((o) => o.kind === "door"), windows: ops.filter((o) => o.kind === "window") });
  }
  // every door keeps a metre clear in front of it; each wall sees those zones in its own frame
  const zones = [];
  for (const W of out) {
    for (const d of W.doors) {
      const a = W.P(d.u - d.w / 2 - 0.1, 0), b = W.P(d.u + d.w / 2 + 0.1, 1.0);
      zones.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) });
    }
  }
  for (const W of out) W.keep = zones.map((z) => toWall(c, W.side, z));
  return out;
}

/* A world rectangle in a wall's (u, t) frame. */
function toWall(c, side, r) {
  switch (side) {
    case "z0": return { u0: r.x0 - c.x, u1: r.x1 - c.x, t0: r.z0 - c.z - FACE, t1: r.z1 - c.z - FACE };
    case "z1": return { u0: r.x0 - c.x, u1: r.x1 - c.x, t0: c.z + c.l - FACE - r.z1, t1: c.z + c.l - FACE - r.z0 };
    case "x0": return { u0: r.z0 - c.z, u1: r.z1 - c.z, t0: r.x0 - c.x - FACE, t1: r.x1 - c.x - FACE };
    default:   return { u0: r.z0 - c.z, u1: r.z1 - c.z, t0: c.x + c.w - FACE - r.x1, t1: c.x + c.w - FACE - r.x0 };
  }
}

/* Free stretches of a wall for something reaching `reach` into the room:
   minus door swings on this wall, the clear zone of any door whose zone it
   would reach into, and windows (for tall things). */
function freeOn(wall, avoidWindows, reach = 0.9) {
  let iv = [[0.05, wall.len - 0.05]];
  const cuts = [
    ...wall.doors.map((d) => [d.u - d.w / 2 - 0.3, d.u + d.w / 2 + 0.3]),
    ...(wall.keep || []).filter((k) => k.t0 < reach && k.t1 > 0).map((k) => [k.u0 - 0.05, k.u1 + 0.05]),
    ...(avoidWindows ? wall.windows.map((o) => [o.u - o.w / 2 - 0.05, o.u + o.w / 2 + 0.05]) : []),
  ];
  for (const [a, b] of cuts) iv = iv.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([x, y]) => y - x > 0.05)));
  return iv;
}

/* The best wall for something `need` wide; returns { wall, u } (u = its centre). */
function pickWall(walls, need, { avoidWindows = true, minDepth = 0, exclude = [], reach = 0.9 } = {}) {
  let best = null;
  for (const wall of walls) {
    if (exclude.includes(wall.side) || wall.depth < minDepth) continue;
    for (const strict of [true, false]) {
      for (const [a, b] of freeOn(wall, strict && avoidWindows, reach)) {
        if (b - a < need) continue;
        const u = clamp(wall.len / 2, a + need / 2, b - need / 2);
        const score = (strict ? 1000 : 0) + (b - a) + (wall.doors.length ? 0 : 50) - Math.abs(u - wall.len / 2);
        if (!best || score > best.score) best = { wall, u, score };
      }
    }
  }
  return best;
}

/* Does u0..u1 sit on a free stretch of the wall (for something `reach` deep)? */
const fits = (wall, u0, u1, reach = 0.6) => freeOn(wall, false, reach).some(([a, b]) => u0 >= a - 1e-6 && u1 <= b + 1e-6);

/* ---------- piece helpers in a wall's frame ---------- */

function placer(M, wall, y0, host) {
  // box from (u0..u1, t0..t1, y0..y1) in the wall frame
  const box = (kind, name, profile, mat, u0, u1, t0, t1, ya, yb, extra = {}) => {
    const tm = (t0 + t1) / 2, ym = y0 + (ya + yb) / 2;
    const [ax, az] = wall.P(u0, tm), [bx, bz] = wall.P(u1, tm);
    return M.add({ sys: SYS, kind, name, profile, mat, unit: "ea", host, a: [ax, ym, az], b: [bx, ym, bz], d: yb - ya, w: Math.abs(t1 - t0), up: [0, 1, 0], code: "FF", ...extra });
  };
  const post = (kind, name, profile, mat, u, t, ya, yb, dia, extra = {}) => {
    const [x, z] = wall.P(u, t);
    return M.add({ sys: SYS, kind, name, profile, mat, shape: "cyl", unit: "ea", host, a: [x, y0 + ya, z], b: [x, y0 + yb, z], d: dia, w: dia, up: [1, 0, 0], code: "FF", ...extra });
  };
  const blob = (kind, name, profile, mat, u, t, ya, yb, dia, extra = {}) => {
    const [x, z] = wall.P(u, t);
    return M.add({ sys: SYS, kind, name, profile, mat, shape: "shrub", unit: "ea", host, a: [x, y0 + ya, z], b: [x, y0 + yb, z], d: dia, w: dia, up: [1, 0, 0], code: "FF", tint: hash(x, z), ...extra });
  };
  return { box, post, blob };
}

const part = { noSchedule: true };   // the parts of one piece: only the first is scheduled

function plantPot(p, u, t, h = 1.1) {
  p.post("pot", "Indoor plant", "Indoor plant in 300 mm pot", "furnDark", u, t, 0, 0.32, 0.32);
  p.blob("plant", "Indoor plant", "Indoor plant in 300 mm pot", "leaf", u, t, 0.3, h, 0.55, part);
}

function art(p, u, wide, yc, h) {
  p.box("art", "Framed artwork", "Framed print", "furnDark", u - wide / 2, u + wide / 2, 0.005, 0.035, yc - h / 2, yc + h / 2);
  p.box("art", "Artwork", "Framed print", "artwork", u - wide / 2 + 0.04, u + wide / 2 - 0.04, 0.03, 0.04, yc - h / 2 + 0.04, yc + h / 2 - 0.04, { ...part, tint: hash(u, yc) });
}

function chair(p, u, t, faceT, label = "Dining chair") {
  // seat + back; the back is on the side away from the table
  const s = 0.23;
  p.box("chair", label, label, "furnWood", u - s, u + s, t - s, t + s, 0.43, 0.48);
  const tb = faceT > t ? t - s : t + s - 0.05;
  p.box("chair", label, label, "furnWood", u - s, u + s, tb, tb + 0.05, 0.48, 0.9, part);
  for (const [du, dt] of [[-s + 0.03, -s + 0.03], [s - 0.03, -s + 0.03], [-s + 0.03, s - 0.03], [s - 0.03, s - 0.03]]) p.post("chair", label, label, "furnDark", u + du, t + dt, 0, 0.43, 0.03, part);
}

/* ---------- rooms ---------- */

function bedroom(M, c, fl, walls, ctx, big) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const area = c.w * c.l;
  // the right bed for the room, stepping down a size (or to the short wall) until one fits
  const SIZES = [[1.83, 2.03, "King bed"], [1.53, 2.03, "Queen bed"], [1.38, 1.88, "Double bed"], [1.06, 2.03, "King single bed"]];
  const first = big ? (area >= 16 ? 0 : 1) : area < 9.5 ? 3 : 2;
  let pick = null, bw = 0, bl = 0, label = "";
  for (const [w, l, name] of SIZES.slice(first)) {
    pick = pickWall(walls, w + (area > 8 ? 1.1 : 0.2), { minDepth: l + 0.7, reach: l })
      || pickWall(walls, w + 0.1, { avoidWindows: false, minDepth: l + 0.15, reach: l });
    if (pick) { [bw, bl, label] = [w, l, name]; break; }
  }
  if (!pick) return 0;
  const p = placer(M, pick.wall, fl.y, host);
  const u = pick.u, h = bw / 2;
  p.box("rug", "Rug", "Wool rug", "rug", u - h - 0.55, u + h + 0.55, 0.85, Math.min(pick.wall.depth - 0.15, bl + 0.75), 0, 0.012);
  p.box("bed", label, `${label} — ensemble`, "furnWood", u - h, u + h, 0.06, bl + 0.06, 0.02, 0.36);
  p.box("bed", label, label, "linen", u - h + 0.02, u + h - 0.02, 0.08, bl + 0.05, 0.36, 0.6, part);
  p.box("bed", label, label, "furnFabric", u - h - 0.03, u + h + 0.03, 0.0, 0.08, 0.0, 1.15, part);   // upholstered bedhead
  const pillows = bw > 1.2 ? [u - bw / 4, u + bw / 4] : [u];
  for (const pu of pillows) p.box("bed", label, label, "linen", pu - Math.min(0.33, bw / 2 - 0.08), pu + Math.min(0.33, bw / 2 - 0.08), 0.14, 0.5, 0.6, 0.74, part);
  p.box("bed", label, label, "furnAccent", u - h, u + h, bl - 0.6, bl + 0.06, 0.6, 0.64, part);         // throw
  let n = 1;
  if (area > 8) {
    for (const s of [-1, 1]) {
      const su = u + s * (h + 0.3);
      if (!fits(pick.wall, su - 0.25, su + 0.25)) continue;
      p.box("bedside", "Bedside table", "Bedside table 500 wide", "furnWood", su - 0.24, su + 0.24, 0.06, 0.48, 0, 0.55);
      p.post("lamp", "Table lamp", "Table lamp", "furnDark", su, 0.27, 0.55, 0.85, 0.03, part);
      p.post("lamp", "Table lamp", "Table lamp", "lampShade", su, 0.27, 0.8, 1.02, 0.3, part);
      n++;
    }
  }
  art(p, u, Math.min(1.4, bw * 0.8), 1.55, 0.6);
  return n + 1;
}

function lounge(M, c, fl, walls, ctx, media) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const pick = pickWall(walls, 2.1, { minDepth: 2.6 });
  if (!pick) return 0;
  const W = pick.wall, p = placer(M, W, fl.y, host), u = pick.u;
  const tS = clamp(W.depth - 0.7, 2.3, 3.6);                // sofa centre, back from the TV wall
  const sw = clamp(W.len * 0.42, 1.8, 2.6);
  p.box("tv", "TV unit", "Low TV unit 1800", "furnWood", u - 0.95, u + 0.95, 0.05, 0.48, 0, 0.45);
  p.box("tv", "Television", "65\" television", "black", u - 0.73, u + 0.73, 0.18, 0.23, 0.6, 1.42, part);
  p.box("rug", "Rug", "Wool rug 2.4 × 1.7", "rug", u - sw / 2 - 0.2, u + sw / 2 + 0.2, 0.75, tS + 0.35, 0, 0.012);
  const seat = (u0, u1, t0, t1, back, extra = {}) => {
    p.box("sofa", media ? "Corner sofa" : "Sofa", media ? "Modular corner sofa" : "3-seat sofa", "furnFabric", u0, u1, t0, t1, 0.08, 0.44, extra);
    p.box("sofa", "Sofa", "Sofa", "furnFabric", ...back, 0.44, 0.82, part);
    for (let k = 0; k < Math.max(2, Math.round((u1 - u0) / 0.75)); k++) {
      const cu = u0 + ((k + 0.5) * (u1 - u0)) / Math.max(2, Math.round((u1 - u0) / 0.75));
      p.box("sofa", "Sofa", "Sofa", "furnAccent", cu - 0.18, cu + 0.18, back[3] - 0.25, back[3] - 0.13, 0.44, 0.78, { ...part, tint: hash(cu, k) });
    }
  };
  seat(u - sw / 2, u + sw / 2, tS - 0.45, tS + 0.45, [u - sw / 2, u + sw / 2, tS + 0.3, tS + 0.45]);
  if (media && u + sw / 2 + 0.9 < W.len) seat(u + sw / 2 - 0.9, u + sw / 2, tS - 1.6, tS - 0.45, [u + sw / 2 - 0.15, u + sw / 2, tS - 1.6, tS - 0.45], part);
  p.box("table", "Coffee table", "Coffee table 1200 × 600", "furnWood", u - 0.6, u + 0.6, tS - 1.35, tS - 0.75, 0, 0.4);
  p.blob("decor", "Bowl", "Decor bowl", "furnAccent", u + 0.2, tS - 1.05, 0.4, 0.5, 0.25, part);
  let n = 4;
  if (!media && u - sw / 2 - 1.1 > 0.1 && fits(W, u - sw / 2 - 1.05, u - sw / 2 - 0.25, tS)) {
    const au = u - sw / 2 - 0.65;
    p.box("chair", "Armchair", "Upholstered armchair", "furnAccent", au - 0.4, au + 0.4, tS - 1.3, tS - 0.5, 0.08, 0.45);
    p.box("chair", "Armchair", "Armchair", "furnAccent", au - 0.4, au - 0.25, tS - 1.3, tS - 0.5, 0.45, 0.8, part);
    n++;
  }
  if (fits(W, u + sw / 2 + 0.1, u + sw / 2 + 0.5, tS + 0.4)) {
    const lu = u + sw / 2 + 0.3;
    p.post("lamp", "Floor lamp", "Arc floor lamp", "furnDark", lu, tS + 0.2, 0, 1.55, 0.03);
    p.post("lamp", "Floor lamp", "Floor lamp", "lampShade", lu, tS + 0.2, 1.45, 1.75, 0.4, part);
    n++;
  }
  if (W.len - (u + 0.95) > 0.6 && fits(W, W.len - 0.55, W.len - 0.15)) { plantPot(p, W.len - 0.35, 0.35, 1.4); n++; }
  return n;
}

function dining(M, c, fl, ctx) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const alongX = c.w >= c.l;
  const W = frameOf(c, alongX ? "z0" : "x0");
  const long = W.len, short = W.depth;
  const L = clamp(long - 1.7, 1.2, 2.2), T = 0.95;
  if (short < 2.2) return 0;
  const p = placer(M, { ...W }, fl.y, host);
  const u = long / 2, t = short / 2;
  p.box("rug", "Rug", "Flatweave rug", "rug", u - L / 2 - 0.6, u + L / 2 + 0.6, t - 1.2, t + 1.2, 0, 0.01);
  p.box("table", "Dining table", `Dining table ${Math.round(L * 1000)} × 950`, "furnWood", u - L / 2, u + L / 2, t - T / 2, t + T / 2, 0.72, 0.76);
  for (const du of [-L / 2 + 0.08, L / 2 - 0.08]) for (const dt of [-T / 2 + 0.08, T / 2 - 0.08]) p.post("table", "Dining table", "Dining table", "furnDark", u + du, t + dt, 0, 0.72, 0.05, part);
  const per = Math.max(1, Math.floor(L / 0.65));
  let n = 1;
  for (let i = 0; i < per; i++) {
    const cu = u - L / 2 + ((i + 0.5) * L) / per;
    chair(p, cu, t - T / 2 - 0.3, t); chair(p, cu, t + T / 2 + 0.3, t); n += 2;
  }
  // pendant over the table, from the ceiling
  const ceil = ctx.env.wallH;
  p.post("pendant", "Pendant light", "Pendant light over table", "furnDark", u, t, 1.6, ceil - 0.01, 0.01);
  p.blob("pendant", "Pendant light", "Pendant light", "lampShade", u, t, 1.45, 1.75, 0.45, part);
  return n + 1;
}

function kitchenStools(M, c, fl, ctx) {
  const k = c.item.src || {};
  if (!k.island) return 0;
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const alongX = c.w >= c.l;
  const run = Math.min((alongX ? c.w : c.l) - 0.1, Math.max(2.4, +k.benchLengthM || 3));
  const depth = alongX ? c.l : c.w;
  if (depth < 2.85) return 0;
  // same frame as interior.js kitchenFitout: u along the bench from 0.05, t out from the back wall
  const W = { P: alongX ? (u, t) => [c.x + 0.05 + u, c.z + 0.05 + t] : (u, t) => [c.x + 0.05 + t, c.z + 0.05 + u] };
  const p = placer(M, W, fl.y, host);
  const len = Math.min(run * 0.6, 3.0), mid = run / 2;
  const n = Math.max(2, Math.floor(len / 0.6));
  for (let i = 0; i < n; i++) {
    const u = mid - len / 2 + ((i + 0.5) * len) / n;
    p.post("stool", "Bar stool", "Counter stool 650", "furnDark", u, 2.48, 0, 0.62, 0.04);
    p.post("stool", "Bar stool", "Counter stool", "furnFabric", u, 2.48, 0.62, 0.67, 0.38, part);
  }
  for (let i = 0; i < 3; i++) p.blob("pendant", "Pendant light", "Pendant over island", "lampShade", mid + (i - 1) * Math.min(0.9, len / 3), 1.75, 1.75, 1.95, 0.25, i ? part : {});
  return n + 1;
}

function study(M, c, fl, walls, ctx) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const pick = pickWall(walls, 1.45, { minDepth: 1.6, avoidWindows: false, reach: 1.3 });
  if (!pick) return 0;
  const p = placer(M, pick.wall, fl.y, host), u = pick.u;
  p.box("desk", "Desk", "Desk 1400 × 700", "furnWood", u - 0.7, u + 0.7, 0.05, 0.75, 0.71, 0.75);
  for (const s of [-1, 1]) p.box("desk", "Desk", "Desk", "furnDark", u + s * 0.66 - 0.02, u + s * 0.66 + 0.02, 0.07, 0.73, 0, 0.71, part);
  p.box("desk", "Monitor", "Monitor", "black", u - 0.3, u + 0.3, 0.2, 0.23, 0.95, 1.3, part);
  p.post("chair", "Desk chair", "Task chair", "furnDark", u, 1.05, 0, 0.45, 0.06);
  p.box("chair", "Desk chair", "Task chair", "furnFabric", u - 0.25, u + 0.25, 0.83, 1.28, 0.45, 0.52, part);
  p.box("chair", "Desk chair", "Task chair", "furnFabric", u - 0.23, u + 0.23, 1.25, 1.3, 0.52, 1.0, part);
  let n = 2;
  const shelf = pickWall(walls, 0.95, { exclude: [pick.wall.side], reach: 0.4 });
  if (shelf) {
    const q = placer(M, shelf.wall, fl.y, host), su = shelf.u;
    q.box("shelf", "Bookcase", "Bookcase 900 × 1800", "furnWood", su - 0.45, su + 0.45, 0.02, 0.36, 0, 1.8);
    for (let r = 0; r < 4; r++) {
      let x = su - 0.4;
      for (let b = 0; x < su + 0.36; b++) {
        const bw = 0.03 + 0.04 * hash(r, b);
        q.box("book", "Books", "Books", "artwork", x, x + bw, 0.0, 0.3, 0.2 + r * 0.42, 0.2 + r * 0.42 + 0.22 + 0.08 * hash(b, r), { ...part, tint: hash(b * 3, r) });
        x += bw + 0.004;
      }
    }
    n++;
  }
  const pu = Math.min(pick.wall.len - 0.3, u + 1.05);
  if (fits(pick.wall, pu - 0.2, pu + 0.2)) { plantPot(p, pu, 0.3); n++; }
  return n;
}

function laundry(M, c, fl, walls, ctx) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const pick = pickWall(walls, 1.3, { avoidWindows: false });
  if (!pick) return 0;
  const p = placer(M, pick.wall, fl.y, host), u = pick.u;
  p.box("appliance", "Washing machine", "Front-load washer 8 kg", "paintWhite", u - 0.63, u - 0.03, 0.05, 0.65, 0, 0.85);
  p.box("appliance", "Dryer", "Heat-pump dryer 8 kg", "paintWhite", u + 0.03, u + 0.63, 0.05, 0.65, 0, 0.85);
  return 2;
}

function hall(M, c, fl, walls, ctx) {
  if (c.w * c.l < 3 || Math.min(c.w, c.l) < 1.0) return 0;
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const alongX = c.w >= c.l;
  const W = frameOf(c, alongX ? "z0" : "x0");
  const p = placer(M, W, fl.y, host);
  const rw = Math.min(0.9, W.depth - 0.4), rl = Math.min(W.len - 0.8, 4.5);
  p.box("rug", "Hall runner", "Hall runner", "rug", W.len / 2 - rl / 2, W.len / 2 + rl / 2, W.depth / 2 - rw / 2, W.depth / 2 + rw / 2, 0, 0.01);
  const spot = W.depth > 1.7 && W.len > 2 ? pickWall(walls, 1.3, { avoidWindows: false, reach: 0.5, minDepth: 1.7 }) : null;
  if (spot) {
    const q = placer(M, spot.wall, fl.y, host), u = spot.u;
    q.box("console", "Console table", "Hall console 1200", "furnWood", u - 0.6, u + 0.6, 0.03, 0.38, 0.74, 0.78);
    for (const s of [-1, 1]) q.box("console", "Console table", "Console", "furnDark", u + s * 0.56 - 0.02, u + s * 0.56 + 0.02, 0.05, 0.36, 0, 0.74, part);
    art(q, u, 0.9, 1.55, 0.7);
    return 3;
  }
  return 1;
}

function robe(M, c, fl, walls, ctx) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  const pick = pickWall(walls, 1.2, { avoidWindows: false });
  if (!pick) return 0;
  const p = placer(M, pick.wall, fl.y, host);
  const len = Math.min(pick.wall.len - 0.2, 2.4), u = pick.u;
  p.box("shelf", "Robe shelving", `Robe shelving + hanging, ${Math.round(len * 1000)} long`, "joinery", u - len / 2, u + len / 2, 0.02, 0.6, 1.75, 2.1);
  p.box("shelf", "Robe shelving", "Robe", "furnFabric", u - len / 2 + 0.05, u + len / 2 - 0.05, 0.1, 0.5, 0.95, 1.7, part);
  return 1;
}

/* Curtains either side of each window, a rod over. */
function curtains(M, c, fl, walls, ctx) {
  const host = `${c.item.name} · ${ctx.storey(fl.level)}`;
  let n = 0;
  for (const W of walls) {
    for (const o of W.windows) {
      if (o.u < 0.2 || o.u > W.len - 0.2) continue;
      const p = placer(M, W, fl.y, host);
      const head = (o.sill ?? 0.9) + (o.h ?? 1.2) + 0.15, half = o.w / 2;
      const ul = Math.max(0.03, o.u - half - 0.3), ur = Math.min(W.len - 0.03, o.u + half + 0.3);
      p.box("curtain", "Curtains", `Sheer curtains to ${Math.round(o.w * 1000)} window`, "curtain", ul, ul + 0.32, 0.06, 0.1, 0.02, head);
      p.box("curtain", "Curtains", "Curtains", "curtain", ur - 0.32, ur, 0.06, 0.1, 0.02, head, part);
      p.box("rod", "Curtain rod", "Curtain track", "furnDark", ul, ur, 0.075, 0.095, head, head + 0.02, part);
      n++;
    }
  }
  return n;
}

/* ---------- garage and deck ---------- */

function car(M, G) {
  const host = "Garage";
  const cx = (G.x0 + G.x1) / 2 + 0.6, z0 = G.z0 + 0.8, z1 = Math.min(G.z1 - 0.5, z0 + 4.6);
  const box = (name, mat, x0, x1, za, zb, y0, y1, extra = {}) => M.add({ sys: SYS, kind: "car", name, profile: "Car (for scale)", mat, unit: "ea", host,
    a: [(x0 + x1) / 2, (y0 + y1) / 2, za], b: [(x0 + x1) / 2, (y0 + y1) / 2, zb], d: y1 - y0, w: x1 - x0, up: [0, 1, 0], code: "FF", ...extra });
  const ffl = G.ffl;
  box("Car", "carPaint", cx - 0.92, cx + 0.92, z0, z1, ffl + 0.3, ffl + 0.85);
  box("Car", "carPaint", cx - 0.82, cx + 0.82, z0 + 1.1, z1 - 1.2, ffl + 0.85, ffl + 1.4, part);
  box("Car", "glass", cx - 0.84, cx + 0.84, z0 + 1.25, z1 - 1.35, ffl + 0.9, ffl + 1.35, part);
  for (const zw of [z0 + 0.85, z1 - 0.85]) {
    for (const s of [-1, 1]) {
      M.add({ sys: SYS, kind: "car", name: "Car", profile: "Car (for scale)", mat: "black", shape: "cyl", host, noSchedule: true,
        a: [cx + s * 0.8, ffl + 0.33, zw], b: [cx + s * 0.95, ffl + 0.33, zw], d: 0.66, w: 0.66, up: [0, 1, 0], code: "FF" });
    }
  }
  return 1;
}

function deckSetting(M, D) {
  const w = D.x1 - D.x0, d = D.z1 - D.z0;
  if (w < 2.6 || d < 2.4) return 0;
  const host = "Rear deck";
  const W = { P: (u, t) => [D.x0 + u, D.z1 - t] };     // u along the house, t out from it
  const p = placer(M, W, D.top, host);
  const u = w / 2 + (w > 4 ? 0.6 : 0), t = d / 2 + 0.2;
  p.box("table", "Outdoor table", "Outdoor dining table 1600 × 900", "furnWood", u - 0.8, u + 0.8, t - 0.45, t + 0.45, 0.72, 0.76);
  for (const du of [-0.72, 0.72]) for (const dt of [-0.37, 0.37]) p.post("table", "Outdoor table", "Outdoor table", "furnDark", u + du, t + dt, 0, 0.72, 0.05, part);
  for (const cu of [u - 0.4, u + 0.4]) { chair(p, cu, t - 0.75, t, "Outdoor chair"); chair(p, cu, t + 0.75, t, "Outdoor chair"); }
  p.post("umbrella", "Market umbrella", "Market umbrella 2.7 m", "furnDark", u, t, 0, 2.3, 0.04);
  p.blob("umbrella", "Market umbrella", "Market umbrella", "linen", u, t, 2.05, 2.45, 2.7, part);
  if (w > 4) {
    p.box("bbq", "BBQ", "4-burner BBQ on cart", "darkSteel", 0.25, 1.35, 0.15, 0.7, 0, 0.95);
    plantPot(p, w - 0.35, 0.35, 1.2);
  }
  return 6;
}

/**
 * Furnish the house.
 * ctx = { env, layout, partitions, openings, garage, deck, storey }
 */
export function furnishHouse(M, ctx) {
  const counts = {};
  const add = (k, n) => { if (n) counts[k] = (counts[k] || 0) + n; };
  ctx.layout.floors.forEach((fl, f) => {
    const beds = fl.cells.filter((c) => c.item.type === "Bedroom");
    const main = beds.slice().sort((a, b) => b.w * b.l - a.w * a.l)[0];
    for (const c of fl.cells) {
      const t = c.item.type;
      const walls = wallsOf(c, f, ctx);
      if (t === "Bedroom") { add("bedroom", bedroom(M, c, fl, walls, ctx, c === main || /master|main/i.test(c.item.name))); add("curtains", curtains(M, c, fl, walls, ctx)); }
      else if (t === "Living" || t === "Media") { add(t.toLowerCase(), lounge(M, c, fl, walls, ctx, t === "Media")); add("curtains", curtains(M, c, fl, walls, ctx)); }
      else if (t === "Dining") { add("dining", dining(M, c, fl, ctx)); add("curtains", curtains(M, c, fl, walls, ctx)); }
      else if (t === "Kitchen") add("kitchen", kitchenStools(M, c, fl, ctx));
      else if (t === "Study") add("study", study(M, c, fl, walls, ctx));
      else if (t === "Laundry") add("laundry", laundry(M, c, fl, walls, ctx));
      else if (t === "Walk-in robe") add("robe", robe(M, c, fl, walls, ctx));
      else if (t === "Hallway" || c.item.circulation) add("hall", hall(M, c, fl, walls, ctx));
    }
  });
  if (ctx.garage) add("garage", car(M, { ...ctx.garage, ffl: ctx.env.ffl }));
  if (ctx.deck) add("deck", deckSetting(M, ctx.deck));
  return counts;
}

export { wallsOf as _wallsOf, pickWall as _pickWall };
