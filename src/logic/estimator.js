/* =========================================================================
   MODULE: estimator.js
   Pure functions. Input: building spec. Output: itemised quantities, costs,
   labour, equipment, timeline. No DOM, no React, no Three.js dependencies.
   ========================================================================= */
import { Materials } from "../data/materials.js";
import { MaterialsOnly } from "./materials-only.js";
import { round } from "../lib/format.js";

function humaniseTradeName(k) {
  return ({
    siteworks: "Siteworks & earthworks",
    concrete: "Concretors",
    frame: "Carpenters / framers",
    roof: "Roofers",
    brick: "Bricklayers / cladders",
    electrical: "Electricians",
    plumbing: "Plumbers & drainers",
    hvac: "HVAC technicians",
    plaster: "Plasterers",
    paint: "Painters",
    tile: "Tilers & floor-layers",
    joinery: "Cabinet-makers & joiners",
    kitchen_bath_fit: "Joinery — kitchen & bath fit",
    finishes: "Finishing carpenters",
  })[k] || k;
}

/* Infer parametric settings + a representative GFA from imported takeoff lines,
   so an import can drive both the estimate and a representative 3D massing. */
export function inferSpecFromImport(lines) {
  const ids = new Set(lines.map((l) => l.materialId).filter(Boolean));
  const qtyOf = (id) => lines.filter((l) => l.materialId === id).reduce((a, l) => a + l.qty, 0);

  // GFA: prefer summed floor finishes, else plasterboard/2.3, else materials/1300
  let gfa = qtyOf("floor_timber") + qtyOf("floor_tile") + qtyOf("floor_carpet") + qtyOf("bath_floor_tile");
  if (gfa < 5) { const pb = qtyOf("plasterboard"); gfa = pb > 0 ? pb / 2.3 : 0; }
  if (gfa < 5) { const tot = lines.reduce((a, l) => a + l.total, 0); gfa = tot > 0 ? tot / 1300 : 150; }
  gfa = Math.max(40, Math.round(gfa));

  const cladding = ids.has("brick_veneer") ? "brick" : ids.has("weatherboard") ? "weatherboard" : ids.has("render") ? "render" : "brick";
  const roof = ids.has("concrete_tile") ? "tile" : ids.has("asphalt_shingle") ? "shingle" : "colorbond";
  const floorFinish = qtyOf("floor_tile") > qtyOf("floor_timber") && qtyOf("floor_tile") > qtyOf("floor_carpet") ? "tile"
                    : qtyOf("floor_carpet") > qtyOf("floor_timber") ? "carpet" : "timber";
  const staircaseType = ids.has("stair_steel_glass") ? "steel_glass" : ids.has("stair_concrete") ? "concrete" : ids.has("stair_timber") ? "timber" : "none";
  const hasGarage = ids.has("garage_door");

  // detected element counts for the summary panel
  const detected = [];
  const addDet = (id, label) => { const q = qtyOf(id); if (q > 0) detected.push({ label, qty: q, unit: Materials.get(id)?.unit }); };
  addDet("window_alum_double", "Windows");
  addDet("door_external", "External doors");
  addDet("door_internal", "Internal doors");
  addDet("bath_vanity", "Vanities");
  addDet("bath_toilet", "Toilets");
  addDet("kit_sink_tap", "Kitchen sinks");

  const side = Math.round(Math.sqrt(gfa) * 10) / 10;
  const counts = {
    windows: Math.round(qtyOf("window_alum_double")),
    doorsExt: Math.round(qtyOf("door_external")),
    doorsInt: Math.round(qtyOf("door_internal")),
    vanities: Math.round(qtyOf("bath_vanity")),
    toilets: Math.round(qtyOf("bath_toilet")),
    kitchenSinks: Math.round(qtyOf("kit_sink_tap")),
  };
  return { gfa, side, cladding, roof, floorFinish, staircaseType, hasGarage, detected, counts };
}

export const Estimator = {
  /* Quantity takeoff from spec */
  takeoff(spec) {
    const { widthM, lengthM, floors, wallHeightM, roofPitch, openings,
            slabThicknessM, roofType, claddingType, framingType, floorFinish, hasGarage, staircaseType } = spec;
    const rooms = spec.rooms || [];
    const kitchens = spec.kitchens || [];
    const bathrooms = spec.bathrooms || [];

    const footprint = widthM * lengthM;
    const perimeter = 2 * (widthM + lengthM);
    const gfa = footprint * floors;
    const wallArea = perimeter * wallHeightM * floors;
    const openingArea = openings.windowsM2 + openings.doors * 2.0;
    const netWallArea = Math.max(0, wallArea - openingArea);
    const pitchRad = (roofPitch * Math.PI) / 180;
    const roofArea = footprint / Math.max(0.5, Math.cos(pitchRad));
    const upperFloorArea = footprint * Math.max(0, floors - 1);
    const slabVol = footprint * slabThicknessM;
    const footingVol = perimeter * 0.4 * 0.3;
    const rebarT = ((slabVol + footingVol) * 80) / 1000;
    const timberLM = framingType === "timber" ? gfa * 3.5 + upperFloorArea * 2.5 : 0;
    const steelT = framingType === "steel" ? gfa * 0.018 : 0;
    const lintelLM = (openings.windowsCount + openings.doors) * 1.5;
    const gutterLM = perimeter;

    /* ---- Room schedule aggregation ---- */
    const roomFloorByFinish = { timber: 0, tile: 0, carpet: 0 };
    let robeBuiltInLM = 0, robeHingedLM = 0, robeWalkInLM = 0;
    let roomInternalWallArea = 0;
    let roomCount = 0;
    for (const r of rooms) {
      const area = (r.widthM || 0) * (r.lengthM || 0);
      if (area <= 0) continue;
      roomCount++;
      const finish = r.floorFinish || "timber";
      roomFloorByFinish[finish] = (roomFloorByFinish[finish] || 0) + area;
      // internal partition: half the room perimeter (shared walls counted once), both faces lined
      const roomPerim = 2 * ((r.widthM || 0) + (r.lengthM || 0));
      roomInternalWallArea += roomPerim * 0.5 * wallHeightM;
      // robes
      if (r.robe === "built_in") robeBuiltInLM += r.robeLengthM || 0;
      else if (r.robe === "hinged") robeHingedLM += r.robeLengthM || 0;
      else if (r.robe === "walk_in") robeWalkInLM += r.robeLengthM || 0;
    }
    const roomScheduleArea = Object.values(roomFloorByFinish).reduce((a, b) => a + b, 0);
    const useRoomSchedule = roomScheduleArea > 0;

    /* Internal walls: from room schedule if present, else heuristic */
    const internalWallArea = useRoomSchedule ? roomInternalWallArea * 2 : gfa * 1.2 * wallHeightM * 2;
    const plasterboardArea = internalWallArea + netWallArea + (gfa * 0.9); // + ceilings
    const corniceLM = gfa * 0.6;
    const internalDoors = useRoomSchedule
      ? Math.max(2, roomCount + bathrooms.length) // a door per room + bathrooms
      : Math.max(2, Math.floor(gfa / 25));

    /* ---- Kitchen quantities ---- */
    const kitchenItems = kitchens.map((k) => {
      const bench = k.benchLengthM || 0;
      // splashback area ≈ bench run × 0.6m height
      const splashbackM2 = bench * 0.6;
      return { ...k, benchLengthM: bench, splashbackM2 };
    });

    /* ---- Bathroom quantities ---- */
    const bathroomItems = bathrooms.map((b) => {
      const area = (b.widthM || 0) * (b.lengthM || 0);
      const perim = 2 * ((b.widthM || 0) + (b.lengthM || 0));
      // wall tile: either full height or splash zones (~1.2m). Full perimeter.
      const tileH = b.wallTileFullHeight ? wallHeightM : 1.2;
      const wallTileM2 = perim * tileH;
      const floorTileM2 = area;
      const waterproofM2 = area + perim * 0.3; // floor + 300mm up walls min
      return { ...b, areaM2: area, wallTileM2, floorTileM2, waterproofM2 };
    });

    /* ---- Staircases ---- */
    const stairFlights = (staircaseType && staircaseType !== "none" && floors > 1) ? (floors - 1) : 0;
    const flightRun = wallHeightM * 1.6;
    const balustradeLM = stairFlights * (flightRun + 1.2);

    return {
      footprintM2: footprint, perimeterM: perimeter, gfaM2: gfa,
      wallAreaM2: wallArea, netWallAreaM2: netWallArea, roofAreaM2: roofArea,
      upperFloorAreaM2: upperFloorArea,
      slabVolM3: slabVol, footingVolM3: footingVol, concreteTotalM3: slabVol + footingVol,
      rebarTonne: rebarT,
      timberFramingLM: timberLM, steelFramingTonne: steelT,
      lintelLM, gutterLM,
      plasterboardM2: plasterboardArea, corniceLM,
      // room/finish data
      useRoomSchedule, roomFloorByFinish, roomScheduleArea, roomCount,
      robeBuiltInLM, robeHingedLM, robeWalkInLM,
      kitchenItems, bathroomItems,
      kitchenCount: kitchens.length, bathroomCount: bathrooms.length,
      stairFlights, balustradeLM, staircaseType,
      windowsM2: openings.windowsM2, windowsCount: openings.windowsCount,
      doorsExternal: openings.doors, doorsInternal: internalDoors,
      hasGarage,
      roofType, claddingType, framingType, floorFinish,
    };
  },

  /* Map takeoff onto material catalog and compute material costs */
  materialCosts(takeoff, spec, region) {
    const lines = [];
    const add = (matId, qty, opts = {}) => {
      const m = Materials.get(matId);
      if (!m || qty <= 0) return;
      const rate = Materials.rate(matId, region) * (opts.multiplier || 1);
      lines.push({
        category: m.category, label: m.label, unit: m.unit,
        qty: round(qty, 2), rate: round(rate, 2), total: round(rate * qty, 2),
        materialId: matId,
      });
    };

    // foundation
    add("concrete_25mpa", takeoff.concreteTotalM3);
    add("rebar_n12", takeoff.rebarTonne);
    if (region === "AU") add("termite_membrane", takeoff.footprintM2);
    add("polythene_dpm", takeoff.footprintM2);

    // frame
    if (takeoff.framingType === "timber") {
      add("timber_mgp10", takeoff.timberFramingLM);
      add("lvl_beam", takeoff.lintelLM * 0.5 + takeoff.upperFloorAreaM2 * 0.3);
    } else {
      add("structural_steel", takeoff.steelFramingTonne);
    }
    add("steel_lintel", takeoff.lintelLM);

    // roof
    const roofMat = takeoff.roofType === "tile" ? "concrete_tile"
                  : takeoff.roofType === "shingle" ? "asphalt_shingle"
                  : "colorbond_sheet";
    add(roofMat, takeoff.roofAreaM2);
    add("roof_insulation", takeoff.roofAreaM2);
    add("guttering", takeoff.gutterLM);

    // cladding
    const cladMat = takeoff.claddingType === "weatherboard" ? "weatherboard"
                  : takeoff.claddingType === "render" ? "render"
                  : "brick_veneer";
    add(cladMat, takeoff.netWallAreaM2);
    add("wall_insulation", takeoff.netWallAreaM2);

    // openings
    add("window_alum_double", takeoff.windowsM2);
    add("door_external", takeoff.doorsExternal);
    add("door_internal", takeoff.doorsInternal);
    if (takeoff.hasGarage) add("garage_door", 1);

    // interior — linings
    add("plasterboard", takeoff.plasterboardM2);
    add("ceiling_cornice", takeoff.corniceLM);
    add("paint", takeoff.plasterboardM2);

    // flooring — from room schedule if present, else blanket GFA split
    if (takeoff.useRoomSchedule) {
      add("floor_timber", takeoff.roomFloorByFinish.timber || 0);
      add("floor_tile", takeoff.roomFloorByFinish.tile || 0);
      add("floor_carpet", takeoff.roomFloorByFinish.carpet || 0);
    } else {
      const floorMat = takeoff.floorFinish === "tile" ? "floor_tile"
                     : takeoff.floorFinish === "carpet" ? "floor_carpet"
                     : "floor_timber";
      add(floorMat, takeoff.gfaM2 * 0.85);
      add("floor_tile", takeoff.gfaM2 * 0.15);
    }

    // joinery — built-in robes & storage
    add("robe_built_in", takeoff.robeBuiltInLM);
    add("robe_hinged", takeoff.robeHingedLM);
    add("robe_walk_in", takeoff.robeWalkInLM);

    // kitchens — itemised per config
    for (const k of takeoff.kitchenItems) {
      const cab = k.cabinetry === "custom" ? "kit_cab_custom" : "kit_cab_flatpack";
      add(cab, k.benchLengthM);
      const bench = k.benchtop === "laminate" ? "kit_bench_laminate"
                  : k.benchtop === "natural" ? "kit_bench_natural"
                  : k.benchtop === "timber" ? "kit_bench_timber"
                  : "kit_bench_stone";
      add(bench, k.benchLengthM);
      const splash = k.splashback === "glass" ? "kit_splashback_glass"
                   : k.splashback === "stone" ? "kit_splashback_stone"
                   : "kit_splashback_tile";
      add(splash, k.splashbackM2);
      if (k.sinkTap) add("kit_sink_tap", 1);
      if (k.island) add("kit_island", 1);
      const appl = k.appliances === "basic" ? "kit_appliances_basic"
                 : k.appliances === "premium" ? "kit_appliances_premium"
                 : "kit_appliances_mid";
      add(appl, 1);
    }

    // bathrooms — itemised per config
    for (const b of takeoff.bathroomItems) {
      add("bath_vanity", b.vanityCount || 1);
      add("bath_toilet", b.toiletCount || 1);
      if (b.hasShower) add("bath_shower_screen", 1);
      if (b.hasBath) add("bath_tub", 1);
      add("bath_tapware", 1);
      add("bath_accessories", 1);
      add("bath_wall_tile", b.wallTileM2);
      add("bath_floor_tile", b.floorTileM2);
      add("bath_waterproofing", b.waterproofM2);
      add("bath_exhaust", 1);
    }

    // stairs
    if (takeoff.stairFlights > 0) {
      const stairMat = takeoff.staircaseType === "steel_glass" ? "stair_steel_glass"
                     : takeoff.staircaseType === "concrete" ? "stair_concrete"
                     : "stair_timber";
      add(stairMat, takeoff.stairFlights);
      add("balustrade", takeoff.balustradeLM);
    }

    // services
    add("electrical_basic", takeoff.gfaM2);
    add("plumbing_basic", takeoff.gfaM2);
    add("hvac_split", Math.max(1, Math.ceil(takeoff.gfaM2 / 80)));
    add("hot_water", 1);
    if (spec.solar) add("solar_pv", 1);

    return lines;
  },

  /* Labour cost — applied as a % of materials by trade, then totalled */
  labourCosts(takeoff, region, complexity = 1.0) {
    /* rough $/m² GFA for labour by trade, by region */
    const rates = {
      AU: { siteworks: 95, concrete: 110, frame: 180, roof: 95, brick: 130, electrical: 120, plumbing: 110, hvac: 45, plaster: 85, paint: 65, tile: 95, joinery: 90, kitchen_bath_fit: 75, finishes: 95 },
      US: { siteworks: 55, concrete: 65, frame: 110, roof: 60, brick: 80, electrical: 75, plumbing: 70, hvac: 28, plaster: 50, paint: 38, tile: 60, joinery: 55, kitchen_bath_fit: 45, finishes: 55 },
      UK: { siteworks: 60, concrete: 70, frame: 115, roof: 65, brick: 85, electrical: 78, plumbing: 72, hvac: 32, plaster: 55, paint: 42, tile: 65, joinery: 60, kitchen_bath_fit: 50, finishes: 60 },
    }[region];

    return Object.entries(rates).map(([trade, rate]) => ({
      trade: humaniseTradeName(trade),
      total: round(rate * takeoff.gfaM2 * complexity, 2),
    }));
  },

  equipmentCosts(takeoff, region, durationWeeks) {
    /* Daily/weekly hire rates × duration weighting */
    const tab = {
      AU: { excavator: 380, scaffold_m2: 14, crane: 1800, skipBin: 480, formwork_m2: 38, fence_lm: 18 },
      US: { excavator: 240, scaffold_m2: 9, crane: 1100, skipBin: 320, formwork_m2: 22, fence_lm: 11 },
      UK: { excavator: 260, scaffold_m2: 10, crane: 1200, skipBin: 340, formwork_m2: 25, fence_lm: 12 },
    }[region];

    const scaffoldM2 = takeoff.perimeterM * takeoff.upperFloorAreaM2 > 0 ? takeoff.perimeterM * 3 * (takeoff.gfaM2 / takeoff.footprintM2) : 0;
    const formworkM2 = takeoff.footprintM2 * 0.6;
    const skipBinsCount = Math.ceil(takeoff.gfaM2 / 50);
    const craneWeeks = takeoff.upperFloorAreaM2 > 0 ? 2 : 0;
    const excavatorDays = Math.max(3, Math.ceil(takeoff.footprintM2 / 30));
    const siteFenceLM = takeoff.perimeterM + 20;

    const items = [
      { name: "Excavator hire", qty: excavatorDays, unit: "days", rate: tab.excavator, total: excavatorDays * tab.excavator },
      { name: "Scaffolding (perimeter × storeys)", qty: round(scaffoldM2, 1), unit: "m²·wk", rate: tab.scaffold_m2, total: round(scaffoldM2 * tab.scaffold_m2, 2) },
      { name: "Formwork (slab edges + footings)", qty: round(formworkM2, 1), unit: "m²", rate: tab.formwork_m2, total: round(formworkM2 * tab.formwork_m2, 2) },
      { name: "Mobile crane", qty: craneWeeks, unit: "weeks", rate: tab.crane, total: craneWeeks * tab.crane },
      { name: "Waste skip bins", qty: skipBinsCount, unit: "ea", rate: tab.skipBin, total: skipBinsCount * tab.skipBin },
      { name: "Site fencing + signage", qty: siteFenceLM, unit: "lin.m", rate: tab.fence_lm, total: siteFenceLM * tab.fence_lm },
    ].filter((i) => i.total > 0);

    return items;
  },

  timeline(takeoff, spec) {
    /* Base duration scales by GFA, floors, and complexity. */
    const baseWeeks = 8 + Math.sqrt(takeoff.gfaM2) * 1.6 + (spec.floors - 1) * 6;
    const siteFactor = { flat: 1.0, sloping: 1.18, difficult: 1.35 }[spec.siteCondition] || 1.0;
    const totalWeeks = Math.round(baseWeeks * siteFactor);

    /* Stage breakdown — % of total */
    const stages = [
      { name: "Site preparation & set-out", pct: 0.06, key: "site" },
      { name: "Foundation & slab", pct: 0.09, key: "foundation" },
      { name: "Frame & structural", pct: 0.16, key: "frame" },
      { name: "Roof structure & cover", pct: 0.10, key: "roof" },
      { name: "External walls & cladding", pct: 0.12, key: "cladding" },
      { name: "Window & door installation", pct: 0.05, key: "openings" },
      { name: "Plumbing, electrical, HVAC rough-in", pct: 0.10, key: "services_rough" },
      { name: "Insulation & plasterboard", pct: 0.08, key: "lining" },
      { name: "Internal fit-out & joinery", pct: 0.10, key: "fitout" },
      { name: "Painting & finishes", pct: 0.07, key: "finishes" },
      { name: "Services fit-off & commissioning", pct: 0.05, key: "commissioning" },
      { name: "Site clean & handover", pct: 0.02, key: "handover" },
    ];
    let week = 0;
    return {
      totalWeeks,
      stages: stages.map((s) => {
        const weeks = Math.max(1, Math.round(s.pct * totalWeeks));
        const startWeek = week + 1;
        const endWeek = week + weeks;
        week += weeks;
        return { ...s, weeks, startWeek, endWeek };
      }),
    };
  },

  buildEstimate(spec, region) {
    const takeoff = this.takeoff(spec);
    const imported = spec.importedLines && spec.importedLines.length > 0;

    /* Fully-cleared building → genuine zero estimate (no residual minimums).
       But still honour any added extras (e.g. just adding a single wall). */
    if (!imported && takeoff.gfaM2 <= 0) {
      const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
      const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
      const extrasEst = (spec.extras && spec.extras.length) ? MaterialsOnly.buildEstimate({ lines: spec.extras }, region) : null;
      const extrasTotal = extrasEst ? extrasEst.total : 0;
      return {
        region, spec, takeoff, imported: false,
        materialLines: [], materialsTotal: 0,
        labourLines: [], labourTotal: 0,
        equipmentLines: [], equipmentTotal: 0,
        subtotal: 0, prelims: 0, margin: 0, contingency: 0,
        buildTotal: 0, extrasLines: extrasEst ? extrasEst.lines : [], extrasTotal, extrasByKind: extrasEst ? extrasEst.byKind : null,
        total: extrasTotal,
        taxRate, taxLabel,
        timeline: { totalWeeks: 0, stages: [] },
      };
    }

    const materialLines = imported
      ? spec.importedLines.map((l) => ({ ...l }))
      : this.materialCosts(takeoff, spec, region);
    const materialsTotal = materialLines.reduce((s, l) => s + l.total, 0);
    const complexity = { flat: 1.0, sloping: 1.12, difficult: 1.25 }[spec.siteCondition] || 1.0;
    const labourLines = this.labourCosts(takeoff, region, complexity);
    const labourTotal = labourLines.reduce((s, l) => s + l.total, 0);
    const timeline = this.timeline(takeoff, spec);
    const equipmentLines = this.equipmentCosts(takeoff, region, timeline.totalWeeks);
    const equipmentTotal = equipmentLines.reduce((s, l) => s + l.total, 0);
    const subtotal = materialsTotal + labourTotal + equipmentTotal;
    /* Preliminaries (site setup, supervision, insurances), margin (builder), contingency */
    const prelims = subtotal * 0.08;
    const margin = subtotal * 0.15;
    const contingency = subtotal * 0.07;
    const buildTotal = subtotal + prelims + margin + contingency;
    /* Additional jobs/scope (the quote-builder extras) — added at entered price,
       no extra markup, shown as a transparent block. */
    const extrasEst = (spec.extras && spec.extras.length)
      ? MaterialsOnly.buildEstimate({ lines: spec.extras }, region)
      : null;
    const extrasTotal = extrasEst ? extrasEst.total : 0;
    const total = buildTotal + extrasTotal;
    /* Tax (GST/VAT) — informational */
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    return {
      region, spec, takeoff, imported,
      materialLines, materialsTotal,
      labourLines, labourTotal,
      equipmentLines, equipmentTotal,
      subtotal, prelims, margin, contingency,
      buildTotal, extrasLines: extrasEst ? extrasEst.lines : [], extrasTotal, extrasByKind: extrasEst ? extrasEst.byKind : null,
      total,
      taxRate, taxLabel,
      timeline,
    };
  },
};
