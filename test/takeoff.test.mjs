import { calibrate, evaluateMeasurement, rollUpByCostItem, toQuoteLines,
         snapOrtho, hitTest, polygonArea, scaleFromRatio } from "../src/logic/takeoff.js";

let pass = 0, fail = 0;
const ok = (name, got, want, tol = 1e-6) => {
  const good = typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
};

// The synthetic plan: outer envelope drawn 80,80 -> 720,480 = 640 x 400 px.
// Calibrate that 640 px run as a known 12.8 m wall -> 50 px per metre.
const { pxPerMetre } = calibrate({x:80,y:80}, {x:720,y:80}, 12.8);
ok("calibration px/m", pxPerMetre, 50);

// Area of the full envelope: 12.8 m x 8.0 m = 102.4 m2
const envelope = { type:"area", points:[{x:80,y:80},{x:720,y:80},{x:720,y:480},{x:80,y:480}], multiplier:1 };
ok("envelope area m2", evaluateMeasurement(envelope, pxPerMetre).value, 102.4);
ok("envelope perimeter m", evaluateMeasurement(envelope, pxPerMetre).secondary.value, 41.6);

// Winding direction must not matter
const reversed = { ...envelope, points: [...envelope.points].reverse() };
ok("area is winding-independent", evaluateMeasurement(reversed, pxPerMetre).value, 102.4);

// Linear run with wall height -> cladding area
const wall = { type:"linear", points:[{x:80,y:80},{x:720,y:80}], multiplier:1, height:2.4 };
ok("wall run m", evaluateMeasurement(wall, pxPerMetre).value, 12.8);
ok("wall area m2 (x2.4 high)", evaluateMeasurement(wall, pxPerMetre).secondary.value, 30.72);

// Volume: 102.4 m2 slab at 0.1 m = 10.24 m3
ok("slab volume m3", evaluateMeasurement({ ...envelope, type:"volume", depth:0.1 }, pxPerMetre).value, 10.24);

// Count with multiplier
ok("count x2", evaluateMeasurement({ type:"count", points:[{x:1,y:1},{x:2,y:2},{x:3,y:3}], multiplier:2 }, pxPerMetre).value, 6);

// Uncalibrated drawings must refuse to report a quantity
ok("no scale => invalid", evaluateMeasurement(envelope, null).valid, false);
ok("count works without scale", evaluateMeasurement({ type:"count", points:[{x:1,y:1}], multiplier:1 }, null).valid, true);

// Roll-up groups by cost item and sums
const rolled = rollUpByCostItem([
  { ...envelope, id:"a", costItem:"Slab" },
  { ...envelope, id:"b", costItem:"Slab" },
], pxPerMetre);
ok("roll-up groups", rolled.length, 1);
ok("roll-up sums", rolled[0].quantity, 204.8);

// Waste allowance must inflate the ordered quantity, not the measured one
const lines = toQuoteLines([{ ...envelope, id:"a", costItem:"Tiling", wastePct:10, rate:65 }], pxPerMetre);
ok("measured qty unchanged", lines[0].measuredQty, 102.4);
ok("ordered qty +10% waste", lines[0].qty, 112.64, 0.01);
ok("line total uses waste qty", lines[0].total, 7321.6, 0.01);

// Ortho snapping locks a near-horizontal drag flat
ok("ortho snaps to horizontal", snapOrtho({x:0,y:0}, {x:100,y:7}, true), {x:100,y:0});
ok("ortho snaps to 45", snapOrtho({x:0,y:0}, {x:100,y:96}, true), {x:98,y:98});
ok("ortho off passes through", snapOrtho({x:0,y:0}, {x:100,y:7}, false), {x:100,y:7});

// Hit testing finds the polygon under the cursor and misses outside it
ok("hit inside polygon", hitTest({x:400,y:280}, [{ ...envelope, id:"e" }], 6)?.id, "e");
ok("miss outside polygon", hitTest({x:20,y:20}, [{ ...envelope, id:"e" }], 6), null);

// Printed-ratio scale: A1 sheet (841 mm) at 1:100, image 800 px wide
ok("ratio scale px/m", scaleFromRatio(100, 800, 841).pxPerMetre, (800/841)*10, 1e-9);

// Guard rails
try { calibrate({x:0,y:0},{x:640,y:0}, 0); ok("rejects zero length", false, true); }
catch { ok("rejects zero length", true, true); }
try { calibrate({x:0,y:0},{x:3,y:0}, 5); ok("rejects tiny calibration line", false, true); }
catch { ok("rejects tiny calibration line", true, true); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
