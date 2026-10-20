/* =========================================================================
   MODULE: partners/contracts.js
   The shapes a partner integrates against, and the rules we apply to what
   they send. Written before any partner exists on purpose: when a supplier
   or a trades platform says "what do you need from us?", the answer is this
   file (and docs/PARTNER-API.md, which documents it for them).

   Two feeds today:

     PriceQuote    live material pricing from a supplier — one SKU, one
                   price, one region, and a validUntil. A price without an
                   expiry is never used: a fixed-price quote built on a
                   number nobody stands behind is the builder's loss.
     TradeOffer    a tradie a dispatch partner can put on a job — trade,
                   licence, insurance, rate, availability. Nobody is offered
                   to a client with an expired licence or insurance, and the
                   licence must cover the state the job is in.

   Everything here is a pure function over plain objects, shared by the
   browser and the server, so the two can never disagree about what is a
   valid price or an eligible tradie.
   ========================================================================= */

export const PARTNER_KINDS = ["pricing", "trades", "engineering", "certification", "finance", "insurance"];

export const TRADES = [
  "builder", "carpenter", "concreter", "bricklayer", "roofer", "plumber", "electrician",
  "plasterer", "tiler", "painter", "landscaper", "excavation", "steel_fixer", "glazier", "cabinetmaker",
  "hvac", "waterproofer", "surveyor", "engineer", "certifier",
];

/** Trades that need a licence of their own to work, in every AU state. */
export const LICENSED_TRADES = new Set(["builder", "plumber", "electrician", "hvac", "certifier"]);

const isISO = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isPos = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const str = (v, max = 200) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/* ---- Pricing ----------------------------------------------------------- */

/**
 * Validate and normalise one supplier price. Money is integer cents ex GST
 * so nothing downstream ever rounds a float.
 */
export function validatePriceQuote(q, { now = Date.now() } = {}) {
  const errors = [];
  if (!q || typeof q !== "object") return { ok: false, errors: ["not an object"] };
  if (!str(q.partnerId, 64)) errors.push("partnerId required");
  if (!str(q.sku, 64)) errors.push("sku required");
  if (!str(q.description)) errors.push("description required");
  if (!str(q.unit, 16)) errors.push("unit required (e.g. m, m2, m3, each, sheet, lm)");
  if (!Number.isInteger(q.unitPriceCents) || q.unitPriceCents <= 0) errors.push("unitPriceCents must be a positive integer (ex GST)");
  if (q.currency !== undefined && !/^[A-Z]{3}$/.test(q.currency)) errors.push("currency must be ISO 4217");
  if (!str(q.region, 16)) errors.push("region required (state, e.g. QLD, or a postcode)");
  if (!isISO(q.validUntil)) errors.push("validUntil must be an ISO timestamp");
  else if (Date.parse(q.validUntil) <= now) errors.push("price has expired");
  if (q.minQty !== undefined && !isPos(q.minQty)) errors.push("minQty must be positive");
  if (q.leadTimeDays !== undefined && !(Number.isInteger(q.leadTimeDays) && q.leadTimeDays >= 0)) errors.push("leadTimeDays must be a whole number");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      partnerId: q.partnerId,
      sku: q.sku,
      gtin: q.gtin || null,
      catalogueId: q.catalogueId || null, // our materials.js id, when the partner has mapped it
      description: q.description.trim(),
      unit: q.unit,
      unitPriceCents: q.unitPriceCents,
      currency: q.currency || "AUD",
      region: q.region,
      minQty: q.minQty || 1,
      leadTimeDays: q.leadTimeDays ?? null,
      stock: q.stock || "unknown",       // in_stock | low | order_in | unknown
      deliveryCents: Number.isInteger(q.deliveryCents) ? q.deliveryCents : null,
      validUntil: q.validUntil,
      exclusive: !!q.exclusive,           // marketplace-exclusive line
    },
  };
}

/**
 * The best usable price for a material from a set of partner quotes: valid,
 * unexpired, in the job's region, and covering the quantity. Cheapest
 * landed cost wins (unit × qty + delivery); lead time breaks ties.
 */
export function bestPrice(quotes = [], { region, qty = 1, now = Date.now() } = {}) {
  const usable = [];
  for (const q of quotes) {
    const v = validatePriceQuote(q, { now });
    if (!v.ok) continue;
    if (region && v.value.region !== region) continue;
    if (qty < v.value.minQty) continue;
    const landed = v.value.unitPriceCents * qty + (v.value.deliveryCents || 0);
    usable.push({ ...v.value, landedCents: landed });
  }
  usable.sort((a, b) => a.landedCents - b.landedCents || (a.leadTimeDays ?? 99) - (b.leadTimeDays ?? 99));
  return usable[0] || null;
}

/**
 * A fixed-price quote is only as good as the prices under it. Returns the
 * earliest expiry across the priced lines — the date the quote must say it
 * is valid until.
 */
export function quoteValidUntil(pricedLines = []) {
  const times = pricedLines.map((l) => Date.parse(l.validUntil)).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

/* ---- Trades ------------------------------------------------------------ */

export function validateTradeOffer(t) {
  const errors = [];
  if (!t || typeof t !== "object") return { ok: false, errors: ["not an object"] };
  if (!str(t.partnerId, 64)) errors.push("partnerId required");
  if (!str(t.tradieId, 64)) errors.push("tradieId required");
  if (!TRADES.includes(t.trade)) errors.push(`trade must be one of: ${TRADES.join(", ")}`);
  if (!str(t.businessName)) errors.push("businessName required");
  if (!str(t.abn || "", 14) || !/^\d{11}$/.test(String(t.abn).replace(/\s/g, ""))) errors.push("abn must be 11 digits");
  if (!t.insurance || !isPos(t.insurance.publicLiabilityCents) || !isISO(t.insurance.expiresAt)) {
    errors.push("insurance.publicLiabilityCents and insurance.expiresAt required");
  }
  if (LICENSED_TRADES.has(t.trade)) {
    const l = t.licence;
    if (!l || !str(l.number, 32) || !str(l.state, 3) || !isISO(l.expiresAt)) {
      errors.push("licence { number, state, expiresAt } required for this trade");
    }
  }
  if (!Array.isArray(t.serviceAreas) || !t.serviceAreas.length) errors.push("serviceAreas (postcodes) required");
  if (t.rate && !["hourly", "daily", "fixed", "quote"].includes(t.rate.type)) errors.push("rate.type must be hourly, daily, fixed or quote");
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/** Minimum public liability a tradie must carry to be put on a job. */
export const MIN_PUBLIC_LIABILITY_CENTS = 5_000_000_00; // A$5m — the usual head-contract requirement

/**
 * Can this tradie be offered for this job, on this date? Returns the reasons
 * if not, so the UI can tell the tradie exactly what to fix.
 */
export function dispatchEligibility(t, { trade, state, postcode, date = Date.now() } = {}) {
  const v = validateTradeOffer(t);
  if (!v.ok) return { eligible: false, reasons: v.errors };
  const reasons = [];
  const at = typeof date === "number" ? date : Date.parse(date);
  if (trade && t.trade !== trade) reasons.push(`is a ${t.trade}, not a ${trade}`);
  if (Date.parse(t.insurance.expiresAt) <= at) reasons.push("insurance expired");
  if (t.insurance.publicLiabilityCents < MIN_PUBLIC_LIABILITY_CENTS) reasons.push("public liability below A$5m");
  if (LICENSED_TRADES.has(t.trade)) {
    if (Date.parse(t.licence.expiresAt) <= at) reasons.push("licence expired");
    if (state && t.licence.state !== state) reasons.push(`licence is for ${t.licence.state}, job is in ${state}`);
  }
  if (postcode && !t.serviceAreas.includes(String(postcode))) reasons.push("does not service this postcode");
  if (t.availableFrom && isISO(t.availableFrom) && Date.parse(t.availableFrom) > at) reasons.push("not available by that date");
  return { eligible: reasons.length === 0, reasons };
}

/* ---- Partner registry -------------------------------------------------- */

const partners = new Map();

/**
 * Register a partner adapter. An adapter is whatever talks to the partner's
 * API (server side — keys never reach the browser) and returns the shapes
 * above:
 *   { id, kind, label,
 *     quotePrices?(items: {catalogueId, qty}[], region) => Promise<PriceQuote[]>,
 *     findTrades?(query: {trade, state, postcode, date}) => Promise<TradeOffer[]> }
 */
export function registerPartner(adapter) {
  if (!adapter || !str(adapter.id, 64) || !PARTNER_KINDS.includes(adapter.kind)) {
    throw new Error("partner needs an id and a kind of: " + PARTNER_KINDS.join(", "));
  }
  partners.set(adapter.id, adapter);
  return () => partners.delete(adapter.id);
}

export const listPartners = (kind) => [...partners.values()].filter((p) => !kind || p.kind === kind);

/** Ask every pricing partner, keep only valid prices. One failing partner never sinks the rest. */
export async function livePrices(items, region, { now = Date.now() } = {}) {
  const results = await Promise.allSettled(listPartners("pricing").map((p) => p.quotePrices?.(items, region) || []));
  return results
    .flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []))
    .filter((q) => validatePriceQuote(q, { now }).ok);
}

/** Ask every trades partner, keep only tradies who can actually take the job. */
export async function availableTrades(query) {
  const results = await Promise.allSettled(listPartners("trades").map((p) => p.findTrades?.(query) || []));
  return results
    .flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []))
    .filter((t) => dispatchEligibility(t, query).eligible);
}
