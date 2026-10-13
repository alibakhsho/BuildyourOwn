/* The free "Describe your project" engine — no AI, no network. */
import { parseScope, parseHouse, houseSpecFromFeatures, parseMulti, parseDeveloper, cleanDeveloper, normalise } from "../src/logic/describe.js";
import { WallBuilder } from "../src/logic/wall-builder.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${JSON.stringify(detail)}`}`);
  good ? pass++ : fail++;
};
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

/* units */
ok("normalise: sq m → m2", /20m2/.test(normalise("20 sq m deck")));
ok("normalise: feet → metres", /3\.05m/.test(normalise("a 10 ft wall")));
ok("normalise: number words", /4 bed/.test(normalise("four bed")));
ok("normalise: 1,200 → 1200", /1200m2/.test(normalise("1,200m² floor plate")));

/* scope — the app's own example */
{
  const r = parseScope("a partition wall 4m by 2.4 painted both sides with 2 power points, and a 20m² merbau deck");
  const wall = r.items.find((i) => i.preset === "timber_wall");
  const deck = r.items.find((i) => i.preset === "deck");
  ok("scope: wall found", !!wall, r);
  ok("scope: wall 4 × 2.4", wall && wall.lengthM === 4 && wall.heightM === 2.4, wall);
  ok("scope: both sides", wall && wall.sides === 2);
  ok("scope: 2 power points", wall && wall.addons.some((a) => a.id === "wa_power" && a.qty === 2), wall?.addons);
  ok("scope: deck 20 m² merbau", deck && deck.dim === 20 && deck.variant === "deck_merbau", deck);
  ok("scope: every item prices through the WallBuilder engine", r.items.every((it) => {
    const p = WallBuilder.getPreset(it.preset);
    const opts = p.dim === "wall" ? { lengthM: it.lengthM, heightM: it.heightM, finish: it.finish, sides: it.sides, labour: it.labour, addonList: it.addons } : { dim: it.dim, variant: it.variant, labour: it.labour, addonList: [] };
    return WallBuilder.presetToLines(it.preset, opts, "AU", () => Math.random()).length > 0;
  }));
}
{
  const r = parseScope("30m colorbond fence and a 6x8 exposed aggregate driveway, installed");
  const fence = r.items.find((i) => i.preset === "fencing");
  const drive = r.items.find((i) => i.preset === "concreting");
  ok("scope: 30 m colorbond fence", fence && fence.dim === 30 && fence.variant === "colorbond", fence);
  ok("scope: 6×8 exposed driveway = 48 m²", drive && drive.dim === 48 && drive.variant === "exposed", drive);
  ok("scope: 'installed' → labour on", drive && drive.labour === true);
}
{
  const r = parseScope("3x3 cabin with a tin roof");
  ok("scope: cabin decomposes into slab + walls + roof", ["concreting", "timber_wall", "roofing"].every((p) => r.items.some((i) => i.preset === p)), r.items);
  const walls = r.items.find((i) => i.preset === "timber_wall");
  ok("scope: cabin walls = perimeter 12 m", walls && walls.lengthM === 12);
  ok("scope: tin roof → colorbond", r.items.find((i) => i.preset === "roofing")?.variant === "colorbond");
}
{
  const r = parseScope("a retaining wall 12m2 in besser block");
  ok("scope: retaining wall is not a stud wall", r.items[0]?.preset === "retaining" && r.items[0]?.variant === "besser", r.items);
}
{
  const r = parseScope("new pergola");
  ok("scope: no size → starting size + note", r.items[0]?.preset === "deck" && /starting size/.test(r.note), r);
}
ok("scope: nonsense → nothing priced, explained", (() => { const r = parseScope("make it nice"); return r.items.length === 0 && /Couldn't place/.test(r.note); })());

/* houses */
{
  const r = parseHouse("4 bed 2 bath double storey brick house about 250m2 with a double garage, colorbond roof and solar, plus a 30m2 merbau deck");
  const f = r.features;
  ok("house: 4 bed / 2 bath / 2 storeys", f.bedrooms === 4 && f.bathrooms === 2 && f.storeys === 2, f);
  ok("house: 250 m², brick, colorbond, garage, solar", f.areaM2 === 250 && f.cladding === "brick" && f.roof === "colorbond" && f.garage && f.solar, f);
  ok("house: the deck becomes extra scope", r.extras.some((e) => e.preset === "deck" && e.dim === 30), r.extras);
  const spec = houseSpecFromFeatures(f, { floors: 1, openings: { doors: 2 } });
  ok("house spec: GFA ≈ 250 m²", Math.abs(spec.widthM * spec.lengthM * spec.floors - 250) / 250 < 0.08, spec.widthM * spec.lengthM * 2);
  ok("house spec: 4 bedrooms scheduled", spec.rooms.filter((x) => x.type === "Bedroom").length === 4);
  ok("house spec: 2 bathrooms", spec.bathrooms.length === 2);
  ok("house spec: two storeys get a stair", spec.floors === 2 && spec.staircaseType !== "none");
}
{
  const spec = houseSpecFromFeatures(parseHouse("single storey 3 bedroom weatherboard home on a sloping block, no garage").features, { floors: 2, staircaseType: "timber", openings: {} });
  ok("house: single storey drops the stair", spec.floors === 1 && spec.staircaseType === "none");
  ok("house: weatherboard, sloping, no garage", spec.claddingType === "weatherboard" && spec.siteCondition === "sloping" && spec.hasGarage === false, spec);
}
{
  const f = parseHouse("12 x 18 house").features;
  ok("house: explicit dims kept", f.widthM === 12 && f.lengthM === 18, f);
}

/* multi-dwelling */
{
  const r = parseMulti("6 single storey 3 bed homes and 4 double storey 4 bed townhouses, all brick with colorbond roofs");
  ok("multi: two types", r.types.length === 2, r.types);
  ok("multi: counts 6 and 4", r.types[0]?.count === 6 && r.types[1]?.count === 4);
  ok("multi: storeys per type", r.types[0]?.features.storeys === 1 && r.types[1]?.features.storeys === 2);
  ok("multi: shared finishes applied to every type", r.types.every((t) => t.features.cladding === "brick" && t.features.roof === "colorbond"), r.types.map((t) => t.features));
}
{
  const r = parseMulti("12 townhouses");
  ok("multi: townhouses default to two storeys", r.types[0]?.count === 12 && r.types[0]?.features.storeys === 2);
}
ok("multi: a duplex is two dwellings", parseMulti("a brick duplex").types[0]?.count === 2);

/* developer */
{
  const f = parseDeveloper("a 4 storey apartment block with 24 units, 1 basement level, concrete frame").features;
  ok("developer: 4 storeys (apartment block, not forced to 5+)", f.floors === 4, f);
  ok("developer: 1 basement", f.basementLevels === 1, f);
  ok("developer: residential, rc", f.occupancy === "residential" && f.structureType === "rc", f);
  ok("developer: floor plate from units ≈ 24×85×1.25/4", near(f.floorPlateM2, 638, 1), f.floorPlateM2);
  ok("developer: residential floor-to-floor 3.1 m", f.floorHeightM === 3.1);
}
{
  const f = parseDeveloper("20-storey office tower, 1,200m² floor plate, 3 basement levels, curtain wall façade, 8 lifts").features;
  ok("developer: the app's tower example", f.floors === 20 && f.floorPlateM2 === 1200 && f.basementLevels === 3 && f.occupancy === "office" && f.facadeType === "curtain_wall" && f.passengerLifts === 8, f);
}
{
  const c = cleanDeveloper({ facadeType: "brick", occupancy: "hotel", floors: 300, floorPlateM2: 50 });
  ok("developer: values the engine can't price are dropped", !("facadeType" in c) && !("occupancy" in c), c);
  ok("developer: numbers clamped to engine ranges", c.floors === 120 && c.floorPlateM2 === 150, c);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
