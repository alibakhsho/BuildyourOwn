/* =========================================================================
   MODULE: logic/site.js — the land a house goes on.

   Pure maths and response parsing for the "Your land" card: an address
   becomes a point, the point becomes a lot (its boundary from the state
   cadastre), the lot becomes a frontage × depth the landscape model can
   use, and the satellite photo is laid under the 3D model at true scale.

   Shared by the browser (SiteCard) and the server (api/_lib/site.js) so
   both compute the same imagery footprint from the same inputs — the
   picture and the model can never disagree about how many metres it covers.

   Coordinates:
     lat/lng      WGS84 degrees
     local (x,y)  metres east / north of a reference point — an
                  equirectangular projection, exact to a few mm over a lot
     model (x,z)  three.js: x across, +z = towards the street

   No React, no three.js, no network. Tests: test/site.test.mjs.
   ========================================================================= */

const R = 6378137;                 // WGS84 equatorial radius, metres
const D2R = Math.PI / 180;

/* ---------- projection ---------- */

/** lat/lng → metres east/north of ref. */
export function toLocal(ref, p) {
  const [lat, lng] = p;
  return [(lng - ref[1]) * D2R * R * Math.cos(ref[0] * D2R), (lat - ref[0]) * D2R * R];
}
/** metres east/north of ref → lat/lng. */
export function fromLocal(ref, xy) {
  return [ref[0] + xy[1] / R / D2R, ref[1] + xy[0] / (R * Math.cos(ref[0] * D2R)) / D2R];
}

/** Shoelace area of a ring of [x,y] metres (open or closed ring). */
export function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Compass bearing (0 = north, 90 = east) of a local east/north vector. */
export const bearingOf = (x, y) => ((Math.atan2(x, y) / D2R) + 360) % 360;

/**
 * The smallest rectangle around a lot — its frontage and depth for a block
 * that is not quite square. Each side carries the compass bearing of its
 * outward normal, which is how the street side is chosen.
 * @returns {{ center:[x,y], sides:[{ bearing, lengthM }] }} sides in order +u, +v, -u, -v
 */
export function minAreaRect(pts) {
  const hull = convexHull(pts);
  if (hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], v = [-u[1], u[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of hull) {
      const pu = q[0] * u[0] + q[1] * u[1], pv = q[0] * v[0] + q[1] * v[1];
      u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area - 1e-9) best = { area, u, v, u0, u1, v0, v1 };
  }
  const { u, v, u0, u1, v0, v1 } = best;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const du = u1 - u0, dv = v1 - v0;
  return {
    center: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv],
    // a side facing +u is as long as the rectangle's v extent, and so on
    sides: [
      { bearing: bearingOf(u[0], u[1]), lengthM: dv },
      { bearing: bearingOf(v[0], v[1]), lengthM: du },
      { bearing: bearingOf(-u[0], -u[1]), lengthM: dv },
      { bearing: bearingOf(-v[0], -v[1]), lengthM: du },
    ],
  };
}

/**
 * A cadastre ring (lat/lng) as a lot: area, its bounding rectangle's centre
 * (the point the imagery is centred on), the four candidate street sides,
 * and the boundary in metres around that centre.
 * `hint` is the geocoded address point: the street side is guessed as the
 * side facing it (address points sit near the front of the block more often
 * than not) — the card always lets the owner turn it.
 */
export function lotFromRing(ring, hint) {
  const pts = (ring || []).filter((p) => Array.isArray(p) && p.every(Number.isFinite));
  if (pts.length < 3) return null;
  const ref = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const local = pts.map((p) => toLocal(ref, p));
  const rect = minAreaRect(local);
  if (!rect) return null;
  const center = fromLocal(ref, rect.center);
  const boundary = local.map(([x, y]) => [x - rect.center[0], y - rect.center[1]]);
  // no usable hint: blocks are usually deeper than wide, so the street is on a short side
  let streetSide = rect.sides[0].lengthM <= rect.sides[1].lengthM ? 0 : 1;
  if (Array.isArray(hint) && hint.every(Number.isFinite)) {
    const h = toLocal(ref, hint);
    const dx = h[0] - rect.center[0], dy = h[1] - rect.center[1];
    // only trust the hint when it is clearly off-centre
    if (Math.hypot(dx, dy) > 2) {
      const hb = bearingOf(dx, dy);
      const off = (b) => Math.abs(((b - hb + 540) % 360) - 180);
      streetSide = rect.sides.reduce((bi, s, i) => (off(s.bearing) < off(rect.sides[bi].bearing) ? i : bi), 0);
    }
  }
  return {
    areaM2: Math.round(ringArea(local)),
    center,
    sides: rect.sides.map((s) => ({ bearing: Math.round(s.bearing * 10) / 10, lengthM: Math.round(s.lengthM * 100) / 100 })),
    streetSide,
    boundary: boundary.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
  };
}

/** Frontage and depth for the chosen street side. */
export function lotDims(lot, streetSide = lot?.streetSide ?? 0) {
  if (!lot?.sides?.length) return null;
  const s = lot.sides[((streetSide % 4) + 4) % 4];
  const other = lot.sides[(((streetSide + 1) % 4) + 4) % 4];
  return { frontageM: s.lengthM, depthM: other.lengthM, streetBearing: s.bearing };
}

/** The three.js Y rotation that turns north-up imagery so the street faces +z. */
export const imageryRotationY = (streetBearing) => (streetBearing - 180) * D2R;

/* ---------- satellite imagery footprint ---------- */

/** Web-Mercator ground metres per 256-px-tile pixel at a zoom. */
export const metresPerPixel = (lat, zoom) => (156543.03392 * Math.cos(lat * D2R)) / 2 ** zoom;

/** How much ground the picture should cover for a lot: room for the neighbours. */
export function imagerySpan(lot) {
  const d = lot?.sides?.length ? Math.hypot(lot.sides[0].lengthM, lot.sides[1].lengthM) : 40;
  return Math.max(60, Math.min(400, Math.round(d * 2.6)));
}

/**
 * What the imagery request will actually return, per provider. Google's
 * Static Maps only zooms in whole steps, so it returns the closest zoom that
 * still covers the span; Esri's export takes the exact box.
 * @returns {{ spanM, zoom?, sizePx }}
 */
export function imageryPlan(provider, lat, spanM) {
  const span = Math.max(30, Math.min(800, +spanM || 80));
  if (provider === "google") {
    let zoom = 21;
    while (zoom > 15 && 640 * metresPerPixel(lat, zoom) < span) zoom--;
    return { zoom, spanM: 640 * metresPerPixel(lat, zoom), sizePx: 1280 };
  }
  return { spanM: span, sizePx: 1280 };
}

/** Esri World Imagery export box (EPSG:3857) for a centre and ground span. */
export function mercatorBox(lat, lng, spanM) {
  const x = R * lng * D2R;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
  const half = spanM / 2 / Math.cos(lat * D2R);   // Mercator stretches by 1/cos(lat)
  return [x - half, y - half, x + half, y + half];
}

/* ---------- slope ---------- */

/** Sample points for the elevation lookup: the lot centre and its rectangle's corners (inset 10%). */
export function slopeSamples(lot) {
  const d = lotDims(lot);
  if (!d) return [];
  const hb = d.streetBearing * D2R;
  const f = [Math.sin(hb), Math.cos(hb)];     // towards the street
  const s = [f[1], -f[0]];                     // across the block
  const hw = d.frontageM * 0.4, hd = d.depthM * 0.4;
  const pts = [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]].map(([a, b]) => [s[0] * a + f[0] * b, s[1] * a + f[1] * b]);
  return pts.map((p) => fromLocal(lot.center, p));
}

/**
 * Elevations at slopeSamples() → fall and a suggested block type. Terrain
 * models are coarse (30–90 m cells for the free one), so this is a hint the
 * owner applies, never a survey.
 */
export function classifySlope(elevs, lot) {
  const e = (elevs || []).filter(Number.isFinite);
  const d = lotDims(lot);
  if (e.length < 3 || !d) return null;
  const fallM = Math.max(...e) - Math.min(...e);
  const runM = Math.hypot(d.frontageM, d.depthM) * 0.8;
  const gradePct = runM > 0 ? (fallM / runM) * 100 : 0;
  const suggest = gradePct < 4 && fallM < 1 ? "flat" : gradePct < 15 ? "sloping" : "difficult";
  // which way it falls: from the centre towards the lowest corner
  const front = (e[1] + e[2]) / 2, rear = (e[3] + e[4]) / 2;
  const toward = Math.abs(front - rear) < 0.3 ? "across the block" : front < rear ? "towards the street" : "away from the street";
  return { fallM: Math.round(fallM * 10) / 10, gradePct: Math.round(gradePct * 10) / 10, suggest, toward };
}

/* ---------- lot → landscape setbacks ---------- */

/**
 * Setbacks that make the landscape model's lot match the real one. The
 * house stays centred across the block; the front setback is kept where it
 * fits and the back yard takes the rest.
 * @param houseW  house width incl. garage, metres
 * @param houseL  house length, metres
 */
export function setbacksForLot({ frontageM, depthM }, houseW, houseL, current = {}) {
  const side = Math.max(0.45, Math.round(((frontageM - houseW) / 2) * 10) / 10);
  const wantFront = Math.max(1.5, current.frontSetbackM ?? 6);
  const front = Math.max(1.5, Math.min(wantFront, depthM - houseL - 1));
  const rear = Math.max(1, Math.round((depthM - houseL - front) * 10) / 10);
  const fits = frontageM >= houseW + 0.9 && depthM >= houseL + 2.5;
  return {
    patch: { sideLeftM: side, sideRightM: side, frontSetbackM: Math.round(front * 10) / 10, rearYardM: rear },
    fits,
    note: fits ? "" : `The house (${houseW.toFixed(1)} × ${houseL.toFixed(1)} m) is bigger than this block allows with minimum setbacks — check the footprint.`,
  };
}

/* ---------- provider responses → one shape ---------- */

const STATES = {
  "new south wales": "NSW", victoria: "VIC", queensland: "QLD", "south australia": "SA", "western australia": "WA",
  tasmania: "TAS", "northern territory": "NT", "australian capital territory": "ACT",
};
export const stateCode = (s) => {
  const t = String(s || "").trim();
  return STATES[t.toLowerCase()] || (t.length <= 3 ? t.toUpperCase() : t);
};

/** Google Geocoding API JSON → [{ label, lat, lng, state, postcode, suburb }]. */
export function parseGoogleGeocode(j) {
  if (!j || (j.status && j.status !== "OK" && j.status !== "ZERO_RESULTS")) {
    throw new Error(j?.error_message || `Address search failed (${j?.status || "no response"}).`);
  }
  return (j.results || []).slice(0, 5).map((r) => {
    const c = (type) => (r.address_components || []).find((a) => (a.types || []).includes(type));
    return {
      label: r.formatted_address,
      lat: r.geometry?.location?.lat, lng: r.geometry?.location?.lng,
      state: c("administrative_area_level_1")?.short_name || "",
      postcode: c("postal_code")?.long_name || "",
      suburb: (c("locality") || c("postal_town"))?.long_name || "",
    };
  }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** OpenStreetMap Nominatim jsonv2 → the same shape. */
export function parseNominatim(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 5).map((r) => ({
    label: r.display_name,
    lat: +r.lat, lng: +r.lon,
    state: stateCode(r.address?.state),
    postcode: r.address?.postcode || "",
    suburb: r.address?.suburb || r.address?.town || r.address?.city || r.address?.village || "",
  })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** An ArcGIS REST query response → the first feature's attributes and outer ring as [lat,lng]. */
export function parseArcgisFeature(j) {
  if (j?.error) throw new Error(j.error.message || "The land register query failed.");
  const f = (j?.features || [])[0];
  if (!f) return null;
  const rings = f.geometry?.rings || [];
  // the outer ring is the biggest one; ArcGIS gives [x=lng, y=lat]
  let ring = null, best = -1;
  for (const r of rings) {
    const a = ringArea(r);
    if (a > best) { best = a; ring = r; }
  }
  return { attributes: f.attributes || {}, ring: ring ? ring.map(([x, y]) => [y, x]) : null };
}

/** NSW cadastre lot attributes → "Lot 12 DP 34567" and the registered area. */
export function nswLotLabel(a = {}) {
  const lot = a.lotnumber ?? a.LotNumber ?? a.lot_number;
  const sec = a.sectionnumber ?? a.SectionNumber;
  const plan = a.planlabel ?? a.PlanLabel;
  const label = a.lotidstring ? a.lotidstring
    : [lot != null && `Lot ${lot}`, sec && `Sec ${sec}`, plan].filter(Boolean).join(" ");
  const area = +(a.planlotarea ?? a.PlanLotArea);
  const unit = String(a.planlotareaunits ?? a.PlanLotAreaUnits ?? "").toLowerCase();
  const registeredM2 = Number.isFinite(area) && area > 0 ? (unit.startsWith("h") ? area * 10000 : area) : null;
  return { label: label || "", registeredM2 };
}

/** NSW Planning Portal land-zoning attributes → { code, name, instrument }. */
export function nswZoning(a = {}) {
  const code = a.SYM_CODE || a.sym_code || a.ZONE || "";
  if (!code) return null;
  return { code, name: a.LAY_CLASS || a.lay_class || "", instrument: a.EPI_NAME || a.epi_name || "" };
}

/** Elevation responses → metres per point. */
export function parseGoogleElevation(j) {
  if (!j || j.status !== "OK") throw new Error(j?.error_message || "Elevation lookup failed.");
  return (j.results || []).map((r) => r.elevation);
}
export function parseOpenMeteo(j) {
  if (!Array.isArray(j?.elevation)) throw new Error(j?.reason || "Elevation lookup failed.");
  return j.elevation;
}

/** Rough NSW bounding box — which cadastre to ask. */
export const inNsw = (lat, lng) => lat >= -37.6 && lat <= -28.1 && lng >= 140.9 && lng <= 153.7;
