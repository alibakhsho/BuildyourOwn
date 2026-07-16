/* =========================================================================
   MODULE: pricing-providers.js
   A small runtime layer sitting in front of the static supplier directory
   (data/suppliers.js) and the equipment catalog (data/equipment.js).

   Ships with SAMPLE data only. Everything here is meant to be erased and
   replaced by the user from inside the running app:
     - suppliers:  add your own, hide/remove any sample entry, or reset
                   back to the bundled sample list at any time.
     - equipment:  override any catalogue rate; clear an override (or all
                   of them) to fall back to the bundled default.

   No real supplier/equipment API exists today — most trade suppliers don't
   expose a public pricing API. `registerPricingProvider` is the extension
   point for wiring one in later (per-region async fetchers) without any
   UI code needing to change. It ships with zero providers registered.
   ========================================================================= */
import { SAMPLE_SUPPLIERS } from "./suppliers.js";

const LS_SUPPLIER_OVERRIDES = "byo.pricing.supplierOverrides.v1";   // { [region]: SupplierEntry[] }
const LS_HIDDEN_SAMPLE = "byo.pricing.hiddenSampleSuppliers.v1";    // { [region]: string[] }  (names)
const LS_EQUIPMENT_OVERRIDES = "byo.pricing.equipmentOverrides.v1"; // { [equipmentId]: { [region]: number } }

function readLS(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled/full — overrides just won't persist this session */
  }
}

/* ---- extension point for a future real supplier/equipment API ---- */
const providers = []; // ordered, most-recently-registered wins
export function registerPricingProvider(provider) {
  // provider: { id, label,
  //   getSuppliers?(region): Promise<SupplierEntry[]>,
  //   getEquipmentRates?(region): Promise<Record<string, number>> }
  providers.unshift(provider);
}
export async function refreshSuppliersFromProviders(region) {
  for (const p of providers) {
    if (!p.getSuppliers) continue;
    try {
      const result = await p.getSuppliers(region);
      if (result) return result;
    } catch {
      /* provider failed — fall through to the next one / local data */
    }
  }
  return null;
}

/* ================================ SUPPLIERS ================================ */

export function getSuppliers(region) {
  const sample = SAMPLE_SUPPLIERS[region] || [];
  const hidden = new Set((readLS(LS_HIDDEN_SAMPLE)[region] || []));
  const overrides = readLS(LS_SUPPLIER_OVERRIDES)[region] || [];
  return [...sample.filter((s) => !hidden.has(s.name)), ...overrides];
}

export function addSupplierOverride(region, entry) {
  const all = readLS(LS_SUPPLIER_OVERRIDES);
  const list = all[region] || [];
  all[region] = [...list, { custom: true, ...entry }];
  writeLS(LS_SUPPLIER_OVERRIDES, all);
}

export function removeSupplierOverride(region, name) {
  const all = readLS(LS_SUPPLIER_OVERRIDES);
  all[region] = (all[region] || []).filter((s) => s.name !== name);
  writeLS(LS_SUPPLIER_OVERRIDES, all);
}

export function hideSampleSupplier(region, name) {
  const all = readLS(LS_HIDDEN_SAMPLE);
  const list = new Set(all[region] || []);
  list.add(name);
  all[region] = [...list];
  writeLS(LS_HIDDEN_SAMPLE, all);
}

export function resetSuppliersToSample(region) {
  const overrides = readLS(LS_SUPPLIER_OVERRIDES);
  delete overrides[region];
  writeLS(LS_SUPPLIER_OVERRIDES, overrides);
  const hidden = readLS(LS_HIDDEN_SAMPLE);
  delete hidden[region];
  writeLS(LS_HIDDEN_SAMPLE, hidden);
}

export function eraseAllSupplierCustomisations() {
  writeLS(LS_SUPPLIER_OVERRIDES, {});
  writeLS(LS_HIDDEN_SAMPLE, {});
}

/* ================================ EQUIPMENT ================================ */

export function getEquipmentRateOverride(id, region) {
  const all = readLS(LS_EQUIPMENT_OVERRIDES);
  const forId = all[id];
  return forId && forId[region] != null ? forId[region] : undefined;
}

export function setEquipmentRateOverride(id, region, value) {
  const all = readLS(LS_EQUIPMENT_OVERRIDES);
  all[id] = { ...(all[id] || {}), [region]: value };
  writeLS(LS_EQUIPMENT_OVERRIDES, all);
}

export function clearEquipmentRateOverrides(id) {
  const all = readLS(LS_EQUIPMENT_OVERRIDES);
  if (id) delete all[id];
  writeLS(LS_EQUIPMENT_OVERRIDES, id ? all : {});
}

export function resolveEquipmentRate(Equipment, id, region) {
  const override = getEquipmentRateOverride(id, region);
  return override != null ? override : Equipment.rate(id, region);
}
