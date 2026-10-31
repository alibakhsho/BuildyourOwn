/* =========================================================================
   MODULE: structure/services.js
   The services trades as real pieces, laid out from the room plan the same
   way partitions and fit-out are:

     electrical — meter box + switchboard, every power point, switch, light,
                  smoke alarm, exhaust fan, data/TV point and isolator, and
                  the cable runs from the board through the ceiling space
     plumbing   — water meter, hot-water unit, hot & cold PEX runs to every
                  fixture, laundry trough + washing-machine taps, garden taps
     drainage   — sanitary drainage under the slab (DN100 main, DN50 waste
                  branches), floor wastes, vent stack, inspection openings,
                  overflow relief gully, sewer connection, and stormwater
                  from every downpipe to the street

   Point counts follow common AU practice (AS/NZS 3000 wiring rules, NCC
   smoke-alarm and wet-area rules, AS/NZS 3500 plumbing). INDICATIVE: a
   licensed electrician / plumber designs, installs and certifies the real
   thing — servicesCompliance() lists what they will sign off.
   ========================================================================= */

/* Points per room. `per` adds one per that many m² of floor. */
export const ELEC_RULES = {
  Bedroom:  { gpo: 2, light: { base: 2, per: 8 }, switch: 1, smoke: 1, data: 0 },
  Living:   { gpo: 3, gpoPer: 8, light: { base: 3, per: 6 }, switch: 2, smoke: 0, data: 1, tv: 1 },
  Dining:   { gpo: 2, light: { base: 2, per: 8 }, switch: 1, smoke: 0, data: 0 },
  Media:    { gpo: 3, light: { base: 3, per: 6 }, switch: 1, smoke: 0, data: 1, tv: 1 },
  Study:    { gpo: 3, light: { base: 2, per: 8 }, switch: 1, smoke: 0, data: 1 },
  Kitchen:  { gpo: 4, light: { base: 4, per: 4 }, switch: 2, smoke: 0, data: 0, dedicated: ["Oven / cooktop isolator", "Dishwasher", "Rangehood", "Fridge"] },
  Bathroom: { gpo: 1, light: { base: 2, per: 5 }, switch: 2, smoke: 0, data: 0, fan: 1 },
  Laundry:  { gpo: 2, light: { base: 1, per: 6 }, switch: 1, smoke: 0, data: 0, fan: 1 },
  Hallway:  { gpo: 1, light: { base: 1, per: 7 }, switch: 2, smoke: 1, data: 0 },
  Stair:    { gpo: 0, light: { base: 2, per: 99 }, switch: 2, smoke: 1, data: 0 },
  Other:    { gpo: 2, light: { base: 1, per: 8 }, switch: 1, smoke: 0, data: 0 },
};
export const MAX_LIGHTS_PER_ROOM = 14;
export const rulesFor = (type) => ELEC_RULES[type] || (/bed/i.test(type) ? ELEC_RULES.Bedroom : ELEC_RULES.Other);

/* Typical AU supply-and-install rates (AUD ex GST) by schedule profile, so
   the services schedule can be priced point by point. */
export const SERVICE_RATES = {
  "Meter box + main switch": 950,
  "Switchboard, RCBO protected (AS/NZS 3000)": 2650,
  "Double power point (GPO) 10 A": 115,
  "Weatherproof double GPO IP56": 185,
  "Dedicated circuit + outlet": 240,
  "Isolator switch 32 A": 220,
  "Light switch": 70,
  "2-way light switch": 95,
  "LED downlight 10 W, IC-4 rated": 92,
  "External LED wall light": 140,
  "LED batten 1200 mm": 110,
  "240 V smoke alarm, interconnected (AS 3786)": 175,
  "Exhaust fan, ducted to outside": 265,
  "Data point Cat6": 145,
  "TV point": 130,
  "TPS cable 2.5 mm² (power)": 7,
  "TPS cable 1.5 mm² (lighting)": 6,
  "Cat6 cable": 4,
  "Consumer mains 16 mm²": 38,
  "Water meter + isolating valve": 650,
  "Heat-pump hot-water unit 270 L": 4200,
  "PEX-b 20 mm cold water": 26,
  "PEX-b 20 mm hot water, lagged": 32,
  "PEX-b 25 mm water main": 34,
  "Water point (rough-in + fit-off)": 175,
  "Tempering valve 50 °C (AS/NZS 3500.4)": 320,
  "Laundry trough + mixer": 690,
  "Washing machine taps": 160,
  "Garden tap (hose cock)": 145,
  "PVC DN100 sewer drain": 95,
  "PVC DN50 waste branch": 62,
  "PVC DN50 vent stack": 70,
  "Floor waste DN80 with puddle flange": 230,
  "Inspection opening": 140,
  "Overflow relief gully": 360,
  "Boundary trap / sewer connection": 1850,
  "PVC DN90 stormwater drain": 68,
  "Stormwater pit 450 × 450": 420,
  "Stormwater connection to kerb": 950,
};

const HOT = "PEX-b 20 mm hot water, lagged";
const COLD = "PEX-b 20 mm cold water";
const storey = (f) => (f === 0 ? "Ground floor" : f === 1 ? "First floor" : `Level ${f}`);

/**
 * Add the services to the model.
 * @param M       Model
 * @param ctx     { env, layout, spec, roof, garage }
 */
import { landscapeSpec, deckRunsFullWidth } from "./landscape.js";

export function buildServices(M, ctx) {
  const { env, layout } = ctx;
  const { w, l, ffl, slabThk, wallH } = env;
  // the street end: the real front boundary when the lot is modelled, else just past the front wall
  const front = ctx.frontZ ?? null;
  const ceil = (f) => env.levelY(f) + wallH - 0.05;       // cable / pipe zone just above the ceiling lining
  const under = ffl - slabThk - 0.35;                      // drain invert zone under the slab

  /* ---------- the source end ---------- */
  // meter box + switchboard on the right-hand external wall, front quarter
  const board = [w / 2 + 0.08, ffl + 1.5, l / 4];
  M.add({ sys: "electrical", kind: "meterbox", name: "Meter box", profile: "Meter box + main switch", mat: "plasticGrey", unit: "ea", host: "Right side wall · outside",
    a: [board[0], ffl + 1.2, board[2]], b: [board[0], ffl + 1.9, board[2]], d: 0.16, w: 0.5, up: [1, 0, 0], code: "E-MB" });
  M.add({ sys: "electrical", kind: "board", name: "Switchboard", profile: "Switchboard, RCBO protected (AS/NZS 3000)", mat: "paintWhite", unit: "ea", host: "Right side wall · outside",
    a: [board[0], ffl + 1.2, board[2] + 0.55], b: [board[0], ffl + 1.9, board[2] + 0.55], d: 0.14, w: 0.45, up: [1, 0, 0], code: "E-SB" });
  M.add({ sys: "electrical", kind: "cable", name: "Consumer mains", profile: "Consumer mains 16 mm²", mat: "black", shape: "cyl", host: "Front yard",
    a: [board[0] + 0.1, 0.02, board[2]], b: [board[0] + 0.1, 0.02, front ?? l / 2 + 2], d: 0.03, w: 0.03, up: [0, 1, 0], code: "E-CM" });
  const boardTop = [w / 2 - 0.3, ceil(0), board[2] + 0.55];

  // water meter at the front boundary, hot-water unit on the rear wall
  const meter = [w / 2 - 1.0, 0.25, front != null ? front - 0.6 : l / 2 + 1.6];
  M.add({ sys: "plumbing", kind: "meter", name: "Water meter", profile: "Water meter + isolating valve", mat: "galv", unit: "ea", host: "Front boundary",
    a: [meter[0] - 0.15, meter[1], meter[2]], b: [meter[0] + 0.15, meter[1], meter[2]], d: 0.15, w: 0.15, up: [0, 1, 0], code: "P-WM" });
  // a full-width rear deck takes the back wall, so the unit goes on the right side wall, near the back
  const hwuSide = !!(ctx.spec && deckRunsFullWidth(landscapeSpec(ctx.spec), w));
  const hwu = hwuSide ? [w / 2 + 0.45, ffl, -l / 2 + 1.4] : [w / 3, ffl, -l / 2 - 0.45];
  const along = hwuSide ? [0, 0, 1] : [1, 0, 0];                     // along the wall the unit stands on
  const at = (k, y) => [hwu[0] + along[0] * k, y, hwu[2] + along[2] * k];
  const hwWall = hwuSide ? "Right side wall" : "Rear wall";
  M.add({ sys: "plumbing", kind: "hwu", name: "Hot-water unit", profile: "Heat-pump hot-water unit 270 L", mat: "paintWhite", shape: "cyl", unit: "ea", host: `${hwWall} · outside`,
    a: [hwu[0], ffl, hwu[2]], b: [hwu[0], ffl + 1.6, hwu[2]], d: 0.62, w: 0.62, up: [1, 0, 0], code: "P-HW" });
  M.add({ sys: "plumbing", kind: "valve", name: "Tempering valve", profile: "Tempering valve 50 °C (AS/NZS 3500.4)", mat: "chrome", unit: "ea", host: `${hwWall} · outside`,
    a: at(0.4, ffl + 0.9), b: at(0.4, ffl + 1.05), d: 0.06, w: 0.06, up: [1, 0, 0], code: "P-TV" });
  // main from the meter, under ground to the house, up into the roof space
  const mainIn = [w / 2 - 1.0, ffl, l / 2 - 0.3];
  pipe(M, "plumbing", "Water main", "PEX-b 25 mm water main", "Front yard", [meter[0], 0.2, meter[2]], [mainIn[0], -0.3, meter[2]], 0.025, "P-MN", "pipeCold");
  pipe(M, "plumbing", "Water main", "PEX-b 25 mm water main", "Front yard", [mainIn[0], -0.3, meter[2]], [mainIn[0], -0.3, mainIn[2]], 0.025, "P-MN", "pipeCold");
  pipe(M, "plumbing", "Water main", "PEX-b 25 mm water main", "Front wall", [mainIn[0], -0.3, mainIn[2]], [mainIn[0], ceil(0), mainIn[2]], 0.025, "P-MN", "pipeCold");
  const coldSrc = [mainIn[0], ceil(0), mainIn[2]];
  // through the wall into the roof space, just inside the wall the unit stands on
  const hotSrc = hwuSide ? [w / 2 - 0.3, ceil(0), hwu[2] + 0.4] : [hwu[0], ceil(0), -l / 2 + 0.3];
  pipe(M, "plumbing", "Hot water flow", HOT, hwWall, at(0.4, ffl + 1.0), at(0.4, ceil(0)), 0.02, "P-HF", "pipeHot");
  pipe(M, "plumbing", "Hot water flow", HOT, "Roof space", at(0.4, ceil(0)), hotSrc, 0.02, "P-HF", "pipeHot");
  const coldTurn = hwuSide ? [coldSrc[0], ceil(0), hwu[2] - 0.2] : [hwu[0] - 0.2, ceil(0), coldSrc[2]];
  pipe(M, "plumbing", "Cold feed to HWU", COLD, "Roof space", coldSrc, coldTurn, 0.02, "P-CF", "pipeCold");
  pipe(M, "plumbing", "Cold feed to HWU", COLD, "Roof space", coldTurn, at(-0.2, ceil(0)), 0.02, "P-CF", "pipeCold");
  pipe(M, "plumbing", "Cold feed to HWU", COLD, hwWall, at(-0.2, ceil(0)), at(-0.2, ffl + 0.3), 0.02, "P-CF", "pipeCold");

  // sewer: boundary trap at the front, the main drain runs back under the slab
  const sewer = [-w / 4, under - 0.3, front != null ? front - 1.0 : l / 2 + 1.5];
  M.add({ sys: "drainage", kind: "trap", name: "Boundary trap", profile: "Boundary trap / sewer connection", mat: "pvcGrey", shape: "cyl", unit: "ea", host: "Front boundary",
    a: [sewer[0], sewer[1], sewer[2]], b: [sewer[0], 0.05, sewer[2]], d: 0.15, w: 0.15, up: [1, 0, 0], code: "D-BT" });
  M.add({ sys: "drainage", kind: "org", name: "Overflow relief gully", profile: "Overflow relief gully", mat: "pvcGrey", shape: "cyl", unit: "ea", host: "Front yard",
    a: [sewer[0] + 0.6, under, l / 2 + 0.6], b: [sewer[0] + 0.6, ffl - 0.075, l / 2 + 0.6], d: 0.15, w: 0.15, up: [1, 0, 0], code: "D-ORG" });
  const mainX = sewer[0];
  const drainEnds = [];   // z of every branch joining the main (so we know how far back it runs)

  /* ---------- room by room ---------- */
  const counts = { gpo: 0, light: 0, smoke: 0 };
  let circuit = 0;
  for (const fl of layout.floors) {
    const f = fl.level, y0 = fl.y, yc = ceil(f);
    for (const c of fl.cells) {
      const t = c.item.type;
      const R = rulesFor(t);
      const host = `${c.item.name} · ${storey(f)}`;
      const area = c.w * c.l;
      const cx = c.x + c.w / 2, cz = c.z + c.l / 2;
      // home run for this room's circuits: board → over the ceiling → room centre
      circuit++;
      cableRun(M, boardTop, [cx, yc, cz], "TPS cable 2.5 mm² (power)", host, f, ceil);
      cableRun(M, [boardTop[0], boardTop[1], boardTop[2] - 0.08], [cx + 0.1, yc, cz + 0.1], "TPS cable 1.5 mm² (lighting)", host, f, ceil);

      // power points round the walls, 300 above floor
      const nGpo = R.gpo + (R.gpoPer ? Math.floor(area / R.gpoPer) : 0) + (/master/i.test(c.item.name) ? 1 : 0);
      wallSpots(c, nGpo).forEach((p, i) => {
        point(M, "gpo", "Power point", "Double power point (GPO) 10 A", [p.x, y0 + 0.3, p.z], p.n, host, "E-GPO", 0.115, 0.075);
        drop(M, [p.x, y0 + 0.3, p.z], yc, "TPS cable 2.5 mm² (power)", host);
        void i;
      });
      counts.gpo += nGpo;
      for (const name of R.dedicated || []) {
        const p = wallSpots(c, 1, 0.5 + (R.dedicated.indexOf(name) + 1) * 0.12)[0];
        const iso = /isolator/i.test(name);
        point(M, iso ? "isolator" : "gpo", name, iso ? "Isolator switch 32 A" : "Dedicated circuit + outlet", [p.x, y0 + (iso ? 1.1 : 0.3), p.z], p.n, host, "E-DC", 0.09, 0.09);
        drop(M, [p.x, y0 + (iso ? 1.1 : 0.3), p.z], yc, "TPS cable 2.5 mm² (power)", host);
      }
      // switches 1100 above floor, near a corner
      for (let i = 0; i < R.switch; i++) {
        const p = cornerSpot(c, i);
        const twoWay = t === "Hallway" || t === "Stair";
        point(M, "switch", "Light switch", twoWay ? "2-way light switch" : "Light switch", [p.x, y0 + 1.1, p.z], p.n, host, "E-SW", 0.075, 0.115);
        drop(M, [p.x, y0 + 1.1, p.z], yc, "TPS cable 1.5 mm² (lighting)", host);
      }
      // lights on a grid on the ceiling
      const nLight = Math.min(MAX_LIGHTS_PER_ROOM, R.light.base + Math.floor(area / R.light.per));
      for (const p of grid(c, nLight)) {
        M.add({ sys: "electrical", kind: "light", name: "Downlight", profile: "LED downlight 10 W, IC-4 rated", mat: "lightLens", shape: "cyl", unit: "ea", host,
          a: [p.x, y0 + wallH - 0.012, p.z], b: [p.x, y0 + wallH + 0.04, p.z], d: 0.09, w: 0.09, up: [1, 0, 0], code: "E-DL" });
      }
      counts.light += nLight;
      if (R.smoke) {
        M.add({ sys: "electrical", kind: "smoke", name: "Smoke alarm", profile: "240 V smoke alarm, interconnected (AS 3786)", mat: "paintWhite", shape: "cyl", unit: "ea", host,
          a: [cx + 0.3, y0 + wallH - 0.045, cz], b: [cx + 0.3, y0 + wallH - 0.005, cz], d: 0.12, w: 0.12, up: [1, 0, 0], code: "E-SA" });
        counts.smoke++;
      }
      if (R.fan) {
        M.add({ sys: "electrical", kind: "fan", name: "Exhaust fan", profile: "Exhaust fan, ducted to outside", mat: "paintWhite", unit: "ea", host,
          a: [cx - 0.12, y0 + wallH - 0.02, cz - 0.4], b: [cx + 0.12, y0 + wallH - 0.02, cz - 0.4], d: 0.03, w: 0.24, up: [0, 1, 0], code: "E-EF" });
      }
      for (const [k, prof, code] of [["data", "Data point Cat6", "E-DA"], ["tv", "TV point", "E-TV"]]) {
        if (!R[k]) continue;
        const p = wallSpots(c, 1, 0.82)[0];
        point(M, k, k === "tv" ? "TV point" : "Data point", prof, [p.x, y0 + 0.3, p.z], p.n, host, code, 0.075, 0.115);
        cableRun(M, [boardTop[0], boardTop[1], boardTop[2] + 0.1], [p.x, yc, p.z], "Cat6 cable", host, f, ceil);
      }

      /* ---------- wet areas: water + drainage ---------- */
      const fixtures = wetFixtures(c, y0, ctx);
      if (!fixtures.length && t !== "Laundry") continue;
      if (t === "Laundry") {
        const tx = c.x + 0.06 + 0.3, tz = c.z + 0.06 + 0.28;
        M.add({ sys: "plumbing", kind: "trough", name: "Laundry trough", profile: "Laundry trough + mixer", mat: "chrome", unit: "ea", host,
          a: [tx - 0.3, y0 + 0.85, tz], b: [tx + 0.3, y0 + 0.85, tz], d: 0.3, w: 0.5, up: [0, 1, 0], code: "P-LT" });
        M.add({ sys: "plumbing", kind: "taps", name: "Washing machine taps", profile: "Washing machine taps", mat: "chrome", unit: "ea", host,
          a: [tx + 0.6, y0 + 1.1, c.z + 0.07], b: [tx + 0.75, y0 + 1.1, c.z + 0.07], d: 0.05, w: 0.04, up: [0, 1, 0], code: "P-MT" });
        fixtures.push({ name: "Laundry trough", x: tx, z: tz, hot: true, cold: true, waste: "DN50" }, { name: "Washing machine", x: tx + 0.7, z: c.z + 0.1, hot: true, cold: true, waste: "DN50" });
      }
      for (const fx of fixtures) {
        const at = [fx.x, y0 + 0.5, fx.z];
        if (fx.cold) waterRun(M, coldSrc, at, COLD, `${fx.name} · ${host}`, yc, "P-CW", "pipeCold");
        if (fx.hot) waterRun(M, hotSrc, [fx.x + 0.1, at[1], fx.z], HOT, `${fx.name} · ${host}`, yc, "P-HW", "pipeHot");
        M.add({ sys: "plumbing", kind: "point", name: "Water point", profile: "Water point (rough-in + fit-off)", mat: "chrome", unit: "ea", host: `${fx.name} · ${host}`,
          a: [fx.x, at[1], fx.z], b: [fx.x, at[1] + 0.06, fx.z], d: 0.03, w: 0.03, up: [1, 0, 0], code: "P-PT" });
        // waste: down to under the slab, then a branch to the main
        if (!fx.waste) continue;
        const dn = fx.waste === "DN100" ? "PVC DN100 sewer drain" : "PVC DN50 waste branch";
        const dia = fx.waste === "DN100" ? 0.11 : 0.056;
        pipe(M, "drainage", `${fx.name} waste`, dn, host, [fx.x, y0 + 0.05, fx.z], [fx.x, under, fx.z], dia, "D-WS", "pvcGrey");
        pipe(M, "drainage", `${fx.name} branch`, dn, host, [fx.x, under, fx.z], [mainX, under, fx.z], dia, "D-BR", "pvcGrey");
        drainEnds.push(fx.z);
      }
      if (t === "Bathroom" || t === "Laundry") {
        M.add({ sys: "drainage", kind: "floorwaste", name: "Floor waste", profile: "Floor waste DN80 with puddle flange", mat: "chrome", shape: "cyl", unit: "ea", host,
          a: [cx, y0 - 0.02, cz], b: [cx, y0 + 0.004, cz], d: 0.11, w: 0.11, up: [1, 0, 0], code: "D-FW" });
        pipe(M, "drainage", "Floor waste", "PVC DN50 waste branch", host, [cx, y0 - 0.02, cz], [cx, under, cz], 0.056, "D-FW", "pvcGrey");
        pipe(M, "drainage", "Floor waste branch", "PVC DN50 waste branch", host, [cx, under, cz], [mainX, under, cz], 0.056, "D-BR", "pvcGrey");
        drainEnds.push(cz);
      }
    }
  }

  // the main drain: from the furthest branch, under the slab, out to the boundary trap
  if (drainEnds.length) {
    const zBack = Math.min(...drainEnds) - 0.3;
    pipe(M, "drainage", "Sewer drain", "PVC DN100 sewer drain", "Under slab", [mainX, under, zBack], [mainX, under, l / 2 + 0.2], 0.11, "D-MN", "pvcGrey");
    pipe(M, "drainage", "Sewer drain", "PVC DN100 sewer drain", "Front yard", [mainX, under, l / 2 + 0.2], [mainX, sewer[1], sewer[2]], 0.11, "D-MN", "pvcGrey");
    M.add({ sys: "drainage", kind: "io", name: "Inspection opening", profile: "Inspection opening", mat: "pvcGrey", shape: "cyl", unit: "ea", host: "Front yard",
      a: [mainX, under, l / 2 + 0.4], b: [mainX, 0.05, l / 2 + 0.4], d: 0.11, w: 0.11, up: [1, 0, 0], code: "D-IO" });
    M.add({ sys: "drainage", kind: "io", name: "Inspection opening", profile: "Inspection opening", mat: "pvcGrey", shape: "cyl", unit: "ea", host: "Under slab · upstream end",
      a: [mainX, under, zBack], b: [mainX, under + 0.2, zBack], d: 0.11, w: 0.11, up: [1, 0, 0], code: "D-IO" });
    // vent stack from the upstream end, up a wall and out through the roof
    const ventTop = (ctx.roof?.ridgeY ?? env.plateY + 1.5) + 0.3;
    pipe(M, "drainage", "Vent stack", "PVC DN50 vent stack", "Through roof", [mainX, under, zBack], [mainX, ventTop, zBack], 0.056, "D-VS", "pvcGrey");
  }

  // garden taps: front and rear, off the cold main
  for (const [z, side] of [[l / 2 + 0.06, "Front"], [-l / 2 - 0.06, "Rear"]]) {
    const gx = side === "Front" ? mainIn[0] + 0.5 : w / 3 - 1.0;
    M.add({ sys: "plumbing", kind: "tap", name: "Garden tap", profile: "Garden tap (hose cock)", mat: "chrome", unit: "ea", host: `${side} wall · outside`,
      a: [gx, 0.45, z], b: [gx, 0.52, z], d: 0.05, w: 0.05, up: [1, 0, 0], code: "P-GT" });
    pipe(M, "plumbing", "Garden tap feed", COLD, `${side} wall`, [gx, 0.45, z], [gx, -0.3, z], 0.02, "P-CW", "pipeCold");
    pipe(M, "plumbing", "Garden tap feed", COLD, "Under ground", [gx, -0.3, z], [mainIn[0], -0.3, z], 0.02, "P-CW", "pipeCold");
  }

  // outside: weatherproof GPOs and lights at the entries
  for (const [p, n, side] of [[[w / 2 - 1.5, ffl + 0.4, l / 2 + 0.01], [0, 0, 1], "Front"], [[-w / 2 + 1.5, ffl + 0.4, -l / 2 - 0.01], [0, 0, -1], "Rear"]]) {
    point(M, "gpo", "Outdoor power point", "Weatherproof double GPO IP56", p, n, `${side} wall · outside`, "E-WP", 0.12, 0.09);
    M.add({ sys: "electrical", kind: "light", name: "External light", profile: "External LED wall light", mat: "lightLens", unit: "ea", host: `${side} wall · outside`,
      a: [p[0] + 0.6, ffl + 2.0, p[2]], b: [p[0] + 0.6, ffl + 2.2, p[2]], d: 0.06, w: 0.14, up: n, code: "E-XL" });
  }
  if (ctx.garage) {
    const G = ctx.garage;
    for (const x of [G.x0 + G.doorW * 0.3, G.x0 + G.doorW * 0.8]) {
      M.add({ sys: "electrical", kind: "light", name: "Garage batten", profile: "LED batten 1200 mm", mat: "lightLens", unit: "ea", host: "Garage",
        a: [x - 0.6, ffl + G.h - 0.03, (G.z0 + G.z1) / 2], b: [x + 0.6, ffl + G.h - 0.03, (G.z0 + G.z1) / 2], d: 0.04, w: 0.06, up: [0, 1, 0], code: "E-GB" });
    }
    point(M, "gpo", "Power point", "Double power point (GPO) 10 A", [G.x1 - 0.12, ffl + 0.3, G.z0 + 1.0], [-1, 0, 0], "Garage", "E-GPO", 0.115, 0.075);
    point(M, "gpo", "Door motor outlet", "Dedicated circuit + outlet", [(G.x0 + G.x1) / 2, ffl + G.h - 0.2, G.z0 + 1.5], [0, -1, 0], "Garage", "E-DC", 0.09, 0.09);
    cableRun(M, boardTop, [(G.x0 + G.x1) / 2, ceil(0), (G.z0 + G.z1) / 2], "TPS cable 2.5 mm² (power)", "Garage", 0, ceil);
  }

  /* ---------- stormwater: a collector down each side, every downpipe
     teed in, both collectors to a pit at the front, the pit to the kerb ---------- */
  const dps = M.members.filter((m) => m.kind === "downpipe" && m.b[1] < 0.1);
  if (dps.length) {
    const ring = 0.6;                                   // collectors run 600 out from the slab edge
    const yS = -0.4;
    const xMax = Math.max(w / 2, ...dps.map((m) => m.b[0]));
    const xMin = Math.min(-w / 2, ...dps.map((m) => m.b[0]));
    const pit = [xMax + ring, yS, l / 2 + ring];
    M.add({ sys: "drainage", kind: "pit", name: "Stormwater pit", profile: "Stormwater pit 450 × 450", mat: "concrete", unit: "ea", host: "Front yard",
      a: [pit[0], -0.6, pit[2]], b: [pit[0], 0.02, pit[2]], d: 0.45, w: 0.45, up: [1, 0, 0], code: "D-SP" });
    for (const side of [1, -1]) {
      const mine = dps.filter((m) => Math.sign(m.b[0] || 1) === side);
      if (!mine.length) continue;
      const xc = side > 0 ? xMax + ring : xMin - ring;
      for (const dp of mine) {
        const x = dp.b[0], z = dp.b[2];
        pipe(M, "drainage", "Downpipe connection", "PVC DN90 stormwater drain", "Stormwater", [x, 0.02, z], [x, yS, z], 0.09, "D-SW", "pvcWhite");
        pipe(M, "drainage", "Stormwater branch", "PVC DN90 stormwater drain", "Stormwater", [x, yS, z], [xc, yS, z], 0.09, "D-SW", "pvcWhite");
      }
      const zBack = Math.min(...mine.map((m) => m.b[2]));
      pipe(M, "drainage", "Stormwater collector", "PVC DN90 stormwater drain", "Stormwater", [xc, yS, zBack], [xc, yS, pit[2]], 0.09, "D-SW", "pvcWhite");
      if (side < 0) pipe(M, "drainage", "Stormwater collector", "PVC DN90 stormwater drain", "Front yard", [xc, yS, pit[2]], [pit[0], yS, pit[2]], 0.09, "D-SW", "pvcWhite");
    }
    pipe(M, "drainage", "Stormwater to kerb", "PVC DN90 stormwater drain", "Front yard", [pit[0], yS, pit[2]], [pit[0], yS, front ?? l / 2 + 2.5], 0.09, "D-SK", "pvcWhite");
    M.add({ sys: "drainage", kind: "kerb", name: "Kerb connection", profile: "Stormwater connection to kerb", mat: "concrete", unit: "ea", host: "Front boundary",
      a: [pit[0], yS, front ?? l / 2 + 2.5], b: [pit[0], yS + 0.15, front ?? l / 2 + 2.5], d: 0.1, w: 0.1, up: [1, 0, 0], code: "D-KC" });
  }

  return { circuits: circuit, ...counts };
}

/* ---------- geometry helpers ---------- */

function pipe(M, sys, name, profile, host, a, b, dia, code, mat) {
  return M.add({ sys, kind: sys === "electrical" ? "cable" : "pipe", name, profile, mat, shape: "cyl", unit: "lm", host, a, b, d: dia, w: dia, up: Math.abs(b[1] - a[1]) > 1e-6 && Math.hypot(b[0] - a[0], b[2] - a[2]) < 1e-6 ? [1, 0, 0] : [0, 1, 0], code });
}

/* An orthogonal run: across in x, then in z, at the source's height. */
function orthoRun(M, sys, from, to, profile, host, dia, code, mat, name) {
  const mid = [to[0], from[1], from[2]];
  pipe(M, sys, name, profile, host, from, mid, dia, code, mat);
  pipe(M, sys, name, profile, host, mid, [to[0], from[1], to[2]], dia, code, mat);
}

function cableRun(M, from, to, profile, host, f, ceil) {
  const name = /Cat6/.test(profile) ? "Data cable" : /1\.5/.test(profile) ? "Lighting circuit" : "Power circuit";
  const start = f === 0 ? from : [from[0], ceil(f), from[2]];
  if (f > 0) pipe(M, "electrical", name, profile, "Riser · wall cavity", from, start, 0.012, "E-CB", cableMat(profile));
  orthoRun(M, "electrical", start, to, profile, host, 0.012, "E-CB", cableMat(profile), name);
}
const cableMat = (profile) => (/Cat6/.test(profile) ? "cableBlue" : "cableGrey");

function drop(M, at, yc, profile, host) {
  pipe(M, "electrical", /1\.5/.test(profile) ? "Lighting drop" : "Power drop", profile, host, [at[0], at[1] + 0.05, at[2]], [at[0], yc, at[2]], 0.012, "E-CB", cableMat(profile));
}

function waterRun(M, src, at, profile, host, yc, code, mat) {
  const top = [at[0], src[1] === yc ? yc : src[1], at[2]];
  orthoRun(M, "plumbing", src, top, profile, host, 0.02, code, mat, /hot/i.test(profile) ? "Hot water" : "Cold water");
  pipe(M, "plumbing", /hot/i.test(profile) ? "Hot water drop" : "Cold water drop", profile, host, top, at, 0.02, code, mat);
}

/* A wall-mounted point: a thin plate on the wall face. n = outward normal of the wall it sits on (into the room). */
function point(M, kind, name, profile, p, n, host, code, wdt, hgt) {
  const along = Math.abs(n[0]) > 0.5 ? [0, 0, 1] : [1, 0, 0];
  return M.add({ sys: "electrical", kind, name, profile, mat: "paintWhite", unit: "ea", host,
    a: [p[0] - along[0] * wdt / 2, p[1], p[2] - along[2] * wdt / 2], b: [p[0] + along[0] * wdt / 2, p[1], p[2] + along[2] * wdt / 2],
    d: hgt, w: 0.012, up: [0, 1, 0], code });
}

/* n spots spread round a room's perimeter (fraction offset `phase`), on the wall faces. */
function wallSpots(c, n, phase = 0.25) {
  const P = 2 * (c.w + c.l);
  const out = [];
  const inset = 0.012;
  for (let i = 0; i < n; i++) {
    let s = ((i + phase) / Math.max(1, n)) * P;
    if (s < c.w) out.push({ x: c.x + clampIn(s, c.w), z: c.z + inset, n: [0, 0, 1] });
    else if ((s -= c.w) < c.l) out.push({ x: c.x + c.w - inset, z: c.z + clampIn(s, c.l), n: [-1, 0, 0] });
    else if ((s -= c.l) < c.w) out.push({ x: c.x + c.w - clampIn(s, c.w), z: c.z + c.l - inset, n: [0, 0, -1] });
    else { s -= c.w; out.push({ x: c.x + inset, z: c.z + c.l - clampIn(s, c.l), n: [1, 0, 0] }); }
  }
  return out;
}
const clampIn = (s, L) => Math.max(0.25, Math.min(L - 0.25, s));

function cornerSpot(c, i) {
  const k = i % 4;
  return [
    { x: c.x + 0.25, z: c.z + c.l - 0.012, n: [0, 0, -1] },
    { x: c.x + c.w - 0.25, z: c.z + 0.012, n: [0, 0, 1] },
    { x: c.x + 0.012, z: c.z + 0.25, n: [1, 0, 0] },
    { x: c.x + c.w - 0.012, z: c.z + c.l - 0.25, n: [-1, 0, 0] },
  ][k];
}

/* n points on an even grid across the ceiling. */
function grid(c, n) {
  const cols = Math.max(1, Math.round(Math.sqrt((n * c.w) / Math.max(0.5, c.l))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out = [];
  for (let r = 0; r < rows && out.length < n; r++) {
    for (let k = 0; k < cols && out.length < n; k++) {
      out.push({ x: c.x + ((k + 0.5) / cols) * c.w, z: c.z + ((r + 0.5) / rows) * c.l });
    }
  }
  return out;
}

/* Fixtures in a wet room, in the same places interior.js puts them. */
function wetFixtures(c, y0) {
  const t = c.item.type;
  const out = [];
  if (t === "Bathroom") {
    const x0 = c.x + 0.06, z0 = c.z + 0.06, x1 = c.x + c.w - 0.06, z1 = c.z + c.l - 0.06;
    const sl = Math.min(1.0, c.l * 0.45), sw = Math.min(1.0, c.w * 0.45);
    out.push({ name: "Basin", x: x0 + 0.45, z: z0 + 0.1, hot: true, cold: true, waste: "DN50" });
    out.push({ name: "Toilet", x: x1 - 0.2, z: z0 + 0.12, hot: false, cold: true, waste: "DN100" });
    out.push({ name: "Shower", x: x0 + sw / 2, z: z1 - sl / 2, hot: true, cold: true, waste: "DN50" });
    if (c.w * c.l > 7) out.push({ name: "Bath", x: x1 - 0.3, z: z1 - 0.38, hot: true, cold: true, waste: "DN50" });
  } else if (t === "Kitchen") {
    const k = c.item.src || {};
    const alongX = c.w >= c.l;
    const run = Math.min((alongX ? c.w : c.l) - 0.1, Math.max(2.4, +k.benchLengthM || 3));
    const u = run * 0.35;
    const P = (uu, tt) => (alongX ? { x: c.x + 0.05 + uu, z: c.z + 0.05 + tt } : { x: c.x + 0.05 + tt, z: c.z + 0.05 + uu });
    out.push({ name: "Kitchen sink", ...P(u, 0.1), hot: true, cold: true, waste: "DN50" });
    out.push({ name: "Dishwasher", ...P(u + 0.75, 0.1), hot: false, cold: true, waste: "DN50" });
    out.push({ name: "Fridge water", ...P(Math.max(0.3, run - 0.3), 0.1), hot: false, cold: true, waste: null });   // tap only, no waste
  }
  void y0;
  return out;
}

/* ---------- what the trades will be asked to certify ---------- */

/**
 * Compliance checklist for the services in this model. Each item says what
 * the rule is, whether the model meets it, and who signs it off.
 */
export function servicesCompliance(S) {
  const M = S.members;
  const rooms = S.layout.floors.flatMap((fl) => fl.cells.map((c) => ({ ...c, level: fl.level })));
  const has = (kind, host) => M.some((m) => m.kind === kind && m.host === host);
  const hostOf = (c) => `${c.item.name} · ${storey(c.level)}`;
  const beds = rooms.filter((c) => rulesFor(c.item.type) === ELEC_RULES.Bedroom);
  const halls = rooms.filter((c) => c.item.type === "Hallway" || c.item.type === "Stair");
  const wet = rooms.filter((c) => c.item.type === "Bathroom" || c.item.type === "Laundry");
  const levels = S.layout.floors.map((fl) => fl.level);
  return [
    { key: "smoke-bed", rule: "Smoke alarm in every bedroom", ref: "NCC 2022 Vol 2 · H3D6 / ABCB Housing Provisions 9.5", who: "Electrician", ok: beds.every((c) => has("smoke", hostOf(c))) },
    { key: "smoke-hall", rule: "Smoke alarm in hallways serving bedrooms, and on every storey", ref: "NCC 2022 · Housing Provisions 9.5.2", who: "Electrician",
      ok: levels.every((f) => M.some((m) => m.kind === "smoke" && m.host.endsWith(storey(f)))) && halls.every((c) => has("smoke", hostOf(c))) },
    { key: "smoke-ic", rule: "Smoke alarms 240 V hard-wired and interconnected", ref: "AS 3786 · NCC 2022 Housing Provisions 9.5.3", who: "Electrician", ok: M.filter((m) => m.kind === "smoke").every((m) => /interconnected/.test(m.profile)) },
    { key: "rcd", rule: "Every final sub-circuit RCD protected (30 mA)", ref: "AS/NZS 3000:2018 · 2.6.3", who: "Electrician", ok: M.some((m) => /RCBO/.test(m.profile)) },
    { key: "fan", rule: "Exhaust fan in every bathroom and laundry without an openable window", ref: "NCC 2022 · F6D12 / Housing Provisions 10.8", who: "Electrician", ok: wet.every((c) => has("fan", hostOf(c))) },
    { key: "downlight", rule: "Downlights IC-4 rated where insulation covers them", ref: "AS/NZS 60598.2.2 · NCC 2022 Housing Provisions 13.7", who: "Electrician", ok: M.filter((m) => m.name === "Downlight").every((m) => /IC-4/.test(m.profile)) },
    { key: "temper", rule: "Hot water to bathrooms tempered to 50 °C max", ref: "AS/NZS 3500.4 · 1.9", who: "Plumber", ok: M.some((m) => /Tempering valve/.test(m.profile)) },
    { key: "fw", rule: "Floor waste in every bathroom and laundry", ref: "AS/NZS 3500.2 · NCC 2022 Housing Provisions 10.2", who: "Plumber", ok: wet.every((c) => has("floorwaste", hostOf(c))) },
    { key: "vent", rule: "Drainage system vented to atmosphere", ref: "AS/NZS 3500.2 · Section 6", who: "Plumber", ok: M.some((m) => m.name === "Vent stack") || !M.some((m) => m.sys === "drainage" && /DN100/.test(m.profile)) },
    { key: "org", rule: "Overflow relief gully, 150 below the lowest fixture", ref: "AS/NZS 3500.2 · 4.6.6", who: "Plumber", ok: M.some((m) => m.kind === "org") },
    { key: "io", rule: "Inspection openings at the boundary and the upstream end", ref: "AS/NZS 3500.2 · 4.5", who: "Plumber", ok: M.filter((m) => m.kind === "io").length >= 2 || !M.some((m) => m.name === "Sewer drain") },
    { key: "sw", rule: "Every downpipe connected to the stormwater system", ref: "AS/NZS 3500.3 · NCC 2022 Housing Provisions 7.4", who: "Plumber",
      ok: M.filter((m) => m.kind === "downpipe" && m.b[1] < 0.1).every((dp) => M.some((m) => m.name === "Downpipe connection" && Math.abs(m.a[0] - dp.b[0]) < 1e-3 && Math.abs(m.a[2] - dp.b[2]) < 1e-3)) },
  ];
}

/* The services schedule, priced with SERVICE_RATES, grouped by trade. */
export function servicesTakeoff(rows) {
  const trades = { electrical: "Electrical", plumbing: "Plumbing", drainage: "Drainage" };
  const out = {};
  for (const r of rows) {
    if (!trades[r.sys]) continue;
    const rate = SERVICE_RATES[r.profile] ?? 0;
    const t = (out[r.sys] ||= { sys: r.sys, label: trades[r.sys], lines: [], total: 0 });
    const amount = Math.round(rate * r.qty);
    t.lines.push({ ...r, rate, amount });
    t.total += amount;
  }
  return Object.values(out);
}
