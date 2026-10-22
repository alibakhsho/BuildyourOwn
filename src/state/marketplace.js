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
  contractFromRow, contractToRow,
} from "../logic/marketplace.js";

const BUCKET = "marketplace";
const SELLER_COLS = "user_id, kind, display_name, tagline, logo_path, regions, verified, licence_number, licence_state";
const SELLER = `seller:pro_profiles!listings_seller_id_fkey(${SELLER_COLS})`;
// Browse uses an inner join on a published, unsuspended seller, so a signed-in
// seller sees exactly what the public sees (RLS also lets them read their own
// drafts and taken-down listings, which don't belong in Browse).
const PUBLIC_SELLER = `seller:pro_profiles!listings_seller_id_fkey!inner(${SELLER_COLS}, published, suspended)`;
const publicListings = (q) => q.eq("status", "live").eq("hidden", false).eq("seller.published", true).eq("seller.suspended", false);

export const marketplaceAvailable = () => !!supabase;

function need() {
  if (!supabase) throw new Error("The marketplace needs an internet connection and a configured account service.");
  return supabase;
}

/* Turn database refusals into something a person can act on. `rls` is the
   sentence for a row-level-security refusal in the caller's context. */
function fail(error, rls = "Your plan doesn't allow that yet — Tradie for a profile and portfolio, Builder for listings.") {
  const m = error?.message || String(error);
  if (/row-level security|violates row-level/i.test(m)) throw new Error(rls);
  if (/plan_limit/.test(m)) throw new Error(m.replace(/^.*plan_limit:\s*/, "").replace(/^./, (c) => c.toUpperCase()) + ".");
  if (/rate_limit/.test(m)) throw new Error("You've sent 20 enquiries today. Try again tomorrow.");
  if (/listings_copyright_when_live/.test(m)) throw new Error("Confirm you own this design before publishing it.");
  if (/listings_prefab_site_works_when_live/.test(m)) throw new Error("Say whether each piece of site work is included, and add a lead time, before publishing.");
  if (/listings_media_when_live/.test(m)) throw new Error("Add at least one photo before publishing.");
  if (/abn/i.test(m) && /check/i.test(m)) throw new Error("An ABN is 11 digits.");
  if (/contact_email/.test(m)) throw new Error("That email address doesn't look right.");
  if (/postcode/.test(m)) throw new Error("A postcode is 4 digits.");
  if (/check constraint|out of range/i.test(m)) throw new Error("One of the values is out of range — check the numbers and try again.");
  if (/permission denied/i.test(m)) throw new Error("That change isn't allowed.");
  throw new Error(m);
}
const run = async (q, rls) => {
  const { data, error, count } = await q;
  if (error) fail(error, rls);
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

/* Photos taken off a saved listing, portfolio job or profile are deleted
   from the public bucket too (the Privacy Policy says removed photos go).
   Each upload has its own path, so nothing else can be using them. */
async function previousMedia(table, key, id, columns) {
  const { data } = await need().from(table).select(columns).eq(key, id).maybeSingle();
  if (!data) return [];
  return columns.split(",").flatMap((c) => data[c] ?? []).filter(Boolean);
}
async function removeDropped(before, after) {
  const keep = new Set(after.filter(Boolean));
  await removeMedia(before.filter((p) => !keep.has(p)));
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
  let query = publicListings(need().from("listings").select(`*, ${PUBLIC_SELLER}`)).order("created_at", { ascending: false }).limit(limit);
  if (kind) query = query.eq("kind", kind);
  if (saleMode) query = query.eq("sale_mode", saleMode);
  if (state) query = query.contains("regions", [state]);
  const term = safeTerm(q);
  if (term) query = query.ilike("title", `%${term}%`);
  return (await run(query)).map(listingFromRow);
}

export async function browsePros({ kind = null, state = null, q = "", limit = 60 } = {}) {
  let query = need().from("pro_profiles").select("*").eq("published", true).eq("suspended", false).order("updated_at", { ascending: false }).limit(limit);
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
    publicListings(sb.from("listings").select(`id, ${PUBLIC_SELLER}`, head)).eq("kind", "plan"),
    publicListings(sb.from("listings").select(`id, ${PUBLIC_SELLER}`, head)).eq("kind", "module"),
    sb.from("pro_profiles").select("user_id", head).eq("published", true).eq("suspended", false).eq("kind", "builder"),
    sb.from("pro_profiles").select("user_id", head).eq("published", true).eq("suspended", false).in("kind", ["tradie", "designer"]),
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
  const saved = await run(need().from("enquiries").insert(row).select("id").single(), "This seller isn't taking enquiries right now.");
  notifySeller(saved?.id);
  return saved?.id;
}

const API = import.meta.env?.VITE_AI_BACKEND || "";

/** Ask our server to email the seller. Fire-and-forget: the enquiry is
 *  already in their inbox in the app, so a failed email never bothers the
 *  buyer. The server checks it's this buyer's own, recent, un-notified one. */
export async function notifySeller(enquiryId) {
  if (!enquiryId || !supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    const res = await fetch(`${API}/api/market/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enquiryId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.sent && json.reason) console.info("[market] seller not emailed:", json.reason);
  } catch (e) {
    console.info("[market] seller not emailed:", e.message);
  }
}

/** New enquiries waiting for the signed-in seller — the badge on Marketplace. */
export async function newEnquiryCount(userId) {
  if (!supabase || !userId) return 0;
  const { count, error } = await supabase.from("enquiries").select("id", { count: "exact", head: true })
    .eq("seller_id", userId).eq("status", "new");
  return error ? 0 : count || 0;
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
  // The header badge counts new enquiries; let it refresh now.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("byo:enquiries-changed"));
}

/* ---- The signed-in seller's own records -------------------------------- */

export async function getMyPro(userId) {
  const row = await run(need().from("pro_profiles").select("*").eq("user_id", userId).maybeSingle());
  return row ? proFromRow(row) : null;
}

/** Create or update the seller's profile. Changing `kind` is allowed only to
 *  a kind the plan covers (the database checks): Tradie -> Builder on upgrade. */
export async function saveMyPro(userId, profile, { create = false } = {}) {
  const sb = need();
  const row = proToRow(profile);
  if (create) {
    if (!profile.termsVersion) throw new Error("Please agree to the Terms of Use first.");
    const data = await run(sb.from("pro_profiles").insert({ ...row, user_id: userId, kind: profile.kind, terms_version: profile.termsVersion }).select().single());
    return proFromRow(data);
  }
  const patch = profile.kind ? { ...row, kind: profile.kind } : row;
  const before = await previousMedia("pro_profiles", "user_id", userId, "logo_path,cover_path");
  const data = await run(sb.from("pro_profiles").update(patch).eq("user_id", userId).select().single());
  await removeDropped(before, [data.logo_path, data.cover_path]);
  return proFromRow(data);
}

/** Accept a (newer) version of the Terms; the database stamps the time. */
export async function acceptTerms(userId, version) {
  const data = await run(need().from("pro_profiles").update({ terms_version: version }).eq("user_id", userId).select().single());
  return proFromRow(data);
}

export async function myListings(userId) {
  const rows = await run(need().from("listings").select("*").eq("seller_id", userId).order("updated_at", { ascending: false }));
  return rows.map(listingFromRow);
}

export async function saveListing(userId, listing) {
  const sb = need();
  const row = listingToRow(listing);
  if (!listing.id) return listingFromRow(await run(sb.from("listings").insert({ ...row, seller_id: userId, status: "draft" }).select().single()));
  const before = await previousMedia("listings", "id", listing.id, "media_paths");
  const data = await run(sb.from("listings").update(row).eq("id", listing.id).select().single());
  await removeDropped(before, data.media_paths || []);
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
  if (!item.id) return portfolioFromRow(await run(sb.from("portfolio_items").insert({ ...row, owner_id: userId }).select().single()));
  const before = await previousMedia("portfolio_items", "id", item.id, "media_paths");
  const data = await run(sb.from("portfolio_items").update(row).eq("id", item.id).select().single());
  await removeDropped(before, data.media_paths || []);
  return portfolioFromRow(data);
}

export async function deletePortfolioItem(item) {
  await run(need().from("portfolio_items").delete().eq("id", item.id));
  await removeMedia(item.mediaPaths);
}

/* ---- Signed contracts (the 1.5% fee) ----------------------------------- */

/* Until the contracts migration is applied, the dashboard should still load. */
const missingTable = (e) => /relation .* does not exist|Could not find the table|schema cache/i.test(e?.message || "");

export async function myContracts(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("contracts").select("*").eq("builder_id", userId).order("signed_on", { ascending: false });
  if (error) { if (missingTable(error)) return []; fail(error); }
  return (data || []).map(contractFromRow);
}

/** Record a signed contract. `link` carries where it came from:
 *  { source: "marketplace", enquiryId, listingId } or { source: "site_office", jobRef, jobName }. */
export async function recordContract(userId, contract, link = {}) {
  const row = {
    ...contractToRow(contract),
    builder_id: userId,
    source: link.source || "other",
    enquiry_id: link.enquiryId || null,
    listing_id: link.listingId || null,
    job_ref: link.jobRef || null,
    job_name: link.jobName || null,
  };
  const { data, error } = await need().from("contracts").insert(row).select().single();
  if (error) {
    if (/contracts_one_per_enquiry|contracts_one_per_job|duplicate key/i.test(error.message)) {
      throw new Error("A contract is already recorded for this. Find it under My marketplace → Fees.");
    }
    if (missingTable(error)) throw new Error("Contract recording isn't switched on yet — the database update still needs applying.");
    fail(error, "You can only record contracts for your own enquiries, listings and jobs.");
  }
  if (link.enquiryId) await setEnquiryStatus(link.enquiryId, "won").catch(() => {});
  return contractFromRow(data);
}

export async function updateContract(id, contract) {
  const data = await run(need().from("contracts").update(contractToRow(contract)).eq("id", id).select().maybeSingle());
  if (!data) throw new Error("This record is locked — it's been invoiced, or it's more than 14 days old. Contact us to change it.");
  return contractFromRow(data);
}

export async function voidContract(id) {
  const data = await run(need().from("contracts").update({ status: "void" }).eq("id", id).select().maybeSingle());
  if (!data) throw new Error("This record is locked — contact us to void it.");
  return contractFromRow(data);
}
