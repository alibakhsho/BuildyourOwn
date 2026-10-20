/* =========================================================================
   MODULE: state/marketplace.js
   Everything the marketplace screens read and write, over Supabase.

   Unlike Site Office (device-first, localStorage), the marketplace only
   makes sense shared, so it lives in the database from day one. Every call
   here runs as the signed-in user (or anonymously) under the row-level
   security in supabase/migrations/20261020100000_marketplace.sql — so this
   file never decides who may see what; the database does. A failed call
   throws an Error with a message fit to show the user.

   Photos go to the public "marketplace" storage bucket under the uploader's
   own folder (<user_id>/...). Rows hold storage paths, never URLs, so a
   change of storage domain is a change to mediaUrl() only.
   ========================================================================= */

import { supabase } from "../lib/supabase.js";
import { normaliseImage, downscaleForVision } from "./blobstore.js";
import {
  listingFromRow, listingToRow, proFromRow, proToRow, portfolioFromRow, portfolioToRow,
} from "../logic/marketplace.js";

const BUCKET = "marketplace";
const SELLER = "seller:pro_profiles!listings_seller_id_fkey(user_id, kind, display_name, tagline, logo_path, regions, verified, licence_number, licence_state)";

export const marketplaceAvailable = () => !!supabase;

function need() {
  if (!supabase) throw new Error("The marketplace needs an internet connection and a configured account service.");
  return supabase;
}

/* Turn database refusals into something a person can act on. */
function fail(error) {
  const m = error?.message || String(error);
  if (/row-level security|violates row-level/i.test(m)) {
    throw new Error("Your plan doesn't allow that yet — Tradie for a profile and portfolio, Builder for listings.");
  }
  if (/rate_limit/.test(m)) throw new Error("You've sent 20 enquiries today. Try again tomorrow.");
  if (/listings_copyright_when_live/.test(m)) throw new Error("Confirm you own this design before publishing it.");
  if (/listings_prefab_site_works_when_live/.test(m)) throw new Error("Say whether each piece of site work is included, and add a lead time, before publishing.");
  if (/listings_media_when_live/.test(m)) throw new Error("Add at least one photo before publishing.");
  if (/abn/i.test(m) && /check/i.test(m)) throw new Error("An ABN is 11 digits.");
  if (/contact_email/.test(m)) throw new Error("That email address doesn't look right.");
  if (/postcode/.test(m)) throw new Error("A postcode is 4 digits.");
  throw new Error(m);
}
const run = async (q) => {
  const { data, error, count } = await q;
  if (error) fail(error);
  return count != null && data == null ? count : data;
};

/** Strip characters PostgREST filters treat as syntax, so a search box can't break the query. */
const safeTerm = (q) => (q || "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 80);

/* ---- Media ------------------------------------------------------------- */

export function mediaUrl(path) {
  if (!path || !supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload one photo (or a PDF brochure) to the user's own folder. Phone
 * photos are normalised the same way plan sheets are (HEIC decoded, EXIF
 * rotation baked in), then capped at 2400px so a listing page stays quick
 * on a phone. Returns the storage path to keep on the row.
 */
export async function uploadMedia(file, userId) {
  const sb = need();
  if (!userId) throw new Error("Sign in to upload photos.");
  let blob = file;
  let ext = (file.name?.split(".").pop() || "").toLowerCase();
  if (file.type !== "application/pdf") {
    const norm = await normaliseImage(file);
    blob = await downscaleForVision(norm.blob, 2400, 0.86);
    ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  } else {
    ext = "pdf";
  }
  if (blob.size > 10 * 1024 * 1024) throw new Error("That file is over 10 MB.");
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${id}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) fail(error);
  return path;
}

export async function removeMedia(paths = []) {
  if (!paths.length) return;
  const { error } = await need().storage.from(BUCKET).remove(paths);
  if (error) console.warn("[market] Could not remove media:", error.message);
}

/* ---- Browsing (public) ------------------------------------------------- */

/** Live listings, newest first. RLS already limits this to live, unhidden
 *  listings from published sellers; the filters only narrow it. */
export async function browseListings({ kind = null, state = null, q = "", saleMode = null, limit = 60 } = {}) {
  let query = need().from("listings").select(`*, ${SELLER}`).order("created_at", { ascending: false }).limit(limit);
  query = query.eq("status", "live");
  if (kind) query = query.eq("kind", kind);
  if (saleMode) query = query.eq("sale_mode", saleMode);
  if (state) query = query.contains("regions", [state]);
  const term = safeTerm(q);
  if (term) query = query.ilike("title", `%${term}%`);
  return (await run(query)).map(listingFromRow);
}

export async function browsePros({ kind = null, state = null, q = "", limit = 60 } = {}) {
  let query = need().from("pro_profiles").select("*").eq("published", true).order("updated_at", { ascending: false }).limit(limit);
  if (kind) query = query.eq("kind", kind);
  if (state) query = query.contains("regions", [state]);
  const term = safeTerm(q);
  if (term) query = query.ilike("display_name", `%${term}%`);
  return (await run(query)).map(proFromRow);
}

/** Headline numbers for the marketplace front page. */
export async function marketCounts() {
  const sb = need();
  const head = { count: "exact", head: true };
  const [plans, modules, builders, tradies] = await Promise.all([
    sb.from("listings").select("id", head).eq("status", "live").eq("kind", "plan"),
    sb.from("listings").select("id", head).eq("status", "live").eq("kind", "module"),
    sb.from("pro_profiles").select("user_id", head).eq("published", true).eq("kind", "builder"),
    sb.from("pro_profiles").select("user_id", head).eq("published", true).in("kind", ["tradie", "designer"]),
  ]);
  for (const r of [plans, modules, builders, tradies]) if (r.error) fail(r.error);
  return { plans: plans.count || 0, modules: modules.count || 0, builders: builders.count || 0, tradies: tradies.count || 0 };
}

export async function getListing(id) {
  const row = await run(need().from("listings").select(`*, ${SELLER}`).eq("id", id).maybeSingle());
  return row ? listingFromRow(row) : null;
}

/** Count a view. Fire-and-forget: a lost view never bothers the visitor. */
export function recordView(id) {
  if (!supabase || !id) return;
  supabase.rpc("record_listing_view", { p_listing: id }).then(({ error }) => {
    if (error) console.warn("[market] view not recorded:", error.message);
  });
}

export async function getPro(userId) {
  const sb = need();
  const [pro, portfolio, listings] = await Promise.all([
    run(sb.from("pro_profiles").select("*").eq("user_id", userId).maybeSingle()),
    run(sb.from("portfolio_items").select("*").eq("owner_id", userId).eq("published", true).order("completed_on", { ascending: false, nullsFirst: false })),
    run(sb.from("listings").select("*").eq("seller_id", userId).eq("status", "live").order("created_at", { ascending: false })),
  ]);
  if (!pro) return null;
  return { pro: proFromRow(pro), portfolio: portfolio.map(portfolioFromRow), listings: listings.map(listingFromRow) };
}

/* ---- Enquiries --------------------------------------------------------- */

export async function sendEnquiry({ sellerId, listingId = null, name, email, phone, postcode, message }) {
  const row = {
    seller_id: sellerId,
    listing_id: listingId,
    contact_name: (name || "").trim(),
    contact_email: (email || "").trim(),
    contact_phone: (phone || "").trim() || null,
    postcode: (postcode || "").trim() || null,
    message: (message || "").trim(),
  };
  if (!row.contact_name || !row.contact_email || !row.message) throw new Error("Add your name, email and a message.");
  // No .select(): the buyer can read their own enquiry, but returning it
  // isn't needed and keeps this a plain insert.
  await run(need().from("enquiries").insert(row));
}

/** Enquiries sent TO the signed-in seller. */
export async function myEnquiries(userId) {
  return run(need().from("enquiries").select("*, listing:listings(id, title)").eq("seller_id", userId).order("created_at", { ascending: false }).limit(200));
}

/** Enquiries the signed-in user has SENT. */
export async function mySentEnquiries(userId) {
  return run(need().from("enquiries")
    .select("id, created_at, status, message, listing:listings(id, title), seller:pro_profiles(user_id, display_name)")
    .eq("buyer_id", userId).order("created_at", { ascending: false }).limit(100));
}

export async function setEnquiryStatus(id, status) {
  await run(need().from("enquiries").update({ status }).eq("id", id));
}

/* ---- The signed-in seller's own records -------------------------------- */

export async function getMyPro(userId) {
  const row = await run(need().from("pro_profiles").select("*").eq("user_id", userId).maybeSingle());
  return row ? proFromRow(row) : null;
}

/** Create (with a kind, which can't change later) or update the seller's profile. */
export async function saveMyPro(userId, profile, { create = false } = {}) {
  const sb = need();
  const row = proToRow(profile);
  if (create) {
    const data = await run(sb.from("pro_profiles").insert({ ...row, user_id: userId, kind: profile.kind }).select().single());
    return proFromRow(data);
  }
  const data = await run(sb.from("pro_profiles").update(row).eq("user_id", userId).select().single());
  return proFromRow(data);
}

export async function myListings(userId) {
  const rows = await run(need().from("listings").select("*").eq("seller_id", userId).order("updated_at", { ascending: false }));
  return rows.map(listingFromRow);
}

export async function saveListing(userId, listing) {
  const sb = need();
  const row = listingToRow(listing);
  const data = listing.id
    ? await run(sb.from("listings").update(row).eq("id", listing.id).select().single())
    : await run(sb.from("listings").insert({ ...row, seller_id: userId, status: "draft" }).select().single());
  return listingFromRow(data);
}

export async function setListingStatus(id, status) {
  const data = await run(need().from("listings").update({ status }).eq("id", id).select().single());
  return listingFromRow(data);
}

export async function deleteListing(listing) {
  await run(need().from("listings").delete().eq("id", listing.id));
  await removeMedia(listing.mediaPaths);
}

export async function myPortfolio(userId) {
  const rows = await run(need().from("portfolio_items").select("*").eq("owner_id", userId).order("completed_on", { ascending: false, nullsFirst: false }));
  return rows.map(portfolioFromRow);
}

export async function savePortfolioItem(userId, item) {
  const sb = need();
  const row = portfolioToRow(item);
  const data = item.id
    ? await run(sb.from("portfolio_items").update(row).eq("id", item.id).select().single())
    : await run(sb.from("portfolio_items").insert({ ...row, owner_id: userId }).select().single());
  return portfolioFromRow(data);
}

export async function deletePortfolioItem(item) {
  await run(need().from("portfolio_items").delete().eq("id", item.id));
  await removeMedia(item.mediaPaths);
}
