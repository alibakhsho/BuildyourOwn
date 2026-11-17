/* The residential estimate against published 2026 Australian benchmarks.
   BMT 2026, Sydney, $/m² GFA ex GST incl. prelims and margin:
   3-bed single-level brick veneer project home A$2,176 / 2,424 / 2,895
   (low / medium / high). A homeowner who sees a number far outside that
   band stops trusting every other line, so this guards the calibration. */
import { Estimator } from "../src/logic/estimator.js";
import { RESIDENTIAL_PRESETS } from "../src/presets/residential-presets.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${JSON.stringify(detail)}`}`);
  good ? pass++ : fail++;
};
const preset = (id) => RESIDENTIAL_PRESETS.find((p) => p.id === id).buildSpec();

{
  const e = Estimator.buildEstimate(preset("brick_veneer_3bed"), "AU");
  ok("3-bed brick veneer: inside the BMT 2026 project-home band", e.ratePerM2 >= 2176 && e.ratePerM2 <= 2895, e.ratePerM2);
  // each trade's labour is only the work its material lines don't already include
  const elec = e.labourLines.find((l) => l.tradeKey === "electrical").total;
  const elecMat = e.materialLines.filter((l) => l.materialId === "electrical_basic").reduce((n, l) => n + l.total, 0);
  ok("electrical: installed rough-in + fit-off isn't charged twice", elec < elecMat * 0.25, { elec, elecMat });
}

{
  const base = preset("brick_veneer_3bed");
  const one = Estimator.buildEstimate(base, "AU");
  const two = Estimator.buildEstimate({ ...base, floors: 2, widthM: 9, lengthM: 10, staircaseType: "timber" }, "AU");
  ok("two storeys cost more per m² than one, same floor area", two.ratePerM2 > one.ratePerM2 * 1.04, { one: one.ratePerM2, two: two.ratePerM2 });
  ok("the upper floor gets structural flooring", two.materialLines.some((l) => l.materialId === "particleboard_floor"));
  ok("a single storey doesn't", !one.materialLines.some((l) => l.materialId === "particleboard_floor"));
}

{
  const e = Estimator.buildEstimate(preset("granny_flat"), "AU");
  ok("granny flat: total in the A$120k–250k range builders quote", e.total >= 120000 && e.total <= 250000, Math.round(e.total));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
