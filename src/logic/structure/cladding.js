/* =========================================================================
   MODULE: structure/cladding.js
   The skin of the building:
     - brick veneer laid course by course in stretcher bond, toothed at the
       corners, cut around openings, on a mortar bed, with galvanised angle
       lintels over openings, brick-on-edge (rowlock) sills under windows
       and ties back to the frame
     - or weatherboards (lapped, tilted courses, trimmed to the gable) or
       render; fibre-cement gable infill over brickwork
     - wall wrap, insulation batts and plasterboard on the frame; ceiling
       battens, plasterboard and ceiling batts
   Envelope walls (E) are measured on the building line: t = 0 is the outer
   face of the cladding, t grows inward.
   ========================================================================= */
import { wallPt } from "./walls.js";
import { wallPanels } from "../house-geometry.js";
import { BRICK, BOARD, CRS } from "./standards.js";

const outUp = (E) => [E.out[0], 0, E.out[1]];
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

function subtract(iv, cuts) {
  let out = iv;
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]].filter(([p, q]) => q - p > 1e-3)));
  }
  return out;
}

/**
 * Brick veneer on one envelope wall.
 * E = { code, host, start, dir, out, len, yBase, yTop, ops:[{u0,u1,y0,y1,window}],
 *       trim:(course)=>[cutStart, cutEnd], blocked:[{u0,u1,y1}], ties: bool }
 */
export function brickWall(M, E) {
  const P = (u, y, t) => wallPt(E, u, y, t);
  const host = E.host, code = (c) => `${E.code}-${c}`;
  const courses = Math.floor((E.yTop - E.yBase) / BRICK.course);
  const stretch = BRICK.len + BRICK.joint;
  for (let k = 0; k < courses; k++) {
    const y0 = E.yBase + k * BRICK.course, y1 = y0 + BRICK.h;
    const [c0, c1] = E.trim(k);
    let iv = [[c0, E.len - c1]];
    const cuts = E.ops.filter((o) => y1 > o.y0 && y0 < o.y1).map((o) => [o.u0, o.u1]);
    for (const b of E.blocked || []) if (y0 < b.y1) cuts.push([b.u0, b.u1]);
    iv = subtract(iv, cuts);
    const offset = (k % 2) * (stretch / 2);
    for (const [a, b] of iv) {
      for (let x = -offset; x < E.len; x += stretch) {
        const p = Math.max(a, x), q = Math.min(b, x + BRICK.len);
        if (q - p < 0.03) continue;
        M.add({ sys: "cladding", kind: "brick", name: "Face brick", profile: "230×76×110 face brick", mat: "brick", unit: "ea", host, skin: true,
          tint: hash(k, Math.round(x * 100) + E.len * 7),
          a: P(p, (y0 + y1) / 2, BRICK.d / 2), b: P(q, (y0 + y1) / 2, BRICK.d / 2), d: BRICK.h, w: BRICK.d, up: [0, 1, 0], code: code("BK") });
      }
    }
  }
  const yTopLaid = E.yBase + courses * BRICK.course;

  // mortar bed behind the faces, so every joint reads as mortar
  const rects = E.ops.map((o) => ({ u: (o.u0 + o.u1) / 2, w: o.u1 - o.u0, sill: o.y0 - E.yBase, h: o.y1 - o.y0 }));
  for (const r of wallPanels(E.len, yTopLaid - E.yBase, rects)) {
    if (r.u1 - r.u0 < 0.02 || r.y1 - r.y0 < 0.02) continue;
    M.add({ sys: "cladding", kind: "mortar", name: "Mortar", profile: "Mortar joints", mat: "mortar", unit: "m2", host, skin: true, noSchedule: true,
      a: P(r.u0, E.yBase + (r.y0 + r.y1) / 2, 0.006 + 0.05), b: P(r.u1, E.yBase + (r.y0 + r.y1) / 2, 0.006 + 0.05), d: r.y1 - r.y0, w: 0.1, up: [0, 1, 0], code: code("MO") });
  }

  for (const o of E.ops) {
    // galvanised angle lintel over the opening, 150 bearing each side
    if (o.y1 < yTopLaid - 0.05) {
      const la = { sys: "cladding", kind: "lintel", name: "Brick lintel", profile: "Galv. angle lintel 100×100×8", mat: "galv", host, code: code("LT") };
      M.add({ ...la, a: P(o.u0 - 0.15, o.y1 + 0.004, 0.055), b: P(o.u1 + 0.15, o.y1 + 0.004, 0.055), d: 0.008, w: 0.1, up: [0, 1, 0] });
      M.add({ ...la, noSchedule: true, a: P(o.u0 - 0.15, o.y1 + 0.05, 0.104), b: P(o.u1 + 0.15, o.y1 + 0.05, 0.104), d: 0.1, w: 0.008, up: [0, 1, 0] });
    }
    // rowlock sill: bricks on edge, projecting 30 mm
    if (o.window) {
      for (let u = o.u0 - 0.05; u < o.u1 + 0.05 - 0.02; u += BRICK.h + BRICK.joint) {
        const ue = Math.min(u + BRICK.h, o.u1 + 0.05);
        M.add({ sys: "cladding", kind: "brick", name: "Sill brick (on edge)", profile: "230×76×110 face brick", mat: "brick", unit: "ea", host, skin: true, tint: hash(u * 10, 3),
          a: P((u + ue) / 2, o.y0 + 0.055, -0.03), b: P((u + ue) / 2, o.y0 + 0.055, 0.11), d: BRICK.d - 0.005, w: ue - u, up: [0, 1, 0], code: code("SB") });
      }
    }
  }

  // brick ties into the studs, ~600 × 600
  if (E.ties) {
    for (let y = E.yBase + BRICK.course * 4; y < yTopLaid - 0.1; y += CRS.brickTie.v) {
      const yy = E.yBase + Math.round((y - E.yBase) / BRICK.course) * BRICK.course - BRICK.joint / 2 + BRICK.course;
      for (let u = 0.3; u < E.len - 0.2; u += CRS.brickTie.h) {
        if (E.ops.some((o) => u > o.u0 - 0.05 && u < o.u1 + 0.05 && yy > o.y0 - 0.05 && yy < o.y1 + 0.05)) continue;
        if ((E.blocked || []).some((b) => u > b.u0 && u < b.u1 && yy < b.y1)) continue;
        M.add({ sys: "fixings", kind: "tie", name: "Brick tie", profile: "Galv. brick veneer tie (medium duty)", mat: "galv", unit: "ea", host,
          a: P(u, yy, 0.05), b: P(u, yy, E.frameT + 0.004), d: 0.0016, w: 0.022, up: [0, 1, 0], code: code("BT") });
      }
    }
  }
  return yTopLaid;
}

/** Weatherboards on one envelope wall, optionally rising into a gable. */
export function weatherboardWall(M, E) {
  const P = (u, y, t) => wallPt(E, u, y, t);
  const host = E.host, code = (c) => `${E.code}-${c}`;
  const tilt = 0.09;   // board lean, radians
  const up = [-E.out[0] * Math.sin(tilt), Math.cos(tilt), -E.out[1] * Math.sin(tilt)];
  for (let k = 0; ; k++) {
    const y0 = E.yBase + k * BOARD.cover, y1 = y0 + BOARD.h;
    if (y0 > E.yMax) break;
    const ext = E.extent(y1);                 // [u0,u1] the wall allows at this height
    if (!ext) { if (y0 > E.yTop) break; continue; }
    let iv = [ext];
    const cuts = E.ops.filter((o) => y1 > o.y0 && y0 < o.y1).map((o) => [o.u0 - 0.065, o.u1 + 0.065]);
    for (const b of E.blocked || []) if (y0 < b.y1) cuts.push([b.u0, b.u1]);
    iv = subtract(iv, cuts);
    for (const [a, b] of iv) {
      let cur = a;
      while (b - cur > 0.03) {
        const q = Math.min(b, cur + 5.4);
        M.add({ sys: "cladding", kind: "board", name: "Weatherboard", profile: "180 mm cover weatherboard", mat: "weatherboard", unit: "m2", host, skin: true,
          a: P(cur, (y0 + y1) / 2, BOARD.t / 2 + 0.004), b: P(q, (y0 + y1) / 2, BOARD.t / 2 + 0.004), d: BOARD.h, w: BOARD.t, up, code: code("WB") });
        cur = q;
      }
    }
  }
  // corner stops + opening facings
  for (const u of [0.02, E.len - 0.02]) {
    M.add({ sys: "cladding", kind: "trim", name: "Corner stop", profile: "Corner stop 40×40", mat: "trim", host, skin: true,
      a: P(u, E.yBase, 0.0), b: P(u, E.yTop, 0.0), d: 0.04, w: 0.04, up: outUp(E), code: code("CS") });
  }
  for (const o of E.ops) {
    const f = { sys: "cladding", kind: "trim", name: "Opening facing", profile: "65×19 facing", mat: "trim", host, skin: true, code: code("FC") };
    M.add({ ...f, a: P(o.u0 - 0.065, o.y1 + 0.0325, -0.008), b: P(o.u1 + 0.065, o.y1 + 0.0325, -0.008), d: 0.065, w: 0.019, up: [0, 1, 0] });
    for (const u of [o.u0 - 0.0325, o.u1 + 0.0325]) M.add({ ...f, a: P(u, o.y0, -0.008), b: P(u, o.y1, -0.008), d: 0.019, w: 0.065, up: outUp(E) });
  }
}

/** Render (or any sheet cladding) as panels cut around the openings. */
export function sheetWall(M, E, mat, profile, thk) {
  const P = (u, y, t) => wallPt(E, u, y, t);
  const rects = E.ops.map((o) => ({ u: (o.u0 + o.u1) / 2, w: o.u1 - o.u0, sill: o.y0 - E.yBase, h: o.y1 - o.y0 }));
  for (const r of wallPanels(E.len, E.yTop - E.yBase, rects)) {
    if (r.u1 - r.u0 < 0.02 || r.y1 - r.y0 < 0.02) continue;
    M.add({ sys: "cladding", kind: "sheet", name: "Wall cladding", profile, mat, unit: "m2", host: E.host, skin: true,
      a: P(r.u0, E.yBase + (r.y0 + r.y1) / 2, thk / 2), b: P(r.u1, E.yBase + (r.y0 + r.y1) / 2, thk / 2), d: r.y1 - r.y0, w: thk, up: [0, 1, 0], code: `${E.code}-CL` });
  }
}

/** Gable triangle (+ strip below it) on a gable end wall. */
export function gableInfill(M, E, yStrip, yBase, yApex, mat, profile, thk) {
  const P = (u, y, t) => wallPt(E, u, y, t);
  const base = { sys: "cladding", kind: "gable", name: "Gable infill", profile, mat, unit: "m2", host: E.host, skin: true, code: `${E.code}-GI` };
  if (yBase - yStrip > 0.01) {
    M.add({ ...base, a: P(0, (yStrip + yBase) / 2, thk / 2), b: P(E.len, (yStrip + yBase) / 2, thk / 2), d: yBase - yStrip, w: thk, up: [0, 1, 0] });
  }
  const h = yApex - yBase;
  if (h > 0.05) {
    // area of a triangle = ½ b h; the renderer draws shape "tri"
    M.add({ ...base, shape: "tri", unit: "m2", areaFactor: 0.5, a: P(0, yBase + h / 2, thk / 2), b: P(E.len, yBase + h / 2, thk / 2), d: h, w: thk, up: [0, 1, 0] });
  }
}

/* Linings on a framed wall: wrap outside, batts in the bays, plasterboard
   inside (both faces on a partition). W is the frame wall. */
export function wallLinings(M, W, ext, studY0Top, rects) {
  const P = (s, y, t) => wallPt(W, s, y, t);
  const D = W.frame.d;
  const panels = wallPanels(W.len, W.h, rects);
  const add = (r, t, thk, extra) => M.add({ sys: "linings", host: W.host, unit: "m2", up: [0, 1, 0],
    a: P(r.u0, W.y0 + (r.y0 + r.y1) / 2, t), b: P(r.u1, W.y0 + (r.y0 + r.y1) / 2, t), d: r.y1 - r.y0, w: thk, ...extra });
  for (const r of panels) {
    if (r.u1 - r.u0 < 0.02 || r.y1 - r.y0 < 0.02) continue;
    if (ext) {
      add(r, -0.001, 0.001, { kind: "wrap", name: "Wall wrap", profile: "Vapour-permeable wall wrap", mat: "wrap", skin: true, code: `${W.code}-WW` });
      add(r, D / 2, D - 0.012, { kind: "batt", name: "Wall batts", profile: "R2.5 glasswool wall batts", mat: "insulation", skin: true, code: `${W.code}-IN` });
      add(r, D + 0.005, 0.01, { kind: "plasterboard", name: "Wall plasterboard", profile: "10 mm plasterboard", mat: "plasterboard", skin: true, code: `${W.code}-PB` });
    } else {
      for (const t of [-0.005, D + 0.005]) add(r, t, 0.01, { kind: "plasterboard", name: "Wall plasterboard", profile: "10 mm plasterboard", mat: "plasterboard", skin: true, code: `${W.code}-PB` });
    }
  }
  void studY0Top;
}

/** Ceiling: furring channels across the trusses, plasterboard, batts above. */
export function ceiling(M0, C) {
  const M = { add: (m) => M0.add({ ...m, zone: "ceiling" }) };
  const { x0, x1, z0, z1, y, host, code, batts } = C;
  for (let x = x0 + 0.3; x < x1 - 0.1; x += CRS.ceilingBatten) {
    M.add({ sys: "linings", kind: "batten", name: "Ceiling batten", profile: "Furring channel 28 mm", mat: "galv", host, shape: "tophat",
      a: [x, y - 0.014, z0], b: [x, y - 0.014, z1], d: 0.028, w: 0.035, up: [0, -1, 0], code: `${code}-CB` });
  }
  M.add({ sys: "linings", kind: "plasterboard", name: "Ceiling plasterboard", profile: "10 mm ceiling plasterboard", mat: "plasterboard", unit: "m2", host, skin: true,
    a: [x0, y - 0.033, (z0 + z1) / 2], b: [x1, y - 0.033, (z0 + z1) / 2], d: 0.01, w: z1 - z0, up: [0, 1, 0], code: `${code}-CP` });
  if (batts) {
    M.add({ sys: "linings", kind: "batt", name: "Ceiling batts", profile: "R4.0 glasswool ceiling batts", mat: "insulation", unit: "m2", host, skin: true,
      a: [x0, y + 0.1, (z0 + z1) / 2], b: [x1, y + 0.1, (z0 + z1) / 2], d: 0.2, w: z1 - z0, up: [0, 1, 0], code: `${code}-CI` });
  }
}
