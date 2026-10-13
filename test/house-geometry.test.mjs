/* The 3D model must agree with the estimate. These checks pin the geometry
   the viewport draws to the takeoff the quote is priced from. */
import { envelope, roofGeometry, placeOpenings, wallPanels, walls, layoutFloors,
         solarLayout, stairGeometry, windowSize, STD } from "../src/logic/house-geometry.js";
import { Estimator } from "../src/logic/estimator.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const base = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", floorFinish: "timber",
  hasGarage: true, solar: true, staircaseType: "none",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [
    { id: 1, name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8, floorFinish: "carpet" },
    { id: 2, name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet" },
    { id: 3, name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet" },
    { id: 4, name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber" },
    { id: 5, name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile" },
  ],
  kitchens: [{ id: 6, benchLengthM: 7, island: true }],
  bathrooms: [
    { id: 7, label: "Main bathroom", widthM: 3.0, lengthM: 2.4 },
    { id: 8, label: "Ensuite", widthM: 2.6, lengthM: 2.0 },
  ],
};

const takeoff = (spec) => Estimator.takeoff(spec);

/* ---- openings match the estimate exactly ---- */
for (const [label, spec] of [
  ["default", base],
  ["two-storey", { ...base, floors: 2, staircaseType: "timber" }],
  ["no garage, 3 doors, 22 windows", { ...base, hasGarage: false, openings: { windowsCount: 22, windowsM2: 30, doors: 3 } }],
  ["small cabin", { ...base, widthM: 6, lengthM: 8, hasGarage: false, openings: { windowsCount: 4, windowsM2: 5, doors: 1 } }],
]) {
  const ops = placeOpenings(spec);
  const wins = ops.filter((o) => o.kind === "window");
  const doors = ops.filter((o) => o.kind === "door");
  ok(`${label}: window count = spec (${spec.openings.windowsCount})`, wins.length === spec.openings.windowsCount, `got ${wins.length}`);
  ok(`${label}: door count = spec (${spec.openings.doors})`, doors.length === spec.openings.doors, `got ${doors.length}`);
  const glazed = wins.reduce((a, o) => a + o.w * o.h, 0);
  ok(`${label}: glazed area = windowsM2 (${spec.openings.windowsM2})`, near(glazed, spec.openings.windowsM2, 1e-6), `got ${glazed}`);

  // cladding area drawn == estimator net wall area
  const env = envelope(spec);
  let clad = 0;
  for (const wall of walls(spec)) for (let f = 0; f < env.floors; f++) {
    const mine = ops.filter((o) => o.side === wall.side && o.floor === f);
    clad += wallPanels(wall.len, env.wallH, mine).reduce((a, p) => a + (p.u1 - p.u0) * (p.y1 - p.y0), 0);
  }
  ok(`${label}: cladding area = takeoff.netWallAreaM2`, near(clad, takeoff(spec).netWallAreaM2, 1e-6), `3D ${clad.toFixed(3)} vs takeoff ${takeoff(spec).netWallAreaM2.toFixed(3)}`);

  // nothing hangs off a wall, nothing overlaps, nothing behind the garage
  let inside = true, overlap = false, behindGarage = false;
  for (const wall of walls(spec)) for (let f = 0; f < env.floors; f++) {
    const mine = ops.filter((o) => o.side === wall.side && o.floor === f).sort((a, b) => a.u - b.u);
    for (const o of mine) if (o.u - o.w / 2 < 0 || o.u + o.w / 2 > wall.len || o.sill + o.h > env.wallH + 1e-9) inside = false;
    for (let i = 1; i < mine.length; i++) if (mine[i].u - mine[i].w / 2 < mine[i - 1].u + mine[i - 1].w / 2 - 1e-9) overlap = true;
    if (spec.hasGarage && wall.side === "left" && f === 0) for (const o of mine) if (o.u + o.w / 2 > env.l - STD.garage.l) behindGarage = true;
  }
  ok(`${label}: openings fit within their walls`, inside);
  ok(`${label}: no overlapping openings`, !overlap);
  ok(`${label}: no openings behind the garage`, !behindGarage);
}

ok("window head at 2.1 m", near(windowSize(base).head, 2.1));
ok("windows sit on a sill >= 300", windowSize(base).sill >= STD.minSill - 1e-9);

/* ---- wallPanels tiles exactly ---- */
{
  const ps = wallPanels(10, 2.7, [{ u: 2, w: 1.2, h: 1.2, sill: 0.9 }, { u: 6, w: 0.98, h: 2.04, sill: 0 }]);
  const area = ps.reduce((a, p) => a + (p.u1 - p.u0) * (p.y1 - p.y0), 0);
  ok("wallPanels: area = wall - openings", near(area, 27 - 1.44 - 0.98 * 2.04));
}

/* ---- envelope / slab / roof ---- */
{
  const env = envelope(base);
  ok("slab footprint = width × length", near(env.w * env.l, takeoff(base).footprintM2));
  ok("slab volume = takeoff", near(env.w * env.l * env.slabThk, takeoff(base).slabVolM3));
  const r = roofGeometry(base);
  ok("roof slope area (no eaves) = takeoff.roofAreaM2", near(r.slopedAreaNoEaves, takeoff(base).roofAreaM2));
  ok("ridge height = half-span × tan(pitch)", near(r.ridgeH, 6 * Math.tan(22 * Math.PI / 180)));
  const two = envelope({ ...base, floors: 2 });
  ok("two-storey: level 1 sits a wall + floor zone above level 0", near(two.levelY(1) - two.levelY(0), 2.7 + STD.floorZoneM));
}

/* ---- rooms ---- */
{
  const lay = layoutFloors(base);
  const cells = lay.floors[0].cells.filter((c) => !c.item.circulation);
  ok("every scheduled space is drawn (5 rooms + 2 baths + kitchen)", cells.length === 8, `got ${cells.length}`);
  const areaErr = Math.max(...cells.map((c) => Math.abs(c.w * c.l - c.item.area) / c.item.area));
  ok("rooms keep their scheduled area (fits on one floor)", areaErr < 1e-6, `worst ${(areaErr * 100).toFixed(2)}%`);
  ok("fit = 1 when the schedule fits", lay.floors[0].fit === 1);
  const { inner } = lay;
  const within = lay.floors[0].cells.every((c) => c.x >= inner.x - 1e-6 && c.z >= inner.z - 1e-6 && c.x + c.w <= inner.x + inner.w + 1e-6 && c.z + c.l <= inner.z + inner.l + 1e-6);
  ok("all cells inside the external walls", within);
  let overlaps = false;
  const cs = lay.floors[0].cells;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oz = Math.min(a.z + a.l, b.z + b.l) - Math.max(a.z, b.z);
    if (ox > 1e-6 && oz > 1e-6) overlaps = true;
  }
  ok("no overlapping rooms", !overlaps);
  const worstAspect = Math.max(...cells.map((c) => Math.max(c.w / c.l, c.l / c.w)));
  ok("rooms are plausible shapes (aspect <= 3.5)", worstAspect <= 3.5, `worst ${worstAspect.toFixed(2)}`);
}
{
  const two = layoutFloors({ ...base, floors: 2, staircaseType: "timber" });
  const up = two.floors[1].cells.map((c) => c.item.type);
  const down = two.floors[0].cells.map((c) => c.item.type);
  ok("two-storey: bedrooms upstairs", up.filter((t) => t === "Bedroom").length === 3);
  ok("two-storey: living + kitchen downstairs", down.includes("Living") && down.includes("Kitchen"));
  ok("two-storey: stair on both levels", two.floors.every((f) => f.cells.some((c) => c.item.type === "Stair")));
  const st = stairGeometry(base);
  ok("stair risers <= 190 mm (NCC)", st.riser <= 0.19 + 1e-9, `riser ${st.riser}`);
}
{
  const cramped = layoutFloors({ ...base, widthM: 8, lengthM: 8, hasGarage: false });
  ok("overfull schedule reports fit < 1", cramped.floors[0].fit < 1);
}

/* ---- solar ---- */
{
  const s = solarLayout(base);
  ok("6.6 kW array = 16 × 415 W panels", s.fitted === 16, `got ${s.fitted}`);
  const r = roofGeometry(base);
  const onRoof = s.panels.every((p) => p.s - p.up / 2 >= 0 && p.s + p.up / 2 <= r.slopeLen && Math.abs(p.t) + p.along / 2 <= r.lengthWithEaves / 2);
  ok("all panels within their roof plane", onRoof);
  ok("panels on one plane when they fit", s.panels.every((p) => p.side === 1));
  ok("no solar → no panels", solarLayout({ ...base, solar: false }).panels.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
