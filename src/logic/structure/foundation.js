/* =========================================================================
   MODULE: structure/foundation.js
   Below the frame: a stiffened raft slab (AS 2870 style) — slab, edge
   beams, internal stiffening beams both ways, SL82 mesh, trench mesh in the
   beams, polythene membrane — and, for two-storey homes, the upper floor:
   LVL joists at 450 centres, flush beams with steel posts on pad footings,
   joist hangers, stair-void trimmers, rim boards and sheet flooring.
   ========================================================================= */
import { SLAB, FLOOR, CRS } from "./standards.js";

/**
 * S = { code, host, x0, x1, z0, z1 (slab edges), top (FFL), thk }
 */
export function buildSlab(M, S) {
  const { x0, x1, z0, z1, top, thk } = S;
  const host = S.host;
  const code = (c) => `${S.code}-${c}`;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, L = z1 - z0;
  M.add({ sys: "foundation", kind: "slab", name: "Concrete slab", profile: `${Math.round(thk * 1000)} mm slab, N25 concrete`, mat: "concrete", unit: "m3", host,
    a: [x0, top - thk / 2, cz], b: [x1, top - thk / 2, cz], d: thk, w: L, up: [0, 1, 0], code: code("SL") });
  M.add({ sys: "foundation", kind: "membrane", name: "Vapour barrier", profile: "200 µm polythene membrane", mat: "membrane", unit: "m2", host,
    a: [x0, top - thk - 0.002, cz], b: [x1, top - thk - 0.002, cz], d: 0.002, w: L, up: [0, 1, 0], code: code("VB"), noBounds: true });

  /* beams: edge beams all round, stiffening beams at <= 4 m both ways */
  const eb = SLAB.edgeBeam, ib = SLAB.intBeam;
  const beam = (a, b, wdt, below, name, profile) => {
    const depth = below;
    const y = top - thk - depth / 2;
    M.add({ sys: "foundation", kind: "beam", name, profile, mat: "concrete", unit: "m3", host,
      a: [a[0], y, a[1]], b: [b[0], y, b[1]], d: depth, w: wdt, up: [0, 1, 0], code: code("EB") });
    // trench mesh: three bars near the bottom of the beam
    for (let k = 0; k < SLAB.trench.bars; k++) {
      const off = (k - 1) * (wdt / 3);
      const dir = [b[0] - a[0], b[1] - a[1]];
      const Lb = Math.hypot(dir[0], dir[1]) || 1;
      const nx = -dir[1] / Lb, nz = dir[0] / Lb;
      const yb = top - thk - depth + 0.06;
      M.add({ sys: "reo", kind: "bar", name: "Trench mesh bar", profile: SLAB.trench.profile, mat: "rebar", shape: "cyl", host,
        a: [a[0] + nx * off, yb, a[1] + nz * off], b: [b[0] + nx * off, yb, b[1] + nz * off], d: SLAB.trench.r * 2, w: SLAB.trench.r * 2, up: [0, 1, 0], code: code("TM"), noSchedule: k > 0 });
    }
  };
  const h = eb.w / 2;
  beam([x0, z0 + h], [x1, z0 + h], eb.w, eb.below, "Edge beam", "300 × 300 edge beam");
  beam([x0, z1 - h], [x1, z1 - h], eb.w, eb.below, "Edge beam", "300 × 300 edge beam");
  beam([x0 + h, z0 + eb.w], [x0 + h, z1 - eb.w], eb.w, eb.below, "Edge beam", "300 × 300 edge beam");
  beam([x1 - h, z0 + eb.w], [x1 - h, z1 - eb.w], eb.w, eb.below, "Edge beam", "300 × 300 edge beam");
  const nx = Math.max(0, Math.ceil(W / ib.maxCrs) - 1), nz = Math.max(0, Math.ceil(L / ib.maxCrs) - 1);
  for (let i = 1; i <= nx; i++) {
    const x = x0 + (W * i) / (nx + 1);
    beam([x, z0 + eb.w], [x, z1 - eb.w], ib.w, ib.below, "Stiffening beam", "300 × 250 stiffening beam");
  }
  for (let i = 1; i <= nz; i++) {
    const z = z0 + (L * i) / (nz + 1);
    beam([x0 + eb.w, z], [x1 - eb.w, z], ib.w, ib.below, "Stiffening beam", "300 × 250 stiffening beam");
  }

  /* SL82 mesh at mid-depth, 200 centres each way, 50 cover to the edges */
  const yMesh = top - thk / 2;
  const meshBase = { sys: "reo", kind: "bar", name: "Slab mesh bar", profile: SLAB.mesh.profile, mat: "rebar", shape: "cyl", host, d: SLAB.mesh.r * 2, w: SLAB.mesh.r * 2, up: [0, 1, 0] };
  for (let z = z0 + 0.05; z <= z1 - 0.05 + 1e-6; z += SLAB.mesh.crs) M.add({ ...meshBase, a: [x0 + 0.05, yMesh, z], b: [x1 - 0.05, yMesh, z], code: code("MX") });
  for (let x = x0 + 0.05; x <= x1 - 0.05 + 1e-6; x += SLAB.mesh.crs) M.add({ ...meshBase, a: [x, yMesh + 0.008, z0 + 0.05], b: [x, yMesh + 0.008, z1 - 0.05], code: code("MZ") });
}

/**
 * Upper floor framing over storey f-1.
 * F = { code, host, x0, x1, z0, z1 (frame OUTER faces), bear (top of the
 *       lower top plate), ffl (finished floor above), frameD, void: {x0,x1,z0,z1}|null,
 *       slabTop }
 */
export function buildUpperFloor(M, F) {
  const J = FLOOR.joist, host = F.host;
  const code = (c) => `${F.code}-${c}`;
  const yJ = F.bear + J.d / 2;
  const xi0 = F.x0, xi1 = F.x1;                       // joists bear full width of the frame
  const span = xi1 - xi0;
  // flush beams along z split the span to <= FLOOR.maxSpan
  const nBeams = Math.max(0, Math.ceil(span / FLOOR.maxSpan) - 1);
  const beamX = Array.from({ length: nBeams }, (_, i) => xi0 + (span * (i + 1)) / (nBeams + 1));
  const zi0 = F.z0 + F.frameD, zi1 = F.z1 - F.frameD;
  const Bm = FLOOR.beam;
  for (const x of beamX) {
    M.add({ sys: "floorFrame", kind: "beam", name: "Flush beam", profile: Bm.profile, mat: Bm.mat, host,
      a: [x, F.bear + Bm.d / 2 - (Bm.d - J.d), zi0], b: [x, F.bear + Bm.d / 2 - (Bm.d - J.d), zi1], d: Bm.d, w: Bm.t * 2, up: [0, 1, 0], code: code("FB") });
    // posts down to pad footings, <= 4.5 m centres
    const nP = Math.max(1, Math.ceil((zi1 - zi0) / FLOOR.maxPostCrs) - 1);
    for (let k = 1; k <= nP; k++) {
      const z = zi0 + ((zi1 - zi0) * k) / (nP + 1);
      const yTopPost = F.bear - (Bm.d - J.d);
      M.add({ sys: "floorFrame", kind: "post", name: "Steel post", profile: FLOOR.post.profile, mat: FLOOR.post.mat, unit: "ea", host,
        a: [x, F.slabTop, z], b: [x, yTopPost, z], d: FLOOR.post.d, w: FLOOR.post.d, up: [1, 0, 0], code: code("PO") });
      M.add({ sys: "foundation", kind: "pad", name: "Pad footing", profile: "600×600×400 pad footing", mat: "concrete", unit: "m3", host,
        a: [x - 0.3, F.slabTop - 0.3, z], b: [x + 0.3, F.slabTop - 0.3, z], d: 0.4, w: 0.6, up: [0, 1, 0], code: code("PF") });
    }
  }
  const supports = [xi0, ...beamX, xi1];
  const v = F.void;
  const inVoidZ = (z) => v && z > v.z0 - 0.02 && z < v.z1 + 0.02;

  // joists at 450 centres along z, cut at each flush beam (hung on hangers)
  const joistZ = [];
  for (let z = zi0 + J.t / 2; z <= zi1 - J.t / 2 + 1e-6; z += CRS.joist) joistZ.push(z);
  if (zi1 - J.t / 2 - joistZ[joistZ.length - 1] > 0.05) joistZ.push(zi1 - J.t / 2);
  for (const z of joistZ) {
    for (let k = 0; k < supports.length - 1; k++) {
      let a = supports[k] + (k > 0 ? Bm.t : 0), b = supports[k + 1] - (k < supports.length - 2 ? Bm.t : 0);
      const pieces = [];
      if (inVoidZ(z) && v.x1 > a && v.x0 < b) {
        if (v.x0 - a > 0.1) pieces.push([a, v.x0]);
        if (b - v.x1 > 0.1) pieces.push([v.x1, b]);
      } else pieces.push([a, b]);
      for (const [p, q] of pieces) {
        M.add({ sys: "floorFrame", kind: "joist", name: "Floor joist", profile: J.profile, mat: J.mat, host,
          a: [p, yJ, z], b: [q, yJ, z], d: J.d, w: J.t, up: [0, 1, 0], code: code("J") });
        // a hanger wherever a joist ends on a beam or trimmer (not on a wall)
        for (const [x, onWall] of [[p, Math.abs(p - xi0) < 0.01], [q, Math.abs(q - xi1) < 0.01]]) {
          if (onWall) continue;
          M.add({ sys: "fixings", kind: "hanger", name: "Joist hanger", profile: "Galv. joist hanger 45×240", mat: "galv", unit: "ea", host,
            a: [x, F.bear + 0.01, z], b: [x, F.bear + J.d - 0.02, z], d: 0.002, w: J.t + 0.006, up: [1, 0, 0], code: code("JH") });
        }
      }
    }
  }
  // rim boards along the joist ends (front/back walls carry the edge joists)
  for (const x of [xi0 + 0.0225, xi1 - 0.0225]) {
    M.add({ sys: "floorFrame", kind: "rim", name: "Rim board", profile: "240×45 LVL rim board", mat: "lvl", host,
      a: [x, yJ, zi0], b: [x, yJ, zi1], d: J.d, w: 0.045, up: [0, 1, 0], code: code("RB") });
  }
  // stair void: doubled trimmer joists and trimmers across
  if (v) {
    for (const z of [v.z0 - 0.045, v.z1 + 0.045]) {
      for (const dz of [-0.0225, 0.0225]) {
        M.add({ sys: "floorFrame", kind: "joist", name: "Trimmer joist (stair void)", profile: J.profile, mat: J.mat, host,
          a: [Math.max(xi0, v.x0 - 0.6), yJ, z + dz], b: [Math.min(xi1, v.x1 + 0.6), yJ, z + dz], d: J.d, w: J.t, up: [0, 1, 0], code: code("TJ") });
      }
    }
    for (const x of [v.x0 - 0.0225, v.x1 + 0.0225]) {
      M.add({ sys: "floorFrame", kind: "joist", name: "Trimmer (stair void)", profile: J.profile, mat: J.mat, host,
        a: [x, yJ, v.z0 - 0.09], b: [x, yJ, v.z1 + 0.09], d: J.d, w: J.t, up: [0, 1, 0], code: code("TR") });
    }
  }
  // sheet flooring, 3600 × 900, laid across the joists and staggered
  const S = FLOOR.sheet;
  const yS = F.bear + J.d + S.t / 2;
  let row = 0;
  for (let z = F.z0; z < F.z1 - 0.01; z += S.w, row++) {
    const zb = Math.min(F.z1, z + S.w);
    const off = row % 2 ? S.len / 2 : 0;
    for (let x = F.x0 - off; x < F.x1 - 0.01; x += S.len) {
      let a = Math.max(F.x0, x), b = Math.min(F.x1, x + S.len);
      const cuts = [];
      if (v && zb > v.z0 && z < v.z1 && b > v.x0 && a < v.x1) {
        if (v.x0 - a > 0.05) cuts.push([a, v.x0]);
        if (b - v.x1 > 0.05) cuts.push([v.x1, b]);
      } else cuts.push([a, b]);
      for (const [p, q] of cuts) {
        if (q - p < 0.05) continue;
        M.add({ sys: "floorFrame", kind: "flooring", name: "Floor sheet", profile: S.profile, mat: "particleboard", unit: "m2", host,
          a: [p + 0.001, yS, (z + zb) / 2], b: [q - 0.001, yS, (z + zb) / 2], d: S.t, w: zb - z - 0.002, up: [0, 1, 0], code: code("FS") });
      }
    }
  }
  return { top: yS + S.t / 2, beamX };
}
