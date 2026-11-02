/* "Your land" (logic/site.js, api/_lib/site.js) and the plan-photo brief
   (logic/describe.js houseSpecFromPlan). No network: upstream services are
   replaced by a fake fetch that returns their documented response shapes. */
import {
  toLocal, fromLocal, ringArea, minAreaRect, lotFromRing, lotDims, imageryRotationY, metresPerPixel, imageryPlan,
  imagerySpan, mercatorBox, slopeSamples, classifySlope, setbacksForLot, parseGoogleGeocode, parseNominatim,
  parseArcgisFeature, nswLotLabel, nswZoning, parseGoogleElevation, parseOpenMeteo, inNsw, stateCode, bearingOf,
} from "../src/logic/site.js";
import siteHandler, { imageryUrl } from "../api/_lib/site.js";
import { houseSpecFromPlan } from "../src/logic/describe.js";
import { BRIEF_SCHEMA, BRIEF_ROOM_TYPES } from "../api/_lib/plan-reader.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${JSON.stringify(detail)}`}`);
  good ? pass++ : fail++;
};
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

/* ---------- projection & geometry ---------- */
const REF = [-33.815, 151.003];   // Parramatta-ish
{
  const p = [-33.8148, 151.0034];
  const back = fromLocal(REF, toLocal(REF, p));
  ok("projection round-trips to < 1 mm", near(back[0], p[0], 1e-8) && near(back[1], p[1], 1e-8), back);
  const [x, y] = toLocal(REF, [REF[0] + 0.001, REF[1]]);
  ok("0.001° of latitude ≈ 111 m north", near(y, 111.3, 0.5) && near(x, 0, 1e-9), [x, y]);
}
ok("ringArea: 15 × 40 rectangle", near(ringArea([[0, 0], [15, 0], [15, 40], [0, 40]]), 600, 1e-9));
ok("bearingOf: east is 90°, south 180°", near(bearingOf(1, 0), 90) && near(bearingOf(0, -1), 180));

/* a 15 m × 40 m lot turned 30° — as a cadastre would return it */
const rot = (deg, [x, y]) => { const a = (deg * Math.PI) / 180; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; };
const lotLocal = [[-7.5, -20], [7.5, -20], [7.5, 20], [-7.5, 20]].map((p) => rot(30, p));
const lotRing = lotLocal.map((p) => fromLocal(REF, p));
{
  const r = minAreaRect(lotLocal);
  const lens = r.sides.map((s) => s.lengthM).sort((a, b) => a - b);
  ok("minAreaRect finds the turned 15 × 40 box", near(lens[0], 15, 1e-6) && near(lens[2], 40, 1e-6), lens);
}
{
  // the address point sits near the short side towards local "south" (-y before the turn)
  const hint = fromLocal(REF, rot(30, [0, -18]));
  const lot = lotFromRing(lotRing, hint);
  ok("lotFromRing: area from the ring", near(lot.areaM2, 600, 1), lot.areaM2);
  ok("lotFromRing: centre of the block", near(lot.center[0], REF[0], 1e-7) && near(lot.center[1], REF[1], 1e-7), lot.center);
  const d = lotDims(lot);
  ok("street side follows the address point: 15 m frontage, 40 m deep", near(d.frontageM, 15, 0.01) && near(d.depthM, 40, 0.01), d);
  // the -y direction turned 30° anticlockwise (in east/north) points to bearing 180 - 30 = 150°
  ok("street bearing is the outward normal of that side", near(d.streetBearing, 150, 0.2), d.streetBearing);
  const turned = lotDims(lot, lot.streetSide + 1);
  ok("turning the street side swaps frontage and depth", near(turned.frontageM, 40, 0.01) && near(turned.depthM, 15, 0.01), turned);
  ok("boundary is relative to the centre", lot.boundary.length === 4 && near(ringArea(lot.boundary), 600, 1));
  const noHint = lotFromRing(lotRing);
  ok("no address point: street on a short side", near(lotDims(noHint).frontageM, 15, 0.01));
}
ok("lotFromRing: fewer than 3 points is no lot", lotFromRing([[1, 2], [3, 4]]) === null);

/* imagery turn: street to the south needs no turn; to the east, -90° */
ok("imageryRotationY: street south → 0", near(imageryRotationY(180), 0, 1e-12));
{
  // a bearing-b vector (sin b, -cos b) in model x/z, turned by rotation.y = φ, must land on +z
  for (const b of [0, 37, 90, 150, 270]) {
    const phi = imageryRotationY(b), vx = Math.sin((b * Math.PI) / 180), vz = -Math.cos((b * Math.PI) / 180);
    const x2 = vx * Math.cos(phi) + vz * Math.sin(phi), z2 = -vx * Math.sin(phi) + vz * Math.cos(phi);
    ok(`imageryRotationY(${b}°) puts the street at +z`, near(x2, 0, 1e-9) && near(z2, 1, 1e-9), [x2, z2]);
  }
}

/* imagery footprint */
ok("metresPerPixel at the equator, z0 = 156543 m", near(metresPerPixel(0, 0), 156543.03392, 1e-6));
{
  const span = imagerySpan(lotFromRing(lotRing));
  ok("imagerySpan: room for the neighbours (≈ 2.6 × diagonal)", span >= 100 && span <= 120, span);
  const g = imageryPlan("google", REF[0], span);
  ok("google plan: highest zoom that still covers the span", g.spanM >= span && 640 * metresPerPixel(REF[0], g.zoom + 1) < span, g);
  ok("esri plan: the exact span", imageryPlan("esri", REF[0], span).spanM === span);
  const box = mercatorBox(REF[0], REF[1], 100);
  ok("mercator box widened by 1/cos(lat)", near((box[2] - box[0]) * Math.cos((REF[0] * Math.PI) / 180), 100, 1e-6), box);
  const u = imageryUrl(REF[0], REF[1], 100, "");
  ok("no key → Esri export with that box", /World_Imagery\/MapServer\/export/.test(u.url) && /bboxSR=3857/.test(u.url));
  const gu = imageryUrl(REF[0], REF[1], 100, "KEY");
  ok("key → Google Static Maps satellite", /staticmap/.test(gu.url) && /maptype=satellite/.test(gu.url) && /key=KEY/.test(gu.url));
}

/* slope */
{
  const lot = lotFromRing(lotRing, fromLocal(REF, rot(30, [0, -18])));
  const pts = slopeSamples(lot);
  ok("slope samples: centre + 4 corners", pts.length === 5);
  const front = toLocal(lot.center, pts[1]);
  const d = lotDims(lot);
  const along = front[0] * Math.sin((d.streetBearing * Math.PI) / 180) + front[1] * Math.cos((d.streetBearing * Math.PI) / 180);
  ok("samples 1 and 2 are the front corners (towards the street)", near(along, 16, 0.01), along);
  ok("flat block", classifySlope([20, 20.2, 20.1, 20.3, 20.2], lot).suggest === "flat");
  const s = classifySlope([20, 18, 18, 23, 23], lot);
  ok("5 m fall over ~34 m reads as sloping, towards the street", s.suggest === "sloping" && s.toward === "towards the street" && near(s.fallM, 5, 0.01), s);
  ok("steep block", classifySlope([20, 14, 14, 26, 26], lot).suggest === "difficult");
  ok("too few elevations → no call", classifySlope([1, 2], lot) === null);
}

/* lot → landscape setbacks */
{
  const r = setbacksForLot({ frontageM: 15, depthM: 40 }, 12, 15, { frontSetbackM: 6 });
  ok("setbacks: centred across the block", r.patch.sideLeftM === 1.5 && r.patch.sideRightM === 1.5, r);
  ok("setbacks: front kept, back yard gets the rest", r.patch.frontSetbackM === 6 && r.patch.rearYardM === 19 && r.fits, r);
  const tight = setbacksForLot({ frontageM: 10, depthM: 20 }, 12, 15);
  ok("setbacks: a house too big for the block is flagged", !tight.fits && /bigger than this block/.test(tight.note), tight);
}

/* ---------- provider responses ---------- */
{
  const g = parseGoogleGeocode({ status: "OK", results: [{ formatted_address: "12 Smith St, Parramatta NSW 2150, Australia", geometry: { location: { lat: -33.81, lng: 151.0 } },
    address_components: [{ long_name: "New South Wales", short_name: "NSW", types: ["administrative_area_level_1"] }, { long_name: "2150", types: ["postal_code"] }, { long_name: "Parramatta", types: ["locality"] }] }] });
  ok("google geocode → one shape", g[0].state === "NSW" && g[0].postcode === "2150" && g[0].suburb === "Parramatta" && g[0].lat === -33.81, g);
  ok("google ZERO_RESULTS is an empty list", parseGoogleGeocode({ status: "ZERO_RESULTS", results: [] }).length === 0);
  let threw = false; try { parseGoogleGeocode({ status: "REQUEST_DENIED", error_message: "API key invalid" }); } catch (e) { threw = /API key invalid/.test(e.message); }
  ok("google errors surface their message", threw);
  const n = parseNominatim([{ display_name: "12, Smith Street, Parramatta", lat: "-33.81", lon: "151.0", address: { state: "New South Wales", postcode: "2150", suburb: "Parramatta" } }]);
  ok("nominatim → same shape, state abbreviated", n[0].state === "NSW" && n[0].lng === 151 && n[0].suburb === "Parramatta", n);
  ok("stateCode keeps codes", stateCode("vic") === "VIC" && stateCode("Queensland") === "QLD");
}
{
  const f = parseArcgisFeature({ features: [{ attributes: { lotnumber: "12", planlabel: "DP34567", planlotarea: 0.06, planlotareaunits: "ha" },
    geometry: { rings: [[[151, -33], [151.0001, -33], [151.0001, -33.0001], [151, -33]], [[151, -33], [151.001, -33], [151.001, -33.001], [151, -33.001], [151, -33]]] } }] });
  ok("arcgis: the biggest ring is the outer one, flipped to [lat,lng]", f.ring.length === 5 && f.ring[1][0] === -33 && f.ring[1][1] === 151.001, f.ring);
  const l = nswLotLabel(f.attributes);
  ok("NSW lot label and hectares → m²", l.label === "Lot 12 DP34567" && near(l.registeredM2, 600, 1e-6), l);
  ok("lotidstring wins when present", nswLotLabel({ lotidstring: "12//DP34567" }).label === "12//DP34567");
  ok("arcgis: no features is no lot", parseArcgisFeature({ features: [] }) === null);
  let threw = false; try { parseArcgisFeature({ error: { message: "Invalid query" } }); } catch (e) { threw = /Invalid query/.test(e.message); }
  ok("arcgis errors surface", threw);
  const z = nswZoning({ SYM_CODE: "R2", LAY_CLASS: "Low Density Residential", EPI_NAME: "Parramatta LEP 2023" });
  ok("NSW zoning", z.code === "R2" && /Low Density/.test(z.name) && /LEP/.test(z.instrument), z);
  ok("elevation parsers", parseGoogleElevation({ status: "OK", results: [{ elevation: 12.5 }] })[0] === 12.5 && parseOpenMeteo({ elevation: [3, 4] })[1] === 4);
  ok("inNsw: Sydney yes, Melbourne no", inNsw(-33.87, 151.2) && !inNsw(-37.81, 144.96));
}

/* ---------- the route, with a fake upstream ---------- */
const realFetch = globalThis.fetch;
const calls = [];
const fakeRes = () => {
  const r = { code: 0, body: null, headers: {} };
  return Object.assign(r, { status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } });
};
const jsonResp = (j) => ({ ok: true, status: 200, json: async () => j, headers: { get: () => "application/json" } });
const req = (op, query, ip) => ({ method: "GET", query: { site: op, ...query }, headers: { origin: "http://localhost:5173", host: "localhost:5173", "x-forwarded-for": ip || "9.9.9.9" }, socket: {} });

globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (/nominatim/.test(url)) return jsonResp([{ display_name: "12 Smith St", lat: "-33.815", lon: "151.003", address: { state: "New South Wales" } }]);
  if (/NSW_Cadastre/.test(url)) return jsonResp({ features: [{ attributes: { lotnumber: 12, planlabel: "DP34567" }, geometry: { rings: [lotRing.map(([la, ln]) => [ln, la])] } }] });
  if (/EPI_Primary_Planning_Layers/.test(url)) return jsonResp({ features: [{ attributes: { SYM_CODE: "R2", LAY_CLASS: "Low Density Residential" } }] });
  if (/open-meteo/.test(url)) return jsonResp({ elevation: [10, 9, 9, 11, 11] });
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => "" } };
};
try {
  delete process.env.GOOGLE_MAPS_API_KEY;
  let r = fakeRes();
  await siteHandler(req("search", { q: "12 Smith St Parramatta" }), r, "search");
  ok("route search: free provider without a key", r.code === 200 && r.body.provider === "osm" && r.body.results[0].state === "NSW", r.body);
  ok("route search: identifies itself to Nominatim, Australia only", calls.some((u) => /countrycodes=au/.test(u)));

  r = fakeRes();
  await siteHandler(req("lot", { lat: "-33.815", lng: "151.003" }), r, "lot");
  ok("route lot: NSW lot, label and zoning", r.code === 200 && near(r.body.lot.areaM2, 600, 1) && r.body.lot.label === "Lot 12 DP34567" && r.body.zoning.code === "R2", r.body);
  ok("route lot: point query in WGS84", calls.some((u) => /NSW_Cadastre\/MapServer\/9\/query\?geometry=151.003%2C-33.815/.test(u) && /outSR=4326/.test(u)));
  ok("route lot: Esri imagery without a key", r.body.imagery === "esri");

  r = fakeRes();
  await siteHandler(req("lot", { lat: "-37.81", lng: "144.96" }), r, "lot");
  ok("route lot: outside NSW is an honest 'not yet'", r.code === 200 && r.body.lot === null && /NSW/.test(r.body.note), r.body);

  r = fakeRes();
  await siteHandler(req("elevation", { points: "-33.8,151|-33.81,151.01|-33.82,151.02" }), r, "elevation");
  ok("route elevation: Open-Meteo without a key", r.code === 200 && r.body.elevations.length === 5 && /Copernicus/.test(r.body.source), r.body);

  r = fakeRes();
  await siteHandler(req("lot", {}), r, "lot");
  ok("route: lat/lng required", r.code === 400);
  r = fakeRes();
  await siteHandler({ ...req("search", { q: "x" }), headers: { "x-forwarded-for": "1.1.1.1" } }, r, "search");
  ok("route: refuses requests that aren't from the app", r.code === 403);
  r = fakeRes();
  await siteHandler(req("nope", { lat: "1", lng: "1" }), r, "nope");
  ok("route: unknown op is a 404", r.code === 404);

  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  calls.length = 0;
  globalThis.fetch = async (url) => { calls.push(String(url)); return jsonResp({ status: "OK", results: [] }); };
  r = fakeRes();
  await siteHandler(req("search", { q: "12 Smith St Parramatta" }, "8.8.8.8"), r, "search");
  ok("route search: Google when keyed, key stays server-side", r.body.provider === "google" && calls.some((u) => /geocode\/json/.test(u) && /key=test-key/.test(u)) && !JSON.stringify(r.body).includes("test-key"), r.body);
} finally {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_API_KEY;
}

/* ---------- plan photo → the house ---------- */
ok("brief schema: every property required (structured outputs)", BRIEF_SCHEMA.required.length === Object.keys(BRIEF_SCHEMA.properties).length);
ok("brief schema: room types cover the estimate's schedule", ["Bedroom", "Living", "Laundry", "Garage", "Ensuite"].every((t) => BRIEF_ROOM_TYPES.includes(t)));
{
  const brief = {
    storeys: 1, overallWidthM: 18, overallLengthM: 16, totalAreaM2: 0, windows: 14, externalDoors: 3, garageSpaces: 2, roof: "tile", cladding: "brick",
    rooms: [
      { name: "MASTER", type: "Bedroom", widthM: 4.2, lengthM: 3.9, level: 0 },
      { name: "BED 2", type: "Bedroom", widthM: 3.3, lengthM: 3.1, level: 0 },
      { name: "BED 3", type: "Bedroom", widthM: 0, lengthM: 0, level: 0 },
      { name: "ENS", type: "Ensuite", widthM: 2.8, lengthM: 2.0, level: 0 },
      { name: "BATH", type: "Bathroom", widthM: 2.6, lengthM: 2.4, level: 0 },
      { name: "WC", type: "WC", widthM: 0.9, lengthM: 1.6, level: 0 },
      { name: "KITCHEN/MEALS", type: "Kitchen", widthM: 4.5, lengthM: 4.0, level: 0 },
      { name: "FAMILY", type: "Family", widthM: 5.4, lengthM: 4.8, level: 0 },
      { name: "LDRY", type: "Laundry", widthM: 2.2, lengthM: 1.8, level: 0 },
      { name: "GARAGE", type: "Garage", widthM: 6.0, lengthM: 6.0, level: 0 },
      { name: "ALFRESCO", type: "Alfresco", widthM: 4, lengthM: 3, level: 0 },
    ],
  };
  const { spec, summary } = houseSpecFromPlan(brief, { floors: 1, openings: { doors: 2 }, kitchens: [] });
  ok("plan: 3 bed, 3 wet areas, garage", summary.bedrooms === 3 && summary.bathrooms === 3 && spec.hasGarage === true, summary);
  ok("plan: footprint from the overalls, garage taken out (the model adds it)", spec.lengthM === 16 && spec.widthM === 16, [spec.widthM, spec.lengthM]);   // (18×16 − 36 m² garage) ÷ 16 = 15.75 → 16
  ok("plan: rooms keep printed names and sizes", spec.rooms.find((r) => r.name === "MASTER")?.widthM === 4.2 && spec.rooms.find((r) => r.name === "FAMILY")?.type === "Living", spec.rooms);
  ok("plan: master gets the walk-in robe", spec.rooms[0].robe === "walk_in" && spec.rooms[1].robe === "built_in");
  ok("plan: a room with no printed size gets a typical one, and is counted", summary.guessed === 1 && spec.rooms.find((r) => r.name === "BED 3").widthM === 3.4, summary);
  ok("plan: wet areas go to the bathroom schedule; only the main bathroom has a bath", spec.bathrooms.length === 3 && spec.bathrooms.filter((b) => b.hasBath).length === 1 && spec.bathrooms.find((b) => b.label === "WC").hasShower === false, spec.bathrooms);
  ok("plan: garage and alfresco are not rooms in the schedule", !spec.rooms.some((r) => /GARAGE|ALFRESCO/.test(r.name)));
  ok("plan: kitchen bench run from the kitchen's size", spec.kitchens.length === 1 && near(spec.kitchens[0].benchLengthM, 6.4, 0.01), spec.kitchens);
  ok("plan: counted windows and doors used", spec.openings.windowsCount === 14 && spec.openings.doors === 3, spec.openings);
  ok("plan: roof and cladding when printed", spec.roofType === "tile" && spec.claddingType === "brick");
}
{
  // a brochure photo with no overalls: footprint from the rooms themselves
  const { spec } = houseSpecFromPlan({ storeys: 2, rooms: [
    { name: "Living", type: "Living", widthM: 6, lengthM: 5, level: 0 }, { name: "Bed 1", type: "Bedroom", widthM: 4, lengthM: 4, level: 1 },
    { name: "Bed 2", type: "Bedroom", widthM: 3.5, lengthM: 3, level: 1 }, { name: "Bath", type: "Bathroom", widthM: 3, lengthM: 2.5, level: 1 },
  ] }, { floors: 1 });
  ok("plan: two storeys → stairs", spec.floors === 2 && spec.staircaseType !== "none");
  const gfa = spec.widthM * spec.lengthM * 2;
  ok("plan: no overalls → area from rooms + 20% walls/circulation", gfa > 60 && gfa < 110, gfa);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
