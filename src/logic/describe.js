/* =========================================================================
   MODULE: describe.js — "Describe your project" without spending AI credits.

   Plain-English in, structured features out, for each kind of project:
     parseScope(text)      → quote items for WallBuilder presets (walls,
                             decks, fences, slabs, roofs, cabins …)
     parseHouse(text)      → house features (beds, baths, storeys, area,
                             cladding, roof, garage …) + extra scope items
     parseMulti(text)      → house types with counts
     parseDeveloper(text)  → apartment / tower parameters

   This is the free engine: deterministic rules, no network, no model. The
   paid AI path asks the model for the SAME feature shapes (FEATURE_SCHEMAS
   below) and hands them to the same builders, so either way only our own
   engines produce quantities and prices — the parser or the AI just reads
   the description.

   Pure: no React, no three.js. Tests: test/describe.test.mjs.
   ========================================================================= */

const WORD_NUM = { one: 1, a: 1, an: 1, single: 1, two: 2, double: 2, pair: 2, three: 3, triple: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const FT = 0.3048;

/* Lower-case, units normalised: "20 sq m" → "20m2", "4 x 2.4", "1,200" → "1200",
   feet converted to metres, number words to digits. */
export function normalise(text) {
  let s = ` ${String(text || "").toLowerCase()} `
    .replace(/[×*]/g, " x ")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/(\d)\s*(?:m²|m\^2|sq\.?\s*m(?:etres?|eters?)?|square\s*m(?:etres?|eters?)|sqm)/g, "$1m2")
    .replace(/(\d)\s*(?:metres?|meters?|mtrs?|lm|lin(?:ear)?\s*m)\b/g, "$1m")
    .replace(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|square\s*f(?:ee|oo)t)/g, (_, n) => `${(+n * FT * FT).toFixed(1)}m2`)
    .replace(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')/g, (_, n) => `${(+n * FT).toFixed(2)}m`)
    .replace(/(\d+(?:\.\d+)?)\s*squares?\b/g, (_, n) => `${(+n * 9.29).toFixed(0)}m2`) // AU "squares"
    .replace(/[“”"]/g, " ")
    .replace(/\s+/g, " ");
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\b/g, (w) => String(WORD_NUM[w]));
  return s;
}

const num = (re, s) => { const m = s.match(re); return m ? parseFloat(m[1]) : null; };

/* "4m by 2.4m" / "4 x 2.4" / "4x3m" → [a, b] */
function pair(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*m?\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*m?\b(?!2)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}
const area = (s) => num(/(\d+(?:\.\d+)?)\s*m2/, s);
const length = (s) => num(/(\d+(?:\.\d+)?)\s*m\b(?!2)/, s);

/* ---------- scope: quote items ---------- */

const PRESET_RULES = [
  // order matters: most specific first
  ["retaining", /retaining/],
  ["pool", /\bpool\b|plunge/],
  ["fencing", /fenc/],
  ["deck", /\bdeck|pergola|verandah|veranda/],
  ["carport", /carport|\bshed\b/],
  ["roofing", /\broof|re-?roof|gutter/],
  ["concreting", /\bslab\b|driveway|concrete|footpath|\bpath\b/],
  ["kitchen_bench", /kitchen|benchtop|\bbench\b/],
  ["laundry_cabinet", /laundry|vanity/],
  ["tiling", /\btil(e|es|ing)\b/],
  ["flooring", /floor(ing|boards)?\b|carpet|laminate|vinyl plank/],
  ["drywall", /plasterboard|drywall|gyprock|sheeting the walls|line the walls/],
  ["timber_wall", /\bwall|partition|stud/],
  ["painting", /\bpaint/],
];

const VARIANT_RULES = {
  deck: [["deck_merbau", /merbau|hardwood/], ["deck_composite", /composite|trex/], ["deck_treated_pine", /pine|treated/]],
  fencing: [["colorbond", /colorbond|metal|tin|steel/], ["aluminium_slat", /alumin|slat/], ["pool_glass", /glass/], ["chainmesh", /chain/], ["picket", /picket/], ["timber_paling", /paling|timber|wood/]],
  roofing: [["colorbond", /colorbond|tin|metal|steel/], ["zincalume", /zinc/], ["terracotta", /terracotta/], ["concrete_tile", /tile/]],
  concreting: [["polished", /polish/], ["exposed", /exposed|aggregate/], ["coloured", /colou?red/], ["plain", /./]],
  pool: [["plunge", /plunge/], ["fibreglass", /fibreglass|fiberglass/], ["vinyl", /vinyl/], ["concrete", /./]],
  tiling: [["porcelain", /porcelain/], ["stone", /stone|marble|travertine/], ["mosaic", /mosaic/], ["ceramic", /./]],
  flooring: [["floor_tile", /\btile/], ["floor_carpet", /carpet/], ["floor_timber", /./]],
  retaining: [["concrete_sleeper", /concrete sleeper/], ["besser", /besser|block/], ["rock", /rock|boulder|stone/], ["timber_sleeper", /./]],
  carport: [["shed_enclosed", /shed|enclosed/], ["carport_single", /./]],
  kitchen_bench: [["custom_stone", /custom/], ["flatpack_stone", /stone/], ["flatpack_laminate", /./]],
};

const ADDON_RULES = [
  ["wa_power", /(\d+)?\s*(?:power ?points?|gpos?|power outlets?|sockets?)/],
  ["wa_switch", /(\d+)?\s*(?:light )?switch(?:es)?/],
  ["wa_data", /(\d+)?\s*(?:data|tv|ethernet) points?/],
  ["wa_light", /(\d+)?\s*(?:down ?lights?|light fittings?|lights)\b/],
  ["wa_door", /(\d+)?\s*(?:internal )?doors?\b/],
  ["wa_window", /(\d+)?\s*windows?\b/],
  ["wa_skirting", /skirting|cornice/],
  ["wa_waterproof", /waterproof/],
];

const LABOUR = /install|supply and|labou?r|fitted|put in|built for|done for me|by a tradie|trade(s|y)/;
const COMPOSITE = /cabin|granny flat|studio|bungalow|sleep-?out|outbuilding|home office|amenities|toilet block|shower block/;

function splitClauses(s) {
  // keep "with …" attached to its clause; split on commas, "and", "plus", ";"
  return s.split(/;|,|\.\s| plus | and (?:a |an |some )?(?=\d|a |an |new |the |\w+ (?:deck|fence|pool|slab|roof|wall|driveway|path|shed|carport|kitchen|bench))/)
    .map((c) => c.trim()).filter(Boolean);
}

function variantFor(preset, c) {
  for (const [id, re] of VARIANT_RULES[preset] || []) if (re.test(c)) return id;
  return undefined;
}

function scopeItem(preset, c) {
  const labour = LABOUR.test(c);
  const label = c.replace(/^(i want|i need|we want|we need|build|add|a|an|new)\s+/g, "").slice(0, 60);
  if (preset === "timber_wall") {
    const p = pair(c);
    const len = p ? p[0] : (length(c) ?? 3);
    const ht = p ? p[1] : 2.4;
    const addons = [];
    for (const [id, re] of ADDON_RULES) {
      const m = c.match(re);
      if (m) addons.push({ id, qty: m[1] ? +m[1] : 1 });
    }
    return {
      preset, lengthM: len, heightM: ht,
      finish: /render/.test(c) ? "render" : /\btil/.test(c) ? "tile" : /unpainted|no paint|bare/.test(c) ? "none" : "paint",
      sides: /one side|1 side|single side|single-sided/.test(c) ? 1 : 2,
      labour, addons, label,
    };
  }
  const p = pair(c);
  const dimKind = { kitchen_bench: "length", laundry_cabinet: "length", fencing: "length" }[preset] || "area";
  let dim;
  if (dimKind === "length") dim = length(c) ?? (p ? p[0] : null);
  else dim = area(c) ?? (p ? +(p[0] * p[1]).toFixed(2) : null);
  return { preset, dim: dim ?? (dimKind === "length" ? 3 : 10), variant: variantFor(preset, c), labour, label, assumedSize: dim == null };
}

/* A cabin/studio/granny flat → walls + roof + slab, the way a builder would take it off. */
function compositeItems(c) {
  const p = pair(c);
  const a = p ? p[0] : 3, b = p ? p[1] : (p ? p[0] : 3);
  const labour = LABOUR.test(c);
  const what = (c.match(COMPOSITE) || ["structure"])[0];
  return [
    { preset: "concreting", dim: +(a * b).toFixed(2), variant: "plain", labour, label: `${what} slab ${a}×${b} m` },
    { preset: "timber_wall", lengthM: +(2 * (a + b)).toFixed(2), heightM: 2.4, finish: "paint", sides: 2, labour, addons: [], label: `${what} walls (perimeter)` },
    { preset: "roofing", dim: +(a * b * 1.15).toFixed(2), variant: /tile/.test(c) ? "concrete_tile" : "colorbond", labour, label: `${what} roof` },
  ];
}

export function parseScope(text) {
  const s = normalise(text);
  const items = [], unmatched = [];
  for (const c of splitClauses(s)) {
    if (COMPOSITE.test(c)) { items.push(...compositeItems(c)); continue; }
    const hit = PRESET_RULES.find(([, re]) => re.test(c));
    if (hit) items.push(scopeItem(hit[0], c));
    else if (c.length > 2 && !LABOUR.test(c)) unmatched.push(c);
  }
  // "…, installed" / "supply and install everything" covers every item
  if (LABOUR.test(s)) items.forEach((i) => { i.labour = true; });
  const assumed = items.filter((i) => i.assumedSize).map((i) => i.preset.replace("_", " "));
  const notes = [];
  if (assumed.length) notes.push(`No size given for ${assumed.join(", ")} — used a starting size, adjust the line.`);
  if (unmatched.length) notes.push(`Couldn't place: "${unmatched.join('", "')}".`);
  return { items, note: notes.join(" ") };
}

/* ---------- houses ---------- */

const HOUSE_EXTRA_PRESETS = new Set(["deck", "pool", "fencing", "retaining", "carport", "concreting"]);

/** Features a house description can carry — the schema the AI also returns. */
export function parseHouseFeatures(c) {
  const f = {};
  const beds = num(/(\d+)\s*-?\s*(?:bed(?:room)?s?|br)\b/, c); if (beds != null) f.bedrooms = beds;
  const baths = num(/(\d+(?:\.5)?)\s*-?\s*(?:bath(?:room)?s?|ba)\b/, c); if (baths != null) f.bathrooms = Math.ceil(baths);
  if (/double[- ]?stor|two[- ]?stor|2[- ]?stor|2 levels|two levels|townhouse/.test(c)) f.storeys = 2;
  else if (/triple[- ]?stor|3[- ]?stor|three[- ]?stor|3 levels/.test(c)) f.storeys = 3;
  else if (/single[- ]?stor|1[- ]?stor|one[- ]?stor|single level|1 level/.test(c)) f.storeys = 1;
  const a = area(c); if (a != null) f.areaM2 = a;
  const p = pair(c); if (p) { f.widthM = Math.min(p[0], p[1]); f.lengthM = Math.max(p[0], p[1]); }
  if (/brick/.test(c)) f.cladding = "brick";
  else if (/weatherboard|weather board|timber clad|cladding|hebel|fibre cement/.test(c)) f.cladding = "weatherboard";
  else if (/render/.test(c)) f.cladding = "render";
  if (/colorbond|metal roof|tin roof|steel roof/.test(c)) f.roof = "colorbond";
  else if (/tile(d)? roof|roof tiles?|terracotta/.test(c)) f.roof = "tile";
  else if (/shingle/.test(c)) f.roof = "shingle";
  if (/no garage|without (a )?garage/.test(c)) f.garage = false; else if (/garage/.test(c)) f.garage = true;
  if (/solar|pv\b|panels/.test(c)) f.solar = true;
  if (/steep|difficult site|rock|cut and fill/.test(c)) f.site = "difficult";
  else if (/slop|fall|hillside/.test(c)) f.site = "sloping";
  if (/steel fram/.test(c)) f.framing = "steel";
  return f;
}

export function parseHouse(text) {
  const s = normalise(text);
  const features = parseHouseFeatures(s);
  // extra scope (decks, pools, fences …) described alongside the house
  const extras = [];
  for (const c of splitClauses(s)) {
    const hit = PRESET_RULES.find(([, re]) => re.test(c));
    if (hit && HOUSE_EXTRA_PRESETS.has(hit[0]) && !/house|home|bed|stor/.test(c)) extras.push(scopeItem(hit[0], c));
  }
  return { features, extras, found: Object.keys(features).length > 0 || extras.length > 0 };
}

let roomSeq = 0;
const rid = () => `dr_${Date.now().toString(36)}${(roomSeq++).toString(36)}`;

/** Turn house features into a full residential spec on top of `base`. */
export function houseSpecFromFeatures(f, base = {}) {
  const storeys = f.storeys || base.floors || 1;
  const beds = f.bedrooms ?? null;
  const bathCount = f.bathrooms ?? (beds != null ? Math.max(1, Math.round(beds / 2)) : null);
  // floor area: stated, from dimensions, from bedrooms, else keep what's there
  let gfa = f.areaM2 ?? (f.widthM && f.lengthM ? f.widthM * f.lengthM * storeys : null);
  if (gfa == null && beds != null) gfa = 45 + beds * 38 + (storeys > 1 ? 20 : 0);
  const spec = { ...base };
  if (f.widthM && f.lengthM) { spec.widthM = f.widthM; spec.lengthM = f.lengthM; }
  else if (gfa != null) {
    const footprint = gfa / storeys;
    const w = Math.max(6, Math.round(Math.sqrt(footprint / 1.3) * 2) / 2);
    spec.widthM = w;
    spec.lengthM = Math.max(w, Math.round((footprint / w) * 2) / 2);
  }
  spec.floors = storeys;
  if (storeys > 1 && (!spec.staircaseType || spec.staircaseType === "none")) spec.staircaseType = "timber";
  if (storeys === 1) spec.staircaseType = "none";
  if (f.cladding) spec.claddingType = f.cladding;
  if (f.roof) spec.roofType = f.roof;
  if (f.garage != null) spec.hasGarage = f.garage;
  if (f.solar) spec.solar = true;
  if (f.site) spec.siteCondition = f.site;
  if (f.framing) spec.framingType = f.framing;
  const g = (spec.widthM || 10) * (spec.lengthM || 12) * storeys;
  spec.openings = { ...(base.openings || {}), windowsCount: Math.max(4, Math.round(g / 18)), windowsM2: Math.max(5, Math.round(g * 0.078)), doors: (base.openings?.doors) || 2 };
  if (beds != null) {
    spec.rooms = [
      { id: rid(), name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8, floorFinish: "carpet", robe: "walk_in", robeLengthM: 2.4 },
      ...Array.from({ length: Math.max(0, beds - 1) }, (_, i) => ({ id: rid(), name: `Bedroom ${i + 2}`, type: "Bedroom", widthM: 3.4, lengthM: 3.1, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 })),
      { id: rid(), name: "Open living", type: "Living", widthM: Math.max(5, Math.min(8, g / 30)), lengthM: 5.5, floorFinish: "timber", robe: "none", robeLengthM: 0 },
      { id: rid(), name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 },
    ];
  }
  if (bathCount != null) {
    spec.bathrooms = Array.from({ length: bathCount }, (_, i) => ({
      id: rid(), label: i === 0 ? "Main bathroom" : i === 1 ? "Ensuite" : `Bathroom ${i + 1}`,
      widthM: i === 0 ? 3.0 : 2.6, lengthM: i === 0 ? 2.4 : 2.0, hasBath: i === 0, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: i > 0,
    }));
  }
  return spec;
}

/* ---------- multi-dwelling ---------- */

const UNIT_WORD = /(house|home|dwelling|unit|townhouse|villa|duplex|terrace|lot)s?/;

export function parseMulti(text) {
  const s = normalise(text);
  const types = [];
  let shared = {};
  for (const c of s.split(/;|,| and | plus |\.\s/).map((x) => x.trim()).filter(Boolean)) {
    const m = c.match(/^(?:with |of )?(\d+)\s*(?:x\s*)?(.*)$/);
    const f = parseHouseFeatures(c);
    if (m && (UNIT_WORD.test(c) || f.storeys || f.bedrooms)) {
      const count = +m[1];
      const word = (c.match(UNIT_WORD) || [""])[0];
      if (/townhouse|terrace/.test(word) && !f.storeys) f.storeys = 2;
      types.push({ count, features: f, name: c.replace(/^\d+\s*(x\s*)?/, "").slice(0, 40) });
    } else if (/duplex/.test(c) && !types.length) {
      types.push({ count: 2, features: f, name: "Duplex unit" });
    } else {
      shared = { ...shared, ...f };   // "all brick with colorbond roofs"
    }
  }
  for (const t of types) t.features = { ...shared, ...t.features };
  return { types, found: types.length > 0 };
}

/* ---------- developer (apartments / towers) ---------- */

export const DEV_LIMITS = { floors: [2, 120], floorPlateM2: [150, 5000], floorHeightM: [2.9, 6], basementLevels: [0, 8], passengerLifts: [1, 40], goodsLifts: [0, 10] };
const clampTo = (k, v) => Math.max(DEV_LIMITS[k][0], Math.min(DEV_LIMITS[k][1], v));

export function parseDeveloper(text) {
  const s = normalise(text);
  const f = {};
  const base = num(/(\d+)\s*(?:basement|underground|below[- ]ground)/, s) ?? num(/(\d+)\s*levels? of (?:basement|underground|car ?park)/, s);
  if (base != null) f.basementLevels = clampTo("basementLevels", Math.round(base));
  const floors = num(/(\d+)\s*-?\s*(?:stor(?:e)?y|stories|storeys|floors?|levels?)(?! of basement)(?!\s*(?:basement|underground))/, s);
  if (floors != null) f.floors = clampTo("floors", Math.round(floors));
  const plate = num(/(\d+(?:\.\d+)?)\s*m2\s*(?:floor ?plate|plate|per (?:floor|level))/, s) ?? num(/floor ?plate (?:of )?(\d+(?:\.\d+)?)\s*m2/, s);
  const units = num(/(\d+)\s*(?:apartments?|units?|dwellings?|flats?)/, s);
  const gfa = num(/(\d+(?:\.\d+)?)\s*m2\s*(?:gfa|total|in total|overall)?/, s);
  if (/apartment|residential|units?\b|flats?\b|build[- ]to[- ]rent|btr/.test(s)) f.occupancy = "residential";
  if (/office|commercial|workplace/.test(s)) f.occupancy = "office";
  if (/mixed|retail|ground floor (shops|retail)|podium|hotel/.test(s)) f.occupancy = "mixed";
  if (plate != null) f.floorPlateM2 = clampTo("floorPlateM2", plate);
  else if (units != null && (f.floors || floors)) f.floorPlateM2 = clampTo("floorPlateM2", Math.round((units * 85 * 1.25) / (f.floors || floors)));
  else if (gfa != null && f.floors) f.floorPlateM2 = clampTo("floorPlateM2", Math.round(gfa / f.floors));
  if (/steel frame|structural steel/.test(s)) f.structureType = "steel";
  else if (/composite/.test(s)) f.structureType = "composite";
  else if (/concrete|\brc\b|post[- ]?tension|\bpt\b/.test(s)) f.structureType = "rc";
  if (/precast|concrete panels?/.test(s)) f.facadeType = "precast";
  else if (/window[- ]?wall/.test(s)) f.facadeType = "window_wall";
  else if (/curtain|glass|glazed/.test(s)) f.facadeType = "curtain_wall";
  const f2f = num(/(\d(?:\.\d+)?)\s*m\s*(?:floor[- ]to[- ]floor|f2f)/, s); if (f2f != null) f.floorHeightM = clampTo("floorHeightM", f2f);
  else if (f.occupancy === "residential") f.floorHeightM = 3.1;
  const lifts = num(/(\d+)\s*(?:passenger )?lifts?/, s); if (lifts != null) f.passengerLifts = clampTo("passengerLifts", Math.round(lifts));
  if (/escalator/.test(s)) f.hasEscalators = true;
  if (/cbd|inner[- ]city|constrained|tight site|zero lot/.test(s)) f.siteCondition = "sloping";
  if (/difficult|deep (excavation|services)|rock|dewater/.test(s)) f.siteCondition = "difficult";
  return { features: f, found: Object.keys(f).length > 0 };
}

/* Clamp/validate developer fields coming from either the parser or the AI. */
export function cleanDeveloper(f = {}) {
  const out = {};
  for (const k of Object.keys(DEV_LIMITS)) if (f[k] != null && isFinite(+f[k])) out[k] = clampTo(k, k === "floorHeightM" ? +f[k] : Math.round(+f[k]));
  if (["rc", "steel", "composite"].includes(f.structureType)) out.structureType = f.structureType;
  if (["curtain_wall", "window_wall", "precast"].includes(f.facadeType)) out.facadeType = f.facadeType;
  if (["office", "residential", "mixed"].includes(f.occupancy)) out.occupancy = f.occupancy;
  if (typeof f.hasEscalators === "boolean") out.hasEscalators = f.hasEscalators;
  if (["flat", "sloping", "difficult"].includes(f.siteCondition)) out.siteCondition = f.siteCondition;
  return out;
}

/* What the paid AI is asked to return for each mode — the same shapes the
   rules above produce, so one set of builders handles both. */
export const FEATURE_SCHEMAS = {
  house: `{"features":{"bedrooms":int,"bathrooms":int,"storeys":1|2|3,"areaM2":number,"widthM":number,"lengthM":number,"cladding":"brick"|"weatherboard"|"render","roof":"colorbond"|"tile"|"shingle","garage":bool,"solar":bool,"site":"flat"|"sloping"|"difficult","framing":"timber"|"steel"},"extras":[{"preset":"deck"|"pool"|"fencing"|"retaining"|"carport"|"concreting","dim":number,"variant":string,"labour":bool,"label":string}],"note":string}`,
  multi: `{"types":[{"count":int,"name":string,"features":{<same house features as above>}}],"note":string}`,
  developer: `{"features":{"floors":int 2-120,"floorPlateM2":number 150-5000,"floorHeightM":number 2.9-6,"basementLevels":int 0-8,"structureType":"rc"|"steel"|"composite","facadeType":"curtain_wall"|"window_wall"|"precast","occupancy":"office"|"residential"|"mixed","passengerLifts":int,"goodsLifts":int,"hasEscalators":bool,"siteCondition":"flat"|"sloping"|"difficult"},"note":string}`,
};
