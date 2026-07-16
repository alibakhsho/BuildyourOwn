/* =========================================================================
   MODULE: equipment.js
   Plant/equipment hire catalog, same shape as Materials so items are
   user-editable and provider-swappable rather than a fixed formula.
   The first six entries are seeded with the exact values that used to be
   hardcoded inline in Estimator.equipmentCosts, so default totals don't
   shift when the estimator switches to reading from this catalog.
   ========================================================================= */
export const Equipment = {
  catalog: [
    // ---- EARTHWORKS ----
    { id: "excavator_5t", label: "Excavator hire (5t, incl. operator)", unit: "day", category: "earthworks",
      regions: { AU: 380, US: 240, UK: 260 } },

    // ---- ACCESS ----
    { id: "scaffold_perimeter", label: "Scaffolding — perimeter hire", unit: "m²·wk", category: "access",
      regions: { AU: 14, US: 9, UK: 10 } },

    // ---- CONCRETE ----
    { id: "formwork_hire", label: "Formwork hire/labour (slab edge + footings)", unit: "m²", category: "concrete",
      regions: { AU: 38, US: 22, UK: 25 } },

    // ---- LIFTING ----
    { id: "mobile_crane", label: "Mobile crane hire (25t, incl. operator)", unit: "week", category: "lifting",
      regions: { AU: 1800, US: 1100, UK: 1200 } },
    { id: "material_hoist", label: "Material/passenger hoist (low-rise)", unit: "week", category: "lifting",
      regions: { AU: 900, US: 600, UK: 650 }, note: "For 3+ storey residential builds" },
    { id: "tower_crane", label: "Tower crane hire (incl. operator)", unit: "week", category: "lifting",
      regions: { AU: 3200, US: 2000, UK: 2200 }, note: "High-rise structural cycle" },

    // ---- WASTE ----
    { id: "skip_bin_general", label: "Waste skip bin (general, 6m³)", unit: "ea", category: "waste",
      regions: { AU: 480, US: 320, UK: 340 } },

    // ---- SITE ESTABLISHMENT ----
    { id: "site_fencing", label: "Temporary site fencing + signage", unit: "lin.m", category: "site_establishment",
      regions: { AU: 18, US: 11, UK: 12 } },
    { id: "site_shed", label: "Site office / amenities shed hire", unit: "week", category: "site_establishment",
      regions: { AU: 180, US: 120, UK: 130 } },
    { id: "hoarding_perimeter", label: "Perimeter hoarding (high-rise site)", unit: "lin.m", category: "site_establishment",
      regions: { AU: 220, US: 150, UK: 165 }, note: "Installed, one-off for programme duration" },
  ],
  byCategory(cat) { return this.catalog.filter((e) => e.category === cat); },
  get(id) { return this.catalog.find((e) => e.id === id); },
  rate(id, region) { const e = this.get(id); return e ? e.regions[region] ?? 0 : 0; },
  categories() { return [...new Set(this.catalog.map((e) => e.category))]; },
};
