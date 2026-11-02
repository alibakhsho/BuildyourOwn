/* The exploded assembly view (src/logic/structure/explode.js): layers lift
   off in build order, each wall's pieces leave with their wall, and the
   "every piece" spread opens gaps without resizing anything. */
import { buildStructure } from "../src/logic/structure/index.js";
import { explodeOffset, explodedCentre, explodeCycle, explodeStep } from "../src/logic/structure/explode.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const spec = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", floorFinish: "timber",
  hasGarage: false, solar: true, staircaseType: "none",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [{ id: 1, name: "Living", type: "Living", widthM: 6, lengthM: 5, floorFinish: "timber" }],
  kitchens: [], bathrooms: [],
};

for (const [label, s] of [["single storey", spec], ["two-storey", { ...spec, floors: 2, staircaseType: "timber" }]]) {
  const st = buildStructure(s);
  const env = { w: st.env.w, l: st.env.l, plateY: st.env.plateY };
  const M = st.members.filter((m) => !m.noRender);
  const centre = (m) => [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2];
  const near = (p, q, e = 1e-9) => Math.abs(p[0] - q[0]) < e && Math.abs(p[1] - q[1]) < e && Math.abs(p[2] - q[2]) < e;

  ok(`${label}: assembled (t = 0) leaves every piece where it was`,
    M.every((m) => near(explodedCentre(m, env, 0, { pieces: true }), centre(m))));

  const offs = M.map((m) => [m, explodeOffset(m, env)]);
  ok(`${label}: nothing is pushed down through the ground`, offs.every(([, o]) => o[1] >= 0));
  ok(`${label}: slab and footings stay on the ground`, offs.filter(([m]) => m.sys === "foundation").every(([, o]) => o[0] === 0 && o[1] === 0 && o[2] === 0));

  const lift = (sys) => { const L = offs.filter(([m]) => m.sys === sys).map(([, o]) => o[1]); return L.length ? Math.min(...L) : null; };
  const lw = lift("wallFrame"), lr = lift("roofFrame"), ls = lift("roofing");
  ok(`${label}: layers rise in build order (frame < trusses < sheeting)`, lw > 0 && lr > lw && ls > lr, `frame ${lw} trusses ${lr} sheeting ${ls}`);

  // each outer wall's cladding leaves with its wall
  const S = explodeStep(env.w, env.l);
  const clad = offs.filter(([m]) => m.sys === "cladding");
  const front = clad.filter(([m]) => centre(m)[2] > env.l / 2 - 0.4 && Math.abs(centre(m)[0]) < env.w / 2 - 1);
  const back = clad.filter(([m]) => centre(m)[2] < -env.l / 2 + 0.4 && Math.abs(centre(m)[0]) < env.w / 2 - 1);
  const side = clad.filter(([m]) => centre(m)[0] > env.w / 2 - 0.4 && Math.abs(centre(m)[2]) < env.l / 2 - 1);
  ok(`${label}: front wall cladding pulls out to the front`, front.length > 0 && front.every(([, o]) => o[2] > 0.9 * S && o[0] === 0));
  ok(`${label}: rear wall cladding pulls out to the rear`, back.length > 0 && back.every(([, o]) => o[2] < -0.9 * S && o[0] === 0));
  ok(`${label}: side wall cladding pulls out sideways`, side.length > 0 && side.every(([, o]) => o[0] > 0.9 * S && o[2] === 0));
  const win = offs.filter(([m]) => m.sys === "openings" && centre(m)[2] > env.l / 2 - 0.4);
  ok(`${label}: windows come out past the cladding`, win.length > 0 && Math.min(...win.map(([, o]) => o[2])) > Math.max(...front.map(([, o]) => o[2])));

  // every-piece spread: gaps open, sizes don't change
  const studs = M.filter((m) => m.sys === "wallFrame" && m.kind === "stud").slice(0, 2);
  if (studs.length === 2) {
    const d0 = Math.hypot(...[0, 1, 2].map((i) => centre(studs[0])[i] - centre(studs[1])[i]));
    const pa = explodedCentre(studs[0], env, 1, { pieces: true }), pb = explodedCentre(studs[1], env, 1, { pieces: true });
    const d1 = Math.hypot(...[0, 1, 2].map((i) => pa[i] - pb[i]));
    ok(`${label}: "every piece" opens a gap between neighbouring studs`, d1 > d0 * 1.1, `${d0.toFixed(3)} → ${d1.toFixed(3)} m`);
  }
}

ok("loop: holds assembled, explodes, holds apart, reassembles", explodeCycle(0.5) === 0 && explodeCycle(5) === 1 && explodeCycle(9.2) === 0
  && explodeCycle(2.7) > 0 && explodeCycle(2.7) < 1 && explodeCycle(7.6) > 0 && explodeCycle(7.6) < 1);
ok("loop: always within 0..1", Array.from({ length: 200 }, (_, i) => explodeCycle(i * 0.07)).every((t) => t >= 0 && t <= 1));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
