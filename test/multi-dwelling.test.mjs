/* Multi-dwelling quoting: project economics on top of the house estimator. */
import { buildMultiEstimate, learningFactor, volumeDiscount, MD_DEFAULT_ASSUMPTIONS } from "../src/logic/multi-dwelling.js";
import { Estimator } from "../src/logic/estimator.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const house = {
  widthM: 8, lengthM: 14, floors: 2, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  siteCondition: "flat", framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: true, solar: false, staircaseType: "timber",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [], kitchens: [], bathrooms: [], extras: [],
};
const one = Estimator.buildEstimate(house, "AU");

ok("learning: first unit is 100%", learningFactor(1) === 1);
ok("learning: 2 units average (1 + 0.92)/2", near(learningFactor(2), 0.96));
ok("learning: never below the floor", learningFactor(10000) >= 0.8 - 1e-9);
ok("learning: more units → cheaper on average", learningFactor(20) < learningFactor(5));
ok("volume: 1 house no discount", volumeDiscount(1) === 0);
ok("volume: 12 houses → 9%", volumeDiscount(12) === 0.09);

{
  const m = buildMultiEstimate({ types: [{ id: "a", name: "A", count: 1, spec: house }] }, "AU");
  ok("single dwelling: materials match the house estimator", near(m.materialsTotal, one.materialsTotal));
  ok("single dwelling: labour matches", near(m.labourTotal, one.labourTotal));
  ok("single dwelling: no shared civil under 3 lots", !m.siteLines.some((l) => /Shared civil/.test(l.label)));
}
{
  const m = buildMultiEstimate({ types: [{ id: "a", name: "A", count: 12, spec: house }] }, "AU");
  ok("12 homes: 12 dwellings counted", m.dwellings === 12);
  ok("12 homes: cheaper per house than a one-off (house-for-house)", m.houseOnlyTotal / 12 < one.total, `${(m.houseOnlyTotal / 12).toFixed(0)} vs ${one.total.toFixed(0)}`);
  ok("12 homes: total = subtotal + prelims + margin + contingency", near(m.total, m.subtotal + m.prelims + m.margin + m.contingency));
  ok("12 homes: site works include shared civil", m.siteLines.some((l) => /Shared civil/.test(l.label)));
  ok("12 homes: per-lot civil = 12 × rate", near(m.siteLines[0].total, 12 * MD_DEFAULT_ASSUMPTIONS.site.civilPerLot));
  ok("12 homes: built in 3 waves of 4", m.waves === 3);
  ok("12 homes: programme longer than one house, shorter than 12 in a row",
    m.totalWeeks > one.timeline.totalWeeks && m.totalWeeks < 12 * one.timeline.totalWeeks);
}
{
  const m = buildMultiEstimate({ types: [
    { id: "a", name: "A", count: 6, spec: house },
    { id: "b", name: "B", count: 4, spec: { ...house, floors: 1, widthM: 12 } },
  ] }, "AU");
  ok("mixed types: dwellings add up", m.dwellings === 10);
  ok("mixed types: one row per type", m.types.length === 2);
  ok("mixed types: GFA is the sum of every unit", near(m.gfaM2, m.types.reduce((a, t) => a + t.gfaM2 * t.count, 0)));
  ok("mixed types: learning is per design, not pooled", m.types[0].learningFactor !== m.types[1].learningFactor);
}
{
  const custom = buildMultiEstimate({ types: [{ id: "a", count: 5, spec: house }], assumptions: { marginPct: 0.2, site: { civilPerLot: 0 } } }, "AU");
  const base = buildMultiEstimate({ types: [{ id: "a", count: 5, spec: house }] }, "AU");
  ok("assumptions override: higher margin → higher total", custom.total > base.total);
  ok("assumptions override: partial site override keeps other defaults", custom.siteLines.find((l) => /Fencing/.test(l.label)).rate === MD_DEFAULT_ASSUMPTIONS.site.fencingPerLot);
}
{
  const m = buildMultiEstimate({ types: [{ id: "a", count: 8, spec: house }] }, "AU");
  const sum = m.labourLines.reduce((a, l) => a + l.total, 0);
  ok("labour by trade adds up to the labour total (Site Office budgets)", near(sum, m.labourTotal, 1e-9));
  ok("labour lines keep their trade keys", m.labourLines.every((l) => l.tradeKey));
  const { tradeTotalsFromEstimate } = await import("../src/state/cm.js").catch(() => ({}));
  if (tradeTotalsFromEstimate) {
    const tt = tradeTotalsFromEstimate(m);
    ok("Site Office: trade budgets reconcile to the project total", near(Object.values(tt).reduce((a, b) => a + b, 0), m.total, 1e-6));
  }
}
ok("empty project costs nothing", buildMultiEstimate({ types: [] }, "AU").total === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
