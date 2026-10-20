/* =========================================================================
   MODULE: structure/openings.js
   Windows and doors as manufactured units, part by part: aluminium frames,
   sliding / awning sashes, glass, fly screens, architraves; door frames,
   leaves, hinges, lever sets, deadlocks, thresholds; a sectional garage
   door with its tracks, torsion spring and motor. One part of each unit is
   the scheduled item (e.g. "W03 1810×1210 sliding window"); the rest are
   drawn but not double-counted.
   ========================================================================= */
import { wallPt } from "./walls.js";

const mm = (v) => Math.round(v * 1000);
const outUp = (W) => [W.out[0], 0, W.out[1]];

/* A rectangular frame of four members in a wall plane. */
function rectFrame(M, base, P, s0, s1, y0, y1, t, face, depth) {
  M.add({ ...base, a: P(s0, y1 - face / 2, t), b: P(s1, y1 - face / 2, t), d: face, w: depth, up: [0, 1, 0] });
  M.add({ ...base, a: P(s0, y0 + face / 2, t), b: P(s1, y0 + face / 2, t), d: face, w: depth, up: [0, 1, 0] });
  M.add({ ...base, a: P(s0 + face / 2, y0 + face, t), b: P(s0 + face / 2, y1 - face, t), d: depth, w: face, up: base.upWall });
  M.add({ ...base, a: P(s1 - face / 2, y0 + face, t), b: P(s1 - face / 2, y1 - face, t), d: depth, w: face, up: base.upWall });
}

/* Architraves around an opening on one face (3 sides, or 4 for windows). */
function architraves(M, W, s0, s1, y0, y1, t, sill, host, code) {
  const P = (s, y, tt) => wallPt(W, s, y, tt);
  const base = { sys: "openings", kind: "architrave", name: "Architrave", profile: "67×18 primed architrave", mat: "paintWhite", host, code };
  const a = 0.067, th = 0.018;
  M.add({ ...base, a: P(s0 - a, y1 + a / 2, t), b: P(s1 + a, y1 + a / 2, t), d: a, w: th, up: [0, 1, 0] });
  M.add({ ...base, a: P(s0 - a / 2, sill ? y0 - a : y0, t), b: P(s0 - a / 2, y1, t), d: th, w: a, up: outUp(W) });
  M.add({ ...base, a: P(s1 + a / 2, sill ? y0 - a : y0, t), b: P(s1 + a / 2, y1, t), d: th, w: a, up: outUp(W) });
  if (sill) M.add({ ...base, a: P(s0 - a, y0 - a / 2, t), b: P(s1 + a, y0 - a / 2, t), d: a, w: th, up: [0, 1, 0] });
}

/**
 * Aluminium window in frame wall W at centre s. o = { w, h, sill } (sizes of
 * the window frame, sill above FFL); y0 = FFL; interiorT = depth of the
 * inside lining face.
 */
export function addWindow(M, W, s, o, y0, interiorT, mark, host) {
  const P = (ss, y, t) => wallPt(W, ss, y, t);
  const s0 = s - o.w / 2, s1 = s + o.w / 2, yb = y0 + o.sill, yt = y0 + o.sill + o.h;
  const tF = -0.012 + 0.05;                     // frame depth centre: 100 mm deep, 12 mm proud
  const depth = 0.1, face = 0.04;
  const sliding = o.w >= 0.9 && o.w >= o.h * 0.9;
  const label = `${mm(o.w)}×${mm(o.h)} ${sliding ? "aluminium sliding" : "aluminium awning"} window, double glazed`;
  const frame = { sys: "openings", kind: "windowFrame", name: "Window frame", profile: "100 mm aluminium window frame", mat: "alu", host, upWall: outUp(W), noSchedule: true, code: `${mark}-F` };
  // the head carries the schedule entry for the whole unit
  M.add({ ...frame, noSchedule: false, kind: "window", name: `Window ${mark}`, profile: label, unit: "ea",
    a: P(s0, yt - face / 2, tF), b: P(s1, yt - face / 2, tF), d: face, w: depth, up: [0, 1, 0] });
  M.add({ ...frame, a: P(s0, yb + 0.025, tF), b: P(s1, yb + 0.025, tF), d: 0.05, w: depth, up: [0, 1, 0] });
  M.add({ ...frame, a: P(s0 + face / 2, yb + 0.05, tF), b: P(s0 + face / 2, yt - face, tF), d: depth, w: face, up: outUp(W) });
  M.add({ ...frame, a: P(s1 - face / 2, yb + 0.05, tF), b: P(s1 - face / 2, yt - face, tF), d: depth, w: face, up: outUp(W) });

  const sashBase = { sys: "openings", kind: "sash", name: "Sash", profile: "Aluminium sash", mat: "alu", host, upWall: outUp(W), noSchedule: true, code: `${mark}-S` };
  const glass = (ss0, ss1, gy0, gy1, t) => M.add({ sys: "openings", kind: "glass", name: "Glazing", profile: "Double glazed unit 4/12/4", mat: "glass", host, noSchedule: true, code: `${mark}-G`,
    a: P((ss0 + ss1) / 2, gy0, t), b: P((ss0 + ss1) / 2, gy1, t), d: 0.02, w: ss1 - ss0, up: outUp(W) });
  const ix0 = s0 + face, ix1 = s1 - face, iy0 = yb + 0.05, iy1 = yt - face;
  if (sliding) {
    const mid = (ix0 + ix1) / 2;
    const panels = [[ix0, mid + 0.02, -0.012 + 0.03], [mid - 0.02, ix1, -0.012 + 0.065]];
    panels.forEach(([a, b, t], i) => {
      rectFrame(M, sashBase, P, a, b, iy0, iy1, t, 0.035, 0.028);
      glass(a + 0.035, b - 0.035, iy0 + 0.035, iy1 - 0.035, t);
      if (i === 1) {
        M.add({ sys: "openings", kind: "screen", name: "Fly screen", profile: "Aluminium fly screen", mat: "flyscreen", host, noSchedule: true, code: `${mark}-FS`,
          a: P((a + b) / 2, iy0 + 0.01, -0.012 + 0.09), b: P((a + b) / 2, iy1 - 0.01, -0.012 + 0.09), d: 0.004, w: b - a - 0.01, up: outUp(W) });
        M.add({ sys: "openings", kind: "handle", name: "Window latch", profile: "Sliding window latch", mat: "chrome", host, noSchedule: true, code: `${mark}-H`,
          a: P(a + 0.02, (iy0 + iy1) / 2 - 0.05, -0.012 + 0.085), b: P(a + 0.02, (iy0 + iy1) / 2 + 0.05, -0.012 + 0.085), d: 0.012, w: 0.018, up: outUp(W) });
      }
    });
  } else {
    // awning: fixed light over an opening awning sash with a transom
    const tr = iy0 + (iy1 - iy0) * 0.38;
    M.add({ ...sashBase, kind: "transom", name: "Transom", a: P(ix0, tr, tF), b: P(ix1, tr, tF), d: 0.04, w: 0.06, up: [0, 1, 0] });
    glass(ix0 + 0.01, ix1 - 0.01, tr + 0.02, iy1 - 0.01, -0.012 + 0.05);
    rectFrame(M, sashBase, P, ix0 + 0.005, ix1 - 0.005, iy0 + 0.005, tr - 0.02, -0.012 + 0.04, 0.035, 0.03);
    glass(ix0 + 0.04, ix1 - 0.04, iy0 + 0.04, tr - 0.055, -0.012 + 0.04);
    M.add({ sys: "openings", kind: "handle", name: "Winder", profile: "Chain winder", mat: "chrome", host, noSchedule: true, code: `${mark}-H`,
      a: P((ix0 + ix1) / 2 - 0.05, iy0 + 0.02, interiorT - 0.01), b: P((ix0 + ix1) / 2 + 0.05, iy0 + 0.02, interiorT - 0.01), d: 0.03, w: 0.03, up: [0, 1, 0] });
  }
  // inside: sill board + architraves
  M.add({ sys: "openings", kind: "sill", name: "Window sill", profile: "Painted timber window sill", mat: "paintWhite", host, noSchedule: true, code: `${mark}-SB`,
    a: P(s0 - 0.04, yb - 0.01, (interiorT + 0.088) / 2 + 0.01), b: P(s1 + 0.04, yb - 0.01, (interiorT + 0.088) / 2 + 0.01), d: 0.02, w: interiorT - 0.088 + 0.04, up: [0, 1, 0] });
  architraves(M, W, s0, s1, yb, yt, interiorT + 0.009, true, host, `${mark}-A`);
}

/* Hinges, lever set and (optionally) a deadlock for a door leaf. */
function hardware(M, P, W, hingeS, latchS, y0, tFaceA, tFaceB, host, mark, ext) {
  for (const hy of [0.25, 1.0, 1.85]) {
    M.add({ sys: "openings", kind: "hinge", name: "Door hinge", profile: ext ? "100 mm stainless butt hinge" : "85 mm butt hinge", mat: "chrome", unit: "ea", host, code: `${mark}-HG`,
      a: P(hingeS, y0 + hy - 0.05, tFaceB + 0.002), b: P(hingeS, y0 + hy + 0.05, tFaceB + 0.002), d: 0.006, w: 0.032, up: outUp(W) });
  }
  const dir = latchS > hingeS ? -1 : 1;     // levers point back toward the hinge
  for (const t of [tFaceA - 0.008, tFaceB + 0.008]) {
    M.add({ sys: "openings", kind: "rose", name: "Lever rose", profile: ext ? "Entrance lever set" : "Passage lever set", mat: "chrome", shape: "cyl", unit: "ea", host, code: `${mark}-LV`, noSchedule: t !== tFaceA - 0.008,
      a: P(latchS, y0 + 1.0, t + 0.006), b: P(latchS, y0 + 1.0, t - 0.006), d: 0.054, w: 0.054, up: [0, 1, 0] });
    const tl = t + (t < tFaceA ? -0.03 : 0.03);
    M.add({ sys: "openings", kind: "lever", name: "Lever", profile: "Lever", mat: "chrome", host, noSchedule: true, code: `${mark}-LV`,
      a: P(latchS, y0 + 1.0, tl), b: P(latchS + dir * 0.13, y0 + 1.0, tl), d: 0.016, w: 0.02, up: [0, 1, 0] });
    if (ext) {
      M.add({ sys: "openings", kind: "deadlock", name: "Deadlock", profile: "Single-cylinder deadlock", mat: "chrome", shape: "cyl", unit: "ea", host, code: `${mark}-DL`, noSchedule: t !== tFaceA - 0.008,
        a: P(latchS, y0 + 1.35, t + 0.006), b: P(latchS, y0 + 1.35, t - 0.006), d: 0.05, w: 0.05, up: [0, 1, 0] });
    }
  }
}

/** External hinged door in frame wall W at centre s. o = { w, h } */
export function addExternalDoor(M, W, s, o, y0, interiorT, mark, host) {
  const P = (ss, y, t) => wallPt(W, ss, y, t);
  const s0 = s - o.w / 2, s1 = s + o.w / 2;
  const jt = 0.03, depth = 0.11, tC = 0.045;
  const base = { sys: "openings", kind: "doorFrame", name: "Door frame", profile: "Meranti door frame 110×30", mat: "timberDark", host, noSchedule: true, code: `${mark}-F` };
  M.add({ ...base, a: P(s0 + jt / 2, y0, tC), b: P(s0 + jt / 2, y0 + o.h, tC), d: depth, w: jt, up: outUp(W) });
  M.add({ ...base, a: P(s1 - jt / 2, y0, tC), b: P(s1 - jt / 2, y0 + o.h, tC), d: depth, w: jt, up: outUp(W) });
  M.add({ ...base, a: P(s0, y0 + o.h - jt / 2, tC), b: P(s1, y0 + o.h - jt / 2, tC), d: jt, w: depth, up: [0, 1, 0] });
  M.add({ ...base, kind: "threshold", name: "Door sill", profile: "Aluminium door sill", mat: "alu", a: P(s0, y0 + 0.01, tC - 0.02), b: P(s1, y0 + 0.01, tC - 0.02), d: 0.02, w: 0.15, up: [0, 1, 0] });
  const lw = o.w - 2 * jt - 0.006, lh = o.h - jt - 0.02 - 0.006, lt = 0.04;
  const tLeaf = tC + depth / 2 - lt / 2 - 0.012;
  M.add({ sys: "openings", kind: "door", name: `Door ${mark}`, profile: `${mm(lw)}×${mm(lh)} solid-core entrance door, frame & hardware`, mat: "doorExt", unit: "ea", host, code: `${mark}-D`,
    a: P(s, y0 + 0.023, tLeaf), b: P(s, y0 + 0.023 + lh, tLeaf), d: lt, w: lw, up: outUp(W) });
  // a narrow glazed light in the leaf
  M.add({ sys: "openings", kind: "glass", name: "Door glazing", profile: "Laminated glass", mat: "glass", host, noSchedule: true, code: `${mark}-G`,
    a: P(s0 + jt + 0.15, y0 + 0.5, tLeaf), b: P(s0 + jt + 0.15, y0 + 1.85, tLeaf), d: lt + 0.004, w: 0.11, up: outUp(W) });
  hardware(M, P, W, s1 - jt - 0.003, s0 + jt + 0.07, y0, tLeaf - lt / 2, tLeaf + lt / 2, host, mark, true);
  architraves(M, W, s0, s1, y0, y0 + o.h, interiorT + 0.009, false, host, `${mark}-A`);
}

/**
 * Internal hinged door in a partition, leaf swung open `swing` radians.
 * W is the partition (t = 0 and t = D are its two frame faces).
 */
export function addInternalDoor(M, W, s, y0, D, mark, host, swing = 1.2) {
  const P = (ss, y, t) => wallPt(W, ss, y, t);
  const rough = 0.87, s0 = s - rough / 2, s1 = s + rough / 2;
  const jt = 0.018, full = D + 0.02 + 0.004, tC = D / 2;
  const base = { sys: "openings", kind: "jamb", name: "Door jamb", profile: "Pine jamb set", mat: "paintWhite", host, noSchedule: true, code: `${mark}-F` };
  M.add({ ...base, a: P(s0 + jt / 2, y0, tC), b: P(s0 + jt / 2, y0 + 2.06, tC), d: full, w: jt, up: outUp(W) });
  M.add({ ...base, a: P(s1 - jt / 2, y0, tC), b: P(s1 - jt / 2, y0 + 2.06, tC), d: full, w: jt, up: outUp(W) });
  M.add({ ...base, a: P(s0, y0 + 2.06 - jt / 2, tC), b: P(s1, y0 + 2.06 - jt / 2, tC), d: jt, w: full, up: [0, 1, 0] });
  // leaf, hinged on the s1 side, swung into the room on the t>0 side
  const lw = 0.82, lh = 2.04, lt = 0.035;
  const hinge = P(s1 - jt - 0.002, y0, tC + lt / 2);
  const along = [W.dir[0], W.dir[1]], inw = [-W.out[0], -W.out[1]];
  const c = Math.cos(swing), sn = Math.sin(swing);
  const leafDir = [-along[0] * c + inw[0] * sn, -along[1] * c + inw[1] * sn];   // from hinge toward the latch edge
  const centre = [hinge[0] + leafDir[0] * lw / 2, hinge[2] + leafDir[1] * lw / 2];
  const nrm = [-leafDir[1], 0, leafDir[0]];
  M.add({ sys: "openings", kind: "door", name: `Door ${mark}`, profile: "820×2040 hollow-core door, jamb & hardware", mat: "doorInt", unit: "ea", host, code: `${mark}-D`,
    a: [centre[0], y0 + 0.012, centre[1]], b: [centre[0], y0 + 0.012 + lh, centre[1]], d: lt, w: lw, up: nrm });
  for (const hy of [0.22, 1.0, 1.8]) {
    M.add({ sys: "openings", kind: "hinge", name: "Door hinge", profile: "85 mm butt hinge", mat: "chrome", unit: "ea", host, code: `${mark}-HG`,
      a: [hinge[0], y0 + hy - 0.042, hinge[2]], b: [hinge[0], y0 + hy + 0.042, hinge[2]], d: 0.012, w: 0.012, shape: "cyl", up: [1, 0, 0] });
  }
  // lever set on both faces near the latch edge
  const latch = [hinge[0] + leafDir[0] * (lw - 0.07), hinge[2] + leafDir[1] * (lw - 0.07)];
  for (const side of [-1, 1]) {
    const off = side * (lt / 2 + 0.01);
    const px = latch[0] + nrm[0] * off, pz = latch[1] + nrm[2] * off;
    M.add({ sys: "openings", kind: "rose", name: "Lever rose", profile: "Passage lever set", mat: "chrome", shape: "cyl", unit: "ea", host, code: `${mark}-LV`, noSchedule: side > 0,
      a: [px - nrm[0] * 0.006, y0 + 1.0, pz - nrm[2] * 0.006], b: [px + nrm[0] * 0.006, y0 + 1.0, pz + nrm[2] * 0.006], d: 0.05, w: 0.05, up: [0, 1, 0] });
    const lx = latch[0] + nrm[0] * (off + side * 0.025), lz = latch[1] + nrm[2] * (off + side * 0.025);
    M.add({ sys: "openings", kind: "lever", name: "Lever", profile: "Lever", mat: "chrome", host, noSchedule: true, code: `${mark}-LV`,
      a: [lx, y0 + 1.0, lz], b: [lx - leafDir[0] * 0.12, y0 + 1.0, lz - leafDir[1] * 0.12], d: 0.015, w: 0.02, up: [0, 1, 0] });
  }
  for (const t of [-0.019, D + 0.019]) architraves(M, W, s0, s1, y0, y0 + 2.06, t, false, host, `${mark}-A`);
}

/** Sectional garage door + tracks + motor. Opening centred at s in wall W. */
export function addGarageDoor(M, W, s, o, y0, mark, host) {
  const P = (ss, y, t) => wallPt(W, ss, y, t);
  const s0 = s - o.w / 2, s1 = s + o.w / 2;
  const panels = 4, ph = o.h / panels;
  for (let i = 0; i < panels; i++) {
    M.add({ sys: "openings", kind: i === 0 ? "garageDoor" : "garagePanel", name: i === 0 ? `Garage door ${mark}` : "Garage door panel", profile: `${mm(o.w)}×${mm(o.h)} sectional panel-lift door + motor`, mat: "garageDoor", shape: "panel", unit: "ea", noSchedule: i > 0, host, code: `${mark}-P`,
      a: P(s, y0 + i * ph + 0.004, 0.12), b: P(s, y0 + (i + 1) * ph - 0.004, 0.12), d: 0.04, w: o.w - 0.02, up: outUp(W) });
  }
  const tr = { sys: "openings", kind: "track", name: "Door track", profile: "Galv. door track", mat: "galv", host, noSchedule: true, code: `${mark}-T` };
  for (const ss of [s0 - 0.04, s1 + 0.04]) {
    M.add({ ...tr, a: P(ss, y0, 0.16), b: P(ss, y0 + o.h + 0.05, 0.16), d: 0.05, w: 0.035, up: outUp(W) });
    M.add({ ...tr, a: P(ss, y0 + o.h + 0.2, 0.16), b: P(ss, y0 + o.h + 0.2, 0.16 + 3.0), d: 0.035, w: 0.05, up: [0, 1, 0] });
  }
  M.add({ ...tr, name: "Torsion spring tube", profile: "Torsion spring tube", mat: "darkSteel", shape: "cyl", a: P(s0, y0 + o.h + 0.2, 0.2), b: P(s1, y0 + o.h + 0.2, 0.2), d: 0.05, w: 0.05, up: [0, 1, 0] });
  M.add({ ...tr, name: "Door motor", profile: "Garage door motor", mat: "plasticGrey", a: P(s - 0.15, y0 + o.h + 0.35, 2.9), b: P(s + 0.15, y0 + o.h + 0.35, 2.9), d: 0.15, w: 0.4, up: [0, 1, 0] });
  M.add({ ...tr, name: "Drive rail", profile: "Drive rail", mat: "galv", a: P(s, y0 + o.h + 0.3, 0.25), b: P(s, y0 + o.h + 0.3, 2.75), d: 0.03, w: 0.03, up: [0, 1, 0] });
}
