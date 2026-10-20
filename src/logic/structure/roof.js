/* =========================================================================
   MODULE: structure/roof.js
   A gable roof as built: prefabricated trusses at centres (Fink web pattern,
   or a multi-panel pattern for long spans), gable-end trusses with gable
   studs, nail plates on both faces of every joint, triple-grips at each
   heel, bottom-chord binders, speed-brace straps, battens, sarking, then
   corrugated sheets (with screws) or concrete tiles, ridge capping, fascia,
   square-line gutter, downpipes, barge boards and eave lining.

   The ridge runs along z. x is measured from the roof centre line `xc`.
   ========================================================================= */
import { CRS, TRUSS, ROOFING } from "./standards.js";

/**
 * R = { code, host, xc, xh (heel: frame outer face, from xc), xE (building
 *       line, from xc), eave, verge, zA, zB (frame faces along the ridge),
 *       envZ0, envZ1 (building line along the ridge), plateY, pitch (rad),
 *       cover: "sheet"|"tile", frameMat, gutters: true }
 * Returns the roof surfaces other systems need (soffit height, cover plane).
 */
export function buildRoof(M0, R) {
  // everything here is tagged zone "roof" (the walkthrough lifts it off)
  const M = { add: (m) => M0.add({ ...m, zone: "roof" }) };
  const p = R.pitch, tanp = Math.tan(p), cosp = Math.cos(p), sinp = Math.sin(p);
  const C = TRUSS.chord, Wb = TRUSS.web;
  const cover = R.cover === "tile" ? "tile" : "sheet";
  const RF = ROOFING[cover];
  const B = RF.batten;
  const sheetD = cover === "tile" ? 0.03 : RF.d;
  // eaves on both sides unless told otherwise (a garage butting the house
  // has none on the house side: its trusses stop at the wall line)
  const eaveSides = R.eaveSides || [-1, 1];
  const hasEave = (s) => eaveSides.includes(s);
  const xFs = (s) => (hasEave(s) ? R.xE + R.eave : R.xE);       // fascia outer face (from xc)
  const xTs = (s) => (hasEave(s) ? xFs(s) - 0.025 : R.xE - 0.01); // truss tail end
  const xF = xFs(1), xT = xTs(1);
  const slopeLenOf = (s) => xTs(s) / cosp;
  const zV0 = R.envZ0 - R.verge, zV1 = R.envZ1 + R.verge;

  // lines measured perpendicular to the slope, as y at plan offset xr
  const yU = (xr) => R.plateY + (R.xh - xr) * tanp;                 // top chord underside
  const yAt = (xr, perp) => yU(xr) + perp / cosp;
  const chordC = (xr) => yAt(xr, C.d / 2);
  const battenC = (xr) => yAt(xr, C.d + B.d / 2);
  const coverC = (xr) => yAt(xr, C.d + B.d + sheetD / 2);
  const coverTop = (xr) => yAt(xr, C.d + B.d + sheetD);
  const X = (s, xr) => R.xc + s * xr;
  const slopeN = (s) => [s * sinp, cosp, 0];
  const host = R.host;
  const code = (c) => `${R.code}-${c}`;
  const bcY = R.plateY + C.d / 2;
  const span = 2 * R.xh;

  /* truss positions: gable trusses on the end walls, the rest at centres */
  const crs = CRS.truss[cover];
  const z0 = R.zA + C.t / 2, z1 = R.zB - C.t / 2;
  const n = Math.max(1, Math.ceil((z1 - z0) / crs));
  const trussZ = Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n);
  const fink = span <= TRUSS.finkMaxSpan;

  const chord = (a, b, name, mark, z, isWeb) => {
    const S = isWeb ? Wb : C;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return M.add({ sys: "roofFrame", kind: isWeb ? "web" : "chord", name, profile: S.profile, mat: R.frameMat || S.mat, host,
      a: [a[0], a[1], z], b: [b[0], b[1], z], d: S.d, w: S.t, up: [-dy, dx, 0], code: code(mark) });
  };
  const plates = (pts, z) => {
    for (const [x, y] of pts) {
      for (const side of [-1, 1]) {
        const zz = z + side * (C.t / 2 + 0.0008);
        M.add({ sys: "fixings", kind: "nailplate", name: "Nail plate", profile: TRUSS.plate.profile, mat: "galv", unit: "ea", host,
          a: [x - TRUSS.plate.w / 2, y, zz], b: [x + TRUSS.plate.w / 2, y, zz], d: TRUSS.plate.h, w: 0.0012, up: [0, 1, 0], code: code("NP") });
      }
    }
  };

  trussZ.forEach((z, i) => {
    const gable = i === 0 || i === trussZ.length - 1;
    const tname = gable ? "Gable truss" : "Common truss";
    const tmark = gable ? "GT" : "T";
    // bottom chord, heel to heel
    chord([X(-1, R.xh), bcY], [X(1, R.xh), bcY], `${tname} — bottom chord`, tmark, z);
    // top chords, tail to apex
    for (const s of [-1, 1]) chord([X(s, xTs(s)), chordC(xTs(s))], [X(s, 0), chordC(0)], `${tname} — top chord`, tmark, z);
    const joints = [[X(-1, R.xh - 0.12), R.plateY + 0.06], [X(1, R.xh - 0.12), R.plateY + 0.06], [R.xc, chordC(0) - 0.04]];
    if (gable) {
      // gable studs at 600 centres carry the gable cladding
      for (let xr = 0.6; xr < R.xh - 0.2; xr += 0.6) {
        for (const s of [-1, 1]) {
          const top = chordC(xr) - (C.d / 2) / cosp;
          chord([X(s, xr), bcY + C.d / 2], [X(s, xr), top], "Gable truss — gable stud", tmark, z, true);
          joints.push([X(s, xr), bcY + 0.02], [X(s, xr), top - 0.03]);
        }
      }
      if (Math.abs(chordC(0) - bcY) > 0.4) chord([R.xc, bcY + C.d / 2], [R.xc, chordC(0) - (C.d / 2) / cosp], "Gable truss — gable stud", tmark, z, true);
    } else if (fink) {
      // Fink (W) pattern: bottom panel points at thirds, top at quarter points
      for (const s of [-1, 1]) {
        const pb = [X(s, R.xh / 3), bcY + C.d / 2];
        const pt = [X(s, R.xh / 2), chordC(R.xh / 2) - (C.d / 2) / cosp];
        const ap = [R.xc + s * 0.03, chordC(0) - (C.d / 2) / cosp - 0.02];
        chord(pb, pt, `${tname} — web`, tmark, z, true);
        chord(pb, ap, `${tname} — web`, tmark, z, true);
        joints.push([pb[0], bcY], [pt[0], chordC(R.xh / 2)]);
      }
    } else {
      // long spans: panels of <= 2.1 m, verticals + diagonals sloping to the centre
      const panels = Math.max(4, 2 * Math.ceil(span / 2 / 2.1));
      const half = panels / 2;
      for (const s of [-1, 1]) {
        for (let k = 1; k < half; k++) {
          const xr = R.xh - (R.xh * k) / half;
          const xrIn = R.xh - (R.xh * (k + 1)) / half;
          const top = chordC(xr) - (C.d / 2) / cosp;
          chord([X(s, xr), bcY + C.d / 2], [X(s, xr), top], `${tname} — web`, tmark, z, true);
          chord([X(s, xr), bcY + C.d / 2], [X(s, Math.max(0.03, xrIn)), chordC(Math.max(0, xrIn)) - (C.d / 2) / cosp], `${tname} — web`, tmark, z, true);
          joints.push([X(s, xr), bcY], [X(s, xr), chordC(xr)]);
        }
      }
    }
    plates(joints, z);
    // triple-grip at each heel, on the inside face of the top plate
    for (const s of [-1, 1]) {
      M.add({ sys: "fixings", kind: "bracket", name: "Triple-grip", profile: "Triple-grip truss connector", mat: "galv", unit: "ea", host,
        a: [X(s, R.xh - 0.092), R.plateY - 0.035, z + C.t / 2 + 0.02], b: [X(s, R.xh - 0.092), R.plateY + 0.045, z + C.t / 2 + 0.02],
        d: 0.035, w: 0.0015, up: [0, 0, 1], code: code("TG") });
    }
  });

  /* bottom-chord binders and speed bracing */
  for (const s of [-1, 1]) {
    const x = X(s, R.xh / 3 + 0.2);
    M.add({ sys: "roofFrame", kind: "binder", name: "Bottom chord binder", profile: "70×35 MGP10 binder", mat: "pine", host,
      a: [x, R.plateY + C.d + 0.0175, z0], b: [x, R.plateY + C.d + 0.0175, z1], d: 0.035, w: 0.07, up: [0, 1, 0], code: code("BN") });
    const run = Math.min((z1 - z0) / 2 - 0.1, slopeLenOf(s) * 0.95);
    for (const [za, dir] of [[z0 + 0.05, 1], [z1 - 0.05, -1]]) {
      const a = [X(s, 0.2), yAt(0.2, C.d + 0.001), za];
      const xrB = Math.max(0.3, R.xh - 0.1);
      const b = [X(s, xrB), yAt(xrB, C.d + 0.001), za + dir * run];
      M.add({ sys: "roofFrame", kind: "brace", name: "Speed brace", profile: "Galv. speed brace 32×1.0", mat: "galv", host,
        a, b, d: 0.0016, w: 0.032, up: slopeN(s), code: code("SB") });
    }
  }

  /* battens across the trusses, from verge to verge */
  const bCrs = cover === "tile" ? RF.gauge : CRS.batten.sheet;
  const battensOf = (s) => {
    const out = [];
    for (let sl = 0.06; sl < slopeLenOf(s) - 0.12; sl += bCrs) out.push(sl);
    out.push(slopeLenOf(s) - 0.1);
    return out;
  };
  for (const s of [-1, 1]) {
    const xT = xTs(s);
    for (const sl of battensOf(s)) {
      const xr = xT - sl * cosp;
      const y = battenC(xr);
      // battens come in ~6 m lengths, lapped over a truss
      let cur = zV0;
      while (cur < zV1 - 1e-6) {
        const lim = Math.min(zV1, cur + 6.0);
        const joint = lim < zV1 ? trussZ.filter((z) => z > cur + 1 && z <= lim).pop() ?? lim : lim;
        M.add({ sys: "roofFrame", kind: "batten", name: "Roof batten", profile: B.profile, mat: B.mat, shape: B.shape, host,
          a: [X(s, xr), y, cur], b: [X(s, xr), y, joint], d: B.d, w: B.w, up: slopeN(s), code: code("RB") });
        cur = joint;
      }
    }
    // sarking over the trusses (under the battens)
    const sa = [X(s, xT), yAt(xT, C.d + 0.002), 0], sb = [X(s, 0.02), yAt(0.02, C.d + 0.002), 0];
    const zc = (zV0 + zV1) / 2;
    M.add({ sys: "roofing", kind: "sarking", name: "Sarking", profile: "Reflective foil sarking", mat: "foil", unit: "m2", host, skin: true,
      a: [sa[0], sa[1], zc], b: [sb[0], sb[1], zc], d: 0.002, w: zV1 - zV0, up: slopeN(s), code: code("SK") });
  }

  /* roof cover */
  const tailOf = (s) => (hasEave(s) ? xFs(s) + 0.05 : R.xE - 0.005);   // 50 mm into the gutter
  if (cover === "sheet") {
    for (const s of [-1, 1]) {
      const tailX = tailOf(s), xT = xTs(s), battenSl = battensOf(s);
      for (let z = zV0; z < zV1 - 0.01; z += RF.cover) {
        const wdt = Math.min(RF.cover, zV1 - z);
        const zc = z + wdt / 2;
        const sheet = M.add({ sys: "roofing", kind: "sheet", name: "Roof sheet", profile: RF.profile, mat: "colorbond", shape: "corrugated", unit: "m2", host, skin: true,
          a: [X(s, tailX), coverC(tailX), zc], b: [X(s, 0.03), coverC(0.03), zc], d: RF.d, w: wdt, up: slopeN(s), code: code("SH") });
        void sheet;
        // screws: three per sheet at every batten
        for (const sl of battenSl) {
          const xr = xT - sl * cosp;
          for (const f of [-0.33, 0, 0.33]) {
            const zz = zc + f * wdt;
            const top = coverTop(xr);
            const nrm = slopeN(s);
            M.add({ sys: "roofing", kind: "screw", name: "Roofing screw", profile: "12g×50 Type 17 roofing screw", mat: "colorbondScrew", shape: "cyl", unit: "ea", host,
              a: [X(s, xr) - nrm[0] * 0.004, top - nrm[1] * 0.004, zz], b: [X(s, xr) + nrm[0] * 0.012, top + nrm[1] * 0.012, zz], d: 0.012, w: 0.012, up: [0, 0, 1], code: code("SC") });
          }
        }
      }
    }
    // ridge capping, one leaf down each slope
    for (const s of [-1, 1]) {
      const xr0 = 0.0, xr1 = 0.2 * cosp;
      M.add({ sys: "roofing", kind: "capping", name: "Ridge capping", profile: "Roll-top ridge capping", mat: "colorbond", unit: "lm", host,
        a: [X(s, (xr0 + xr1) / 2), coverTop((xr0 + xr1) / 2) + 0.012, zV0], b: [X(s, (xr0 + xr1) / 2), coverTop((xr0 + xr1) / 2) + 0.012, zV1],
        d: 0.006, w: 0.21, up: slopeN(s), code: code("RC") });
    }
  } else {
    // concrete tiles: courses at the batten gauge, laid from the eave up
    const tileLen = 0.42, tileW = RF.cover;
    for (const s of [-1, 1]) {
      const xT = xTs(s), battenSl = battensOf(s);
      battenSl.forEach((sl, row) => {
        if (row === battenSl.length - 1) return;
        const xrHead = xT - sl * cosp;                  // tile hangs on this batten
        const off = row % 2 ? tileW / 2 : 0;
        for (let z = zV0 - off; z < zV1 - 0.02; z += tileW) {
          const za = Math.max(zV0, z), zb = Math.min(zV1, z + tileW);
          if (zb - za < 0.05) continue;
          const xrTail = xrHead + tileLen * cosp;
          M.add({ sys: "roofing", kind: "tile", name: "Roof tile", profile: RF.profile, mat: "tile", shape: "tile", unit: "ea", host, skin: true, tint: ((row * 7 + Math.round(z * 10)) % 5) / 5,
            a: [X(s, xrTail), coverC(xrTail) + 0.01, (za + zb) / 2], b: [X(s, xrHead), coverC(xrHead) + 0.03, (za + zb) / 2], d: 0.028, w: zb - za - 0.004, up: slopeN(s), code: code("TL") });
        }
      });
    }
    for (let z = zV0; z < zV1; z += 0.4) {
      M.add({ sys: "roofing", kind: "ridge", name: "Ridge tile", profile: "Concrete ridge tile + bedding", mat: "tile", shape: "cyl", unit: "ea", host, skin: true,
        a: [R.xc, coverTop(0) + 0.05, z], b: [R.xc, coverTop(0) + 0.05, Math.min(zV1, z + 0.43)], d: 0.22, w: 0.22, up: [0, 1, 0], code: code("RT") });
    }
  }

  /* fascia, gutter, downpipes, barge boards, eave lining */
  const eaveRef = eaveSides[0] ?? 1;
  const fasciaTop = yAt(xFs(eaveRef) - 0.0125, C.d + B.d);
  const soffitY = yU(xTs(eaveRef)) - 0.008;
  const gutterTop = fasciaTop - 0.012;
  const zLen = zV1 - zV0;
  const downpipeZ = [R.envZ0 + 0.35, R.envZ1 - 0.35, ...(zLen > 12 ? [(R.envZ0 + R.envZ1) / 2] : [])];
  for (const s of eaveSides) {
    const xF = xFs(s), xT = xTs(s);
    M.add({ sys: "roofing", kind: "fascia", name: "Fascia", profile: "Steel fascia 150", mat: "trim", unit: "lm", host,
      a: [X(s, xF - 0.0125), fasciaTop - 0.08, zV0], b: [X(s, xF - 0.0125), fasciaTop - 0.08, zV1], d: 0.16, w: 0.025, up: [0, 1, 0], code: code("FA") });
    M.add({ sys: "roofing", kind: "gutter", name: "Gutter", profile: "Square-line gutter 115", mat: "trim", shape: "gutter", unit: "lm", host,
      a: [X(s, xF + 0.06), gutterTop - 0.05, zV0], b: [X(s, xF + 0.06), gutterTop - 0.05, zV1], d: 0.1, w: 0.115, up: [0, 1, 0], code: code("GU") });
    // eave lining (soffit) between the wall and the fascia
    M.add({ sys: "cladding", kind: "soffit", name: "Eave lining", profile: "4.5 mm fibre-cement eave lining", mat: "fcSheet", unit: "m2", host, skin: true,
      a: [X(s, R.xE), soffitY, (R.envZ0 + R.envZ1) / 2], b: [X(s, xT - 0.005), soffitY, (R.envZ0 + R.envZ1) / 2], d: 0.006, w: R.envZ1 - R.envZ0, up: [0, 1, 0], code: code("EL") });
    if (R.gutters !== false) {
      for (const z of downpipeZ) {
        const xw = X(s, R.xE + 0.07);
        const xg = X(s, xF + 0.06);
        const yJoin = soffitY - 0.25;
        M.add({ sys: "roofing", kind: "downpipe", name: "Downpipe", profile: "90 mm round downpipe", mat: "trim", shape: "cyl", unit: "lm", host,
          a: [xg, gutterTop - 0.1, z], b: [xw, yJoin, z], d: 0.09, w: 0.09, up: [0, 0, 1], code: code("DP") });
        M.add({ sys: "roofing", kind: "downpipe", name: "Downpipe", profile: "90 mm round downpipe", mat: "trim", shape: "cyl", unit: "lm", host,
          a: [xw, yJoin, z], b: [xw, 0.02, z], d: 0.09, w: 0.09, up: [0, 0, 1], code: code("DP") });
      }
    }
  }
  for (const zv of [zV0, zV1]) {
    const zIn = zv === zV0 ? zv + 0.0095 : zv - 0.0095;
    for (const s of [-1, 1]) {
      const a = [X(s, xFs(s)), yAt(xFs(s), C.d + B.d) - 0.095 / cosp, zIn], b = [R.xc, yAt(0, C.d + B.d) - 0.095 / cosp, zIn];
      M.add({ sys: "roofing", kind: "barge", name: "Barge board", profile: "190×19 primed barge board", mat: "trim", host,
        a, b, d: 0.19, w: 0.019, up: [s * sinp, cosp, 0], code: code("BB") });
      const capZ = zv === zV0 ? zv + 0.03 : zv - 0.03;
      M.add({ sys: "roofing", kind: "capping", name: "Barge capping", profile: "Barge capping", mat: "colorbond", host,
        a: [X(s, tailOf(s)), coverTop(tailOf(s)) + 0.01, capZ], b: [X(s, 0.05), coverTop(0.05) + 0.01, capZ], d: 0.02, w: 0.09, up: slopeN(s), code: code("BC") });
    }
  }

  return {
    soffitY, trussZ, plateY: R.plateY, coverTop, coverC, yU, xF, zV0, zV1, slopeN,
    gableBaseY: yU(R.xE), ridgeY: coverTop(0), xTs, xFs, hasEave, cosp, sinp, X,
  };
}
