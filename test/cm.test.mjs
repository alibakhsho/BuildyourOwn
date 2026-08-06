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

// --- Deleting a job takes its children with it ---
CM.deleteJob(job.id);
ok("job gone", CM.getJob(job.id), null);
ok("no orphan cost centres", CM.listCostCentres(job.id).length, 0);
ok("no orphan POs", CM.listPurchaseOrders(job.id).length, 0);
ok("no orphan claims", CM.listClaims(job.id).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
