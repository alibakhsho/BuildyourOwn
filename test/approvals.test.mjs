// cm.js is localStorage-backed; shim it so the domain logic can be tested headless.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
const A = await import("../src/logic/approvals.js");
const CM = await import("../src/state/cm.js");

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
  good ? pass++ : fail++;
};
const keys = (site) => A.requiredApprovals(site).map(r => r.key);

// --- What each site needs ---
const house = keys({ state: "QLD", buildType: "new_dwelling", contractValue: 450000 });
ok("new QLD house needs a soil test", house.includes("soil_test"), true);
ok("new QLD house needs structural design", house.includes("structural_design"), true);
ok("QLD uses NatHERS, not BASIX", [house.includes("energy"), house.includes("basix")], [true, false]);
ok("QLD over $150k pays QLeave", house.includes("lsl_levy"), true);
ok("plain lot needs no planning approval", house.includes("planning"), false);
ok("no BAL off bushfire land", house.includes("bal"), false);

const nsw = keys({ state: "NSW", buildType: "new_dwelling", contractValue: 200000 });
ok("NSW uses BASIX", [nsw.includes("basix"), nsw.includes("energy")], [true, false]);
ok("NSW under $250k pays no LSL levy", nsw.includes("lsl_levy"), false);

const bush = keys({ state: "VIC", buildType: "new_dwelling", bushfire: true, heritage: true });
ok("bushfire overlay adds BAL", bush.includes("bal"), true);
ok("heritage triggers planning + heritage report", [bush.includes("planning"), bush.includes("heritage")], [true, true]);

const paint = keys({ state: "QLD", buildType: "renovation", contractValue: 20000 });
ok("cosmetic reno needs no engineering", paint.filter(k => ["soil_test", "structural_design"].includes(k)), []);

ok("state-specific building approval label",
  A.requiredApprovals({ state: "VIC" }).find(r => r.key === "building_approval").label,
  "Building permit (registered building surveyor)");

// --- Quote readiness ---
const recs = A.requiredApprovals({ state: "QLD", buildType: "new_dwelling", contractValue: 450000 })
  .map(r => ({ ...r, status: "required", feeActual: null, costImpact: 0 }));
let r = A.quoteReadiness(recs, 450000);
ok("starts indicative", r.stage, "indicative");
ok("cannot issue final while engineering is out", r.canIssueFinal, false);
ok("all fees are provisional at the start", r.fees, r.provisionalFees);

// Engineering comes back: reactive clay site, slab costs $18k more; engineer charged $3,600.
for (const x of recs) if (x.affectsPrice) x.status = "submitted";
recs.find(x => x.key === "structural_design").feeActual = 3600;
recs.find(x => x.key === "soil_test").costImpact = 18000;
r = A.quoteReadiness(recs, 450000);
ok("all price inputs in => fixed price", r.stage, "fixed");
ok("cost impact flows into the total", r.costImpact, 18000);
ok("permits outstanding become conditions", r.conditions.some(c => c.key === "building_approval"), true);
ok("nothing price-affecting left open", r.blocking.length, 0);
ok("actual fee replaces allowance", r.total, 450000 + r.fees + 18000);

for (const x of recs) x.status = "approved";
ok("everything issued => approved", A.quoteReadiness(recs, 450000).stage, "approved");

// "Not required" items don't block and don't cost anything
const waived = recs.map(x => ({ ...x, status: x.affectsPrice ? "not_required" : "approved" }));
ok("waived items cost nothing", A.quoteReadiness(waived, 100).fees,
  waived.filter(x => x.status !== "not_required").reduce((n, x) => n + (x.feeActual ?? x.feeAllowance), 0));

// --- Store integration ---
const job = CM.createJob({ name: "Smith St", contractValue: 450000 });
CM.setSite(job.id, { state: "QLD", buildType: "new_dwelling" });
const list = CM.listApprovals(job.id);
ok("approvals seeded from site", list.some(a => a.key === "soil_test"), true);
ok("job quote starts indicative", CM.jobQuoteReadiness(job.id).stage, "indicative");

const soil = list.find(a => a.key === "soil_test");
CM.updateApproval(soil.id, { provider: { name: "FNQ Geotech" }, status: "requested" });
const doc = CM.attachApprovalDocument(soil.id, { name: "soil-report.pdf", blobId: "blob_1", mimeType: "application/pdf" });
ok("engineer's report filed as a job document", CM.listDocuments(job.id).some(d => d.id === doc.id), true);
ok("report linked to the approval", CM.listApprovals(job.id).find(a => a.id === soil.id).documentIds, [doc.id]);

// Changing the site never silently deletes work already started
CM.setSite(job.id, { buildType: "renovation" });
const after = CM.listApprovals(job.id);
ok("started item kept and flagged stale", after.find(a => a.key === "soil_test")?.stale, true);
ok("untouched item no longer needed is dropped", after.some(a => a.key === "stormwater"), false);

CM.setSite(job.id, { buildType: "new_dwelling" });
ok("re-needed item un-flagged, work intact",
  [CM.listApprovals(job.id).find(a => a.key === "soil_test").stale, CM.listApprovals(job.id).find(a => a.key === "soil_test").provider.name],
  [false, "FNQ Geotech"]);
ok("no duplicate items after re-sync", new Set(CM.listApprovals(job.id).map(a => a.key)).size, CM.listApprovals(job.id).length);

CM.deleteJob(job.id);
ok("no orphan approvals", CM.listApprovals(job.id).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
