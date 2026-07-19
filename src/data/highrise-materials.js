/* =========================================================================
   MODULE: highrise-materials.js
   A SEPARATE engine for multi-storey / high-rise commercial buildings.
   High-rise estimating is a different discipline from residential: costs are
   driven by the structural core, typical-floor cycle, façade system, vertical
   transport (lifts), and fire/life-safety engineering — not by rooms & finishes.
   Costed per m² of GFA per system, with a per-floor structural cycle.
   These are FEASIBILITY-GRADE parametric rates, not tender figures.
   ========================================================================= */
export const HighRiseMaterials = {
  /* Rates are per m² of Gross Floor Area unless unit says otherwise. */
  systems: [
    // ---- SUBSTRUCTURE ----
    { id: "hr_piling", label: "Piled foundations / raft", unit: "m²site", category: "substructure",
      regions: { AU: 420, US: 280, UK: 310 }, note: "Deep foundations for tower loads" },
    { id: "hr_basement", label: "Basement / podium structure", unit: "m²base", category: "substructure",
      regions: { AU: 2600, US: 1700, UK: 1900 }, note: "Per m² of basement floor" },
    { id: "hr_excavation", label: "Bulk excavation + shoring", unit: "m³", category: "substructure",
      regions: { AU: 95, US: 62, UK: 70 } },
    { id: "hr_shoring", label: "Deep basement shoring (secant/contiguous piling)", unit: "m²base", category: "substructure",
      regions: { AU: 620, US: 410, UK: 460 }, note: "Additional retention system for 2+ level basements" },

    // ---- SUPERSTRUCTURE ----
    { id: "hr_core_rc", label: "RC core (lift/stair shear walls)", unit: "m²gfa", category: "superstructure",
      regions: { AU: 340, US: 220, UK: 250 }, note: "Slip-formed reinforced concrete core" },
    { id: "hr_frame_rc", label: "RC columns + post-tensioned slabs", unit: "m²gfa", category: "superstructure",
      regions: { AU: 520, US: 340, UK: 380 } },
    { id: "hr_frame_steel", label: "Structural steel frame + metal deck", unit: "m²gfa", category: "superstructure",
      regions: { AU: 640, US: 420, UK: 470 } },
    { id: "hr_frame_composite", label: "Composite steel/concrete frame", unit: "m²gfa", category: "superstructure",
      regions: { AU: 580, US: 380, UK: 425 } },

    // ---- FAÇADE ----
    { id: "hr_curtain_wall", label: "Unitised curtain wall (glazed)", unit: "m²fac", category: "facade",
      regions: { AU: 1250, US: 850, UK: 950 }, note: "Per m² of façade area" },
    { id: "hr_precast_facade", label: "Precast concrete panel façade", unit: "m²fac", category: "facade",
      regions: { AU: 780, US: 520, UK: 580 } },
    { id: "hr_window_wall", label: "Window-wall system", unit: "m²fac", category: "facade",
      regions: { AU: 920, US: 620, UK: 690 } },

    // ---- VERTICAL TRANSPORT ----
    { id: "hr_lift_passenger", label: "Passenger lift (per car, full rise)", unit: "ea", category: "transport",
      regions: { AU: 185000, US: 130000, UK: 145000 }, note: "Scales with floors served" },
    { id: "hr_lift_goods", label: "Goods / service lift", unit: "ea", category: "transport",
      regions: { AU: 240000, US: 165000, UK: 185000 } },
    { id: "hr_escalator", label: "Escalator (podium levels)", unit: "ea", category: "transport",
      regions: { AU: 165000, US: 115000, UK: 130000 } },

    // ---- BUILDING SERVICES (MEP) ----
    { id: "hr_hvac_central", label: "Central HVAC (chilled water/VAV)", unit: "m²gfa", category: "services",
      regions: { AU: 420, US: 290, UK: 320 } },
    { id: "hr_electrical_dist", label: "Electrical distribution + standby", unit: "m²gfa", category: "services",
      regions: { AU: 280, US: 190, UK: 210 } },
    { id: "hr_hydraulic", label: "Hydraulics (water/sewer/booster)", unit: "m²gfa", category: "services",
      regions: { AU: 180, US: 120, UK: 135 } },
    { id: "hr_bms", label: "Building management system", unit: "m²gfa", category: "services",
      regions: { AU: 75, US: 50, UK: 56 } },

    // ---- FIRE & LIFE SAFETY ----
    { id: "hr_sprinkler", label: "Sprinkler + fire hydrant system", unit: "m²gfa", category: "fire",
      regions: { AU: 95, US: 62, UK: 70 }, note: "Mandatory all storeys (NCC E1/IBC 903)" },
    { id: "hr_fire_detection", label: "Fire detection + EWIS alarm", unit: "m²gfa", category: "fire",
      regions: { AU: 65, US: 42, UK: 48 } },
    { id: "hr_fire_stairs", label: "Fire-isolated stairs + pressurisation", unit: "ea", category: "fire",
      regions: { AU: 320000, US: 220000, UK: 245000 }, note: "Min 2 egress stairs; scales with rise" },

    // ---- FIT-OUT (base building) ----
    { id: "hr_fitout_core", label: "Core fit-out (lobbies, amenities, WCs)", unit: "m²gfa", category: "fitout",
      regions: { AU: 240, US: 160, UK: 180 } },
    { id: "hr_ceilings_floors", label: "Raised floors + suspended ceilings", unit: "m²gfa", category: "fitout",
      regions: { AU: 185, US: 125, UK: 140 } },
    { id: "hr_carpark", label: "Car park fit-out + ventilation", unit: "m²base", category: "fitout",
      regions: { AU: 320, US: 210, UK: 235 } },
  ],
  get(id) { return this.systems.find((s) => s.id === id); },
  rate(id, region) { const s = this.get(id); return s ? s.regions[region] ?? 0 : 0; },
};
