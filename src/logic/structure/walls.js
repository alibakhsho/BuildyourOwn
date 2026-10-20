/* =========================================================================
   MODULE: structure/walls.js
   Wall framing, piece by piece, the way a frame fabricator lays it out:
   bottom plate, double top plate, studs at centres, doubled corner studs,
   full-height jamb studs + lintel-support (trimmer) studs at every opening,
   a lintel sized to the opening span, cripple studs above, sill trimmer and
   jack studs below windows, staggered noggings, strap bracing in clear
   end bays and M12 tie-down rods into the slab.

   A wall is described in its own frame: `s` runs along the wall from its
   start, `y` is height, `t` is depth measured INWARD from the frame's outer
   face. wallPt() maps (s, y, t) to plan/world coordinates.
   ========================================================================= */
import { CRS, STOCK_MAX, lintelFor } from "./standards.js";

export function wallPt(W, s, y, t) {
  return [W.start[0] + W.dir[0] * s - W.out[0] * t, y, W.start[1] + W.dir[1] * s - W.out[1] * t];
}
const outUp = (W) => [W.out[0], 0, W.out[1]];

/* Split [a, b] into pieces no longer than `max`, cutting at stud centres
   where possible (plates are joined over a stud). */
function splitRun(a, b, max, studs) {
  const out = [];
  let cur = a;
  while (b - cur > max + 1e-6) {
    const limit = cur + max;
    const cands = studs.filter((s) => s > cur + 0.6 && s <= limit);
    const cut = cands.length ? cands[cands.length - 1] : limit;
    out.push([cur, cut]);
    cur = cut;
  }
  if (b - cur > 1e-3) out.push([cur, b]);
  return out;
}

/**
 * Frame one wall.
 * W = { code, host, start:[x,z], dir:[dx,dz], out:[ox,oz], len, y0, h,
 *       kind: "ext"|"int", frame: {d,t,profile,mat,shape}, plateT,
 *       ops: [{ s0, s1, sill, head, kind }]  (rough opening, heights above y0)
 *       tieDown: "rod"|"strap"|null, brace: bool }
 * Returns layout facts other systems need (stud positions, top of wall).
 */
export function frameWall(M, W) {
  const F = W.frame, T = F.t, D = F.d, PT = W.plateT;
  const ext = W.kind === "ext";
  const nTop = ext ? 2 : 1;
  const crs = ext ? CRS.extStud : CRS.intStud;
  const yb = W.y0, yTop = W.y0 + W.h;
  const studY0 = yb + PT, studY1 = yTop - nTop * PT;
  const tc = D / 2;
  const base = { sys: "wallFrame", mat: F.mat, shape: F.shape, host: W.host, profile: F.profile };
  const P = (s, y, t = tc) => wallPt(W, s, y, t);
  const code = (c) => `${W.code}-${c}`;

  const occupied = [];   // s of every vertical member, to avoid doubling up
  const full = [];       // full-height members (nogging bays run between these)
  const taken = (s) => occupied.some((o) => Math.abs(o - s) < T * 0.95);
  const vert = (s, y0, y1, kind, name, c, isFull) => {
    if (s < T / 2 - 1e-6 || s > W.len - T / 2 + 1e-6 || y1 - y0 < 0.02) return null;
    if (taken(s)) return null;
    occupied.push(s);
    if (isFull) full.push(s);
    return M.add({ ...base, kind, name, a: P(s, y0), b: P(s, y1), d: D, w: T, up: outUp(W), code: code(c) });
  };

  /* corners: doubled studs at both ends */
  for (const s of [T / 2, 1.5 * T, W.len - T / 2, W.len - 1.5 * T]) vert(s, studY0, studY1, "stud", ext ? "Corner stud (doubled)" : "End stud (doubled)", "CS", true);

  /* openings */
  const ops = [...(W.ops || [])].sort((a, b) => a.s0 - b.s0);
  for (const o of ops) {
    const span = o.s1 - o.s0;
    const headY = yb + o.head;
    const space = studY1 - headY;
    const L = lintelFor(span, space, !ext);
    let lb = headY, lt = headY + L.d;
    if (lt > studY1) { lt = studY1; lb = studY1 - L.d; }
    // trimmers carry the lintel, full-height jamb studs beside them
    vert(o.s0 - T / 2, studY0, lb, "stud", "Lintel trimmer stud", "TS", false);
    vert(o.s1 + T / 2, studY0, lb, "stud", "Lintel trimmer stud", "TS", false);
    vert(o.s0 - 1.5 * T, studY0, studY1, "stud", "Jamb stud", "JS", true);
    vert(o.s1 + 1.5 * T, studY0, studY1, "stud", "Jamb stud", "JS", true);
    if (span > 1.8 && ext) {
      vert(o.s0 - 2.5 * T, studY0, studY1, "stud", "Jamb stud (doubled)", "JS", true);
      vert(o.s1 + 2.5 * T, studY0, studY1, "stud", "Jamb stud (doubled)", "JS", true);
    }
    // lintel bears one trimmer width each side
    const ls0 = Math.max(0, o.s0 - T), ls1 = Math.min(W.len, o.s1 + T);
    const lintelBase = { ...base, kind: "lintel", name: ext ? "Lintel" : "Door head", profile: L.profile, mat: L.mat, shape: L.mat === "steelPaint" ? "channel" : "box", code: code("L") };
    if (L.flat) {
      M.add({ ...lintelBase, a: P(ls0, headY + PT / 2), b: P(ls1, headY + PT / 2), d: PT, w: D, up: [0, 1, 0] });
      lt = headY + PT;
    } else if (L.plies === 2) {
      for (const t of [D / 4, (3 * D) / 4]) {
        M.add({ ...lintelBase, a: P(ls0, (lb + lt) / 2, t), b: P(ls1, (lb + lt) / 2, t), d: L.d, w: D / 2, up: [0, 1, 0] });
      }
    } else {
      M.add({ ...lintelBase, a: P(ls0, (lb + lt) / 2), b: P(ls1, (lb + lt) / 2), d: L.d, w: Math.min(D, 0.075), up: [0, 1, 0] });
    }
    o.lintel = { profile: L.profile, top: lt, bottom: lb };
    // cripple studs between the lintel and the top plate
    if (studY1 - lt > 0.03) {
      for (let s = Math.ceil(ls0 / crs) * crs; s < ls1; s += crs) {
        if (s > ls0 + T && s < ls1 - T) {
          occupied.push(s);
          M.add({ ...base, kind: "stud", name: "Cripple stud", a: P(s, lt), b: P(s, studY1), d: D, w: T, up: outUp(W), code: code("CR") });
        }
      }
    }
    // windows: sill trimmer + jack studs under it
    if (o.sill > 0.05) {
      const sillTop = yb + o.sill, sillBot = sillTop - PT;
      M.add({ ...base, kind: "trimmer", name: "Sill trimmer", a: P(o.s0, sillBot + PT / 2), b: P(o.s1, sillBot + PT / 2), d: PT, w: D, up: [0, 1, 0], code: code("ST") });
      for (let s = Math.ceil(o.s0 / crs) * crs; s < o.s1; s += crs) {
        if (s > o.s0 + T / 2 && s < o.s1 - T / 2) {
          occupied.push(s);
          M.add({ ...base, kind: "stud", name: "Jack stud (under sill)", a: P(s, studY0), b: P(s, sillBot), d: D, w: T, up: outUp(W), code: code("JK") });
        }
      }
    }
  }

  /* common studs at centres, skipping each opening zone */
  const inOpeningZone = (s) => ops.some((o) => s > o.s0 - 3 * T && s < o.s1 + 3 * T);
  for (let s = crs; s < W.len - T; s += crs) {
    if (inOpeningZone(s)) continue;
    vert(s, studY0, studY1, "stud", "Common stud", "S", true);
  }

  /* noggings — rows at <= 1350 centres, staggered so each can be end-nailed */
  const H = studY1 - studY0;
  const rows = Math.max(1, Math.ceil(H / CRS.maxNog) - 1);
  const fullSorted = [...new Set(full)].sort((a, b) => a - b);
  for (let r = 1; r <= rows; r++) {
    const yRow = studY0 + (H * r) / (rows + 1);
    for (let i = 0; i < fullSorted.length - 1; i++) {
      const sa = fullSorted[i] + T / 2, sb = fullSorted[i + 1] - T / 2;
      if (sb - sa < 0.06) continue;
      const y = yRow + (i % 2 ? 0.025 : -0.025);
      const blocked = ops.some((o) => sb > o.s0 - 2 * T && sa < o.s1 + 2 * T && y > yb + o.sill - PT - 0.02 && y < (o.lintel?.top ?? yb + o.head) + 0.02);
      if (blocked) continue;
      M.add({ ...base, kind: "nogging", name: "Nogging", a: P(sa, y), b: P(sb, y), d: PT, w: D, up: [0, 1, 0], code: code("N") });
    }
  }

  /* plates: bottom plate cut out at door openings; top plate(s) jointed
     over studs, second layer joints staggered */
  const doorCuts = ops.filter((o) => o.sill <= 0.05).map((o) => [o.s0, o.s1]);
  let runs = [[0, W.len]];
  for (const [c0, c1] of doorCuts) {
    runs = runs.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]].filter(([p, q]) => q - p > 0.02)));
  }
  for (const [a, b] of runs) {
    for (const [p, q] of splitRun(a, b, STOCK_MAX, fullSorted)) {
      M.add({ ...base, kind: "plate", name: "Bottom plate", a: P(p, yb + PT / 2), b: P(q, yb + PT / 2), d: PT, w: D, up: [0, 1, 0], code: code("BP") });
    }
  }
  for (let k = 0; k < nTop; k++) {
    const y = studY1 + PT * (k + 0.5);
    const offsetStuds = k === 0 ? fullSorted : fullSorted.filter((s) => s > 1.2);
    for (const [p, q] of splitRun(0, W.len, STOCK_MAX, offsetStuds)) {
      M.add({ ...base, kind: "plate", name: k === 0 ? "Top plate" : "Top plate (upper)", a: P(p, y), b: P(q, y), d: PT, w: D, up: [0, 1, 0], code: code("TP") });
    }
  }

  /* strap bracing in the clear bays at each end (external walls) */
  if (W.brace) {
    const clear = [];
    const firstOp = ops.length ? ops[0].s0 - 3 * T : W.len;
    const lastOp = ops.length ? ops[ops.length - 1].s1 + 3 * T : 0;
    if (firstOp > 1.8) clear.push([0.1, Math.min(firstOp, 3.0)]);
    if (W.len - lastOp > 1.8 && (ops.length || W.len > 4)) clear.push([Math.max(lastOp, W.len - 3.0), W.len - 0.1]);
    for (const [s0, s1] of clear) {
      for (const [ya, yb2] of [[studY0, studY1], [studY1, studY0]]) {
        M.add({ sys: "wallFrame", kind: "brace", name: "Strap brace", profile: "30×0.8 galv. strap brace", mat: "galv", host: W.host,
          a: P(s0, ya, -0.002), b: P(s1, yb2, -0.002), d: 0.0016, w: 0.03, up: outUp(W), code: code("BR") });
      }
    }
  }

  /* tie-downs: M12 rods cast into the slab through the bottom plate */
  if (W.tieDown) {
    const pts = [0.15, W.len - 0.15];
    for (const o of ops) { pts.push(o.s0 - 0.15, o.s1 + 0.15); }
    pts.sort((a, b) => a - b);
    const filled = [];
    for (let i = 0; i < pts.length; i++) {
      filled.push(pts[i]);
      if (i < pts.length - 1) {
        const gap = pts[i + 1] - pts[i];
        const n = Math.ceil(gap / CRS.tieDown) - 1;
        for (let k = 1; k <= n; k++) filled.push(pts[i] + (gap * k) / (n + 1));
      }
    }
    const inDoor = (s) => doorCuts.some(([c0, c1]) => s > c0 - 0.03 && s < c1 + 0.03);
    // keep rods clear of stud faces
    const clearOfStud = (s) => { for (const o of occupied) if (Math.abs(o - s) < T / 2 + 0.008) return o + Math.sign(s - o || 1) * (T / 2 + 0.012); return s; };
    const uniq = [...new Set(filled.map((s) => Math.round(s * 1000) / 1000))].filter((s) => s > 0.05 && s < W.len - 0.05 && !inDoor(s));
    for (const s0 of uniq) {
      const s = clearOfStud(s0);
      const fx = { sys: "fixings", host: W.host };
      if (W.tieDown === "rod") {
        M.add({ ...fx, kind: "rod", name: "Tie-down rod", profile: "M12 cast-in tie-down rod", mat: "darkSteel", shape: "cyl", unit: "ea",
          a: P(s, yb - 0.15), b: P(s, yb + PT + 0.03), d: 0.012, w: 0.012, up: outUp(W), code: code("TD") });
        M.add({ ...fx, kind: "washer", name: "Square washer", profile: "50×50×3 galv. washer", mat: "galv", unit: "ea",
          a: P(s - 0.025, yb + PT + 0.0015), b: P(s + 0.025, yb + PT + 0.0015), d: 0.003, w: 0.05, up: [0, 1, 0], code: code("WA") });
        M.add({ ...fx, kind: "nut", name: "Hex nut", profile: "M12 hex nut", mat: "darkSteel", shape: "hex", unit: "ea",
          a: P(s, yb + PT + 0.003), b: P(s, yb + PT + 0.014), d: 0.019, w: 0.019, up: outUp(W), code: code("NT") });
      } else {
        M.add({ ...fx, kind: "strap", name: "Tie-down strap", profile: "30×0.8 galv. tie-down strap", mat: "galv", unit: "ea",
          a: P(s, yb - 0.18, -0.002), b: P(s, yb + 0.25, -0.002), d: 0.0016, w: 0.03, up: outUp(W), code: code("TS") });
      }
    }
  }

  return { studs: fullSorted, studY0, studY1, top: yTop, ops };
}
