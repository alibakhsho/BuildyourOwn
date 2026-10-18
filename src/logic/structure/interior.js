/* =========================================================================
   MODULE: structure/interior.js
   Inside the house, from the room layout (house-geometry.layoutFloors):
     - partition walls on the room boundaries — none between open-plan
       spaces (living / kitchen / dining / halls) — with exactly one door
       per enclosed room, onto the hall where there is one
     - floor finishes per room, the stair (stringers, treads, risers,
       balustrade), kitchen joinery and bathroom fixtures
   Pure: returns partition descriptions for walls.js to frame, and adds the
   finish members itself.
   ========================================================================= */
import { wallPt } from "./walls.js";

const OPEN = new Set(["Living", "Dining", "Kitchen", "Hallway", "Stair", "Media"]);
const isOpen = (c) => c.item.circulation || OPEN.has(c.item.type);
const k3 = (v) => Math.round(v * 1000);

/**
 * Partition runs for one storey.
 * @returns [{ axis:"x"|"z", at, from, to, doors:[centre], rooms:[names] }]
 *   axis "z": the wall runs along z at x = at; axis "x": along x at z = at.
 */
export function partitionsFor(fl, inner) {
  const cells = fl.cells;
  const eps = 0.02;
  const onBoundary = (axis, at) => (axis === "z"
    ? Math.abs(at - inner.x) < 0.03 || Math.abs(at - (inner.x + inner.w)) < 0.03
    : Math.abs(at - inner.z) < 0.03 || Math.abs(at - (inner.z + inner.l)) < 0.03);
  // every cell edge, grouped by the line it lies on
  const lines = new Map();
  for (const c of cells) {
    for (const [axis, at, a, b] of [["z", c.x, c.z, c.z + c.l], ["z", c.x + c.w, c.z, c.z + c.l], ["x", c.z, c.x, c.x + c.w], ["x", c.z + c.l, c.x, c.x + c.w]]) {
      if (onBoundary(axis, at)) continue;
      const key = `${axis}:${k3(at)}`;
      const L = lines.get(key) || { axis, at, cuts: new Set() };
      L.cuts.add(k3(a)); L.cuts.add(k3(b));
      lines.set(key, L);
    }
  }
  const cellAt = (x, z) => cells.find((c) => x > c.x - 1e-6 && x < c.x + c.w + 1e-6 && z > c.z - 1e-6 && z < c.z + c.l + 1e-6);
  // elementary pieces between consecutive cut points, with the cells either side
  const pieces = [];
  for (const L of lines.values()) {
    const cuts = [...L.cuts].sort((p, q) => p - q).map((v) => v / 1000);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2;
      if (b - a < 0.05) continue;
      const [A, B] = L.axis === "z" ? [cellAt(L.at - eps, m), cellAt(L.at + eps, m)] : [cellAt(m, L.at - eps), cellAt(m, L.at + eps)];
      if (!A || !B || A === B) continue;
      pieces.push({ axis: L.axis, at: L.at, a, b, A, B, wall: !(isOpen(A) && isOpen(B)), door: null });
    }
  }
  // one door per enclosed room: hall first, then open-plan, then a bedroom
  // (for an ensuite), then the longest shared wall
  const rank = (me, other) => {
    if (other.item.circulation) return 0;
    if (OPEN.has(other.item.type)) return 1;
    if (me.item.type === "Bathroom" && me.item.ensuite && other.item.type === "Bedroom") return 1.5;
    return 2;
  };
  for (const c of cells) {
    if (isOpen(c)) continue;
    const mine = pieces.filter((p) => p.wall && (p.A === c || p.B === c) && p.b - p.a >= 1.05 && !p.door);
    if (!mine.length) continue;
    mine.sort((p, q) => rank(c, p.A === c ? p.B : p.A) - rank(c, q.A === c ? q.B : q.A) || (q.b - q.a) - (p.b - p.a));
    const p = mine[0];
    // a door near one end of the wall, like a real plan
    p.door = Math.min(p.a + 0.2 + 0.435, (p.a + p.b) / 2);
  }
  // merge consecutive wall pieces on the same line into runs
  const runs = [];
  const byLine = new Map();
  for (const p of pieces.filter((x) => x.wall)) {
    const key = `${p.axis}:${k3(p.at)}`;
    (byLine.get(key) || byLine.set(key, []).get(key)).push(p);
  }
  for (const list of byLine.values()) {
    list.sort((p, q) => p.a - q.a);
    let cur = null;
    for (const p of list) {
      if (cur && Math.abs(p.a - cur.to) < 0.01) {
        cur.to = p.b; if (p.door != null) cur.doors.push(p.door); cur.rooms.push(p.A.item.name, p.B.item.name);
      } else {
        cur = { axis: p.axis, at: p.at, from: p.a, to: p.b, doors: p.door != null ? [p.door] : [], rooms: [p.A.item.name, p.B.item.name] };
        runs.push(cur);
      }
    }
  }
  return runs;
}

/* Floor finish in each room. */
export function floorFinishes(M, fl, storeyName) {
  const MAT = { tile: ["floorTile", "Floor tiles on screed bed", 0.012], carpet: ["carpet", "Carpet on underlay", 0.012], timber: ["floorTimber", "Engineered timber flooring", 0.014] };
  for (const c of fl.cells) {
    const [mat, profile, t] = MAT[c.item.finish] || MAT.timber;
    M.add({ sys: "interior", kind: "floor", name: `Floor — ${c.item.name}`, profile, mat, unit: "m2", host: `${c.item.name} · ${storeyName}`,
      a: [c.x + 0.005, fl.y + t / 2, c.z + c.l / 2], b: [c.x + c.w - 0.005, fl.y + t / 2, c.z + c.l / 2], d: t, w: c.l - 0.01, up: [0, 1, 0], code: `F${fl.level}-FL` });
  }
}

/* Straight stair flight with stringers, treads, risers and a balustrade. */
export function stairFlight(M, st, y0, type) {
  const steel = type === "steel_glass", concrete = type === "concrete";
  const host = "Stair";
  const run = st.risers * st.going;
  const x0 = st.x - st.width / 2, x1 = st.x + st.width / 2;
  const z0 = st.z0;
  const pitch = Math.atan2(st.f2f, run);
  if (concrete) {
    for (let i = 0; i < st.risers; i++) {
      const h = (i + 1) * st.riser;
      M.add({ sys: "interior", kind: "step", name: "Concrete step", profile: "In-situ concrete stair", mat: "concrete", unit: "ea", host,
        a: [x0, y0 + h / 2, z0 + (i + 0.5) * st.going], b: [x1, y0 + h / 2, z0 + (i + 0.5) * st.going], d: h, w: st.going, up: [0, 1, 0], code: "ST-C" });
    }
  } else {
    for (const x of [x0 + 0.02, x1 - 0.02]) {
      M.add({ sys: "interior", kind: "stringer", name: "Stair stringer", profile: steel ? "200 PFC stringer" : "290×42 stringer", mat: steel ? "steelPaint" : "timberStair", host,
        a: [x, y0 + 0.05, z0], b: [x, y0 + st.f2f + 0.05, z0 + run], d: 0.29, w: 0.042, up: [0, Math.cos(pitch), -Math.sin(pitch)], code: "ST-S" });
    }
    for (let i = 0; i < st.risers; i++) {
      const y = y0 + (i + 1) * st.riser;
      const z = z0 + i * st.going;
      M.add({ sys: "interior", kind: "tread", name: "Stair tread", profile: steel ? "40 mm timber tread" : "35 mm hardwood tread", mat: "timberStair", unit: "ea", host,
        a: [x0 + 0.042, y - 0.0175, z + st.going / 2 + 0.01], b: [x1 - 0.042, y - 0.0175, z + st.going / 2 + 0.01], d: 0.035, w: st.going + 0.02, up: [0, 1, 0], code: "ST-T" });
      if (!steel) {
        M.add({ sys: "interior", kind: "riser", name: "Stair riser", profile: "18 mm riser board", mat: "timberStair", host, noSchedule: true,
          a: [x0 + 0.042, y - st.riser / 2 - 0.0175, z + 0.009], b: [x1 - 0.042, y - st.riser / 2 - 0.0175, z + 0.009], d: st.riser - 0.035, w: 0.018, up: [0, 1, 0], code: "ST-R" });
      }
    }
  }
  // balustrade on the open (x0) side: posts, handrail, balusters or glass
  const railH = 0.9 + 0.1;
  const along = (f) => [x0 + 0.03, y0 + st.f2f * f + 0.04, z0 + run * f];
  for (const f of [0, 1]) {
    const p = along(f);
    M.add({ sys: "interior", kind: "post", name: "Newel post", profile: steel ? "50×50 SHS post" : "90×90 newel post", mat: steel ? "steelPaint" : "timberStair", unit: "ea", host,
      a: [p[0], p[1] - 0.04, p[2]], b: [p[0], p[1] + railH + 0.08, p[2]], d: steel ? 0.05 : 0.09, w: steel ? 0.05 : 0.09, up: [1, 0, 0], code: "ST-P" });
  }
  const r0 = along(0), r1 = along(1);
  M.add({ sys: "interior", kind: "handrail", name: "Handrail", profile: steel ? "50 mm stainless handrail" : "65×45 timber handrail", mat: steel ? "chrome" : "timberStair", host, shape: steel ? "cyl" : "box",
    a: [r0[0], r0[1] + railH, r0[2]], b: [r1[0], r1[1] + railH, r1[2]], d: 0.05, w: 0.05, up: [0, 1, 0], code: "ST-H" });
  if (steel) {
    M.add({ sys: "interior", kind: "glass", name: "Glass balustrade", profile: "12 mm toughened glass balustrade", mat: "glass", unit: "m2", host,
      a: [r0[0], r0[1] + railH / 2, r0[2]], b: [r1[0], r1[1] + railH / 2, r1[2]], d: railH - 0.1, w: 0.012, up: [0, 1, 0], code: "ST-G" });
  } else {
    const n = Math.max(2, Math.round(run / 0.12));
    for (let i = 1; i < n; i++) {
      const p = along(i / n);
      M.add({ sys: "interior", kind: "baluster", name: "Baluster", profile: "32×32 baluster", mat: "paintWhite", unit: "ea", host,
        a: [p[0], p[1], p[2]], b: [p[0], p[1] + railH - 0.03, p[2]], d: 0.032, w: 0.032, up: [1, 0, 0], code: "ST-B" });
    }
  }
}

/* Kitchen joinery along the longest wall of the kitchen cell, + island.
   Every piece runs along the bench; d = height, w = depth. */
export function kitchenFitout(M, cell, y0, k) {
  const host = cell.item.name;
  const alongX = cell.w >= cell.l;
  const run = Math.min((alongX ? cell.w : cell.l) - 0.1, Math.max(2.4, +k.benchLengthM || 3));
  const c0 = alongX ? cell.x + 0.05 : cell.z + 0.05;
  // u along the bench, t out from the back wall
  const P = (u, y, t) => (alongX ? [c0 + u, y, cell.z + 0.05 + t] : [cell.x + 0.05 + t, y, c0 + u]);
  const piece = (kind, name, profile, mat, u0, u1, yc, tc, h, depth, extra = {}) =>
    M.add({ sys: "interior", host, kind, name, profile, mat, a: P(u0, yc, tc), b: P(u1, yc, tc), d: h, w: depth, up: [0, 1, 0], ...extra });
  piece("cabinet", "Base cabinets", "Base cabinets 870 high", "joinery", 0, run, y0 + 0.435, 0.29, 0.87, 0.58, { code: "K-BC" });
  piece("benchtop", "Benchtop", "20 mm engineered stone benchtop", "stone", -0.01, run + 0.01, y0 + 0.88, 0.31, 0.02, 0.62, { code: "K-BT" });
  piece("cabinet", "Overhead cabinets", "Overhead cabinets 700 high", "joinery", 0, run, y0 + 1.85, 0.175, 0.7, 0.35, { code: "K-OC" });
  piece("sink", "Kitchen sink", "Stainless double-bowl sink + mixer", "chrome", run * 0.35 - 0.4, run * 0.35 + 0.4, y0 + 0.885, 0.3, 0.012, 0.44, { unit: "ea", code: "K-SK" });
  piece("cooktop", "Cooktop", "900 mm cooktop + oven + rangehood", "black", run * 0.72 - 0.45, run * 0.72 + 0.45, y0 + 0.895, 0.3, 0.008, 0.5, { unit: "ea", code: "K-CT" });
  piece("rangehood", "Rangehood", "900 mm rangehood", "chrome", run * 0.72 - 0.45, run * 0.72 + 0.45, y0 + 1.6, 0.25, 0.12, 0.5, { noSchedule: true, code: "K-RH" });
  if (k.island) {
    const len = Math.min(run * 0.6, 3.0), mid = run / 2;
    piece("island", "Island bench", "Island bench with 40 mm stone top", "joinery", mid - len / 2, mid + len / 2, y0 + 0.45, 1.75, 0.9, 0.9, { unit: "ea", code: "K-IS" });
    piece("benchtop", "Island top", "40 mm engineered stone benchtop", "stone", mid - len / 2 - 0.02, mid + len / 2 + 0.02, y0 + 0.92, 1.75, 0.04, 1.0, { noSchedule: true, code: "K-IT" });
  }
}

/* Bathroom: vanity, WC, shower base + screen, bath where it fits. */
export function bathroomFitout(M, cell, y0) {
  const host = `${cell.item.name}`;
  const base = { sys: "interior", host };
  const x0 = cell.x + 0.06, z0 = cell.z + 0.06, x1 = cell.x + cell.w - 0.06, z1 = cell.z + cell.l - 0.06;
  M.add({ ...base, kind: "vanity", name: "Vanity", profile: "900 mm wall-hung vanity + basin + mixer", mat: "joinery", unit: "ea", a: [x0, y0 + 0.65, z0 + 0.25], b: [x0 + 0.9, y0 + 0.65, z0 + 0.25], d: 0.45, w: 0.5, up: [0, 1, 0], code: "B-VA" });
  M.add({ ...base, kind: "mirror", name: "Mirror", profile: "Mirror", mat: "mirror", noSchedule: true, a: [x0 + 0.05, y0 + 1.4, z0 + 0.01], b: [x0 + 0.85, y0 + 1.4, z0 + 0.01], d: 0.8, w: 0.006, up: [0, 1, 0], code: "B-MI" });
  M.add({ ...base, kind: "wc", name: "Toilet suite", profile: "Back-to-wall toilet suite", mat: "ceramic", unit: "ea", a: [x1 - 0.2, y0 + 0.2, z0], b: [x1 - 0.2, y0 + 0.2, z0 + 0.65], d: 0.4, w: 0.38, up: [0, 1, 0], code: "B-WC" });
  // shower in the far corner
  const sw = Math.min(1.0, cell.w * 0.45), sl = Math.min(1.0, cell.l * 0.45);
  M.add({ ...base, kind: "shower", name: "Shower base", profile: "Tiled shower recess, waterproofed", mat: "floorTile", unit: "ea", a: [x0, y0 + 0.02, z1 - sl / 2], b: [x0 + sw, y0 + 0.02, z1 - sl / 2], d: 0.04, w: sl, up: [0, 1, 0], code: "B-SH" });
  M.add({ ...base, kind: "screen", name: "Shower screen", profile: "Semi-frameless shower screen", mat: "glass", unit: "ea", a: [x0 + sw, y0 + 1.0, z1 - sl], b: [x0 + sw, y0 + 1.0, z1], d: 2.0 - 0.04, w: 0.01, up: [0, 1, 0], code: "B-SS" });
  M.add({ ...base, kind: "screen", name: "Shower screen", profile: "Semi-frameless shower screen", mat: "glass", noSchedule: true, a: [x0, y0 + 1.0, z1 - sl], b: [x0 + sw, y0 + 1.0, z1 - sl], d: 2.0 - 0.04, w: 0.01, up: [0, 1, 0], code: "B-SS" });
  if (cell.w * cell.l > 7) {
    M.add({ ...base, kind: "bath", name: "Bath", profile: "1675 mm acrylic bath", mat: "ceramic", unit: "ea", a: [x1 - 1.675, y0 + 0.25, z1 - 0.38], b: [x1, y0 + 0.25, z1 - 0.38], d: 0.5, w: 0.75, up: [0, 1, 0], code: "B-BA" });
  }
}

export { wallPt };
