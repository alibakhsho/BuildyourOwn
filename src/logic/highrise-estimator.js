/* =========================================================================
   MODULE: highrise-estimator.js
   Pure functions for the high-rise/commercial estimating engine — takeoff,
   system costing, timeline and the final buildEstimate(). Mirrors the
   residential Estimator module but keyed off HighRiseMaterials systems.
   ========================================================================= */
import { HighRiseMaterials } from "../data/highrise-materials.js";
import { Equipment } from "../data/equipment.js";
import { resolveEquipmentRate } from "../data/pricing-providers.js";
import { round } from "../lib/format.js";

export const HighRiseEstimator = {
  /* spec: { floorPlateM2, floors, floorHeightM, basementLevels, structureType,
            facadeType, occupancy, passengerLifts, goodsLifts, hasEscalators,
            siteCondition } */
  takeoff(spec) {
    const { floorPlateM2, floors, floorHeightM, basementLevels, facadeType, structureType } = spec;
    const gfa = floorPlateM2 * floors;
    const basementArea = floorPlateM2 * (basementLevels || 0);
    const totalHeightM = floors * floorHeightM;
    // façade area: assume ~square plate, perimeter × height; +20% for articulation
    const plateSide = Math.sqrt(Math.max(1, floorPlateM2));
    const perimeter = 4 * plateSide;
    const facadeArea = perimeter * totalHeightM * 1.2;
    // excavation for basements: area × depth × levels
    const excavationM3 = basementArea * 3.5;
    // fire stairs: 2 minimum, +1 per ~1500 m² plate over 1000
    const fireStairs = Math.max(2, Math.ceil(floorPlateM2 / 1500) + 1);
    return {
      gfaM2: gfa, floorPlateM2, floors, totalHeightM, basementArea,
      facadeArea, excavationM3, fireStairs,
      siteAreaM2: floorPlateM2 * 1.3, // footprint + setbacks
      facadeType, structureType,
    };
  },

  systemCosts(t, spec, region) {
    const lines = [];
    const add = (id, qty) => {
      const s = HighRiseMaterials.get(id);
      if (!s || qty <= 0) return;
      const rate = HighRiseMaterials.rate(id, region);
      lines.push({ category: s.category, label: s.label, unit: s.unit, qty: round(qty, 1), rate: round(rate, 2), total: round(rate * qty, 2) });
    };

    // substructure
    add("hr_piling", t.siteAreaM2);
    add("hr_excavation", t.excavationM3);
    if (t.basementArea > 0) add("hr_basement", t.basementArea);
    if ((spec.basementLevels || 0) >= 2) add("hr_shoring", t.basementArea);

    // superstructure: core always RC; frame by type
    add("hr_core_rc", t.gfaM2);
    const frame = t.structureType === "steel" ? "hr_frame_steel"
                : t.structureType === "composite" ? "hr_frame_composite"
                : "hr_frame_rc";
    add(frame, t.gfaM2);

    // façade
    const fac = t.facadeType === "precast" ? "hr_precast_facade"
              : t.facadeType === "window_wall" ? "hr_window_wall"
              : "hr_curtain_wall";
    add(fac, t.facadeArea);

    // vertical transport — lift cost scales with rise (floors/10 factor, min 1)
    const riseFactor = Math.max(1, t.floors / 10);
    const pax = spec.passengerLifts || Math.max(1, Math.ceil(t.floors / 8));
    for (let i = 0; i < pax; i++) add("hr_lift_passenger", riseFactor);
    if (spec.goodsLifts) for (let i = 0; i < spec.goodsLifts; i++) add("hr_lift_goods", riseFactor);
    if (spec.hasEscalators) add("hr_escalator", 2);

    // services (MEP)
    add("hr_hvac_central", t.gfaM2);
    add("hr_electrical_dist", t.gfaM2);
    add("hr_hydraulic", t.gfaM2);
    add("hr_bms", t.gfaM2);

    // fire & life safety
    add("hr_sprinkler", t.gfaM2);
    add("hr_fire_detection", t.gfaM2);
    add("hr_fire_stairs", t.fireStairs);

    // fit-out (base building)
    add("hr_fitout_core", t.gfaM2);
    add("hr_ceilings_floors", t.gfaM2);
    if (t.basementArea > 0) add("hr_carpark", t.basementArea);

    return lines;
  },

  /* Site plant/equipment — doesn't exist as a residential-style formula here;
     high-rise builds are structured around the tower crane's floor cycle,
     so equipment costing is duration-driven (structureWeeks) rather than
     quantity-driven off the takeoff like the residential estimator. */
  equipmentCosts(t, spec, region, structureWeeks) {
    const rate = (id) => resolveEquipmentRate(Equipment, id, region);
    const perimeter = 4 * Math.sqrt(Math.max(1, t.floorPlateM2));

    const items = [
      { equipmentId: "tower_crane", name: "Tower crane hire", qty: structureWeeks, unit: "weeks", rate: rate("tower_crane"), total: structureWeeks * rate("tower_crane") },
      { equipmentId: "material_hoist", name: "Material/passenger hoist", qty: structureWeeks, unit: "weeks", rate: rate("material_hoist"), total: structureWeeks * rate("material_hoist") },
      { equipmentId: "site_shed", name: "Site office / amenities shed", qty: structureWeeks, unit: "weeks", rate: rate("site_shed"), total: structureWeeks * rate("site_shed") },
      { equipmentId: "hoarding_perimeter", name: "Perimeter hoarding", qty: round(perimeter, 1), unit: "lin.m", rate: rate("hoarding_perimeter"), total: round(perimeter * rate("hoarding_perimeter"), 2) },
    ];
    return items.filter((i) => i.total > 0);
  },

  timeline(t, spec) {
    // high-rise programme: mobilisation + substructure + (floor cycle × floors) + fit-out + commissioning
    const floorCycleDays = { rc: 7, composite: 6, steel: 5 }[spec.structureType] || 7; // days per typical floor
    const structureWeeks = Math.ceil((t.floors * floorCycleDays) / 5);
    const substructureWeeks = 8 + (spec.basementLevels || 0) * 6;
    const facadeWeeks = Math.ceil(t.floors * 0.6);
    const fitoutWeeks = Math.ceil(t.floors * 0.8);
    const totalWeeks = 12 + substructureWeeks + structureWeeks + Math.round(facadeWeeks * 0.5) + fitoutWeeks + 12;
    const stages = [
      { name: "Mobilisation & site establishment", weeks: 8 },
      { name: "Piling & substructure", weeks: substructureWeeks },
      { name: "Core & superstructure cycle", weeks: structureWeeks },
      { name: "Façade installation (trails structure)", weeks: facadeWeeks },
      { name: "Services rough-in (MEP risers)", weeks: Math.ceil(t.floors * 0.5) },
      { name: "Vertical transport installation", weeks: 10 },
      { name: "Base-building fit-out", weeks: fitoutWeeks },
      { name: "Fire & life-safety commissioning", weeks: 8 },
      { name: "Testing, certification & handover", weeks: 6 },
    ];
    let week = 0;
    return {
      totalWeeks,
      stages: stages.map((s) => { const startWeek = week + 1; week += s.weeks; return { ...s, startWeek, endWeek: week }; }),
    };
  },

  buildEstimate(spec, region) {
    const takeoff = this.takeoff(spec);
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    if (takeoff.gfaM2 <= 0) {
      return { mode: "highrise", region, spec, takeoff, systemLines: [], systemsTotal: 0,
        equipmentLines: [], equipmentTotal: 0,
        prelims: 0, designFees: 0, margin: 0, contingency: 0, total: 0, ratePerM2: 0, taxRate, taxLabel,
        timeline: { totalWeeks: 0, stages: [] } };
    }
    const systemLines = this.systemCosts(takeoff, spec, region);
    const systemsTotal = systemLines.reduce((a, l) => a + l.total, 0);
    const timeline = this.timeline(takeoff, spec);
    const floorCycleDays = { rc: 7, composite: 6, steel: 5 }[spec.structureType] || 7;
    const structureWeeks = Math.ceil((takeoff.floors * floorCycleDays) / 5);
    const equipmentLines = this.equipmentCosts(takeoff, spec, region, structureWeeks);
    const equipmentTotal = equipmentLines.reduce((a, l) => a + l.total, 0);
    // commercial loadings differ from residential
    const complexity = { flat: 1.0, sloping: 1.08, difficult: 1.18 }[spec.siteCondition] || 1.0;
    const adjSystems = systemsTotal * complexity;
    const prelims = adjSystems * 0.12;     // site, cranes, hoists, supervision (higher for towers)
    const designFees = adjSystems * 0.10;  // engineering, fire, façade consultants
    const margin = adjSystems * 0.10;      // builder margin (thinner % on large jobs)
    const contingency = adjSystems * 0.08;
    const total = adjSystems + equipmentTotal + prelims + designFees + margin + contingency;
    return {
      mode: "highrise", region, spec, takeoff,
      systemLines, systemsTotal: adjSystems,
      equipmentLines, equipmentTotal,
      prelims, designFees, margin, contingency, total,
      ratePerM2: takeoff.gfaM2 > 0 ? round(total / takeoff.gfaM2, 0) : 0,
      taxRate, taxLabel, timeline,
    };
  },
};
