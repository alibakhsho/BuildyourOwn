/* =========================================================================
   MODULE: house-geometry.js
   Pure, three.js-free geometry for the residential 3D model. Everything the
   viewport draws is derived here from the SAME spec fields the estimator
   prices, so the model and the quote can't drift apart:

     - windows: exactly openings.windowsCount, total glazed area = windowsM2
     - external doors: exactly openings.doors, 2.0 m² each (the estimator's
       allowance), so cladding area == takeoff.netWallAreaM2
     - slab: widthM × lengthM at slabThicknessM
     - rooms / bathrooms / kitchens: true areas, assigned to storeys
     - solar: a 6.6 kW array is 16 real-size panels, on one roof plane

   Headless tests live in test/house-geometry.test.mjs.
   ========================================================================= */

/* Australian residential defaults (NCC / AS 1684 / typical builder spec) */
export const STD = {
  eave: 0.45,              // 450 mm eave overhang
  doorH: 2.04,             // 2040 mm door height
  doorAllowanceM2: 2.0,    // matches estimator: openings.doors * 2.0
  windowHead: 2.1,         // standard head height above FFL
  minSill: 0.3,
  endMargin: 0.35,         // min wall return beside an opening at a corner
  gap: 0.25,               // min pier between two openings
  studSpacing: 0.6,        // 600 mm stud centres
  trussSpacing: 0.9,       // 900 mm truss centres
  floorZoneM: 0.26,        // 240 joist + 19 flooring between storeys (structure/foundation.js)
  wallThk: 0.11,           // 90 frame + cladding allowance (drawn)
  partThk: 0.09,
  stairWidth: 1.0,         // NCC min clear 1000
  stairGoing: 0.25,
  maxRiser: 0.19,
  garage: { w: 6.0, l: 6.0, h: 2.7, doorW: 4.8, doorH: 2.1 },
  panel: { a: 1.722, b: 1.134, watts: 415 }, // 415 W module
  solarSystemW: 6600,      // materials.js: "Solar PV 6.6kW + inverter"
};

import { buildUp } from "./structure/standards.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Core envelope dims, in metres. Ground floor FFL sits a little above
   natural ground (slab edge is visible), never less than the slab itself. */
export function envelope(spec) {
  const w = Math.max(1, +spec.widthM || 0);
  const l = Math.max(1, +spec.lengthM || 0);
  const floors = Math.max(1, Math.round(+spec.floors || 1));
  const wallH = Math.max(2.1, +spec.wallHeightM || 2.4);
  const slabThk = Math.max(0.08, +spec.slabThicknessM || 0.1);
  const ffl = Math.max(0.15, slabThk);
  const zone = floors > 1 ? STD.floorZoneM : 0;
  // storey f's floor level
  const levelY = (f) => ffl + f * (wallH + STD.floorZoneM);
  const totalH = floors * wallH + (floors - 1) * zone;
  return { w, l, floors, wallH, slabThk, ffl, levelY, totalH, plateY: ffl + totalH };
}

/* Gable roof running along the length (ridge parallel to z). */
export function roofGeometry(spec) {
  const { w, l, plateY } = envelope(spec);
  const pitchDeg = clamp(+spec.roofPitch || 0, 0, 60);
  const pitch = (pitchDeg * Math.PI) / 180;
  const halfSpan = w / 2 + STD.eave;           // eave line to ridge, plan
  const ridgeH = (w / 2) * Math.tan(pitch);    // ridge above wall plate
  const slopeLen = halfSpan / Math.cos(pitch); // eave to ridge, on the slope
  const eaveDrop = STD.eave * Math.tan(pitch); // eave sits below plate
  return {
    pitch, pitchDeg, halfSpan, ridgeH, slopeLen, eaveDrop,
    lengthWithEaves: l + 2 * STD.eave,
    plateY, ridgeY: plateY + ridgeH,
    // plan area of the roof on the slope, matches estimator when eave = 0
    slopedAreaNoEaves: (w * l) / Math.max(0.5, Math.cos(pitch)),
  };
}

/* The four walls, in a consistent frame. u runs along the wall from its
   start corner; `at` maps (u) -> plan (x,z) on the outer face.
   front = +z (street), back = -z, left = -x, right = +x. */
export function walls(spec) {
  const { w, l } = envelope(spec);
  return [
    { side: "front", len: w, at: (u) => [-w / 2 + u, l / 2], normal: [0, 1] },
    { side: "back",  len: w, at: (u) => [w / 2 - u, -l / 2], normal: [0, -1] },
    { side: "left",  len: l, at: (u) => [-w / 2, -l / 2 + u], normal: [-1, 0] },
    { side: "right", len: l, at: (u) => [w / 2, l / 2 - u], normal: [1, 0] },
  ];
}

/* Blocked stretches of a wall on a storey (garage abutting the left wall). */
function blockedOn(spec, side, floor) {
  if (!spec.hasGarage || floor !== 0 || side !== "left") return [];
  const { l } = envelope(spec);
  // left wall u runs -z -> +z, garage is flush with the front (u = l)
  return [[Math.max(0, l - STD.garage.l), l]];
}

function freeIntervals(len, blocked, margin) {
  let iv = [[margin, len - margin]];
  for (const [b0, b1] of blocked) {
    const next = [];
    for (const [a0, a1] of iv) {
      if (b1 <= a0 || b0 >= a1) { next.push([a0, a1]); continue; }
      if (b0 - STD.gap > a0) next.push([a0, b0 - STD.gap]);
      if (b1 + STD.gap < a1) next.push([b1 + STD.gap, a1]);
    }
    iv = next;
  }
  return iv.filter(([a, b]) => b - a > 0.2);
}

/* Window size from the estimator's count + total area. Aspect ~1.25 wide,
   head at 2.1 m, never taller than the storey allows. */
export function windowSize(spec) {
  const o = spec.openings || {};
  const n = Math.max(0, Math.round(+o.windowsCount || 0));
  const area = Math.max(0, +o.windowsM2 || 0);
  if (!n || !area) return null;
  const { wallH } = envelope(spec);
  const each = area / n;
  const head = Math.min(STD.windowHead, wallH - 0.25);
  let h = clamp(Math.sqrt(each / 1.25), 0.5, head - STD.minSill);
  let wd = each / h;
  return { w: wd, h, sill: head - h, head, areaEach: each };
}

/* Every external opening, positioned. Returns
   [{ kind:'door'|'window', side, floor, u, w, h, sill }]
   u = centre along the wall (see walls()). */
export function placeOpenings(spec) {
  const o = spec.openings || {};
  const { floors } = envelope(spec);
  const W = walls(spec);
  const out = [];

  /* Doors — ground floor. Entry on the front, second at the rear, then
     alternate sides. Width chosen so each door is exactly the estimator's
     2.0 m² allowance (leaf + frame). */
  const nDoors = Math.max(0, Math.round(+o.doors || 0));
  const doorW = STD.doorAllowanceM2 / STD.doorH;
  const doorSides = ["front", "back", "right", "left"];
  const doorsBySide = {};
  for (let i = 0; i < nDoors; i++) {
    const s = doorSides[i % doorSides.length];
    (doorsBySide[s] = doorsBySide[s] || []).push(i);
  }
  for (const wall of W) {
    const list = doorsBySide[wall.side] || [];
    if (!list.length) continue;
    const iv = freeIntervals(wall.len, blockedOn(spec, wall.side, 0), STD.endMargin + doorW / 2);
    // spread doors across the free length; front entry sits off-centre like a real plan
    const span = iv.length ? iv : [[wall.len / 2, wall.len / 2]];
    const total = span.reduce((a, [p, q]) => a + (q - p), 0) || 1;
    list.forEach((_, k) => {
      let t = (k + (wall.side === "front" ? 0.62 : 0.5)) / list.length * total;
      let u = span[0][0];
      for (const [p, q] of span) { if (t <= q - p) { u = p + t; break; } t -= q - p; }
      out.push({ kind: "door", side: wall.side, floor: 0, u, w: doorW, h: STD.doorH, sill: 0 });
    });
  }

  /* Windows — distribute across every (storey, wall) slot by free length,
     largest-remainder so the count is exact. */
  const ws = windowSize(spec);
  const nWin = Math.max(0, Math.round(+o.windowsCount || 0));
  if (ws && nWin) {
    const slots = [];
    for (let f = 0; f < floors; f++) {
      for (const wall of W) {
        const doorBlocks = out.filter((d) => d.side === wall.side && d.floor === f)
          .map((d) => [d.u - d.w / 2, d.u + d.w / 2]);
        const iv = freeIntervals(wall.len, [...blockedOn(spec, wall.side, f), ...doorBlocks], STD.endMargin);
        const free = iv.reduce((a, [p, q]) => a + (q - p), 0);
        slots.push({ f, wall, iv, free, cap: iv.reduce((a, [p, q]) => a + Math.max(0, Math.floor((q - p + STD.gap) / (ws.w + STD.gap))), 0) });
      }
    }
    const totalFree = slots.reduce((a, s) => a + s.free, 0) || 1;
    slots.forEach((s) => { s.ideal = (nWin * s.free) / totalFree; s.k = Math.min(s.cap, Math.floor(s.ideal)); });
    let left = nWin - slots.reduce((a, s) => a + s.k, 0);
    // hand out the remainder by largest fractional part, respecting capacity
    while (left > 0) {
      const cand = slots.filter((s) => s.k < s.cap).sort((a, b) => (b.ideal - b.k) - (a.ideal - a.k));
      if (!cand.length) break;
      cand[0].k++; left--;
    }
    // over capacity (too much glass for the walls): put leftovers on the longest slots anyway
    while (left > 0) { slots.sort((a, b) => b.free - a.free)[0].k++; left--; }

    for (const s of slots) {
      if (!s.k) continue;
      // split this slot's k windows across its free intervals by length
      const lens = s.iv.map(([p, q]) => q - p);
      const tot = lens.reduce((a, b) => a + b, 0) || 1;
      let ks = lens.map((L) => Math.floor((s.k * L) / tot));
      let rem = s.k - ks.reduce((a, b) => a + b, 0);
      const order = lens.map((L, i) => [((s.k * L) / tot) - ks[i], i]).sort((a, b) => b[0] - a[0]);
      for (let j = 0; rem > 0; j = (j + 1) % order.length, rem--) ks[order[j][1]]++;
      s.iv.forEach(([p, q], i) => {
        const k = ks[i];
        for (let j = 0; j < k; j++) {
          const u = p + ((q - p) * (j + 0.5)) / k;
          out.push({ kind: "window", side: s.wall.side, floor: s.f, u, w: ws.w, h: ws.h, sill: ws.sill });
        }
      });
    }
  }
  return out;
}

/* Cladding panels for one wall/storey: the wall rectangle (len × height)
   minus its openings. Returns [{u0,u1,y0,y1}] in wall-local coords. */
export function wallPanels(len, height, openings) {
  const ops = [...openings]
    .map((o) => ({ u0: Math.max(0, o.u - o.w / 2), u1: Math.min(len, o.u + o.w / 2), y0: o.sill, y1: Math.min(height, o.sill + o.h) }))
    .sort((a, b) => a.u0 - b.u0);
  const out = [];
  let cur = 0;
  for (const o of ops) {
    if (o.u0 > cur + 1e-6) out.push({ u0: cur, u1: o.u0, y0: 0, y1: height });
    const a = Math.max(cur, o.u0);
    if (o.u1 > a + 1e-6) {
      if (o.y0 > 1e-6) out.push({ u0: a, u1: o.u1, y0: 0, y1: o.y0 });
      if (height - o.y1 > 1e-6) out.push({ u0: a, u1: o.u1, y0: o.y1, y1: height });
    }
    cur = Math.max(cur, o.u1);
  }
  if (len - cur > 1e-6) out.push({ u0: cur, u1: len, y0: 0, y1: height });
  return out;
}

/* ---- Rooms ---------------------------------------------------------- */

const GROUND_TYPES = new Set(["Living", "Dining", "Kitchen", "Laundry", "Media", "Study", "Other", "Hallway"]);

/* Everything that occupies floor area, normalised to one shape. Bathrooms
   and kitchens live in their own spec arrays but take up real space. */
export function spaceSchedule(spec) {
  const items = [];
  for (const r of spec.rooms || []) {
    const a = (+r.widthM || 0) * (+r.lengthM || 0);
    if (a > 0) items.push({ id: r.id, name: r.name || r.type, type: r.type || "Other", w: +r.widthM, l: +r.lengthM, area: a, finish: r.floorFinish || "timber", src: r });
  }
  (spec.bathrooms || []).forEach((b, i) => {
    const a = (+b.widthM || 0) * (+b.lengthM || 0);
    if (a > 0) items.push({ id: b.id, name: b.label || `Bathroom ${i + 1}`, type: "Bathroom", w: +b.widthM, l: +b.lengthM, area: a, finish: "tile", src: b, ensuite: /ensuite/i.test(b.label || "") });
  });
  (spec.kitchens || []).forEach((k, i) => {
    // kitchen footprint from its bench run: ~1.8 m² per bench metre, + island zone
    const bench = Math.max(2, +k.benchLengthM || 0);
    const a = bench * 1.8 + (k.island ? 3 : 0);
    const kw = clamp(bench * 0.6, 2.4, 5);
    items.push({ id: k.id, name: (spec.kitchens.length > 1 ? `Kitchen ${i + 1}` : "Kitchen"), type: "Kitchen", w: kw, l: a / kw, area: a, finish: "tile", src: k });
  });
  return items;
}

/* Straight stair flight sized from the actual floor-to-floor height. */
export function stairGeometry(spec) {
  const { wallH } = envelope(spec);
  const f2f = wallH + STD.floorZoneM;
  const risers = Math.ceil(f2f / STD.maxRiser);
  const riser = f2f / risers;
  const run = (risers - 1) * STD.stairGoing;
  return { risers, riser, going: STD.stairGoing, run, width: STD.stairWidth, f2f };
}

/* Squarified treemap (Bruls et al.) — keeps cells as close to square as the
   areas allow, which reads far more like a real plan than slice-and-dice. */
function squarify(items, rect) {
  const out = [];
  const total = items.reduce((a, it) => a + it.area, 0);
  if (!items.length || total <= 0) return out;
  const scale = (rect.w * rect.l) / total;
  const queue = [...items].sort((a, b) => b.area - a.area).map((it) => ({ it, a: it.area * scale }));
  let { x, z, w, l } = rect;
  const worst = (row, side) => {
    const s = row.reduce((a, r) => a + r.a, 0);
    const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  let row = [];
  const layoutRow = () => {
    const s = row.reduce((a, r) => a + r.a, 0);
    if (w >= l) { // lay the row as a column on the left
      const cw = s / l; let cz = z;
      for (const r of row) { const ch = r.a / cw; out.push({ x, z: cz, w: cw, l: ch, item: r.it }); cz += ch; }
      x += cw; w -= cw;
    } else {      // as a row along the top
      const ch = s / w; let cx = x;
      for (const r of row) { const cw = r.a / ch; out.push({ x: cx, z, w: cw, l: ch, item: r.it }); cx += cw; }
      z += ch; l -= ch;
    }
    row = [];
  };
  while (queue.length) {
    const side = Math.min(w, l);
    const next = queue[0];
    if (!row.length || worst([...row, next], side) <= worst(row, side)) { row.push(queue.shift()); }
    else layoutRow();
  }
  if (row.length) layoutRow();
  return out;
}

/* Assign spaces to storeys and lay each storey out inside the envelope.
   Rooms keep their scheduled area: leftover floor becomes hallway /
   circulation. Only when the schedule genuinely exceeds the floor plate are
   rooms shrunk, and `fit` reports by how much. Coordinates are plan metres,
   building centred on the origin. */
export function layoutFloors(spec) {
  const env = envelope(spec);
  // rooms start at the inside face of the plasterboard: cladding + cavity +
  // frame + lining (brick veneer ≈ 250 mm)
  const t = buildUp(spec).total;
  const items = spaceSchedule(spec);
  const hasStair = env.floors > 1;
  const st = hasStair ? stairGeometry(spec) : null;

  // interior rect, minus a stair + landing strip along the right wall
  const inner = { x: -env.w / 2 + t, z: -env.l / 2 + t, w: env.w - 2 * t, l: env.l - 2 * t };
  const stairStrip = hasStair ? Math.min(st.width + STD.partThk, inner.w * 0.3) : 0;
  const plate = { x: inner.x, z: inner.z, w: inner.w - stairStrip, l: inner.l };
  const plateArea = plate.w * plate.l;

  // explicit coordinates (e.g. from a plan reader) win: x/z = metres from the
  // interior's back-left corner, optional `level`
  const explicit = (spec.rooms || []).length > 0 && (spec.rooms || []).every((r) => Number.isFinite(+r.x) && Number.isFinite(+r.z));

  const perFloor = Array.from({ length: env.floors }, () => []);
  if (explicit) {
    for (const it of items) {
      const r = it.src;
      if (!Number.isFinite(+r.x)) continue;
      perFloor[clamp(Math.round(+r.level || 0), 0, env.floors - 1)].push({ ...it, fixed: { x: inner.x + +r.x, z: inner.z + +r.z, w: it.w, l: it.l } });
    }
  } else if (env.floors === 1) {
    perFloor[0].push(...items);
  } else {
    // typical AU two-storey: living zones down, sleeping zones up
    const up = [], down = [];
    let bathsDown = 0;
    for (const it of items) {
      if (GROUND_TYPES.has(it.type)) down.push(it);
      else if (it.type === "Bathroom" && !it.ensuite && bathsDown === 0 && items.filter((x) => x.type === "Bathroom").length > 1) { down.push(it); bathsDown++; }
      else up.push(it);
    }
    perFloor[0].push(...down);
    up.forEach((it, i) => perFloor[1 + (i % (env.floors - 1))].push(it));
    // rebalance: move the smallest item off any overfull storey to the emptiest one
    for (let guard = 0; guard < 50; guard++) {
      const sums = perFloor.map((fl) => fl.reduce((a, x) => a + x.area, 0));
      const over = sums.findIndex((s) => s > plateArea);
      if (over < 0) break;
      const target = sums.indexOf(Math.min(...sums));
      if (target === over) break;
      const fl = perFloor[over];
      const smallest = fl.reduce((m, x, i) => (x.area < fl[m].area ? i : m), 0);
      if (sums[target] + fl[smallest].area > plateArea) break;
      perFloor[target].push(fl.splice(smallest, 1)[0]);
    }
  }

  const floorsOut = perFloor.map((list, f) => {
    let cells, fit = 1, scheduled = list.reduce((a, x) => a + x.area, 0);
    if (explicit) {
      cells = list.map((it) => ({ ...it.fixed, item: it }));
    } else {
      let work = list;
      if (scheduled < plateArea - 0.5) {
        work = [...list, { id: `hall-${f}`, name: f === 0 ? "Hallway / circulation" : "Landing / hall", type: "Hallway", area: plateArea - scheduled, finish: "timber", circulation: true }];
      } else if (scheduled > plateArea) {
        fit = plateArea / scheduled;
      }
      cells = squarify(work, plate);
    }
    if (hasStair) {
      cells.push({ x: plate.x + plate.w, z: plate.z, w: stairStrip, l: plate.l, item: { id: `stair-${f}`, name: "Stair", type: "Stair", area: stairStrip * plate.l, finish: "timber", circulation: true } });
    }
    return { level: f, y: env.levelY(f), cells, scheduledM2: scheduled, plateM2: plateArea, fit };
  });

  return { floors: floorsOut, stair: hasStair ? { ...st, x: plate.x + plate.w + stairStrip / 2, z0: plate.z + 0.3 } : null, inner, plate };
}

/* ---- Solar ----------------------------------------------------------- */

/* Panels on the +x roof plane (treated as north-facing). Positions are in
   slope coordinates: s = distance up-slope from the eave, t = along ridge
   (centred). Landscape modules, 20 mm gaps, 300 mm edge clearance. */
export function solarLayout(spec) {
  if (!spec.solar) return { panels: [], kw: 0, fitted: 0, wanted: 0 };
  const r = roofGeometry(spec);
  const P = STD.panel, gap = 0.02, edge = 0.3;
  const wanted = Math.ceil(STD.solarSystemW / P.watts);
  const usableS = r.slopeLen - 2 * edge;
  const usableT = r.lengthWithEaves - 2 * edge;
  const fitOn = (along, up) => ({ cols: Math.max(0, Math.floor((usableT + gap) / (along + gap))), rows: Math.max(0, Math.floor((usableS + gap) / (up + gap))) });
  // prefer landscape (long side along the ridge), fall back to portrait
  let o = { along: P.a, up: P.b, ...fitOn(P.a, P.b) };
  const p = { along: P.b, up: P.a, ...fitOn(P.b, P.a) };
  if (p.cols * p.rows > o.cols * o.rows) o = p;
  const panels = [];
  const perPlane = o.cols * o.rows;
  const planes = [1, -1]; // +x first, then spill onto -x
  for (const side of planes) {
    let n = Math.min(perPlane, wanted - panels.length);
    if (n <= 0) break;
    const rows = Math.ceil(n / o.cols);
    for (let rI = 0; rI < rows; rI++) {
      const inRow = Math.min(o.cols, n - rI * o.cols);
      const rowW = inRow * o.along + (inRow - 1) * gap;
      for (let c = 0; c < inRow; c++) {
        panels.push({ side, s: edge + o.up / 2 + rI * (o.up + gap), t: -rowW / 2 + o.along / 2 + c * (o.along + gap), along: o.along, up: o.up });
      }
    }
  }
  return { panels, kw: (panels.length * P.watts) / 1000, fitted: panels.length, wanted };
}
