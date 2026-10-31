/* Furniture & styling (src/logic/structure/furniture.js) and the cinematic
   film planner (src/logic/cinematic.js): every room furnished inside its own
   walls and clear of its doors; every camera move finite, the interior
   shots inside their rooms, the client cut carrying the build and price. */
import { buildStructure, schedule } from "../src/logic/structure/index.js";
import { _wallsOf } from "../src/logic/structure/furniture.js";
import { planFilm, captionAt, stageWeeks } from "../src/logic/cinematic.js";
import { Estimator } from "../src/logic/estimator.js";

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
    { id: 4, name: "Dining", type: "Dining", widthM: 3.6, lengthM: 3.4 },
    { id: 5, name: "Study", type: "Study", widthM: 3.0, lengthM: 2.8 },
    { id: 6, name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0 },
  ],
  kitchens: [{ id: 7, benchLengthM: 7, island: true }],
  bathrooms: [{ id: 8, label: "Main bathroom", widthM: 3.0, lengthM: 2.4 }],
};

const VARIANTS = [
  ["single storey, yard", { ...base, landscape: { enabled: true } }],
  ["two-storey, coastal", { ...base, floors: 2, staircaseType: "timber", interiorStyle: "coastal" }],
  ["no garage, media room", { ...base, hasGarage: false, rooms: [...base.rooms, { id: 9, name: "Media", type: "Media", widthM: 4, lengthM: 4 }] }],
  ["small cabin", { ...base, widthM: 6, lengthM: 8, hasGarage: false, rooms: [{ id: 1, name: "Bedroom", type: "Bedroom", widthM: 3, lengthM: 3 }], kitchens: [], bathrooms: [], openings: { windowsCount: 4, windowsM2: 5, doors: 1 } }],
];

/* ---------- furniture ---------- */
{
  const off = buildStructure({ ...base, furnish: false });
  ok("unfurnished: no furniture pieces", !off.members.some((m) => m.sys === "furniture") && off.summary.furniture == null);
  const lite = buildStructure(base, { detail: "lite" });
  ok("street (lite) models stay unfurnished", !lite.members.some((m) => m.sys === "furniture"));
}

for (const [label, spec] of VARIANTS) {
  const S = buildStructure(spec);
  const F = S.members.filter((m) => m.sys === "furniture");
  const cells = S.layout.floors.flatMap((fl, f) => fl.cells.map((c) => ({ c, fl, f })));
  ok(`${label}: furniture pieces have positive, finite geometry`, F.every((m) => [...m.a, ...m.b, m.d, m.w].every(Number.isFinite) && m.d > 0 && m.w > 0));
  const own = (m) => cells.find(({ c }) => m.host.startsWith(`${c.item.name} ·`));
  const inside = F.filter((m) => !["Garage", "Rear deck"].includes(m.host)).every((m) => {
    const r = own(m);
    if (!r) return false;
    const { c } = r;
    return [m.a, m.b].every((p) => p[0] >= c.x - 0.02 && p[0] <= c.x + c.w + 0.02 && p[2] >= c.z - 0.02 && p[2] <= c.z + c.l + 0.02);
  });
  ok(`${label}: every piece inside its own room`, inside);
  ok(`${label}: pieces stand on their floor`, F.filter((m) => !["Garage", "Rear deck"].includes(m.host) && !/Pendant|rod|art/i.test(`${m.name} ${m.kind}`)).every((m) => {
    const r = own(m);
    const lo = Math.min(m.a[1], m.b[1]) - (Math.abs(m.up?.[1] ?? 0) > 0.5 ? m.d / 2 : 0);
    return r && lo >= r.fl.y - 0.01;
  }));
  // nothing in front of a door: no piece's footprint within 0.5 m of a door centre on its room's walls
  let blocked = 0;
  for (const { c, f } of cells) {
    for (const wall of _wallsOf(c, f, { env: S.env, partitions: S.partitions, openings: S.openings })) {
      for (const d of wall.doors) {
        const [dx, dz] = wall.P(d.u, 0.3);
        blocked += F.filter((m) => m.host.startsWith(`${c.item.name} ·`) && m.kind !== "rug" && m.kind !== "curtain" && m.kind !== "pendant" && m.kind !== "rod"
          && Math.hypot((m.a[0] + m.b[0]) / 2 - dx, (m.a[2] + m.b[2]) / 2 - dz) < 0.45).length;
      }
    }
  }
  ok(`${label}: furniture clear of the doorways`, blocked === 0, `${blocked} pieces in a doorway`);
  const beds = cells.filter(({ c }) => c.item.type === "Bedroom" && Math.min(c.w, c.l) >= 2.4);
  ok(`${label}: a bed in every bedroom a bed fits in`, beds.every(({ c }) => F.some((m) => m.kind === "bed" && m.host.startsWith(`${c.item.name} ·`))));
  const living = cells.filter(({ c }) => c.item.type === "Living");
  if (living.length) ok(`${label}: living room has a sofa and a TV`, living.every(({ c }) => ["sofa", "tv"].every((k) => F.some((m) => m.kind === k && m.host.startsWith(`${c.item.name} ·`)))));
  const sch = schedule(F);
  ok(`${label}: FF&E list counts each piece once`, sch.every((r) => r.pieces >= 1) && !sch.some((r) => r.item === "Sofa" && r.pieces > living.length));
  if (spec.hasGarage) ok(`${label}: a car in the garage`, F.some((m) => m.kind === "car" && m.host === "Garage"));
  if (spec.landscape?.enabled) ok(`${label}: an outdoor setting on the deck`, F.some((m) => m.host === "Rear deck" && m.kind === "table"));
}

/* ---------- the film ---------- */
for (const [label, spec] of VARIANTS) {
  const S = buildStructure(spec);
  const est = Estimator.buildEstimate(spec, "AU");
  const facts = { title: "Test House", subtitle: "3 bed · 1 bath", priceText: "A$650,000 incl. GST", weeks: est.timeline.totalWeeks, stages: est.timeline.stages, presentedBy: "Acme Builders" };
  const home = planFilm(S, facts, { audience: "homeowner" });
  const client = planFilm(S, facts, { audience: "client" });
  for (const [cut, film] of [["homeowner", home], ["client", client]]) {
    const pts = film.shots.flatMap((s) => [...s.pos, ...s.look]);
    ok(`${label} · ${cut}: every camera point finite`, pts.every((p) => p.length === 3 && p.every(Number.isFinite)));
    ok(`${label} · ${cut}: shots back to back`, film.shots.every((s, i) => s.dur > 0 && (i === 0 ? s.start === 0 : Math.abs(s.start - (film.shots[i - 1].start + film.shots[i - 1].dur)) < 1e-9)) && Math.abs(film.duration - film.shots.reduce((a, s) => a + s.dur, 0)) < 1e-9);
    ok(`${label} · ${cut}: 40–100 s long`, film.duration >= 40 && film.duration <= 100, `${film.duration.toFixed(1)} s`);
    ok(`${label} · ${cut}: exterior cameras stay above the ground`, film.shots.filter((s) => !s.interior).every((s) => s.pos.every((p) => p[1] >= 1.2)));
    const rooms = film.shots.filter((s) => s.interior);
    ok(`${label} · ${cut}: interior shots stay inside their rooms, at eye height`, rooms.every((s) => {
      const cell = S.layout.floors.flatMap((fl) => fl.cells.map((c) => ({ c, y: fl.y }))).find(({ c }) => c.item.name.replace(/\s*\/.*$/, "") === s.title);
      return cell && s.pos.every((p) => p[0] > cell.c.x + 0.3 && p[0] < cell.c.x + cell.c.w - 0.3 && p[2] > cell.c.z + 0.3 && p[2] < cell.c.z + cell.c.l - 0.3 && Math.abs(p[1] - (cell.y + 1.55)) < 0.1);
    }));
    ok(`${label} · ${cut}: opens and closes on the title`, film.shots[0].title === "Test House" && film.shots.at(-1).title === "Test House");
  }
  const build = client.shots.find((s) => s.id === "build");
  ok(`${label}: client cut builds it stage by stage`, !!build && build.build[0] === 0 && build.build[1] === 1 && build.stageCaptions.length === 5);
  ok(`${label}: homeowner cut has no build sequence and no price`, !home.shots.some((s) => s.build) && !home.shots.some((s) => /A\$/.test(s.sub)));
  ok(`${label}: client cut ends on the price and presenter`, /A\$650,000/.test(client.shots.at(-1).sub) && /Acme Builders/.test(client.shots.at(-1).credit));
  const cap = captionAt(build, build.dur * 0.5, 0.5);
  ok(`${label}: stage caption follows the build`, /^Stage 3/.test(cap.title) && /^Weeks \d+–\d+$/.test(cap.sub) && cap.alpha === 1);
  ok(`${label}: captions fade in and out`, captionAt(home.shots[0], 0, null).alpha === 0 && captionAt(home.shots[0], home.shots[0].dur, null).alpha === 0);
}
{
  const w = stageWeeks([{ key: "site", startWeek: 1, endWeek: 2 }, { key: "foundation", startWeek: 3, endWeek: 5 }, { key: "frame", startWeek: 6, endWeek: 9 }]);
  ok("stage weeks merge the programme's stages", w.foundation[0] === 1 && w.foundation[1] === 5 && w.frame[0] === 6 && !w.roof);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
