/* The free walkthrough and live finishes: rooms carry their extent (so the
   walk knows which room you are in), the fit-out has the pieces a homeowner
   wants to change (splashback, shower wall tiles, mirror, glass), and the
   finish catalogue resolves every choice to material overrides. */
import { buildStructure } from "../src/logic/structure/index.js";
import { FINISHES, finishOption, finishProps, swatchOf, onlyFinishesChanged } from "../src/logic/finishes.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const spec = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", floorFinish: "timber",
  hasGarage: false, solar: false, staircaseType: "none",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [
    { id: 1, name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber" },
    { id: 2, name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet" },
  ],
  kitchens: [{ id: 3, benchLengthM: 5, cabinetry: "custom", benchtop: "stone", splashback: "glass", appliances: "mid", island: true, sinkTap: true }],
  bathrooms: [{ id: 4, label: "Main bathroom", widthM: 3.0, lengthM: 2.4, hasBath: true, hasShower: true, vanityCount: 1, toiletCount: 1 }],
};
const st = buildStructure(spec);
const M = st.members;

/* rooms for the walk */
ok("every walk room has a name, centre and extent", st.waypoints.length > 0 && st.waypoints.every((r) => r.name && r.w > 0 && r.l > 0 && Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.floorY)));
ok("room centres sit inside the building footprint", st.waypoints.every((r) => Math.abs(r.x) <= st.env.w / 2 + 0.01 && Math.abs(r.z) <= st.env.l / 2 + 0.01));
ok("eye height is 1.55 m above each room's floor", st.waypoints.every((r) => Math.abs(r.y - r.floorY - 1.55) < 1e-9));

/* the pieces you can walk up to and change */
const kinds = (k) => M.filter((m) => m.kind === k);
const sb = kinds("splashback");
ok("the kitchen has a splashback", sb.length === 1 && sb[0].mat === "splashback");
ok("the splashback names the chosen type", /glass/i.test(sb[0]?.profile || ""));
const bench = kinds("benchtop")[0], over = M.find((m) => m.name === "Overhead cabinets");
const sbY = [(sb[0].a[1] - sb[0].d / 2), (sb[0].a[1] + sb[0].d / 2)];
ok("the splashback runs from the benchtop up to the overhead cupboards",
  bench && over && Math.abs(sbY[0] - (bench.a[1] + bench.d / 2)) < 0.02 && Math.abs(sbY[1] - (over.a[1] - over.d / 2)) < 0.02, JSON.stringify(sbY));
const wt = kinds("wallTile");
ok("the shower has two tiled walls, 2 m high", wt.length === 2 && wt.every((m) => m.mat === "wallTile" && Math.abs(m.d - 2) < 1e-9));
ok("the bathroom has a mirror and a glass screen", kinds("mirror").length === 1 && M.some((m) => m.kind === "screen" && m.mat === "glass"));
ok("splashback and wall tiles are scheduled by area", [...sb, ...wt].every((m) => m.unit === "m2"));
ok("a tiled splashback reads as tiles", /tiled/i.test(buildStructure({ ...spec, kitchens: [{ ...spec.kitchens[0], splashback: "tile" }] }).members.find((m) => m.kind === "splashback")?.profile || ""));

/* finish catalogue */
const editable = ["floorTile", "wallTile", "splashback", "mirror", "glass", "stone", "joinery", "ceramic", "chrome", "floorTimber", "carpet", "plasterboard"];
ok("tiles, splashback, mirror, glass, benchtop, cabinets, tapware, floors and paint are all editable", editable.every((k) => FINISHES[k]));
ok("every editable material is one the model actually uses", ["floorTile", "wallTile", "splashback", "mirror", "glass", "stone", "joinery", "ceramic", "chrome"].every((k) => M.some((m) => m.mat === k)));
ok("each finish starts with the standard look and offers at least three", Object.values(FINISHES).every((f) => f.options[0].id === "standard" && f.options.length >= 3));
ok("option ids are unique within a finish", Object.values(FINISHES).every((f) => new Set(f.options.map((x) => x.id)).size === f.options.length));
ok("every option has a name and a CSS swatch", Object.values(FINISHES).every((f) => f.options.every((x) => x.name && /^#[0-9a-f]{6}$/i.test(swatchOf(x)))));
ok("non-standard options carry a colour", Object.values(FINISHES).every((f) => f.options.slice(1).every((x) => Number.isInteger(x.color) && x.color >= 0 && x.color <= 0xffffff)));
ok("standard → no override", finishProps("glass", "standard") === null && finishProps("glass", undefined) === null);
ok("unknown choice falls back to standard", finishOption("mirror", "nope").id === "standard" && finishProps("mirror", "nope") === null);
ok("unknown material has no finish", finishOption("pine", "x") === null && finishProps("pine", "x") === null);
const frost = finishProps("glass", "frosted");
ok("frosted glass is more opaque and rougher", frost && frost.opacity > 0.5 && frost.roughness > 0.3);
ok("opacities stay between 0 and 1", Object.values(FINISHES).every((f) => f.options.every((x) => x.opacity == null || (x.opacity > 0 && x.opacity <= 1))));

/* in-place recolour vs rebuild */
const a = { widthM: 10, rooms: [], finishes: {} };
ok("a finish change alone recolours in place", onlyFinishesChanged(a, { ...a, finishes: { glass: "grey" } }));
ok("a size change rebuilds", !onlyFinishesChanged(a, { ...a, widthM: 11, finishes: { glass: "grey" } }));
ok("the same spec is not a finish change", !onlyFinishesChanged(a, a) && !onlyFinishesChanged(a, { ...a }));
ok("no previous build means rebuild", !onlyFinishesChanged(null, a));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
