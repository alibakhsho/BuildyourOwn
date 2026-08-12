// cm.js is localStorage-backed; shim it so the domain logic can be tested headless.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
const CM = await import("../src/state/cm.js");

let pass = 0, fail = 0;
const ok = (name, got, want, tol = 1e-6) => {
  const good = typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
};

const client = CM.createClient({ name: "M & J Hastings" });
const job = CM.createJob({ name: "Hastings Rd", clientId: client.id, contractValue: 600000 });

ok("job number format", /^J-\d{4}-\d{4}$/.test(job.jobNo), true);
ok("cost centres seeded", CM.listCostCentres(job.id).length, CM.DEFAULT_COST_CENTRES.length);
ok("contract sum starts at contract value", CM.contractSum(job.id), 600000);

// --- Variations only move the contract sum once APPROVED ---
const v = CM.createVariation(job.id, { title: "Upgrade kitchen", cost: 12000, charge: 18000 });
ok("draft variation does not move contract sum", CM.contractSum(job.id), 600000);
CM.approveVariation(v.id, "Client");
ok("approved variation moves contract sum", CM.contractSum(job.id), 618000);

// --- Draft POs commit nothing; sent POs commit ---
const cc = CM.listCostCentres(job.id).find(c => c.trade === "frame");
CM.updateCostCentre(cc.id, { budget: 80000 });
const po = CM.createPurchaseOrder(job.id, {
  costCentreId: cc.id,
  lines: [{ description: "Wall frames", qty: 1, rate: 55000 }],
});
ok("PO total", CM.poTotal(po), 55000);
ok("draft PO commits nothing", CM.jobFinancials(job.id).totalCommitted, 0);
CM.updatePurchaseOrder(po.id, { status: "sent" });
ok("sent PO commits", CM.jobFinancials(job.id).totalCommitted, 55000);

// --- Over-budget detection ---
const before = CM.jobFinancials(job.id).rows.find(r => r.id === cc.id);
ok("under budget => not at risk", before.atRisk, false);
ok("variance correct", before.variance, 25000);
CM.updatePurchaseOrder(po.id, { lines: [{ description: "Wall frames", qty: 1, rate: 92000 }] });
const after = CM.jobFinancials(job.id).rows.find(r => r.id === cc.id);
ok("over budget => at risk", after.atRisk, true);
ok("negative variance", after.variance, -12000);

// --- Progress claim: work-to-date, less prior, less retention, then GST ---
const claim = CM.createClaim(job.id, {
  retentionRate: 0.05,
  lines: [
    { name: "Slab",  value: 100000, percentComplete: 100 },
    { name: "Frame", value: 100000, percentComplete: 50 },
  ],
});
const t1 = CM.claimTotals(claim, 0);
ok("work to date", t1.workToDate, 150000);
ok("this claim (no prior)", t1.thisClaim, 150000);
ok("retention 5%", t1.retention, 7500);
ok("net after retention", t1.net, 142500);
ok("GST on the NET, not the gross", t1.gst, 14250);
ok("claim total", t1.total, 156750);

// Second claim deducts what was already certified
const t2 = CM.claimTotals(claim, 100000);
ok("prior claim deducted", t2.thisClaim, 50000);
ok("retention on this claim only", t2.retention, 2500);
ok("total on second claim", t2.total, 52250);

// Over-certification cannot produce a negative invoice
ok("never negative", CM.claimTotals(claim, 999999).thisClaim, 0);

// --- Schedule: working days skip weekends ---
const task = CM.createTask(job.id, { name: "Frame", startDate: "2026-08-03", days: 10 }); // Mon
ok("10 working days lands on the 2nd Friday", CM.taskEndDate(task).toISOString().slice(0, 10), "2026-08-14");

// --- Estimate -> budget bridge ---
// One centre carries "roof", two carry "concrete" -> 3 centres touched.
const n = CM.applyEstimateToBudget(job.id, { roof: 40000, concrete: 90000 });
ok("estimate maps onto matching trades", n, 3);
const roofRows = CM.listCostCentres(job.id).filter(c => c.trade === "roof");
ok("single-centre trade takes the lot", roofRows.reduce((s, r) => s + r.budget, 0), 40000);
const concreteRows = CM.listCostCentres(job.id).filter(c => c.trade === "concrete");
ok("multi-centre trade splits evenly", concreteRows.map(r => r.budget), [45000, 45000]);
ok("split conserves the total", concreteRows.reduce((s, r) => s + r.budget, 0), 90000);
ok("unknown trade is ignored", CM.applyEstimateToBudget(job.id, { not_a_trade: 5000 }), 0);

// --- Quote -> trade totals (what the "Send to Site Office" button feeds in) ---
// Labour splits 3:1 between roof and concrete; everything else in the quote
// (materials, plant, prelims, margin) rides along pro-rata on that weighting.
const estimate = {
  total: 200000,
  labourLines: [
    { tradeKey: "roof", trade: "Roofers", total: 30000 },
    { tradeKey: "concrete", trade: "Concretors", total: 10000 },
  ],
};
const tt = CM.tradeTotalsFromEstimate(estimate);
ok("trade totals reconcile to the quote total", Math.round(tt.roof + tt.concrete), 200000);
ok("roof takes its 75% labour share", Math.round(tt.roof), 150000);
ok("concrete takes its 25% labour share", Math.round(tt.concrete), 50000);
ok("no labour means nothing to map", CM.tradeTotalsFromEstimate({ total: 5000, labourLines: [] }), {});
ok("a missing estimate is not a crash", CM.tradeTotalsFromEstimate(null), {});
// Lines without a tradeKey can't be joined to a cost centre, so they're dropped
// rather than silently bucketed into the wrong trade.
ok("untagged labour lines are ignored",
  CM.tradeTotalsFromEstimate({ total: 100, labourLines: [{ trade: "Roofers", total: 100 }] }), {});

// --- Job pipeline: advance / revert / off-ramp ---
const pj = CM.createJob({ name: "Pipeline test" });
ok("a new job starts as a lead", pj.status, "lead");
ok("next after lead is estimating", CM.nextJobStatus("lead"), "estimating");
ok("nothing before lead", CM.prevJobStatus("lead"), null);
ok("nothing after closed", CM.nextJobStatus("closed"), null);
ok("lost is off the line — no next", CM.nextJobStatus("lost"), null);
ok("advance moves one step", CM.advanceJob(pj.id), "estimating");
ok("advance is persisted", CM.getJob(pj.id).status, "estimating");
ok("revert moves back one step", CM.revertJob(pj.id), "lead");
// Walk the whole line and confirm it stops cleanly at the end.
let walk = "lead", steps = 0;
while (CM.nextJobStatus(walk)) { walk = CM.nextJobStatus(walk); steps++; }
ok("the main line is seven stages long", steps + 1, CM.JOB_PIPELINE.length);
ok("the line ends on closed", walk, "closed");
ok("advancing a closed job is a no-op", (CM.setJobStatus(pj.id, "closed"), CM.advanceJob(pj.id)), "closed");
CM.deleteJob(pj.id);

// --- Deleting a job takes its children with it ---
CM.deleteJob(job.id);
ok("job gone", CM.getJob(job.id), null);
ok("no orphan cost centres", CM.listCostCentres(job.id).length, 0);
ok("no orphan POs", CM.listPurchaseOrders(job.id).length, 0);
ok("no orphan claims", CM.listClaims(job.id).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
