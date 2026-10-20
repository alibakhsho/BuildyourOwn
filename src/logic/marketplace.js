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

/**
 * What stops this listing going live. Mirrors the database's CHECKs for
 * status = 'live', plus the obvious (a title). Empty list = ready.
 */
export function publishProblems(l = {}) {
  const out = [];
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
