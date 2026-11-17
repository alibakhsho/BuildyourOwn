/* =========================================================================
   MODULE: mobile/house.js — the phone app's house controls
   ------------------------------------------------------------------------
   The phone edits a house the way volume-builder configurators do: beds,
   baths, storeys, floor area, and a handful of choices. Each change edits
   only what it names in the same residential spec the full app uses, so a
   house started on the phone opens unchanged on a computer (and the other
   way round). Room-by-room sizes stay a computer job.
   ========================================================================= */
import { RESIDENTIAL_PRESETS } from "../presets/residential-presets.js";
import { nextId } from "../lib/ids.js";

/** A new phone build starts as the standard 3-bed family home. */
export function starterSpec() {
  return RESIDENTIAL_PRESETS.find((p) => p.id === "brick_veneer_3bed").buildSpec();
}

/** Presets that are houses — the shed preset isn't one. */
export const HOME_PRESETS = RESIDENTIAL_PRESETS.filter((p) => p.id !== "small_warehouse_shed");

const gfaOf = (s) => (s.widthM || 0) * (s.lengthM || 0) * (s.floors || 1);
export const bedroomsOf = (s) => (s.rooms || []).filter((r) => r.type === "Bedroom").length;
export const bathroomsOf = (s) => (s.bathrooms || []).length;
export const floorAreaOf = (s) => Math.round(gfaOf(s));

/** The line under a build's name: "3 bed · 2 bath · 180 m²". */
export function houseSummary(s) {
  if (!s) return "";
  const parts = [`${bedroomsOf(s)} bed`, `${bathroomsOf(s)} bath`, `${floorAreaOf(s)} m²`];
  if ((s.floors || 1) > 1) parts.push(`${s.floors} storey`);
  return parts.join(" · ");
}

/* Windows follow the floor area, as houseSpecFromFeatures sets them. */
function withOpenings(s) {
  const g = gfaOf(s) || 1;
  return { ...s, openings: { ...(s.openings || {}), windowsCount: Math.max(4, Math.round(g / 18)), windowsM2: Math.max(5, Math.round(g * 0.078)), doors: s.openings?.doors || 2 } };
}

/** Resize to a floor area, keeping the house's proportions and storeys. */
export function setFloorArea(s, areaM2) {
  const floors = s.floors || 1;
  const ratio = (s.lengthM || 15) / (s.widthM || 12);
  const footprint = Math.max(20, areaM2) / floors;
  const widthM = Math.max(5, Math.round(Math.sqrt(footprint / ratio) * 2) / 2);
  const lengthM = Math.max(widthM, Math.round((footprint / widthM) * 2) / 2);
  return withOpenings({ ...s, widthM, lengthM });
}

/** Change storeys, keeping the floor area: the footprint shrinks or grows. */
export function setStoreys(s, floors) {
  const area = gfaOf(s);
  const next = { ...s, floors, staircaseType: floors > 1 ? (s.staircaseType && s.staircaseType !== "none" ? s.staircaseType : "timber") : "none" };
  return setFloorArea(next, area);
}

/* A bedroom adds about what houseSpecFromFeatures allows per bedroom. */
const M2_PER_BEDROOM = 38;

/** Add or remove bedrooms; the house grows or shrinks to fit them. */
export function setBedrooms(s, n) {
  const rooms = s.rooms || [];
  const beds = rooms.filter((r) => r.type === "Bedroom");
  if (n === beds.length) return s;
  let nextRooms;
  if (n > beds.length) {
    const add = Array.from({ length: n - beds.length }, (_, i) => ({
      id: nextId(), name: `Bedroom ${beds.length + i + 1}`, type: "Bedroom", widthM: 3.4, lengthM: 3.1,
      floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8,
    }));
    // new bedrooms go in after the last bedroom, before living and laundry
    const at = rooms.reduce((last, r, i) => (r.type === "Bedroom" ? i + 1 : last), 0);
    nextRooms = [...rooms.slice(0, at), ...add, ...rooms.slice(at)];
  } else {
    // drop from the end, never the main bedroom
    const drop = new Set(beds.slice(Math.max(1, n)).map((r) => r.id));
    nextRooms = rooms.filter((r) => !drop.has(r.id));
  }
  const grown = setFloorArea({ ...s, rooms: nextRooms }, gfaOf(s) + (n - beds.length) * M2_PER_BEDROOM);
  return grown;
}

/** Add or remove bathrooms (the second is the ensuite). */
export function setBathrooms(s, n) {
  const baths = s.bathrooms || [];
  if (n === baths.length) return s;
  if (n < baths.length) return { ...s, bathrooms: baths.slice(0, Math.max(1, n)) };
  const add = Array.from({ length: n - baths.length }, (_, k) => {
    const i = baths.length + k;
    return {
      id: nextId(), label: i === 0 ? "Main bathroom" : i === 1 ? "Ensuite" : i === 2 ? "Powder room" : `Bathroom ${i + 1}`,
      widthM: i === 0 ? 3.0 : i === 2 ? 1.6 : 2.6, lengthM: i === 0 ? 2.4 : i === 2 ? 1.4 : 2.0,
      hasBath: i === 0, hasShower: i !== 2, vanityCount: 1, toiletCount: 1, wallTileFullHeight: i === 1,
    };
  });
  return { ...s, bathrooms: [...baths, ...add] };
}

/* Kitchen finish levels, in the estimator's own option values. */
export const KITCHEN_LEVELS = [
  { id: "standard", label: "Standard", set: { cabinetry: "flatpack", benchtop: "laminate", appliances: "basic" } },
  { id: "mid", label: "Mid-range", set: { cabinetry: "custom", benchtop: "stone", appliances: "mid" } },
  { id: "premium", label: "Premium", set: { cabinetry: "custom", benchtop: "natural", appliances: "premium" } },
];

export function kitchenLevelOf(s) {
  const k = (s.kitchens || [])[0];
  if (!k) return "mid";
  if (k.appliances === "premium" || k.benchtop === "natural") return "premium";
  if (k.cabinetry === "flatpack" && k.benchtop === "laminate") return "standard";
  return "mid";
}

export function setKitchenLevel(s, id) {
  const level = KITCHEN_LEVELS.find((l) => l.id === id);
  if (!level) return s;
  const kitchens = (s.kitchens && s.kitchens.length ? s.kitchens : [{ id: nextId(), benchLengthM: 5, splashback: "tile", island: false, sinkTap: true }])
    .map((k, i) => (i === 0 ? { ...k, ...level.set, island: id !== "standard" ? (k.island ?? true) : false } : k));
  return { ...s, kitchens };
}

/** Floor finish in the living areas. Bedrooms keep theirs (usually carpet)
 *  and the laundry stays tiled. */
export function setMainFloors(s, finish) {
  return {
    ...s,
    floorFinish: finish,
    rooms: (s.rooms || []).map((r) => (r.type === "Bedroom" || r.type === "Laundry" ? r : { ...r, floorFinish: finish })),
  };
}
