/* =========================================================================
   MODULE: logic/approvals.js
   What a job needs from engineers, certifiers and council before its price
   can be called final — and how far it is from getting there.

   The estimator produces an INDICATIVE price: it knows the house, not the
   ground it sits on. A reactive clay site, a bushfire overlay or a high wind
   class can move a residential build by tens of thousands, and nobody knows
   which until the soil test, the engineer and the energy assessor report
   back. So a quote moves through three stages:

     indicative   Something that can still move the construction cost is
                  outstanding (soil test, structural design, BAL, energy...).
                  Those costs sit in the quote as provisional allowances.
     fixed        Every price-affecting report is in and its cost impact has
                  been entered. The price is firm; the permits still to issue
                  are listed on the quote as conditions.
     approved     Every required approval has issued. Ready to sign and start.

   Each catalogue item says WHEN it applies (from the job's site profile),
   WHO provides it, a provisional fee allowance, and whether its outcome can
   change the construction price (`affectsPrice`). Fee allowances are
   starting points for an AU residential job, not quotes — the builder
   overwrites them with the real fee once the professional has quoted.

   Statutory levies and insurance thresholds change. They are carried as
   data with a `verify` note so the UI can say so; nothing here is legal
   advice. Pure module: no React, no storage.
   ========================================================================= */

/** The states and territories whose rules differ enough to matter here. */
export const AU_STATES = ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"];

export const BUILD_TYPES = [
  { id: "new_dwelling", label: "New house" },
  { id: "extension", label: "Extension / second storey" },
  { id: "renovation", label: "Renovation (no structural change)" },
  { id: "structural_reno", label: "Renovation with structural change" },
  { id: "granny_flat", label: "Granny flat / secondary dwelling" },
  { id: "deck_patio", label: "Deck, patio or carport" },
  { id: "multi_dwelling", label: "Duplex / townhouses" },
];

export const DISCIPLINES = {
  survey: "Survey",
  engineering: "Engineering",
  energy: "Energy & environment",
  planning: "Planning (council)",
  building: "Building approval",
  insurance: "Insurance",
  levy: "Levies",
};

export const APPROVAL_STATUS = [
  { id: "required", label: "Required" },
  { id: "requested", label: "Requested" },
  { id: "submitted", label: "Received" },   // report/plans in hand, cost entered
  { id: "approved", label: "Approved" },    // issued / accepted / paid
  { id: "not_required", label: "Not required" },
];

/** A blank site profile. The builder fills it in from the title search,
 *  the council's planning overlays and a look at the block. */
export const DEFAULT_SITE = {
  state: "QLD",
  buildType: "new_dwelling",
  storeys: 1,
  bushfire: false,       // bushfire-prone land overlay
  flood: false,          // flood overlay
  heritage: false,       // heritage overlay / character area
  slopeOver15: false,    // more than ~15% fall across the building footprint
  needsPlanning: null,   // null = let the rules decide; true/false = builder knows
  contractValue: 0,      // drives warranty insurance and levy thresholds
};

const STRUCTURAL = new Set(["new_dwelling", "extension", "structural_reno", "granny_flat", "deck_patio", "multi_dwelling"]);
const NEW_FOOTPRINT = new Set(["new_dwelling", "extension", "granny_flat", "multi_dwelling"]);
const HABITABLE = new Set(["new_dwelling", "extension", "granny_flat", "multi_dwelling"]);

const isStructural = (s) => STRUCTURAL.has(s.buildType);
const hasNewFootprint = (s) => NEW_FOOTPRINT.has(s.buildType);

/** Whether the job needs a planning (development) approval as well as a
 *  building approval. Most single houses on a standard lot don't; overlays
 *  and multi-dwellings usually do. The builder can override either way. */
export function needsPlanningApproval(site) {
  if (site.needsPlanning === true || site.needsPlanning === false) return site.needsPlanning;
  return site.heritage || site.flood || site.buildType === "multi_dwelling";
}

/* Building approval is named and issued differently in each state. */
const BUILDING_APPROVAL_LABEL = {
  QLD: "Building approval (private certifier)",
  NSW: "Construction certificate or CDC",
  VIC: "Building permit (registered building surveyor)",
  WA: "Building permit (council)",
  SA: "Building rules consent",
  TAS: "Building permit",
  ACT: "Building approval (certifier)",
  NT: "Building permit (building certifier)",
};

/* Home warranty / domestic building insurance: the scheme name and the
   contract value above which it is compulsory. `verify` because these
   thresholds are set by regulation and do change. */
const WARRANTY = {
  QLD: { label: "QBCC Home Warranty Insurance", threshold: 3300 },
  NSW: { label: "Home Building Compensation (HBCF) cover", threshold: 20000 },
  VIC: { label: "Domestic Building Insurance (DBI)", threshold: 16000 },
  WA: { label: "Home Indemnity Insurance", threshold: 20000 },
  SA: { label: "Building Indemnity Insurance", threshold: 12000 },
  TAS: null,
  ACT: { label: "Residential Building Insurance", threshold: 12000 },
  NT: { label: "Residential Building Insurance (Fidelity Fund)", threshold: 12000 },
};

/* Portable long service levies charged on building work over a threshold. */
const LSL_LEVY = {
  QLD: { label: "QLeave portable long service levy", rate: 0.00575, threshold: 150000 },
  NSW: { label: "Long Service Corporation levy", rate: 0.0025, threshold: 250000 },
};

const VERIFY = "Statutory rate/threshold — confirm the current figure with the state body before quoting.";

/**
 * The catalogue. `when(site)` decides whether an item applies; `fee(site)`
 * is the provisional allowance for the professional's fee (ex GST);
 * `affectsPrice` marks items whose outcome can change the construction cost.
 */
export const APPROVAL_CATALOGUE = [
  {
    key: "site_survey", discipline: "survey", who: "Registered surveyor",
    label: "Contour & detail survey",
    why: "Levels, boundaries and services. The engineer and designer both need it.",
    when: (s) => hasNewFootprint(s),
    fee: () => 1800, affectsPrice: true,
  },
  {
    key: "soil_test", discipline: "engineering", who: "Geotechnical engineer",
    label: "Soil test & site classification (AS 2870)",
    why: "Site class (A–P) drives footing and slab design, often the largest swing in the price.",
    when: (s) => hasNewFootprint(s) || s.buildType === "deck_patio",
    fee: () => 900, affectsPrice: true,
  },
  {
    key: "wind_class", discipline: "engineering", who: "Structural engineer",
    label: "Wind classification (AS 4055)",
    why: "Sets bracing and tie-down. Cyclonic classes in north QLD/WA change the frame spec.",
    when: (s) => isStructural(s),
    fee: () => 250, affectsPrice: true,
  },
  {
    key: "structural_design", discipline: "engineering", who: "Structural engineer (RPEQ in QLD)",
    label: "Structural design — footings, slab, framing, tie-down",
    why: "Certified engineering drawings. Member sizes and concrete volumes come from here.",
    when: (s) => isStructural(s),
    fee: (s) => (s.buildType === "deck_patio" ? 900 : s.storeys > 1 ? 4500 : 3200),
    affectsPrice: true,
  },
  {
    key: "stormwater", discipline: "engineering", who: "Civil / hydraulic engineer",
    label: "Stormwater & drainage design",
    why: "Point of discharge, detention tank if council requires one.",
    when: (s) => hasNewFootprint(s) && s.buildType !== "extension",
    fee: () => 1500, affectsPrice: true,
  },
  {
    key: "retaining", discipline: "engineering", who: "Structural engineer",
    label: "Retaining wall & cut/fill design",
    why: "A sloping block needs walls and drainage that the estimate cannot see.",
    when: (s) => hasNewFootprint(s) && s.slopeOver15,
    fee: () => 1600, affectsPrice: true,
  },
  {
    key: "energy", discipline: "energy", who: "Accredited energy assessor",
    label: "Energy rating (NatHERS 7-star / NCC 2022)",
    why: "Glazing, insulation and shading upgrades needed to reach the star rating.",
    when: (s) => HABITABLE.has(s.buildType) && s.state !== "NSW",
    fee: () => 650, affectsPrice: true,
  },
  {
    key: "basix", discipline: "energy", who: "BASIX assessor",
    label: "BASIX certificate",
    why: "NSW's energy and water targets — tanks, glazing and hot water follow from it.",
    when: (s) => HABITABLE.has(s.buildType) && s.state === "NSW",
    fee: () => 650, affectsPrice: true,
  },
  {
    key: "bal", discipline: "energy", who: "BAL assessor",
    label: "Bushfire Attack Level (AS 3959)",
    why: "BAL-29 and above changes windows, cladding and screens.",
    when: (s) => s.bushfire && s.buildType !== "renovation",
    fee: () => 700, affectsPrice: true,
  },
  {
    key: "flood", discipline: "engineering", who: "Hydraulic engineer",
    label: "Flood assessment & habitable floor level",
    why: "A raised floor level can change the whole substructure.",
    when: (s) => s.flood && s.buildType !== "renovation",
    fee: () => 1800, affectsPrice: true,
  },
  {
    key: "planning", discipline: "planning", who: "Council (town planner)",
    label: "Development / planning approval",
    why: "Overlays, heritage or multiple dwellings trigger an assessment beyond the building code.",
    when: (s) => needsPlanningApproval(s),
    fee: (s) => (s.buildType === "multi_dwelling" ? 6000 : 2500), affectsPrice: false,
  },
  {
    key: "heritage", discipline: "planning", who: "Heritage consultant",
    label: "Heritage impact statement",
    why: "Council can require materials and details that cost more.",
    when: (s) => s.heritage,
    fee: () => 2200, affectsPrice: true,
  },
  {
    key: "building_approval", discipline: "building", who: "Building certifier / surveyor",
    label: (s) => BUILDING_APPROVAL_LABEL[s.state] || "Building approval",
    why: "Approval to build against the NCC. Inspections at footings, frame and final.",
    when: (s) => isStructural(s),
    fee: (s) => (s.buildType === "deck_patio" ? 900 : s.buildType === "multi_dwelling" ? 6500 : 3200),
    affectsPrice: false,
  },
  {
    key: "plumbing_approval", discipline: "building", who: "Council / plumbing regulator",
    label: "Plumbing & drainage approval",
    why: "New sanitary drainage needs its own approval and inspections.",
    when: (s) => HABITABLE.has(s.buildType),
    fee: () => 900, affectsPrice: false,
  },
  {
    key: "warranty", discipline: "insurance", who: "State insurer",
    label: (s) => WARRANTY[s.state]?.label || "Home warranty insurance",
    why: "Compulsory before work starts or a deposit is taken, above the state threshold.",
    when: (s) => !!WARRANTY[s.state] && (Number(s.contractValue) || 0) > WARRANTY[s.state].threshold,
    fee: (s) => Math.round((Number(s.contractValue) || 0) * 0.01),
    affectsPrice: false, verify: VERIFY,
  },
  {
    key: "lsl_levy", discipline: "levy", who: "State levy body",
    label: (s) => LSL_LEVY[s.state]?.label || "Portable long service levy",
    why: "Paid before the building approval issues.",
    when: (s) => !!LSL_LEVY[s.state] && (Number(s.contractValue) || 0) >= LSL_LEVY[s.state].threshold,
    fee: (s) => Math.round((Number(s.contractValue) || 0) * (LSL_LEVY[s.state]?.rate || 0)),
    affectsPrice: false, verify: VERIFY,
  },
];

const resolve = (v, site) => (typeof v === "function" ? v(site) : v);

/**
 * The checklist for a site: one entry per catalogue item that applies,
 * ready to be stored against a job. Pure: same site in, same list out.
 */
export function requiredApprovals(site = {}) {
  const s = { ...DEFAULT_SITE, ...site };
  return APPROVAL_CATALOGUE.filter((item) => item.when(s)).map((item) => ({
    key: item.key,
    discipline: item.discipline,
    label: resolve(item.label, s),
    who: item.who,
    why: item.why,
    affectsPrice: item.affectsPrice,
    verify: item.verify || null,
    feeAllowance: Math.max(0, Math.round(resolve(item.fee, s) || 0)),
  }));
}

const DONE = new Set(["submitted", "approved", "not_required"]);

/**
 * Where a job's quote stands, given its approval records and the base
 * estimate. Records are the stored shape: the catalogue fields plus
 * { status, feeActual, costImpact }.
 *
 *   feeActual   the professional's real fee once quoted (null = use allowance)
 *   costImpact  how much the report moved the construction cost (+/-)
 *
 * A price-affecting item counts as resolved once its report is in
 * ("submitted") — the cost is known even if the approval hasn't issued.
 */
export function quoteReadiness(records = [], baseEstimate = 0) {
  const live = records.filter((r) => r.status !== "not_required");
  const priceOpen = live.filter((r) => r.affectsPrice && !DONE.has(r.status));
  const notApproved = live.filter((r) => r.status !== "approved");

  let fees = 0, provisional = 0, impact = 0;
  for (const r of live) {
    const actual = r.feeActual != null && r.feeActual !== "" ? Number(r.feeActual) || 0 : null;
    if (actual != null) fees += actual;
    else { fees += Number(r.feeAllowance) || 0; provisional += Number(r.feeAllowance) || 0; }
    if (DONE.has(r.status)) impact += Number(r.costImpact) || 0;
  }

  const stage = priceOpen.length ? "indicative" : notApproved.length ? "fixed" : "approved";
  return {
    stage,
    canIssueFinal: stage !== "indicative",
    base: Number(baseEstimate) || 0,
    fees,                       // professional fees, actual where known
    provisionalFees: provisional, // the part of `fees` that is still an allowance
    costImpact: impact,         // construction cost movement from reports received
    total: (Number(baseEstimate) || 0) + fees + impact,
    blocking: priceOpen,        // what stands between this quote and a fixed price
    conditions: stage === "fixed" ? notApproved : [], // print these on a fixed-price quote
    progress: live.length ? (live.length - notApproved.length) / live.length : 1,
  };
}

export const STAGE_LABEL = {
  indicative: "Indicative quote",
  fixed: "Fixed-price quote (subject to approvals)",
  approved: "Final quote — approvals in hand",
};

/* Disciplines that mean structural sign-off: someone certifies the building
   will stand up before it is built. */
const STRUCTURAL_DISCIPLINES = new Set(["survey", "engineering", "building"]);

/**
 * The homeowner's read-only view: does this work need structural sign-off,
 * and what will the builder have to arrange? Homeowners see the list and a
 * typical spend; managing it (fees, documents, status) is the builder's
 * job, in Site Office.
 */
export function homeownerRequirements(site = {}) {
  const items = requiredApprovals(site);
  const structural = items.filter((i) => STRUCTURAL_DISCIPLINES.has(i.discipline));
  return {
    needsStructural: structural.length > 0,
    structural,
    other: items.filter((i) => !STRUCTURAL_DISCIPLINES.has(i.discipline)),
    typicalFees: items.reduce((n, i) => n + i.feeAllowance, 0),
    priceMovers: items.filter((i) => i.affectsPrice).length,
  };
}
