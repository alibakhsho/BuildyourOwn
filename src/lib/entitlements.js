/* =========================================================================
   MODULE: lib/entitlements.js
   What each plan unlocks — the ONE place this is defined. The browser uses
   it to show/lock features; the AI routes (api/_lib/ai-access.js) import
   the same file, so the server can never disagree with what the UI shows.

   Plan ladder (tier ids are the database enum; labels are what people see):
     free       Homeowner  — residential estimating, 3D, costs, quote. No AI
                             unless they add the AI assistant add-on.
     pro        Tradie     — residential + custom quotes, AI included.
     business   Builder    — everything: developer (apartments / towers),
                             multi-dwelling, Site Office, AI.
     enterprise            — Builder with no caps (sales-led, not self-serve).

   Guests (not signed in) get exactly the Homeowner plan without AI, so the
   free product works with no account and nothing that costs us money does.
   Pure module: no React, no browser APIs.
   ========================================================================= */

export const BUILD_MODE_IDS = ["residential", "materials", "highrise", "multi"];

/* Display names. "highrise" keeps its id (saved projects reference it) but
   is called Developer — it covers apartment blocks and mixed-use, not just
   towers. */
export const MODE_LABEL = {
  residential: "Residential",
  materials: "Custom quote",
  highrise: "Developer",
  multi: "Multi-dwelling",
};

export const AI_ADDON = {
  label: "AI assistant",
  price: 19,           // A$/month, ex GST — must match Stripe price byo_ai_month
  priceYear: 190,      // A$/year (two months free) — byo_ai_year
  planReads: 5,
};

export const PLANS = {
  free: {
    id: "free", label: "Homeowner", price: 0, priceYear: 0,
    blurb: "Price your own home build or renovation, see it in 3D, and walk into the builder's office informed.",
    modes: ["residential"], ai: false, siteOffice: false,
    projects: 3, planReads: 0,
  },
  pro: {
    id: "pro", label: "Tradie", price: 49, priceYear: 490,   // A$ ex GST = Stripe byo_pro_month / byo_pro_year
    blurb: "Quote houses and any custom job line by line from your own rates — with the AI crew on hand.",
    modes: ["residential", "materials"], ai: true, siteOffice: false,
    projects: Infinity, planReads: 25,
  },
  business: {
    id: "business", label: "Builder", price: 149, priceYear: 1490,   // byo_business_month / byo_business_year
    blurb: "Everything: multi-dwelling and developer quoting, Site Office job management, Xero / MYOB.",
    modes: ["residential", "materials", "highrise", "multi"], ai: true, siteOffice: true,
    projects: Infinity, planReads: 100,
  },
  enterprise: {
    id: "enterprise", label: "Enterprise", price: null, priceYear: null,
    blurb: "Builder with no caps, for volume builders and developers.",
    modes: ["residential", "materials", "highrise", "multi"], ai: true, siteOffice: true,
    projects: Infinity, planReads: Infinity,
  },
};

/* The plans offered on the pricing table (enterprise is sales-led). */
export const PUBLIC_PLANS = ["free", "pro", "business"];

/* ---- Free trials ----------------------------------------------------------
   Signing up as (or switching to) a Tradie or Builder starts a 14-day trial
   of that plan, once per account. The database trigger writes trial_tier /
   trial_ends_at; nothing runs when it ends — every check reads the date.
   Accounts are cheap to make, so a trial's AI plan reads are capped lower
   than the paid plan's: the trial shows the feature, it isn't free capacity. */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN_READS = 10;
/** Which plan a self-declared segment trials. */
export const SEGMENT_PLAN = { homeowner: "free", tradie: "pro", builder: "business" };
const RANK = { free: 0, pro: 1, business: 2, enterprise: 3 };
export const planRank = (id) => RANK[id] ?? 0;

/** The account's trial, active or ended — null if it never had one. */
export function trialFor(profile, now = new Date()) {
  const tier = profile?.trial_tier;
  const endsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  if (!PLANS[tier] || !endsAt || isNaN(endsAt)) return null;
  const active = now < endsAt;
  return { tier, label: PLANS[tier].label, endsAt, active, daysLeft: active ? Math.ceil((endsAt - now) / 86400000) : 0 };
}

/** Resolve what an account (or a guest, when profile is null) may do. */
export function entitlementsFor(profile, now = new Date()) {
  const paid = PLANS[profile?.tier] || PLANS.free;
  const trial = trialFor(profile, now);
  // A trial only ever adds: it never replaces a plan that's already as good.
  const onTrial = !!trial?.active && planRank(trial.tier) > planRank(paid.id);
  const plan = onTrial ? PLANS[trial.tier] : paid;
  const addon = !!profile?.ai_addon && plan.id === "free";
  const reads = addon ? Math.max(plan.planReads, AI_ADDON.planReads) : plan.planReads;
  return {
    plan,
    tier: plan.id,
    paidTier: paid.id,
    trial,
    onTrial,
    // A guest gets one by signing up; an account only if it never had one.
    trialAvailable: paid.id === "free" && !profile?.trial_ends_at,
    modes: plan.modes,
    ai: plan.ai || addon,
    aiAddon: addon,
    siteOffice: plan.siteOffice,
    projects: plan.projects,
    planReads: onTrial ? Math.min(reads, TRIAL_PLAN_READS) : reads,
    canUseMode: (m) => plan.modes.includes(m),
  };
}

/** Plan reads used in the CURRENT monthly window. The database rolls the
 *  window forward lazily (only when the next read is reserved), so a stored
 *  count from last month must read as 0 — same rule as reserve_plan_read. */
export function planReadsUsedNow(profile, now = new Date()) {
  const used = profile?.plan_reads_used || 0;
  const start = profile?.period_started_at ? new Date(profile.period_started_at) : null;
  if (!start || isNaN(start)) return used;
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return now >= next ? 0 : used;
}

/** The cheapest public plan that unlocks a feature — for upgrade prompts. */
export function planFor(feature) {
  if (feature === "ai") return "pro";
  if (feature === "siteOffice") return "business";
  for (const id of PUBLIC_PLANS) if (PLANS[id].modes.includes(feature)) return id;
  return "business";
}
