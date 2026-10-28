/* Electrical, plumbing and drainage in the building model
   (src/logic/structure/services.js) — the points a sparky and a plumber
   would check on a services layout, plus the priced take-off. */
import { buildStructure, schedule, servicesCompliance, servicesTakeoff, SERVICE_RATES } from "../src/logic/structure/index.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const base = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", hasGarage: true, solar: true, staircaseType: "none",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [
    { id: 1, name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8 },
    { id: 2, name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2 },
    { id: 3, name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5 },
    { id: 4, name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0 },
  ],
  kitchens: [{ id: 5, benchLengthM: 7, island: true }],
  bathrooms: [{ id: 6, label: "Main bathroom", widthM: 3.0, lengthM: 2.4 }, { id: 7, label: "Ensuite", widthM: 2.6, lengthM: 2.0 }],
};

const VARIANTS = [
  ["single storey", base],
  ["two-storey", { ...base, floors: 2, staircaseType: "timber" }],
  ["no garage, render", { ...base, hasGarage: false, claddingType: "render" }],
  ["small cabin, no wet rooms", { ...base, widthM: 6, lengthM: 8, hasGarage: false, rooms: [], kitchens: [], bathrooms: [], openings: { windowsCount: 4, windowsM2: 5, doors: 1 } }],
];

for (const [label, spec] of VARIANTS) {
  const S = buildStructure(spec);
  const M = S.members;
  const svc = M.filter((m) => ["electrical", "plumbing", "drainage"].includes(m.sys));
  const wetRooms = S.layout.floors.flatMap((fl) => fl.cells).filter((c) => ["Bathroom", "Kitchen", "Laundry"].includes(c.item.type));

  ok(`${label}: one meter box and one switchboard`, M.filter((m) => m.kind === "meterbox").length === 1 && M.filter((m) => m.kind === "board").length === 1);
  ok(`${label}: every room has a light`, S.layout.floors.every((fl) => fl.cells.every((c) => M.some((m) => m.kind === "light" && m.host.startsWith(`${c.item.name} ·`)))));
  ok(`${label}: power points sit 300 above their floor`, M.filter((m) => m.name === "Power point" && m.host.includes("floor")).every((m) => {
    const lvl = S.layout.floors.find((fl) => m.host.endsWith(fl.level === 0 ? "Ground floor" : fl.level === 1 ? "First floor" : `Level ${fl.level}`));
    return lvl && Math.abs(m.a[1] - (lvl.y + 0.3)) < 1e-3;
  }));
  ok(`${label}: services pieces have positive, finite geometry`, svc.every((m) => [...m.a, ...m.b, m.d, m.w].every(Number.isFinite) && m.d > 0 && m.w > 0));
  ok(`${label}: every service piece has a price`, schedule(svc).every((r) => SERVICE_RATES[r.profile] > 0), schedule(svc).filter((r) => !(SERVICE_RATES[r.profile] > 0)).map((r) => r.profile).join(", "));
  ok(`${label}: drains run under the slab`, M.filter((m) => /branch|Sewer drain/.test(m.name) && m.sys === "drainage" && !/Stormwater/.test(m.name) && m.host !== "Front yard")
    .every((m) => Math.max(m.a[1], m.b[1]) < S.env.ffl - S.env.slabThk));
  ok(`${label}: every downpipe is connected to stormwater`, M.filter((m) => m.kind === "downpipe" && m.b[1] < 0.1)
    .every((dp) => M.some((m) => m.name === "Downpipe connection" && Math.abs(m.a[0] - dp.b[0]) < 1e-3 && Math.abs(m.a[2] - dp.b[2]) < 1e-3)));
  if (wetRooms.length) {
    ok(`${label}: every wet room has hot water, cold water and a waste`, wetRooms.every((c) => {
      const mine = M.filter((m) => m.host.includes(`${c.item.name} ·`));
      return mine.some((m) => /hot water/.test(m.profile)) && mine.some((m) => /cold water/.test(m.profile)) && mine.some((m) => m.sys === "drainage");
    }));
    ok(`${label}: one sewer connection, vented`, M.filter((m) => m.kind === "trap").length === 1 && M.some((m) => m.name === "Vent stack"));
    const vent = M.find((m) => m.name === "Vent stack");
    ok(`${label}: vent stack clears the roof`, Math.max(vent.a[1], vent.b[1]) > S.roof.ridgeY);
  } else {
    ok(`${label}: no wet rooms, no sanitary drainage`, !M.some((m) => m.name === "Sewer drain"));
  }
  const fails = servicesCompliance(S).filter((c) => !c.ok);
  ok(`${label}: services compliance checklist all met`, fails.length === 0, fails.map((c) => c.rule).join("; "));
  const take = servicesTakeoff(schedule(M));
  const lmCost = take.reduce((a, t) => a + t.total, 0);
  ok(`${label}: priced take-off has electrical${wetRooms.length ? ", plumbing and drainage" : ""}`, take.some((t) => t.sys === "electrical") && (!wetRooms.length || take.length === 3) && lmCost > 0);
}

const S1 = buildStructure({ ...base, floors: 2, staircaseType: "timber" });
ok("two-storey: a smoke alarm on every storey", S1.layout.floors.every((fl) => S1.members.some((m) => m.kind === "smoke" && m.host.endsWith(fl.level === 0 ? "Ground floor" : "First floor"))));
ok("two-storey: stair and halls have 2-way switching", S1.members.some((m) => m.profile === "2-way light switch"));
ok("lite model carries no services", !buildStructure(base, { detail: "lite" }).members.some((m) => ["electrical", "plumbing", "drainage"].includes(m.sys)));
const big = servicesTakeoff(schedule(buildStructure(base).members)).reduce((a, t) => a + t.total, 0);
ok(`single storey services priced in a believable range ($${big.toLocaleString()})`, big > 25000 && big < 90000);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
