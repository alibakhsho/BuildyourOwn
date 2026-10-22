/* =========================================================================
   MODULE: logic/marketplace.js
   The rules of the marketplace, shared by the screens and the tests. The
   database (supabase/migrations/20261020100000_marketplace.sql) enforces the
   same rules for a live listing; this module lets the editor say what's
   missing before the seller hits Publish, instead of after.

   We are the platform, not a party to the build. Builders choose how they
   sell (their free hand):

     plan_purchase  Buy the plans outright and build with anyone.
     plan_licence   Pay to build the design once (per-build licence).
     build_only     The design is a showcase: you get it by signing a
                    build contract with that builder.
     prefab         A prefabricated module at a fixed price — what you see
                    is what you get, delivered. Site works (footings,
                    crane, connections, approvals) are usually extra, so a
                    prefab listing must say, for each, included or excluded.

   No payments are taken in the app yet: buyers enquire. Our fee is 1.5% of
   a signed build contract; for plans and modules it is discussed on contract.
   Pure module.
   ========================================================================= */

export const STATES = ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"];

/** What we charge. `rate: null` = not set yet, agreed per seller. */
export const PLATFORM_FEES = {
  contract: { rate: 0.015, label: "1.5% of the signed contract" },
  plan: { rate: null, label: "Discussed on contract" },
  module: { rate: null, label: "Discussed on contract" },
};

export const LISTING_KINDS = {
  plan: { label: "House plan", plural: "House plans" },
  module: { label: "Prefab module", plural: "Prefab modules" },
};

export const SALE_MODES = {
  plan_purchase: { kind: "plan", label: "Buy the plans", blurb: "Buy the plans outright and build with any builder." },
  plan_licence: { kind: "plan", label: "Licence to build", blurb: "Pay to build this design once, with any builder." },
  build_only: { kind: "plan", label: "Build with this builder", blurb: "This design comes with a build contract from this builder." },
  prefab: { kind: "module", label: "Prefab, delivered", blurb: "Built off site at a fixed price — what you see is what you get." },
};

export const PRO_KINDS = {
  builder: { label: "Builder", plan: "business" },
  tradie: { label: "Tradie", plan: "pro" },
  designer: { label: "Designer", plan: "pro" },
};

/** Site works a prefab price usually doesn't cover. A live prefab listing
 *  must answer each one — "included" or "excluded" — so the buyer knows
 *  what else to budget for. Keys match the database CHECK. */
export const PREFAB_SITE_WORKS = {
  footings: "Footings, slab or piers",
  transport: "Transport and crane",
  services: "Service connections (power, water, sewer)",
  approvals: "Engineering and building approval for your site",
};

const num = (v) => (v === "" || v == null ? null : Number(v));

/**
 * Values the database would refuse whatever the status — checked before
 * Save as well as Publish, so the seller gets a sentence, not a Postgres
 * error. Ranges match the CHECKs in the marketplace migration.
 */
export function fieldProblems(l = {}) {
  const out = [];
  const range = (v, lo, hi, msg) => {
    const n = num(v);
    if (n != null && (Number.isNaN(n) || n < lo || n > hi)) out.push(msg);
  };
  range(l.bedrooms, 0, 20, "Beds must be between 0 and 20");
  range(l.bathrooms, 0, 20, "Baths must be between 0 and 20");
  range(l.storeys, 1, 6, "Storeys must be between 1 and 6");
  const area = num(l.floorAreaM2);
  if (area != null && !(area > 0 && area < 100000)) out.push("Area must be more than 0 and under 100,000 m²");
  if (l.priceCents != null && !(l.priceCents > 0 && l.priceCents < 100000000000)) out.push("Price must be more than $0 and under $1 billion");
  if (l.leadTimeWeeks != null && !(Number.isInteger(l.leadTimeWeeks) && l.leadTimeWeeks >= 1 && l.leadTimeWeeks <= 104)) {
    out.push("Lead time must be 1 to 104 weeks");
  }
  if ((l.inclusions || []).filter((x) => x.trim()).length > 40) out.push("List at most 40 inclusions");
  if ((l.title || "").length > 160) out.push("Keep the title under 160 characters");
  return out;
}

/** The fee line for a listing: a build-only plan ends in a build contract. */
export const listingFeeLabel = (l) =>
  (l.saleMode === "build_only" ? PLATFORM_FEES.contract : PLATFORM_FEES[l.kind] || PLATFORM_FEES.plan).label;

/**
 * What stops this listing going live. Mirrors the database's CHECKs for
 * status = 'live', plus the obvious (a title). Empty list = ready.
 */
export function publishProblems(l = {}) {
  const out = [...fieldProblems(l)];
  const mode = SALE_MODES[l.saleMode];
  if (!mode) out.push("Choose how you're selling it");
  else if (mode.kind !== l.kind) out.push(`"${mode.label}" doesn't apply to a ${LISTING_KINDS[l.kind]?.label.toLowerCase() || "listing"}`);
  if (!l.title || l.title.trim().length < 2) out.push("Give it a title");
  if (!Array.isArray(l.mediaPaths) || l.mediaPaths.length === 0) out.push("Add at least one photo or render");
  if ((l.saleMode === "plan_purchase" || l.saleMode === "plan_licence") && !l.ownsCopyright) {
    out.push("Confirm you own this design or are licensed to sell it");
  }
  if (l.saleMode === "prefab") {
    const missing = Object.keys(PREFAB_SITE_WORKS).filter((k) => !["included", "excluded"].includes(l.siteWorks?.[k]));
    if (missing.length) out.push(`Say whether the price includes: ${missing.map((k) => PREFAB_SITE_WORKS[k].toLowerCase()).join("; ")}`);
    if (!Number.isInteger(l.leadTimeWeeks) || l.leadTimeWeeks < 1) out.push("Add a lead time in weeks");
  }
  return out;
}

/** The site works a prefab buyer still has to arrange and pay for. */
export const prefabExtras = (listing) =>
  Object.entries(PREFAB_SITE_WORKS).filter(([k]) => listing.siteWorks?.[k] !== "included").map(([, label]) => label);

/** Shown on cards and the listing page. Prices are indicative and ex GST. */
export function priceLabel(priceCents) {
  if (!Number.isInteger(priceCents) || priceCents <= 0) return "Price on enquiry";
  const dollars = Math.round(priceCents / 100);
  return `From A$${dollars.toLocaleString("en-AU")}`;
}

/** The platform fee on a contract signed through BuildYourOwn (ex GST value). */
export function contractFee(contractValue) {
  const v = Math.max(0, Number(contractValue) || 0);
  return Math.round(v * PLATFORM_FEES.contract.rate * 100) / 100;
}

/* ---- Row mapping ---------------------------------------------------------
   The database speaks snake_case; the screens speak camelCase. One place
   converts, so a renamed column is a one-line change. */

export function listingFromRow(r = {}) {
  return {
    id: r.id,
    sellerId: r.seller_id,
    kind: r.kind,
    saleMode: r.sale_mode,
    title: r.title || "",
    summary: r.summary || "",
    description: r.description || "",
    priceCents: r.price_cents == null ? null : Number(r.price_cents),
    bedrooms: r.bedrooms ?? null,
    bathrooms: r.bathrooms ?? null,
    storeys: r.storeys ?? null,
    floorAreaM2: r.floor_area_m2 == null ? null : Number(r.floor_area_m2),
    inclusions: r.inclusions || [],
    siteWorks: r.site_works || {},
    leadTimeWeeks: r.lead_time_weeks ?? null,
    regions: r.regions || [],
    mediaPaths: r.media_paths || [],
    ownsCopyright: !!r.owns_copyright,
    status: r.status || "draft",
    hidden: !!r.hidden,
    viewCount: r.view_count || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    seller: r.seller ? proFromRow(r.seller) : null,
  };
}

/** Only the columns a seller may write. Status is set separately. */
export function listingToRow(l) {
  const int = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
  return {
    kind: l.kind,
    sale_mode: l.saleMode,
    title: (l.title || "").trim(),
    summary: (l.summary || "").trim() || null,
    description: (l.description || "").trim() || null,
    price_cents: l.priceCents && l.priceCents > 0 ? Math.round(l.priceCents) : null,
    bedrooms: int(l.bedrooms),
    bathrooms: int(l.bathrooms),
    storeys: int(l.storeys),
    floor_area_m2: l.floorAreaM2 === "" || l.floorAreaM2 == null ? null : Number(l.floorAreaM2) || null,
    inclusions: (l.inclusions || []).map((s) => s.trim()).filter(Boolean),
    site_works: l.kind === "module" ? l.siteWorks || {} : {},
    lead_time_weeks: l.kind === "module" ? int(l.leadTimeWeeks) : null,
    regions: (l.regions || []).filter((s) => STATES.includes(s)),
    media_paths: l.mediaPaths || [],
    owns_copyright: !!l.ownsCopyright,
  };
}

export function proFromRow(r = {}) {
  return {
    userId: r.user_id,
    kind: r.kind,
    displayName: r.display_name || "",
    tagline: r.tagline || "",
    bio: r.bio || "",
    abn: r.abn || "",
    licenceNumber: r.licence_number || "",
    licenceState: r.licence_state || "",
    trades: r.trades || [],
    regions: r.regions || [],
    logoPath: r.logo_path || null,
    coverPath: r.cover_path || null,
    published: !!r.published,
    verified: !!r.verified,
    termsVersion: r.terms_version || null,
    termsAcceptedAt: r.terms_accepted_at || null,
  };
}

export function proToRow(p) {
  return {
    display_name: (p.displayName || "").trim(),
    tagline: (p.tagline || "").trim() || null,
    bio: (p.bio || "").trim() || null,
    abn: (p.abn || "").replace(/\s/g, "") || null,
    licence_number: (p.licenceNumber || "").trim() || null,
    licence_state: STATES.includes(p.licenceState) ? p.licenceState : null,
    trades: (p.trades || []).map((s) => s.trim()).filter(Boolean).slice(0, 20),
    regions: (p.regions || []).filter((s) => STATES.includes(s)),
    logo_path: p.logoPath || null,
    cover_path: p.coverPath || null,
    published: !!p.published,
  };
}

export function portfolioFromRow(r = {}) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title || "",
    description: r.description || "",
    category: r.category || "",
    suburb: r.suburb || "",
    state: r.state || "",
    completedOn: r.completed_on || "",
    mediaPaths: r.media_paths || [],
    published: r.published !== false,
  };
}

export function portfolioToRow(p) {
  return {
    title: (p.title || "").trim(),
    description: (p.description || "").trim() || null,
    category: (p.category || "").trim() || null,
    suburb: (p.suburb || "").trim() || null,
    state: STATES.includes(p.state) ? p.state : null,
    completed_on: p.completedOn || null,
    media_paths: p.mediaPaths || [],
    published: p.published !== false,
  };
}

/** Seller dashboard roll-up from their own rows. */
export function sellerStats({ listings = [], enquiries = [], portfolio = [] } = {}) {
  return {
    live: listings.filter((l) => l.status === "live" && !l.hidden).length,
    drafts: listings.filter((l) => l.status === "draft").length,
    hidden: listings.filter((l) => l.hidden).length,
    views: listings.reduce((n, l) => n + (l.viewCount || 0), 0),
    newEnquiries: enquiries.filter((e) => e.status === "new").length,
    totalEnquiries: enquiries.length,
    portfolio: portfolio.length,
  };
}

/* ---- Signed contracts: the 1.5% platform fee ----------------------------
   The database computes the fee (contracts.fee_cents) from the value and a
   staff-set rate; this side previews it and checks the form. */

export const CONTRACT_STATUS = {
  recorded: { label: "Recorded", note: "Fee to be invoiced" },
  invoiced: { label: "Invoiced", note: "Fee invoiced" },
  paid: { label: "Paid", note: "Fee paid" },
  void: { label: "Void", note: "No fee" },
};
/** How long a builder can correct or void their own record (matches the RLS policy). */
export const CONTRACT_EDIT_DAYS = 14;

export const feePreviewCents = (valueCents) =>
  Math.round((Number(valueCents) || 0) * PLATFORM_FEES.contract.rate);

/** YYYY-MM-DD in the user's own timezone (toISOString is UTC: in an
 *  Australian morning that's still yesterday). */
export function localDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function contractProblems(c = {}, today = new Date()) {
  const out = [];
  if (!(c.clientName || "").trim()) out.push("Add the client's name");
  if (!(Number.isInteger(c.valueCents) && c.valueCents > 0)) out.push("Enter the contract value (ex GST)");
  else if (c.valueCents >= 100000000000000) out.push("That contract value looks too large");
  if (c.sitePostcode && !/^\d{4}$/.test(c.sitePostcode)) out.push("A postcode is 4 digits");
  if (c.signedOn) {
    if (c.signedOn > localDate(today)) out.push("The signing date can't be in the future");
  }
  return out;
}

/* The fee covers clients met through BuildYourOwn: an enquiry in the 12
   months before signing (Terms, "fees"). True when a contract was signed
   more than 12 months after the enquiry, so no fee applies to it. */
export const INTRO_WINDOW_MONTHS = 12;
export function outsideIntroWindow(enquiryCreatedAt, signedOn) {
  if (!enquiryCreatedAt || !signedOn) return false;
  const from = new Date(enquiryCreatedAt);
  if (Number.isNaN(from.getTime())) return false;
  const limit = new Date(from.getFullYear(), from.getMonth() + INTRO_WINDOW_MONTHS, from.getDate());
  return signedOn > localDate(limit);
}

export function contractFromRow(r = {}) {
  return {
    id: r.id,
    source: r.source,
    enquiryId: r.enquiry_id || null,
    listingId: r.listing_id || null,
    jobRef: r.job_ref || null,
    jobName: r.job_name || "",
    clientName: r.client_name || "",
    sitePostcode: r.site_postcode || "",
    valueCents: Number(r.contract_value_cents) || 0,
    feeCents: Number(r.fee_cents) || 0,
    feeRate: Number(r.fee_rate) || 0,
    signedOn: r.signed_on || "",
    status: r.status || "recorded",
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

/** Only what a builder may write (fee_rate and status are staff's). */
export function contractToRow(c) {
  return {
    client_name: (c.clientName || "").trim(),
    site_postcode: (c.sitePostcode || "").trim() || null,
    contract_value_cents: Math.round(Number(c.valueCents) || 0),
    signed_on: c.signedOn || null,
    notes: (c.notes || "").trim() || null,
  };
}

/** Can the builder still correct or void this record? */
export function contractEditable(c, now = Date.now()) {
  if (c.status !== "recorded" || !c.createdAt) return false;
  return now - Date.parse(c.createdAt) < CONTRACT_EDIT_DAYS * 86400000;
}

/** Ledger roll-up for the builder's Fees view. Void records count for nothing. */
export function feeSummary(contracts = []) {
  const live = contracts.filter((c) => c.status !== "void");
  const sum = (list, k) => list.reduce((n, c) => n + (c[k] || 0), 0);
  return {
    count: live.length,
    valueCents: sum(live, "valueCents"),
    feesCents: sum(live, "feeCents"),
    owingCents: sum(live.filter((c) => c.status === "recorded" || c.status === "invoiced"), "feeCents"),
    paidCents: sum(live.filter((c) => c.status === "paid"), "feeCents"),
  };
}

export const dollars = (cents) => `A$${(Math.round(Number(cents) || 0) / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
