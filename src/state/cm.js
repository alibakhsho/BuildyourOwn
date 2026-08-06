/* =========================================================================
   MODULE: state/cm.js — Construction Management domain store
   ------------------------------------------------------------------------
   This is the pivot from "estimator toy" to "software a builder runs their
   business on". The estimator (state/projects.js) still owns the parametric
   spec and 3D massing; this module owns everything that happens around it:
   who the client is, what stage the job is at, what was ordered, what
   changed, what has been claimed, and what it actually cost.

   Shape of the world:

     Client 1───n Job 1───n Takeoff        (measurements off a plan image)
                    ├───n CostCentre       (budget vs committed vs actual)
                    ├───n PurchaseOrder    (commits budget)
                    ├───n Variation        (moves the contract sum)
                    ├───n ProgressClaim    (invoices the client)
                    ├───n ScheduleTask     (Gantt, with dependencies)
                    ├───n DiaryEntry       (site diary / daily log)
                    └───n Document         (plans, permits, photos → blobstore)

   Persistence is localStorage today. Every accessor is written as if it were
   an async-capable repository over a real API — single-entity get, filtered
   list, patch-by-id — so swapping in a backend is a change to this file only.
   Binaries never live here; Document.blobId points into state/blobstore.js.

   Schema v2. Any v1 estimator project found on load is adopted as a Job so
   nobody loses work in the migration (see migrateLegacyProjects).
   ========================================================================= */

import { listProjects, getProject } from "./projects.js";

const LS = "byo.cm.v2";

/* ---- Enumerations ------------------------------------------------------ */

/** The sales-to-site pipeline. Order matters: the dashboard renders columns in this order. */
export const JOB_STATUS = [
  { id: "lead", label: "Lead", group: "pre", hint: "Enquiry received, not yet priced" },
  { id: "estimating", label: "Estimating", group: "pre", hint: "Takeoff and pricing under way" },
  { id: "quoted", label: "Quoted", group: "pre", hint: "Quote issued, awaiting decision" },
  { id: "won", label: "Won", group: "pre", hint: "Accepted — contract being prepared" },
  { id: "in_progress", label: "On site", group: "active", hint: "Construction under way" },
  { id: "practical_completion", label: "PC", group: "active", hint: "Practical completion, defects period" },
  { id: "closed", label: "Closed", group: "done", hint: "Final claim paid, job archived" },
  { id: "lost", label: "Lost", group: "done", hint: "Not proceeding" },
];

export const PO_STATUS = ["draft", "sent", "part_received", "received", "invoiced"];
export const VARIATION_STATUS = ["draft", "submitted", "approved", "rejected"];
export const CLAIM_STATUS = ["draft", "sent", "part_paid", "paid"];

/**
 * Default cost centres for an AU residential build. These become the budget
 * spine of a job: every PO, variation and actual cost is coded to one of
 * these, which is what makes budget-vs-actual reporting possible at all.
 * Codes follow the loose NATSPEC-ish ordering builders already think in.
 */
export const DEFAULT_COST_CENTRES = [
  { code: "1-010", name: "Preliminaries & site establishment", trade: "siteworks" },
  { code: "1-020", name: "Demolition & earthworks", trade: "siteworks" },
  { code: "2-010", name: "Concrete & footings", trade: "concrete" },
  { code: "2-020", name: "Slab", trade: "concrete" },
  { code: "3-010", name: "Framing & structural timber", trade: "frame" },
  { code: "3-020", name: "Structural steel", trade: "frame" },
  { code: "4-010", name: "Roofing & guttering", trade: "roof" },
  { code: "4-020", name: "Brickwork & cladding", trade: "brick" },
  { code: "5-010", name: "Windows & external doors", trade: "joinery" },
  { code: "6-010", name: "Electrical", trade: "electrical" },
  { code: "6-020", name: "Plumbing & drainage", trade: "plumbing" },
  { code: "6-030", name: "HVAC", trade: "hvac" },
  { code: "7-010", name: "Insulation & plasterboard", trade: "plaster" },
  { code: "7-020", name: "Internal doors & joinery", trade: "joinery" },
  { code: "8-010", name: "Kitchen", trade: "kitchen_bath_fit" },
  { code: "8-020", name: "Bathrooms & wet areas", trade: "tile" },
  { code: "9-010", name: "Painting & decorating", trade: "paint" },
  { code: "9-020", name: "Floor coverings", trade: "finishes" },
  { code: "9-030", name: "Landscaping & external works", trade: "siteworks" },
  { code: "0-999", name: "Contingency & builder's margin", trade: "siteworks" },
];

/* ---- Store plumbing ---------------------------------------------------- */

const EMPTY = {
  version: 2,
  clients: [],
  jobs: [],
  costCentres: [],
  purchaseOrders: [],
  variations: [],
  claims: [],
  tasks: [],
  diary: [],
  documents: [],
  takeoffs: [],
  counters: { job: 1, po: 1, variation: 1, claim: 1 },
  settings: {
    company: { name: "", abn: "", address: "", email: "", phone: "", logoBlobId: null },
    gstRate: 0.1,
    retentionRate: 0.05,
    defaultMarkup: 0.15,
  },
};

let cache = null;
const subscribers = new Set();

function read() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(LS));
    cache = raw && raw.version === 2 ? { ...EMPTY, ...raw, settings: { ...EMPTY.settings, ...(raw.settings || {}) } } : { ...EMPTY };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

function write(next) {
  cache = next;
  try {
    localStorage.setItem(LS, JSON.stringify(next));
  } catch (e) {
    // Quota exceeded means structured data has outgrown localStorage — which
    // should not happen now that binaries live in IndexedDB, but a builder
    // with 400 jobs will eventually get here. Fail loudly rather than
    // silently dropping their last edit.
    console.error("[cm] Could not persist — storage quota exceeded.", e);
    throw new Error("Storage is full. Export and archive old jobs to continue.");
  }
  subscribers.forEach((fn) => {
    try {
      fn(next);
    } catch {}
  });
  return next;
}

/** Subscribe to any store mutation. Returns an unsubscribe function. */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function nextCounter(key, pad = 4) {
  const db = read();
  const n = db.counters[key] || 1;
  write({ ...db, counters: { ...db.counters, [key]: n + 1 } });
  return String(n).padStart(pad, "0");
}

/* Generic collection helpers — every entity below is CRUD over one array. */
function all(coll) {
  return read()[coll] || [];
}
function insert(coll, record) {
  const db = read();
  write({ ...db, [coll]: [...(db[coll] || []), record] });
  return record;
}
function patch(coll, id, changes) {
  const db = read();
  const list = db[coll] || [];
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const updated = { ...list[i], ...changes, id, updatedAt: Date.now() };
  const nextList = [...list];
  nextList[i] = updated;
  write({ ...db, [coll]: nextList });
  return updated;
}
function remove(coll, id) {
  const db = read();
  write({ ...db, [coll]: (db[coll] || []).filter((r) => r.id !== id) });
}

/* ---- Settings ---------------------------------------------------------- */

export function getSettings() {
  return read().settings;
}
export function saveSettings(changes) {
  const db = read();
  const settings = { ...db.settings, ...changes, company: { ...db.settings.company, ...(changes.company || {}) } };
  write({ ...db, settings });
  return settings;
}

/* ---- Clients ----------------------------------------------------------- */

export function listClients() {
  return all("clients").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
export function getClient(id) {
  return all("clients").find((c) => c.id === id) || null;
}
export function createClient(data = {}) {
  return insert("clients", {
    id: uid("cli"),
    name: data.name || "New client",
    company: data.company || "",
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    abn: data.abn || "",
    notes: data.notes || "",
    // Set once the client is pushed to an accounting package, so we update
    // rather than duplicate the contact on the next sync.
    xeroContactId: null,
    myobContactId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateClient = (id, changes) => patch("clients", id, changes);
export const deleteClient = (id) => remove("clients", id);

/* ---- Jobs -------------------------------------------------------------- */

export function listJobs() {
  return all("jobs").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export function getJob(id) {
  return all("jobs").find((j) => j.id === id) || null;
}

export function createJob(data = {}) {
  const jobNo = data.jobNo || `J-${new Date().getFullYear()}-${nextCounter("job")}`;
  const job = insert("jobs", {
    id: uid("job"),
    jobNo,
    name: data.name || "New job",
    clientId: data.clientId || null,
    siteAddress: data.siteAddress || "",
    status: data.status || "lead",
    buildMode: data.buildMode || "residential",
    region: data.region || "AU",
    contractType: data.contractType || "fixed_price",
    // The signed contract sum. Variations adjust it; see contractSum().
    contractValue: Number(data.contractValue) || 0,
    startDate: data.startDate || null,
    targetDate: data.targetDate || null,
    // Link back to a state/projects.js estimator project, so the parametric
    // spec + 3D model stay exactly where they were.
    estimateProjectId: data.estimateProjectId || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  seedCostCentres(job.id);
  return job;
}

export const updateJob = (id, changes) => patch("jobs", id, changes);

/** Deleting a job takes its children with it — otherwise the store silently leaks orphans. */
export function deleteJob(id) {
  const db = read();
  const owned = (coll) => (db[coll] || []).filter((r) => r.jobId !== id);
  write({
    ...db,
    jobs: db.jobs.filter((j) => j.id !== id),
    costCentres: owned("costCentres"),
    purchaseOrders: owned("purchaseOrders"),
    variations: owned("variations"),
    claims: owned("claims"),
    tasks: owned("tasks"),
    diary: owned("diary"),
    documents: owned("documents"),
    takeoffs: owned("takeoffs"),
  });
}

export function setJobStatus(id, status) {
  if (!JOB_STATUS.some((s) => s.id === status)) throw new Error(`Unknown job status: ${status}`);
  return patch("jobs", id, { status });
}

/* ---- Cost centres / budget -------------------------------------------- */

export function listCostCentres(jobId) {
  return all("costCentres")
    .filter((c) => c.jobId === jobId)
    .sort((a, b) => a.code.localeCompare(b.code));
}

function seedCostCentres(jobId) {
  const db = read();
  const seeded = DEFAULT_COST_CENTRES.map((c) => ({
    id: uid("cc"),
    jobId,
    code: c.code,
    name: c.name,
    trade: c.trade,
    budget: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  write({ ...db, costCentres: [...db.costCentres, ...seeded] });
  return seeded;
}

export function createCostCentre(jobId, data = {}) {
  return insert("costCentres", {
    id: uid("cc"),
    jobId,
    code: data.code || "9-999",
    name: data.name || "New cost centre",
    trade: data.trade || "",
    budget: Number(data.budget) || 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateCostCentre = (id, changes) => patch("costCentres", id, changes);
export const deleteCostCentre = (id) => remove("costCentres", id);

/**
 * Push an estimate's trade breakdown into the job budget. This is the join
 * between the estimator and the management side: once a quote is won, the
 * estimate stops being a sales document and becomes the budget it is
 * measured against.
 * `tradeTotals` is { tradeKey: amount } as produced by logic/estimator.js.
 */
/**
 * Turn a finished estimate into { tradeKey: amount } for applyEstimateToBudget.
 *
 * Only labour is broken down by trade in the estimator — materials carry a
 * catalogue `category`, not a trade, so there is no honest per-trade split for
 * them. Seeding trade centres with labour alone would set every budget far
 * below what the trade will actually invoice, which is worse than useless on a
 * job. So each trade gets its labour plus a pro-rata share of everything else
 * (materials, equipment, prelims, margin, contingency), weighted by its share
 * of labour. The totals then reconcile to the contract sum, and the builder
 * reallocates from a sane starting point rather than from zero.
 */
export function tradeTotalsFromEstimate(estimate) {
  const lines = (estimate?.labourLines || []).filter((l) => l.tradeKey && l.total > 0);
  const labourTotal = lines.reduce((s, l) => s + l.total, 0);
  if (!labourTotal) return {};
  // Everything the estimate charges that isn't labour, spread by labour weight.
  const rest = Math.max(0, (Number(estimate.total) || 0) - labourTotal);
  const out = {};
  for (const l of lines) {
    const share = l.total / labourTotal;
    out[l.tradeKey] = (out[l.tradeKey] || 0) + l.total + rest * share;
  }
  return out;
}

export function applyEstimateToBudget(jobId, tradeTotals = {}) {
  const centres = listCostCentres(jobId);
  const db = read();
  const byTrade = new Map();
  for (const c of centres) {
    if (!byTrade.has(c.trade)) byTrade.set(c.trade, []);
    byTrade.get(c.trade).push(c);
  }
  const updates = new Map();
  for (const [trade, amount] of Object.entries(tradeTotals)) {
    const matches = byTrade.get(trade);
    if (!matches || !matches.length || !amount) continue;
    // Split evenly across the centres carrying that trade — the builder
    // then reallocates by hand, which is faster than coding from zero.
    const share = amount / matches.length;
    for (const c of matches) updates.set(c.id, share);
  }
  if (!updates.size) return 0;
  write({
    ...db,
    costCentres: db.costCentres.map((c) =>
      updates.has(c.id) ? { ...c, budget: Math.round(updates.get(c.id)), updatedAt: Date.now() } : c
    ),
  });
  return updates.size;
}

/* ---- Purchase orders --------------------------------------------------- */

export function listPurchaseOrders(jobId) {
  return all("purchaseOrders")
    .filter((p) => !jobId || p.jobId === jobId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export function getPurchaseOrder(id) {
  return all("purchaseOrders").find((p) => p.id === id) || null;
}
export function createPurchaseOrder(jobId, data = {}) {
  return insert("purchaseOrders", {
    id: uid("po"),
    jobId,
    poNo: data.poNo || `PO-${nextCounter("po")}`,
    supplier: data.supplier || "",
    supplierEmail: data.supplierEmail || "",
    costCentreId: data.costCentreId || null,
    lines: data.lines || [],
    status: data.status || "draft",
    issuedAt: data.issuedAt || null,
    requiredBy: data.requiredBy || null,
    notes: data.notes || "",
    xeroPurchaseOrderId: null,
    myobPurchaseOrderId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updatePurchaseOrder = (id, changes) => patch("purchaseOrders", id, changes);
export const deletePurchaseOrder = (id) => remove("purchaseOrders", id);

export function poTotal(po) {
  return (po.lines || []).reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
}

/* ---- Variations -------------------------------------------------------- */

export function listVariations(jobId) {
  return all("variations")
    .filter((v) => v.jobId === jobId)
    .sort((a, b) => (a.varNo || "").localeCompare(b.varNo || ""));
}
export function createVariation(jobId, data = {}) {
  return insert("variations", {
    id: uid("var"),
    jobId,
    varNo: data.varNo || `V-${nextCounter("variation", 3)}`,
    title: data.title || "New variation",
    description: data.description || "",
    costCentreId: data.costCentreId || null,
    // Cost to the builder vs what the client is charged. The gap is the
    // margin on the variation, which builders routinely lose track of.
    cost: Number(data.cost) || 0,
    charge: Number(data.charge) || 0,
    status: data.status || "draft",
    raisedAt: Date.now(),
    approvedAt: null,
    approvedBy: "",
    scheduleImpactDays: Number(data.scheduleImpactDays) || 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateVariation = (id, changes) => patch("variations", id, changes);
export const deleteVariation = (id) => remove("variations", id);

export function approveVariation(id, approvedBy = "") {
  return patch("variations", id, { status: "approved", approvedAt: Date.now(), approvedBy });
}

/* ---- Progress claims --------------------------------------------------- */

export function listClaims(jobId) {
  return all("claims")
    .filter((c) => c.jobId === jobId)
    .sort((a, b) => (a.claimNo || "").localeCompare(b.claimNo || ""));
}
export function createClaim(jobId, data = {}) {
  return insert("claims", {
    id: uid("clm"),
    jobId,
    claimNo: data.claimNo || `PC-${nextCounter("claim", 3)}`,
    periodTo: data.periodTo || new Date().toISOString().slice(0, 10),
    // Percentage-complete claim lines, one per cost centre or stage.
    lines: data.lines || [],
    retentionRate: data.retentionRate ?? getSettings().retentionRate,
    status: data.status || "draft",
    sentAt: null,
    paidAt: null,
    xeroInvoiceId: null,
    myobInvoiceId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateClaim = (id, changes) => patch("claims", id, changes);
export const deleteClaim = (id) => remove("claims", id);

/**
 * AU progress-claim arithmetic: you claim work-to-date, subtract what was
 * previously certified, hold retention, then add GST. Getting the order
 * wrong is the single most common source of disputed claims.
 */
export function claimTotals(claim, previouslyClaimed = 0) {
  const gstRate = getSettings().gstRate;
  const workToDate = (claim.lines || []).reduce(
    (n, l) => n + (Number(l.value) || 0) * ((Number(l.percentComplete) || 0) / 100),
    0
  );
  const thisClaim = Math.max(0, workToDate - previouslyClaimed);
  const retention = thisClaim * (Number(claim.retentionRate) || 0);
  const net = thisClaim - retention;
  const gst = net * gstRate;
  return {
    workToDate,
    previouslyClaimed,
    thisClaim,
    retention,
    net,
    gst,
    total: net + gst,
  };
}

/* ---- Schedule ---------------------------------------------------------- */

export function listTasks(jobId) {
  return all("tasks")
    .filter((t) => t.jobId === jobId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function createTask(jobId, data = {}) {
  const existing = listTasks(jobId);
  return insert("tasks", {
    id: uid("tsk"),
    jobId,
    name: data.name || "New task",
    trade: data.trade || "",
    startDate: data.startDate || new Date().toISOString().slice(0, 10),
    days: Number(data.days) || 1,
    dependsOn: data.dependsOn || [],
    percentComplete: Number(data.percentComplete) || 0,
    assignedTo: data.assignedTo || "",
    costCentreId: data.costCentreId || null,
    order: data.order ?? existing.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateTask = (id, changes) => patch("tasks", id, changes);
export const deleteTask = (id) => remove("tasks", id);

/**
 * Seed a schedule from the estimator's generated timeline so a won job
 * arrives on site with a programme already in place instead of a blank Gantt.
 * `stages` is estimator.js's timeline.stages: [{ name, startWeek, weeks }].
 */
export function seedScheduleFromTimeline(jobId, stages = [], startDate = new Date()) {
  const base = new Date(startDate);
  const created = [];
  stages.forEach((s, i) => {
    const start = new Date(base);
    start.setDate(start.getDate() + (s.startWeek - 1) * 7);
    created.push(
      createTask(jobId, {
        name: s.name,
        startDate: start.toISOString().slice(0, 10),
        days: Math.max(1, (s.weeks || 1) * 5), // working days, not calendar
        order: i,
      })
    );
  });
  return created;
}

/** Business-day end date, skipping weekends — a 10-day task is two weeks. */
export function taskEndDate(task) {
  const d = new Date(task.startDate);
  let remaining = Math.max(1, Number(task.days) || 1) - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

/* ---- Site diary -------------------------------------------------------- */

export function listDiary(jobId) {
  return all("diary")
    .filter((d) => d.jobId === jobId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
export function createDiaryEntry(jobId, data = {}) {
  return insert("diary", {
    id: uid("dia"),
    jobId,
    date: data.date || new Date().toISOString().slice(0, 10),
    weather: data.weather || "",
    temperature: data.temperature || "",
    crewOnSite: data.crewOnSite || "",
    workDone: data.workDone || "",
    delays: data.delays || "",
    // A delay logged here is the evidence base for an EOT claim later.
    delayDays: Number(data.delayDays) || 0,
    photoIds: data.photoIds || [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateDiaryEntry = (id, changes) => patch("diary", id, changes);
export const deleteDiaryEntry = (id) => remove("diary", id);

/* ---- Documents --------------------------------------------------------- */

export function listDocuments(jobId, kind = null) {
  return all("documents")
    .filter((d) => d.jobId === jobId && (!kind || d.kind === kind))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export function createDocument(jobId, data = {}) {
  return insert("documents", {
    id: uid("doc"),
    jobId,
    name: data.name || "Untitled",
    kind: data.kind || "plan", // plan | permit | contract | photo | invoice | other
    blobId: data.blobId || null,
    width: data.width || 0,
    height: data.height || 0,
    size: data.size || 0,
    mimeType: data.mimeType || "",
    notes: data.notes || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateDocument = (id, changes) => patch("documents", id, changes);
export const deleteDocument = (id) => remove("documents", id);

/* ---- Takeoffs ---------------------------------------------------------- */

export function listTakeoffs(jobId) {
  return all("takeoffs")
    .filter((t) => t.jobId === jobId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export function getTakeoff(id) {
  return all("takeoffs").find((t) => t.id === id) || null;
}
export function createTakeoff(jobId, data = {}) {
  return insert("takeoffs", {
    id: uid("tko"),
    jobId,
    name: data.name || "Sheet 1",
    documentId: data.documentId || null,
    blobId: data.blobId || null,
    imageWidth: data.imageWidth || 0,
    imageHeight: data.imageHeight || 0,
    // True when the upload was decoded from HEIC and/or rotated upright on
    // import. Worth surfacing while measuring: the pixels being measured are
    // not byte-identical to the file the builder selected.
    converted: !!data.converted,
    // Pixels per metre, established by calibrating against a known dimension
    // on the drawing. Null until the user calibrates — measuring before that
    // point is meaningless, and the UI blocks it.
    pxPerMetre: data.pxPerMetre || null,
    calibration: data.calibration || null, // { p1, p2, knownMetres }
    measurements: data.measurements || [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const updateTakeoff = (id, changes) => patch("takeoffs", id, changes);
export const deleteTakeoff = (id) => remove("takeoffs", id);

/* ---- Roll-ups: the numbers a builder actually looks at ----------------- */

/** Contract sum = original contract + approved variations charged to the client. */
export function contractSum(jobId) {
  const job = getJob(jobId);
  if (!job) return 0;
  const approved = listVariations(jobId)
    .filter((v) => v.status === "approved")
    .reduce((n, v) => n + (Number(v.charge) || 0), 0);
  return (Number(job.contractValue) || 0) + approved;
}

/**
 * Budget vs committed vs claimed, per cost centre and in total.
 *  - budget:    what was allowed in the estimate
 *  - committed: POs raised (money promised, whether or not invoiced)
 *  - variation: approved variation COST coded to that centre
 *  - forecast:  committed + approved variation cost, i.e. where it lands
 * The `atRisk` flag is the one that earns its keep: it is what tells a
 * builder they are losing money on a trade while they can still act on it.
 */
export function jobFinancials(jobId) {
  const centres = listCostCentres(jobId);
  const pos = listPurchaseOrders(jobId);
  const variations = listVariations(jobId);
  const claims = listClaims(jobId);

  const committedBy = new Map();
  for (const po of pos) {
    if (po.status === "draft") continue; // a draft PO has committed nothing
    const key = po.costCentreId || "__unassigned";
    committedBy.set(key, (committedBy.get(key) || 0) + poTotal(po));
  }

  const variationCostBy = new Map();
  for (const v of variations) {
    if (v.status !== "approved") continue;
    const key = v.costCentreId || "__unassigned";
    variationCostBy.set(key, (variationCostBy.get(key) || 0) + (Number(v.cost) || 0));
  }

  const rows = centres.map((c) => {
    const budget = Number(c.budget) || 0;
    const committed = committedBy.get(c.id) || 0;
    const variationCost = variationCostBy.get(c.id) || 0;
    const forecast = committed + variationCost;
    const allowed = budget + variationCost;
    return {
      ...c,
      budget,
      committed,
      variationCost,
      forecast,
      variance: allowed - forecast,
      percentUsed: allowed > 0 ? (forecast / allowed) * 100 : forecast > 0 ? Infinity : 0,
      atRisk: allowed > 0 && forecast > allowed,
    };
  });

  const unassignedCommitted = committedBy.get("__unassigned") || 0;
  const unassignedVariation = variationCostBy.get("__unassigned") || 0;

  const totalBudget = rows.reduce((n, r) => n + r.budget, 0);
  const totalCommitted = rows.reduce((n, r) => n + r.committed, 0) + unassignedCommitted;
  const totalVariationCost = rows.reduce((n, r) => n + r.variationCost, 0) + unassignedVariation;
  const totalForecast = totalCommitted + totalVariationCost;

  const sum = contractSum(jobId);
  const claimed = claims
    .filter((c) => c.status !== "draft")
    .reduce((n, c) => n + claimTotals(c).thisClaim, 0);

  return {
    rows,
    unassignedCommitted,
    unassignedVariation,
    totalBudget,
    totalCommitted,
    totalVariationCost,
    totalForecast,
    contractSum: sum,
    claimed,
    // Money earned but not yet invoiced — the number that kills cash flow.
    unclaimed: Math.max(0, sum - claimed),
    grossMargin: sum - totalForecast,
    grossMarginPct: sum > 0 ? ((sum - totalForecast) / sum) * 100 : 0,
    atRiskCount: rows.filter((r) => r.atRisk).length,
  };
}

/** Pipeline roll-up for the dashboard. */
export function pipelineSummary() {
  const jobs = listJobs();
  const byStatus = {};
  for (const s of JOB_STATUS) byStatus[s.id] = { count: 0, value: 0, jobs: [] };
  for (const j of jobs) {
    const bucket = byStatus[j.status] || byStatus.lead;
    bucket.count++;
    bucket.value += contractSum(j.id);
    bucket.jobs.push(j);
  }
  const active = jobs.filter((j) => ["in_progress", "practical_completion"].includes(j.status));
  return {
    byStatus,
    totalJobs: jobs.length,
    activeJobs: active.length,
    pipelineValue: jobs
      .filter((j) => ["lead", "estimating", "quoted"].includes(j.status))
      .reduce((n, j) => n + contractSum(j.id), 0),
    contractedValue: jobs
      .filter((j) => ["won", "in_progress", "practical_completion"].includes(j.status))
      .reduce((n, j) => n + contractSum(j.id), 0),
    unclaimedTotal: active.reduce((n, j) => n + jobFinancials(j.id).unclaimed, 0),
  };
}

/* ---- Migration --------------------------------------------------------- */

/**
 * Adopt any pre-existing estimator project (schema v1) as a Job, once.
 * Runs on app boot. The project itself is untouched — the Job just points at
 * it — so the estimator keeps working exactly as before and nothing is lost
 * if this migration is ever rolled back.
 */
export function migrateLegacyProjects() {
  const db = read();
  const existingLinks = new Set(db.jobs.map((j) => j.estimateProjectId).filter(Boolean));
  const legacy = listProjects().filter((p) => !existingLinks.has(p.id));
  if (!legacy.length) return 0;
  for (const p of legacy) {
    createJob({
      name: p.name,
      buildMode: p.buildMode,
      region: p.region,
      estimateProjectId: p.id,
      status: "estimating",
    });
  }
  return legacy.length;
}

/** Full export — the escape hatch, and the basis of the backup file. */
export function exportAll() {
  return { ...read(), exportedAt: new Date().toISOString(), estimatorProjects: listProjects() };
}

export function importAll(payload) {
  if (!payload || payload.version !== 2) throw new Error("Unrecognised backup file.");
  const { estimatorProjects, exportedAt, ...store } = payload;
  write({ ...EMPTY, ...store });
  return true;
}

/** Test seam: drop everything. Not wired to any UI control by design. */
export function __resetStore() {
  cache = null;
  localStorage.removeItem(LS);
}
