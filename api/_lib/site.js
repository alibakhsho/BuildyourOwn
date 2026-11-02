/* =========================================================================
   Site lookup — GET /api/site/:op   (op = search | lot | elevation | imagery)

   Address → point → lot boundary, zoning, terrain and a satellite photo,
   for the "Your land" card. Used by both hosts: server/index.js mounts it
   directly; on Vercel it rides inside api/health.js (the Hobby plan allows
   12 functions and every slot is taken) via the /api/site/* rewrite in
   vercel.json.

   Providers — Google when GOOGLE_MAPS_API_KEY is set, free ones otherwise:

     search     Google Geocoding API        | OpenStreetMap Nominatim
     elevation  Google Elevation API        | Open-Meteo (Copernicus 90 m DEM)
     imagery    Google Static Maps satellite | Esri World Imagery export
     lot        NSW Spatial Services cadastre (public, no key) for NSW points
     zoning     NSW Planning Portal land zoning (public, no key)

   The free providers have usage rules: Nominatim allows ~1 request/second
   and needs an identifying User-Agent; Esri's basemap is for development
   and light use without an ArcGIS key. For production traffic set the
   Google key. Keys never reach the browser — imagery is streamed through
   this route.

   Cost and abuse: the same origin check and per-IP limits as the AI routes
   (guard.js), but NOT the AI kill switch — land lookups don't spend AI.
   ========================================================================= */
import { allowedOrigin, rateLimit, clientKey } from "./guard.js";
import {
  parseGoogleGeocode, parseNominatim, parseArcgisFeature, nswLotLabel, nswZoning,
  parseGoogleElevation, parseOpenMeteo, lotFromRing, inNsw, imageryPlan, mercatorBox,
} from "../../src/logic/site.js";

export const SITE_LIMITS = { perMinute: 30, perDay: 300 };

const UA = "BuildYourOwn-estimator/1.0 (site lookup; contact via app)";
const googleKey = () => (process.env.GOOGLE_MAPS_API_KEY || "").trim();
export const siteProvider = () => (googleKey() ? "google" : "free");

// Overridable so a state's service can move without a code change.
const NSW_CADASTRE = () => process.env.BYO_NSW_CADASTRE_URL || "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9";
const NSW_ZONING = () => process.env.BYO_NSW_ZONING_URL || "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Planning/EPI_Primary_Planning_Layers/MapServer/2";

async function getJson(url, { timeout = 9000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error(`Upstream ${r.status}`), { status: 502 });
    return await r.json();
  } finally { clearTimeout(t); }
}

const num = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
const pointQuery = (base, lat, lng) => `${base}/query?${new URLSearchParams({
  geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
  outFields: "*", returnGeometry: "true", outSR: "4326", f: "json",
})}`;

/* ---- ops ---------------------------------------------------------------- */

export async function search(q) {
  const query = String(q || "").trim().slice(0, 200);
  if (query.length < 4) return { results: [] };
  if (googleKey()) {
    const j = await getJson(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address: query, region: "au", key: googleKey() })}`);
    return { provider: "google", results: parseGoogleGeocode(j) };
  }
  const j = await getJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "au" })}`);
  return { provider: "osm", results: parseNominatim(j) };
}

export async function lot(lat, lng) {
  if (!inNsw(lat, lng)) {
    return { lot: null, zoning: null, imagery: siteProvider() === "google" ? "google" : "esri",
      note: "Lot boundaries come from the state land register — NSW is connected so far. Enter the block size in Landscaping for now." };
  }
  const [lotRes, zoneRes] = await Promise.allSettled([
    getJson(pointQuery(NSW_CADASTRE(), lat, lng)),
    getJson(pointQuery(NSW_ZONING(), lat, lng).replace("returnGeometry=true", "returnGeometry=false")),
  ]);
  let out = null, note = "";
  if (lotRes.status === "fulfilled") {
    const f = parseArcgisFeature(lotRes.value);
    if (f?.ring) {
      const shape = lotFromRing(f.ring, [lat, lng]);
      if (shape) out = { ...shape, ...nswLotLabel(f.attributes), source: "NSW Spatial Services cadastre" };
    }
    if (!out) note = "No registered lot at that point — the address may sit on the road. Try the exact street number.";
  } else {
    note = "The NSW land register didn't answer — try again in a minute.";
  }
  const zoning = zoneRes.status === "fulfilled" ? nswZoning(parseArcgisFeature(zoneRes.value)?.attributes) : null;
  return { lot: out, zoning, imagery: siteProvider() === "google" ? "google" : "esri", note };
}

export async function elevation(points) {
  const pts = points.slice(0, 9);
  if (!pts.length) return { elevations: [] };
  if (googleKey()) {
    const j = await getJson(`https://maps.googleapis.com/maps/api/elevation/json?${new URLSearchParams({ locations: pts.map((p) => `${p[0]},${p[1]}`).join("|"), key: googleKey() })}`);
    return { source: "Google Elevation", elevations: parseGoogleElevation(j) };
  }
  const j = await getJson(`https://api.open-meteo.com/v1/elevation?${new URLSearchParams({ latitude: pts.map((p) => p[0]).join(","), longitude: pts.map((p) => p[1]).join(",") })}`);
  return { source: "Copernicus 90 m terrain (Open-Meteo)", elevations: parseOpenMeteo(j) };
}

/** Upstream image URL for a centre + ground span. Exported for tests. */
export function imageryUrl(lat, lng, span, key = googleKey()) {
  if (key) {
    const plan = imageryPlan("google", lat, span);
    return { plan, url: `https://maps.googleapis.com/maps/api/staticmap?${new URLSearchParams({ center: `${lat},${lng}`, zoom: String(plan.zoom), size: "640x640", scale: "2", maptype: "satellite", key })}` };
  }
  const plan = imageryPlan("esri", lat, span);
  const box = mercatorBox(lat, lng, plan.spanM);
  return { plan, url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${new URLSearchParams({ bbox: box.map((v) => v.toFixed(2)).join(","), bboxSR: "3857", imageSR: "3857", size: `${plan.sizePx},${plan.sizePx}`, format: "jpg", f: "image" })}` };
}

/* ---- the route ---------------------------------------------------------- */

/** req.query.op (or the :op param) picks the operation; works under Express and Vercel. */
export default async function siteHandler(req, res, opArg) {
  const op = String(opArg || req.params?.op || req.query?.site || req.query?.op || "");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!allowedOrigin(req)) return res.status(403).json({ error: "This endpoint only accepts requests from the app itself." });
  const rl = rateLimit("site", clientKey(req), SITE_LIMITS);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return res.status(429).json({ error: "Too many land lookups — give it a minute." }); }

  const q = req.query || {};
  const lat = num(q.lat), lng = num(q.lng);
  const needPoint = op !== "search";
  if (needPoint && op !== "elevation" && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return res.status(400).json({ error: "lat and lng are required." });

  try {
    if (op === "search") return res.status(200).json(await search(q.q));
    if (op === "lot") return res.status(200).json(await lot(lat, lng));
    if (op === "elevation") {
      const pts = String(q.points || "").split("|").map((s) => s.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
      return res.status(200).json(await elevation(pts));
    }
    if (op === "imagery") {
      const { url } = imageryUrl(lat, lng, num(q.span) || 80);
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 12000);
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctl.signal });
        const type = r.headers.get("content-type") || "";
        if (!r.ok || !type.startsWith("image/")) return res.status(502).json({ error: "The satellite provider didn't return a picture." });
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader("Content-Type", type);
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");   // a week: same box, same picture
        return res.status(200).send(buf);
      } finally { clearTimeout(t); }
    }
    return res.status(404).json({ error: `Unknown site lookup "${op}".` });
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return res.status(aborted ? 504 : e?.status || 502).json({ error: aborted ? "The land service took too long — try again." : e?.message || "Land lookup failed." });
  }
}
