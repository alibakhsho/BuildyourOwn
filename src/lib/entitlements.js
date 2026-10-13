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
  price: 19,           // A$/month — placeholder until billing is live
  planReads: 5,
};

export const PLANS = {
  free: {
    id: "free", label: "Homeowner", price: 0,
    blurb: "Price your own home build or renovation, see it in 3D, and walk into the builder's office informed.",
    modes: ["residential"], ai: false, siteOffice: false,
    projects: 3, planReads: 0,
  },
  pro: {
    id: "pro", label: "Tradie", price: 49,
    blurb: "Quote houses and any custom job line by line from your own rates — with the AI crew on hand.",
    modes: ["residential", "materials"], ai: true, siteOffice: false,
    projects: Infinity, planReads: 25,
  },
  business: {
    id: "business", label: "Builder", price: 149,
    blurb: "Everything: multi-dwelling and developer quoting, Site Office job management, Xero / MYOB.",
    modes: ["residential", "materials", "highrise", "multi"], ai: true, siteOffice: true,
    projects: Infinity, planReads: 100,
  },
  enterprise: {
    id: "enterprise", label: "Enterprise", price: null,
    blurb: "Builder with no caps, for volume builders and developers.",
    modes: ["residential", "materials", "highrise", "multi"], ai: true, siteOffice: true,
    projects: Infinity, planReads: Infinity,
  },
};

/* The plans offered on the pricing table (enterprise is sales-led). */
export const PUBLIC_PLANS = ["free", "pro", "business"];

/** Resolve what an account (or a guest, when profile is null) may do. */
export function entitlementsFor(profile) {
  const plan = PLANS[profile?.tier] || PLANS.free;
  const addon = !!profile?.ai_addon && plan.id === "free";
  return {
    plan,
    tier: plan.id,
    modes: plan.modes,
    ai: plan.ai || addon,
    aiAddon: addon,
    siteOffice: plan.siteOffice,
    projects: plan.projects,
    planReads: addon ? Math.max(plan.planReads, AI_ADDON.planReads) : plan.planReads,
    canUseMode: (m) => plan.modes.includes(m),
  };
}

/** The cheapest public plan that unlocks a feature — for upgrade prompts. */
export function planFor(feature) {
  if (feature === "ai") return "pro";
  if (feature === "siteOffice") return "business";
  for (const id of PUBLIC_PLANS) if (PLANS[id].modes.includes(feature)) return id;
  return "business";
}
