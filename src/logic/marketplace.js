/* =========================================================================
   MODULE: logic/marketplace.js
   What builders can sell through BuildYourOwn, and what we take.

   We are the platform, not a party to the build. Builders choose how they
   sell (their free hand), and every sale or signed contract carries the
   platform fee:

     plan_purchase  Buy the plans outright and build with anyone.
     plan_licence   Pay to build the design once (per-build licence).
     build_only     The design is showcase only: you get it by signing a
                    build contract with that builder.
     prefab         A prefabricated module at a fixed price — what you see
                    is what you get, delivered. Site works (footings,
                    crane, connections, approvals) are never in a module's
                    price, so a prefab listing must say what is excluded.

   The fee comes out of the seller's payout (Stripe Connect
   application fee); the buyer pays the listed price plus GST. Pure module.
   ========================================================================= */

/** Platform fee on every signed contract and every marketplace sale. */
export const PLATFORM_FEE_RATE = 0.015;
export const GST_RATE = 0.1;

export const SALE_MODES = {
  plan_purchase: { label: "Buy the plans", payable: true },
  plan_licence: { label: "Licence to build once", payable: true },
  build_only: { label: "Build with this builder", payable: false },
  prefab: { label: "Prefab module, delivered", payable: true },
};

/** Site works a prefab price usually doesn't cover. A listing must answer
 *  each one — "included" or "excluded" — in `siteWorks`, so "what you see is
 *  what you get" is true and the buyer knows what else to budget for. */
export const PREFAB_SITE_WORKS = {
  footings: "Footings / slab or piers",
  transport: "Transport and crane",
  services: "Service connections (power, water, sewer)",
  approvals: "Engineering and building approval for your site",
};

const cents = (v) => Number.isInteger(v) && v >= 0;

/** Can this listing go up for review? Returns the reasons it can't. */
export function validateListing(l = {}) {
  const errors = [];
  if (!SALE_MODES[l.saleMode]) errors.push(`saleMode must be one of: ${Object.keys(SALE_MODES).join(", ")}`);
  if (!l.title || l.title.length > 160) errors.push("title required (up to 160 characters)");
  if (SALE_MODES[l.saleMode]?.payable && !(cents(l.priceCents) && l.priceCents > 0)) {
    errors.push("priceCents required (positive whole cents, ex GST)");
  }
  if (!Array.isArray(l.media) || l.media.length === 0) errors.push("at least one photo or render");
  if (l.saleMode === "plan_purchase" || l.saleMode === "plan_licence") {
    if (!l.ownsCopyright) errors.push("seller must confirm they own or are licensed to sell this design");
  }
  if (l.saleMode === "prefab") {
    if (!Array.isArray(l.inclusions) || !l.inclusions.length) errors.push("prefab: list what's included");
    const missing = Object.entries(PREFAB_SITE_WORKS)
      .filter(([k]) => !["included", "excluded"].includes(l.siteWorks?.[k]))
      .map(([, label]) => label);
    if (missing.length) errors.push(`prefab: say whether these are included or excluded — ${missing.join("; ")}`);
    if (!Array.isArray(l.deliveryRegions) || !l.deliveryRegions.length) errors.push("prefab: delivery regions required");
    if (!Number.isInteger(l.leadTimeWeeks) || l.leadTimeWeeks <= 0) errors.push("prefab: lead time in weeks required");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * What a buyer pays and what the seller receives. All integer cents.
 * Delivery is quoted by the seller per region (prefab only).
 */
export function checkoutTotals(listing, { deliveryCents = 0, feeRate = PLATFORM_FEE_RATE } = {}) {
  if (!SALE_MODES[listing.saleMode]?.payable) throw new Error("This listing is built to order — sign a contract with the builder instead.");
  const subtotal = listing.priceCents + (listing.saleMode === "prefab" ? deliveryCents : 0);
  const gst = Math.round(subtotal * GST_RATE);
  const fee = Math.round(subtotal * feeRate);
  return {
    subtotalCents: subtotal,
    gstCents: gst,
    buyerPaysCents: subtotal + gst,
    platformFeeCents: fee,            // Stripe application_fee_amount
    sellerReceivesCents: subtotal + gst - fee,
  };
}

/** The site works the buyer still has to arrange and pay for separately. */
export const prefabExtras = (listing) =>
  Object.entries(PREFAB_SITE_WORKS).filter(([k]) => listing.siteWorks?.[k] !== "included").map(([, label]) => label);

/** The platform fee on a contract signed through BuildYourOwn (ex GST value). */
export function contractFee(contractValue, feeRate = PLATFORM_FEE_RATE) {
  const v = Math.max(0, Number(contractValue) || 0);
  return Math.round(v * feeRate * 100) / 100;
}
