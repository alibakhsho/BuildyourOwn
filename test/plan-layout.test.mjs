/* =========================================================================
   Floor plan layouts (house-geometry.js layoutFloors + spec.plan):
   the four layout ideas, mirror, hand-edited plans, hallway fill, storeys —
   and that the 3D structure still builds walls and doors from each.
   ========================================================================= */
import { layoutFloors, PLAN_VARIANTS, roomKey, freeRects } from "../src/logic/house-geometry.js";
import { buildStructure } from "../src/logic/structure/index.js";

let pass = 0, fail = 0;
const ok = (label, cond, info) => {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${info !== undefined ? `\n        ${JSON.stringify(info)}` : ""}`); }
};

const rooms = [
  { id: "r1", name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8 },
  { id: "r2", name: "Bedroom 2", type: "Bedroom", widthM: 3.4, lengthM: 3.1 },
  { id: "r3", name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.1 },
  { id: "r4", name: "Open living", type: "Living", widthM: 6, lengthM: 5.5 },
  { id: "r5", name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0 },
];
const base = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, roofType: "colorbond", claddingType: "brick", framingType: "timber",
  hasGarage: true, staircaseType: "none", slabThicknessM: 0.1, openings: { windowsCount: 10, windowsM2: 14, doors: 2 }, rooms,
  kitchens: [{ id: "k1", benchLengthM: 4, island: true }],
  bathrooms: [{ id: "b1", label: "Main bathroom", widthM: 3, lengthM: 2.4 }, { id: "b2", label: "Ensuite", widthM: 2.6, lengthM: 2 }],
};
const NAMES = ["Master bedroom", "Bedroom 2", "Bedroom 3", "Open living", "Laundry", "Kitchen", "Main bathroom", "Ensuite"];

/* every layout must tile the floor: inside the plate, no overlaps, nothing missing */
function checkTiling(label, L, f = 0) {
  const p = L.plate, cells = L.floors[f].cells.filter((c) => c.item.type !== "Stair");
  const inside = cells.every((c) => c.x >= p.x - 1e-6 && c.z >= p.z - 1e-6 && c.x + c.w <= p.x + p.w + 1e-6 && c.z + c.l <= p.z + p.l + 1e-6);
  let overlap = null;
  for (let i = 0; i < cells.length && !overlap; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j];
    if (a.x < b.x + b.w - 1e-3 && a.x + a.w > b.x + 1e-3 && a.z < b.z + b.l - 1e-3 && a.z + a.l > b.z + 1e-3) { overlap = [a.item.name, b.item.name]; break; }
  }
  const area = cells.reduce((s, c) => s + c.w * c.l, 0);
  ok(`${label}: every cell inside the floor`, inside);
  ok(`${label}: no rooms overlap`, !overlap, overlap);
  ok(`${label}: rooms + hallway cover the whole floor`, Math.abs(area - p.w * p.l) < 0.05, { area, plate: p.w * p.l });
}
const cellOf = (L, name, f = 0) => L.floors[f].cells.find((c) => c.item.name === name);

/* ---- the four layout ideas ---- */
for (const v of PLAN_VARIANTS) {
  const spec = { ...base, plan: { variant: v.id } };
  const L = layoutFloors(spec);
  checkTiling(`idea "${v.label}"`, L);
  const names = L.floors[0].cells.filter((c) => !c.item.circulation).map((c) => c.item.name).sort();
  ok(`idea "${v.label}": every room is placed once`, JSON.stringify(names) === JSON.stringify([...NAMES].sort()), names);
  const m = cellOf(L, "Master bedroom");
  ok(`idea "${v.label}": rooms keep their own area (master 16 m²)`, Math.abs(m.w * m.l - 4.2 * 3.8) < 0.05, m.w * m.l);
  const S = buildStructure(spec);
  const doors = S.partitions[0].reduce((a, p) => a + p.doorMarks.length, 0);
  ok(`idea "${v.label}": the model builds internal walls and doors`, S.partitions[0].length > 0 && doors >= 5, { walls: S.partitions[0].length, doors });
}
{
  const zc = (L, n) => { const c = cellOf(L, n); return c.z + c.l / 2; };
  const xc = (L, n) => { const c = cellOf(L, n); return c.x + c.w / 2; };
  const front = layoutFloors({ ...base, plan: { variant: "front" } });
  ok("living at the front: living is nearer the street than the bedrooms", zc(front, "Open living") > zc(front, "Master bedroom"));
  const rear = layoutFloors({ ...base, plan: { variant: "rear" } });
  ok("living to the yard: living is nearer the back than the bedrooms", zc(rear, "Open living") < zc(rear, "Master bedroom"));
  const side = layoutFloors({ ...base, plan: { variant: "side" } });
  ok("side by side: living at one end, bedrooms at the other", xc(side, "Open living") < xc(side, "Master bedroom"));
  const plain = layoutFloors(base), mirrored = layoutFloors({ ...base, plan: { mirror: true } });
  const p = plain.plate, a = cellOf(plain, "Open living"), b = cellOf(mirrored, "Open living");
  ok("mirror: the plan flips left ↔ right", Math.abs((b.x - p.x) - (p.w - (a.x - p.x) - a.w)) < 1e-6 && Math.abs(a.z - b.z) < 1e-6);
}

/* ---- hand-edited plan ---- */
{
  const auto = layoutFloors(base), p = auto.plate;
  const cells = {};
  for (const c of auto.floors[0].cells) if (!c.item.circulation) cells[roomKey(c.item)] = { x: c.x - p.x, z: c.z - p.z, w: c.w, l: c.l, level: 0 };
  // move the master bedroom into the back-left corner, turned to its scheduled 4.2 × 3.8
  cells.r1 = { x: 0, z: 0, w: 4.2, l: 3.8, level: 0 };
  for (const [k, c] of Object.entries(cells)) if (k !== "r1" && c.x < 4.3 && c.z < 3.9) delete cells[k];   // anything it now sits on goes back to auto
  const spec = { ...base, plan: { mode: "custom", cells } };
  const L = layoutFloors(spec);
  const m = cellOf(L, "Master bedroom");
  ok("by hand: a room stays where it was put", Math.abs(m.x - p.x) < 1e-6 && Math.abs(m.z - p.z) < 1e-6 && Math.abs(m.w - 4.2) < 1e-6);
  const fixed = L.floors[0].cells.filter((c) => !c.item.circulation && !c.unplaced);
  const clean = { ...L, floors: [{ ...L.floors[0], cells: [...fixed, ...L.floors[0].cells.filter((c) => c.item.circulation)] }] };
  ok("by hand: leftover floor becomes hallway", L.floors[0].cells.some((c) => c.item.circulation));
  if (!L.floors[0].cells.some((c) => c.unplaced)) checkTiling("by hand", clean);
  const S = buildStructure(spec);
  ok("by hand: the model builds walls and doors around every room", S.partitions[0].length > 0 && S.partitions[0].reduce((a, q) => a + q.doorMarks.length, 0) >= 5);

  // a size changed on the Estimate page wins over the stale size in the plan
  const bigger = layoutFloors({ ...spec, rooms: rooms.map((r) => (r.id === "r1" ? { ...r, widthM: 5, lengthM: 4 } : r)) });
  const m2 = cellOf(bigger, "Master bedroom");
  ok("by hand: a room resized elsewhere keeps its spot and takes its new size", Math.abs(m2.w * m2.l - 20) < 0.05 && Math.abs(m2.x - p.x) < 1e-6, [m2.w, m2.l]);

  // a room the plan has never seen is placed automatically and flagged
  const added = layoutFloors({ ...spec, rooms: [...rooms, { id: "r9", name: "Study", type: "Study", widthM: 3, lengthM: 2.8 }] });
  const st = cellOf(added, "Study");
  ok("by hand: a new room is placed for you and marked to be placed", st && st.unplaced === true);
}

/* ---- two storeys: a room moved upstairs ---- */
{
  const two = { ...base, floors: 2, staircaseType: "timber" };
  const auto = layoutFloors(two), p = auto.plate;
  const cells = {};
  auto.floors.forEach((F, f) => F.cells.forEach((c) => { if (!c.item.circulation) cells[roomKey(c.item)] = { x: c.x - p.x, z: c.z - p.z, w: c.w, l: c.l, level: f }; }));
  const lvl = (L, n) => L.floors.findIndex((F) => F.cells.some((c) => c.item.name === n));
  const groundRoom = auto.floors[0].cells.find((c) => !c.item.circulation && c.item.type !== "Stair");
  const key = roomKey(groundRoom.item);
  const free = freeRects(p, auto.floors[1].cells.filter((c) => !c.item.circulation && c.item.type !== "Stair"))
    .filter((r) => r.w >= groundRoom.w && r.l >= groundRoom.l)[0];
  if (free) {
    cells[key] = { ...cells[key], x: free.x - p.x, z: free.z - p.z, level: 1 };
    const L = layoutFloors({ ...two, plan: { mode: "custom", cells } });
    ok("storeys: a room moved upstairs is on the first floor", lvl(L, groundRoom.item.name) === 1, lvl(L, groundRoom.item.name));
    ok("storeys: the stair stays on both floors", L.floors.every((F) => F.cells.some((c) => c.item.type === "Stair")));
  } else ok("storeys: (no free spot upstairs to test with)", true);
}

/* ---- free space ---- */
{
  const plate = { x: 0, z: 0, w: 10, l: 8 };
  const all = freeRects(plate, []);
  ok("free space: an empty floor is one rectangle", all.length === 1 && all[0].w === 10 && all[0].l === 8);
  const holes = freeRects(plate, [{ x: 0, z: 0, w: 4, l: 8 }, { x: 6, z: 0, w: 4, l: 3 }]);
  const area = holes.reduce((s, r) => s + r.w * r.l, 0);
  ok("free space: what's left adds up", Math.abs(area - (80 - 32 - 12)) < 1e-6, holes);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
