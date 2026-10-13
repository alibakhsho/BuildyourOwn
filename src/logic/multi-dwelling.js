/* =========================================================================
   MODULE: multi-dwelling.js
   Quote a project of many homes — a duplex, a row of townhouses, a 40-lot
   house-and-land estate — from a mix of house types.

   It is NOT "one house × N". Each house type is priced by the residential
   Estimator as a one-off, then the project-level economics a builder
   actually sees are applied on top:

     - Volume purchasing: materials discount stepping up with dwelling count
       (trade accounts, bulk frames/trusses, full-truck deliveries).
     - Learning curve on labour: crews get faster on repeat units of the
       SAME design (Wright's law, 92% per doubling, floored at 80%).
     - Shared preliminaries: one site office, one supervisor, one set of
       insurances for the whole job — a lower % on the combined value
       instead of every house carrying its own.
     - Equipment: hire shared between houses built side by side.
     - Site works the single-house engine never sees: per-lot civil,
       services, driveways, fencing, landscaping, plus fixed shared civil
       and subdivision/title costs.
     - Programme: houses built in waves of `concurrent` at a time, each
       wave starting part-way through the previous one.

   Every assumption is a field on mdSpec.assumptions, shown and editable in
   the UI, so a builder can replace the defaults with their own numbers.
   Pure: no React, no three.js. Tests: test/multi-dwelling.test.mjs.
   ========================================================================= */
import { Estimator } from "./estimator.js";

export const MD_DEFAULT_ASSUMPTIONS = {
  // materials discount by total dwellings: [minDwellings, discount]
  volumeTiers: [[1, 0], [2, 0.03], [5, 0.06], [10, 0.09], [25, 0.11], [50, 0.13]],
  learningRate: 0.92,      // labour per unit falls to 92% each time cumulative units of a type double
  learningFloor: 0.8,      // never below 80% of the first unit's labour
  equipmentShare: 0.85,    // equipment cost per house when 3+ are built together
  marginPct: 0.12,         // builder margin on a multi-dwelling job (one-off houses use 15%)
  contingencyPct: 0.05,
  site: {
    civilPerLot: 18000,        // stormwater, sewer & water connections, driveway crossover
    fencingPerLot: 4500,
    landscapingPerLot: 8000,
    sharedCivilFixed: 60000,   // internal road, detention, entry works — only for 3+ lots
    subdivisionFixed: 25000,   // survey, council fees, title registration
    subdivisionPerLot: 3500,
  },
  concurrent: 4,             // houses under construction at once
  waveOverlap: 0.5,          // the next wave starts when the previous is 50% through
};

export function volumeDiscount(n, tiers = MD_DEFAULT_ASSUMPTIONS.volumeTiers) {
  let d = 0;
  for (const [min, disc] of tiers) if (n >= min) d = disc;
  return d;
}

/* Average labour factor over units 1..n of one design (unit i costs i^b). */
export function learningFactor(n, rate = 0.92, floor = 0.8) {
  if (n <= 1) return 1;
  const b = Math.log(rate) / Math.log(2);
  let s = 0;
  for (let i = 1; i <= n; i++) s += Math.max(floor, Math.pow(i, b));
  return s / n;
}

function prelimsPctFor(gfaTotal) {
  return gfaTotal < 300 ? 0.08 : gfaTotal < 1500 ? 0.06 : 0.05;
}

/**
 * @param {{ types: Array<{id,name,count,spec}>, assumptions?: object }} mdSpec
 * @param {"AU"|"US"|"UK"} region
 */
export function buildMultiEstimate(mdSpec, region = "AU") {
  const A = { ...MD_DEFAULT_ASSUMPTIONS, ...(mdSpec?.assumptions || {}) };
  A.site = { ...MD_DEFAULT_ASSUMPTIONS.site, ...((mdSpec?.assumptions || {}).site || {}) };
  const types = (mdSpec?.types || []).filter((t) => (+t.count || 0) > 0 && t.spec);
  const dwellings = types.reduce((a, t) => a + Math.round(+t.count), 0);
  const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region] ?? 0;
  const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region] || "Tax";

  const discount = volumeDiscount(dwellings, A.volumeTiers);
  const shareEquip = dwellings >= 3 ? A.equipmentShare : 1;

  let materials = 0, labour = 0, equipment = 0, gfa = 0, oneOffTotal = 0, maxWeeks = 0;
  // Labour by trade across every unit — Site Office seeds job budgets from these.
  const byTrade = new Map();
  const perType = types.map((t) => {
    const n = Math.round(+t.count);
    const e = Estimator.buildEstimate(t.spec, region);
    const lf = learningFactor(n, A.learningRate, A.learningFloor);
    const mat = e.materialsTotal * (1 - discount) * n;
    const lab = e.labourTotal * lf * n;
    for (const l of e.labourLines || []) {
      const k = l.tradeKey || l.label;
      const cur = byTrade.get(k) || { ...l, qty: 0, total: 0 };
      cur.total += l.total * lf * n;
      cur.qty = (cur.qty || 0) + (l.qty || 0) * n;
      byTrade.set(k, cur);
    }
    const eq = e.equipmentTotal * shareEquip * n;
    materials += mat; labour += lab; equipment += eq;
    gfa += (e.takeoff?.gfaM2 || 0) * n;
    oneOffTotal += e.total * n;
    maxWeeks = Math.max(maxWeeks, e.timeline?.totalWeeks || 0);
    return {
      id: t.id, name: t.name || "House type", count: n,
      gfaM2: e.takeoff?.gfaM2 || 0,
      oneOffUnit: e.total,
      materialsDiscount: discount, learningFactor: lf,
      buildCost: mat + lab + eq,   // direct cost, all units of this type
      unitWeeks: e.timeline?.totalWeeks || 0,
    };
  });

  const direct = materials + labour + equipment;
  const S = A.site;
  const lots = dwellings;
  const siteLines = lots ? [
    { label: "Civil & services connections", qty: lots, unit: "lot", rate: S.civilPerLot },
    { label: "Fencing", qty: lots, unit: "lot", rate: S.fencingPerLot },
    { label: "Landscaping & driveways", qty: lots, unit: "lot", rate: S.landscapingPerLot },
    { label: "Subdivision & titles (per lot)", qty: lots, unit: "lot", rate: S.subdivisionPerLot },
    { label: "Subdivision — survey, council, registration", qty: 1, unit: "item", rate: S.subdivisionFixed },
    ...(lots >= 3 ? [{ label: "Shared civil — internal road, detention, entry", qty: 1, unit: "item", rate: S.sharedCivilFixed }] : []),
  ].map((l) => ({ ...l, total: l.qty * l.rate })) : [];
  const siteWorks = siteLines.reduce((a, l) => a + l.total, 0);

  const subtotal = direct + siteWorks;
  const prelimsPct = prelimsPctFor(gfa);
  const prelims = subtotal * prelimsPct;
  const margin = subtotal * A.marginPct;
  const contingency = subtotal * A.contingencyPct;
  const total = subtotal + prelims + margin + contingency;

  // Programme: waves of `concurrent` houses, each wave overlapping the last.
  const waves = Math.max(1, Math.ceil(dwellings / Math.max(1, A.concurrent)));
  const totalWeeks = dwellings ? Math.round(maxWeeks + (waves - 1) * maxWeeks * A.waveOverlap) : 0;

  return {
    kind: "multi", mode: "multi", region, dwellings, types: perType,
    // shapes the rest of the app reads off any estimate
    takeoff: { gfaM2: gfa },
    timeline: { totalWeeks: dwellings ? Math.round(maxWeeks + (Math.max(1, Math.ceil(dwellings / Math.max(1, A.concurrent))) - 1) * maxWeeks * A.waveOverlap) : 0, stages: [] },
    gfaM2: gfa,
    materialsTotal: materials, labourTotal: labour, equipmentTotal: equipment,
    labourLines: [...byTrade.values()],
    siteLines, siteWorks,
    subtotal, prelims, prelimsPct, margin, contingency,
    total,
    perDwelling: dwellings ? total / dwellings : 0,
    ratePerM2: gfa ? total / gfa : 0,
    // What the same homes would cost quoted one at a time (no site works) —
    // the honest comparison is house-for-house, so site works are excluded.
    oneOffTotal,
    houseOnlyTotal: total - siteWorks * (1 + prelimsPct + A.marginPct + A.contingencyPct),
    discount, waves, totalWeeks,
    taxRate, taxLabel,
    assumptions: A,
  };
}
