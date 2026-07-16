/* =========================================================================
   MODULE: materials.js
   Region-specific catalog of construction materials with indicative rates.
   Rates are AUD/USD/GBP per unit, in local market 2025.
   These are guides — not quotes. Real prices vary by supplier and date.
   ========================================================================= */
import { Validate } from "../logic/validate.js";

export const Materials = {
  /* Each material: id, label, unit, category, regions: { AU: { rate, supplier, sku? } } */
  catalog: [
    // ---- FOUNDATION ----
    { id: "concrete_25mpa", label: "Ready-mix concrete (25 MPa)", unit: "m³", category: "foundation",
      regions: { AU: 320, US: 220, UK: 175 }, note: "Slab and footing concrete" },
    { id: "rebar_n12", label: "Reinforcement bar (N12)", unit: "tonne", category: "foundation",
      regions: { AU: 1850, US: 1100, UK: 1050 } },
    { id: "termite_membrane", label: "Termite barrier membrane", unit: "m²", category: "foundation",
      regions: { AU: 28, US: 14, UK: 0 }, note: "Required AS 3660.1 in termite-prone zones" },
    { id: "polythene_dpm", label: "Polythene damp-proof membrane", unit: "m²", category: "foundation",
      regions: { AU: 4, US: 2.5, UK: 3 } },

    // ---- FRAME ----
    { id: "timber_mgp10", label: "Pine framing (MGP10 90×35)", unit: "lin.m", category: "frame",
      regions: { AU: 5.20, US: 2.80, UK: 3.10 }, note: "Standard wall stud / plate" },
    { id: "lvl_beam", label: "LVL structural beam (240×45)", unit: "lin.m", category: "frame",
      regions: { AU: 38, US: 22, UK: 28 } },
    { id: "steel_lintel", label: "Galvanised steel lintel", unit: "lin.m", category: "frame",
      regions: { AU: 65, US: 38, UK: 42 } },
    { id: "structural_steel", label: "Structural steel UB/UC", unit: "tonne", category: "frame",
      regions: { AU: 4200, US: 2800, UK: 2900 } },

    // ---- ROOF ----
    { id: "colorbond_sheet", label: "Colorbond steel sheet roofing", unit: "m²", category: "roof",
      regions: { AU: 42, US: 32, UK: 36 }, note: "Cyclone-rated profiles available" },
    { id: "concrete_tile", label: "Concrete roof tiles", unit: "m²", category: "roof",
      regions: { AU: 38, US: 24, UK: 28 } },
    { id: "asphalt_shingle", label: "Asphalt shingles", unit: "m²", category: "roof",
      regions: { AU: 35, US: 18, UK: 22 } },
    { id: "roof_insulation", label: "Anticon roof blanket R3.0", unit: "m²", category: "roof",
      regions: { AU: 12, US: 8, UK: 10 } },
    { id: "guttering", label: "Quad gutter + downpipes", unit: "lin.m", category: "roof",
      regions: { AU: 28, US: 16, UK: 18 } },

    // ---- CLADDING / EXTERIOR ----
    { id: "brick_veneer", label: "Clay brick veneer (incl. mortar)", unit: "m²", category: "cladding",
      regions: { AU: 95, US: 70, UK: 65 } },
    { id: "weatherboard", label: "Weatherboard (fibre cement)", unit: "m²", category: "cladding",
      regions: { AU: 78, US: 48, UK: 55 } },
    { id: "render", label: "Acrylic render on blockwork", unit: "m²", category: "cladding",
      regions: { AU: 65, US: 38, UK: 45 } },
    { id: "wall_insulation", label: "Wall batt insulation R2.5", unit: "m²", category: "cladding",
      regions: { AU: 14, US: 9, UK: 11 } },

    // ---- OPENINGS ----
    { id: "window_alum_double", label: "Aluminium window, double-glazed", unit: "m²", category: "openings",
      regions: { AU: 720, US: 440, UK: 480 } },
    { id: "door_external", label: "External entry door (solid + frame)", unit: "ea", category: "openings",
      regions: { AU: 1850, US: 950, UK: 1100 } },
    { id: "door_internal", label: "Internal hollow-core door + frame", unit: "ea", category: "openings",
      regions: { AU: 380, US: 180, UK: 220 } },
    { id: "garage_door", label: "Sectional garage door, motorised", unit: "ea", category: "openings",
      regions: { AU: 2400, US: 1400, UK: 1600 } },

    // ---- INTERIOR ----
    { id: "plasterboard", label: "Plasterboard 10mm + set joints", unit: "m²", category: "interior",
      regions: { AU: 38, US: 22, UK: 26 } },
    { id: "ceiling_cornice", label: "Cornice 75mm + install", unit: "lin.m", category: "interior",
      regions: { AU: 18, US: 9, UK: 12 } },
    { id: "floor_tile", label: "Floor tile 600×600 + adhesive + lay", unit: "m²", category: "interior",
      regions: { AU: 145, US: 85, UK: 95 } },
    { id: "floor_timber", label: "Engineered timber floor + lay", unit: "m²", category: "interior",
      regions: { AU: 165, US: 95, UK: 110 } },
    { id: "floor_carpet", label: "Carpet + underlay + lay", unit: "m²", category: "interior",
      regions: { AU: 75, US: 42, UK: 48 } },
    { id: "paint", label: "Paint, 2 coats + primer", unit: "m²", category: "interior",
      regions: { AU: 24, US: 14, UK: 16 } },

    // ---- JOINERY: ROBES & STORAGE ----
    { id: "robe_built_in", label: "Built-in robe — shelf, rail, sliding doors", unit: "lin.m", category: "joinery",
      regions: { AU: 520, US: 300, UK: 340 }, note: "Sliding/mirrored door BIR" },
    { id: "robe_walk_in", label: "Walk-in robe fit-out — shelving & hanging", unit: "lin.m", category: "joinery",
      regions: { AU: 420, US: 240, UK: 270 } },
    { id: "robe_hinged", label: "Built-in robe — hinged doors", unit: "lin.m", category: "joinery",
      regions: { AU: 580, US: 340, UK: 380 } },
    { id: "linen_cupboard", label: "Linen / storage cupboard", unit: "ea", category: "joinery",
      regions: { AU: 950, US: 560, UK: 620 } },

    // ---- KITCHEN: COMPONENTS ----
    { id: "kit_cab_flatpack", label: "Kitchen cabinetry — flat-pack + install", unit: "lin.m", category: "kitchen",
      regions: { AU: 680, US: 400, UK: 440 } },
    { id: "kit_cab_custom", label: "Kitchen cabinetry — custom joinery", unit: "lin.m", category: "kitchen",
      regions: { AU: 1450, US: 870, UK: 960 } },
    { id: "kit_bench_laminate", label: "Benchtop — laminate", unit: "lin.m", category: "kitchen",
      regions: { AU: 190, US: 115, UK: 130 } },
    { id: "kit_bench_stone", label: "Benchtop — engineered stone", unit: "lin.m", category: "kitchen",
      regions: { AU: 680, US: 410, UK: 460 } },
    { id: "kit_bench_natural", label: "Benchtop — natural stone (granite/marble)", unit: "lin.m", category: "kitchen",
      regions: { AU: 980, US: 600, UK: 670 } },
    { id: "kit_bench_timber", label: "Benchtop — solid timber", unit: "lin.m", category: "kitchen",
      regions: { AU: 440, US: 270, UK: 300 } },
    { id: "kit_splashback_tile", label: "Splashback — tiled", unit: "m²", category: "kitchen",
      regions: { AU: 190, US: 115, UK: 130 } },
    { id: "kit_splashback_glass", label: "Splashback — glass", unit: "m²", category: "kitchen",
      regions: { AU: 440, US: 270, UK: 300 } },
    { id: "kit_splashback_stone", label: "Splashback — stone slab", unit: "m²", category: "kitchen",
      regions: { AU: 620, US: 380, UK: 420 } },
    { id: "kit_sink_tap", label: "Sink + mixer tapware", unit: "ea", category: "kitchen",
      regions: { AU: 880, US: 540, UK: 600 } },
    { id: "kit_island", label: "Island bench module", unit: "ea", category: "kitchen",
      regions: { AU: 3200, US: 1900, UK: 2100 } },
    { id: "kit_appliances_basic", label: "Appliance package — basic", unit: "ea", category: "kitchen",
      regions: { AU: 4500, US: 2800, UK: 3100 } },
    { id: "kit_appliances_mid", label: "Appliance package — mid-range", unit: "ea", category: "kitchen",
      regions: { AU: 9500, US: 6000, UK: 6600 } },
    { id: "kit_appliances_premium", label: "Appliance package — premium", unit: "ea", category: "kitchen",
      regions: { AU: 22000, US: 14000, UK: 15500 } },

    // ---- BATHROOM: COMPONENTS ----
    { id: "bath_vanity", label: "Vanity unit + basin", unit: "ea", category: "bathroom",
      regions: { AU: 1250, US: 750, UK: 830 } },
    { id: "bath_toilet", label: "Toilet suite", unit: "ea", category: "bathroom",
      regions: { AU: 650, US: 400, UK: 440 } },
    { id: "bath_shower_screen", label: "Shower screen + base", unit: "ea", category: "bathroom",
      regions: { AU: 980, US: 600, UK: 660 } },
    { id: "bath_tub", label: "Bathtub — freestanding/insert", unit: "ea", category: "bathroom",
      regions: { AU: 1450, US: 880, UK: 970 } },
    { id: "bath_tapware", label: "Tapware & mixer set", unit: "ea", category: "bathroom",
      regions: { AU: 880, US: 540, UK: 600 } },
    { id: "bath_accessories", label: "Towel rails, mirror, accessories", unit: "ea", category: "bathroom",
      regions: { AU: 480, US: 290, UK: 320 } },
    { id: "bath_wall_tile", label: "Wall tiling + adhesive + lay", unit: "m²", category: "bathroom",
      regions: { AU: 135, US: 82, UK: 92 } },
    { id: "bath_floor_tile", label: "Floor tiling — wet area", unit: "m²", category: "bathroom",
      regions: { AU: 155, US: 92, UK: 102 } },
    { id: "bath_waterproofing", label: "Waterproofing (AS 3740)", unit: "m²", category: "bathroom",
      regions: { AU: 78, US: 46, UK: 52 }, note: "Mandatory wet-area membrane" },
    { id: "bath_exhaust", label: "Exhaust fan + ventilation", unit: "ea", category: "bathroom",
      regions: { AU: 320, US: 190, UK: 210 } },

    // ---- STAIRS ----
    { id: "stair_timber", label: "Staircase — timber flight + stringers", unit: "flight", category: "stairs",
      regions: { AU: 4800, US: 3000, UK: 3300 } },
    { id: "stair_steel_glass", label: "Staircase — steel + glass balustrade", unit: "flight", category: "stairs",
      regions: { AU: 13000, US: 8000, UK: 8900 } },
    { id: "stair_concrete", label: "Staircase — precast concrete flight", unit: "flight", category: "stairs",
      regions: { AU: 6500, US: 4000, UK: 4500 } },
    { id: "balustrade", label: "Balustrade / handrail", unit: "lin.m", category: "stairs",
      regions: { AU: 380, US: 230, UK: 260 }, note: "NCC: max 125mm gaps, min 865mm height" },

    // ---- SERVICES ----
    { id: "electrical_basic", label: "Electrical rough-in + fit-off", unit: "m²gfa", category: "services",
      regions: { AU: 165, US: 95, UK: 105 } },
    { id: "plumbing_basic", label: "Plumbing rough-in + fit-off", unit: "m²gfa", category: "services",
      regions: { AU: 140, US: 85, UK: 95 } },
    { id: "hvac_split", label: "Split-system A/C (per zone)", unit: "ea", category: "services",
      regions: { AU: 2800, US: 2200, UK: 2400 } },
    { id: "hot_water", label: "Hot water system (heat-pump)", unit: "ea", category: "services",
      regions: { AU: 3800, US: 2400, UK: 2600 } },
    { id: "solar_pv", label: "Solar PV 6.6kW + inverter", unit: "ea", category: "services",
      regions: { AU: 7500, US: 12000, UK: 8500 } },

    // ---- TIMBER (structural & sizes) ----
    { id: "timber_90x45", label: "Pine MGP10 90×45", unit: "lin.m", category: "frame",
      regions: { AU: 6.40, US: 3.40, UK: 3.80 } },
    { id: "timber_140x45", label: "Pine MGP10 140×45", unit: "lin.m", category: "frame",
      regions: { AU: 9.80, US: 5.40, UK: 6.00 } },
    { id: "timber_190x45", label: "Pine MGP10 190×45", unit: "lin.m", category: "frame",
      regions: { AU: 13.50, US: 7.40, UK: 8.20 } },
    { id: "timber_treated_post", label: "Treated pine post 90×90 (H4)", unit: "lin.m", category: "frame",
      regions: { AU: 16, US: 9, UK: 10 }, note: "In-ground rated" },
    { id: "hardwood_post", label: "Hardwood post 100×100", unit: "lin.m", category: "frame",
      regions: { AU: 38, US: 22, UK: 25 } },
    { id: "lvl_15", label: "LVL beam 150×45", unit: "lin.m", category: "frame",
      regions: { AU: 26, US: 15, UK: 18 } },
    { id: "lvl_30", label: "LVL beam 300×63", unit: "lin.m", category: "frame",
      regions: { AU: 58, US: 34, UK: 40 } },

    // ---- DECKING ----
    { id: "deck_merbau", label: "Merbau decking board 90×19", unit: "m²", category: "decking",
      regions: { AU: 145, US: 95, UK: 105 }, note: "Hardwood, premium" },
    { id: "deck_treated_pine", label: "Treated pine decking 90×22", unit: "m²", category: "decking",
      regions: { AU: 75, US: 48, UK: 54 } },
    { id: "deck_composite", label: "Composite decking (e.g. Trex/Modwood)", unit: "m²", category: "decking",
      regions: { AU: 165, US: 105, UK: 120 }, note: "Low-maintenance" },
    { id: "deck_substructure", label: "Bearers, joists & framing (deck)", unit: "m²", category: "decking",
      regions: { AU: 85, US: 55, UK: 60 } },
    { id: "deck_joist_hangers", label: "Joist hangers & framing brackets", unit: "ea", category: "decking",
      regions: { AU: 6.50, US: 3.50, UK: 4.00 } },

    // ---- STRUCTURAL FIXINGS / GROUND ----
    { id: "post_stirrup", label: "Galvanised post stirrup / bracket", unit: "ea", category: "fixings",
      regions: { AU: 28, US: 16, UK: 18 }, note: "Bolt-down or in-ground post base" },
    { id: "post_anchor_bolt", label: "Chemical / through bolts (set)", unit: "ea", category: "fixings",
      regions: { AU: 12, US: 7, UK: 8 } },
    { id: "footing_concrete", label: "Footing concrete (post holes)", unit: "m³", category: "fixings",
      regions: { AU: 340, US: 220, UK: 240 } },
    { id: "bracket_framing", label: "Framing anchors / tie-down brackets", unit: "ea", category: "fixings",
      regions: { AU: 4.50, US: 2.50, UK: 3.00 }, note: "Cyclone tie-down" },

    // ---- ROOF (expanded) ----
    { id: "metal_roof_sheet", label: "Metal roof sheet (Trimdek/corrugated)", unit: "m²", category: "roof",
      regions: { AU: 36, US: 26, UK: 30 } },
    { id: "metal_roof_insulated", label: "Insulated roof panel (sandwich)", unit: "m²", category: "roof",
      regions: { AU: 88, US: 58, UK: 65 } },
    { id: "roof_flashing", label: "Ridge capping & flashings", unit: "lin.m", category: "roof",
      regions: { AU: 32, US: 19, UK: 22 } },
    { id: "polycarb_roof", label: "Polycarbonate roofing (patio)", unit: "m²", category: "roof",
      regions: { AU: 55, US: 34, UK: 38 } },

    // ---- OPENINGS (expanded) ----
    { id: "window_alum_single", label: "Aluminium window, single-glazed", unit: "m²", category: "openings",
      regions: { AU: 480, US: 300, UK: 330 } },
    { id: "window_timber", label: "Timber window, double-glazed", unit: "m²", category: "openings",
      regions: { AU: 950, US: 580, UK: 640 } },
    { id: "window_sliding_door", label: "Aluminium sliding door (glass)", unit: "m²", category: "openings",
      regions: { AU: 780, US: 480, UK: 530 } },
    { id: "door_prehung", label: "Pre-hung internal door (factory)", unit: "ea", category: "openings",
      regions: { AU: 320, US: 160, UK: 190 } },
    { id: "door_bifold_glass", label: "Bi-fold glass door (per panel)", unit: "ea", category: "openings",
      regions: { AU: 1100, US: 680, UK: 760 } },

    // ---- STAIRS (expanded) ----
    { id: "stair_steel_prefab", label: "Staircase — prefab metal flight", unit: "flight", category: "stairs",
      regions: { AU: 5200, US: 3200, UK: 3600 }, note: "Factory-made, craned in" },

    // ---- CONCRETE / SLAB FINISHES ----
    { id: "concrete_plain", label: "Concrete — plain / broom finish", unit: "m²", category: "concrete",
      regions: { AU: 85, US: 55, UK: 60 } },
    { id: "concrete_exposed", label: "Concrete — exposed aggregate", unit: "m²", category: "concrete",
      regions: { AU: 130, US: 85, UK: 95 } },
    { id: "concrete_polished", label: "Concrete — polished finish", unit: "m²", category: "concrete",
      regions: { AU: 150, US: 95, UK: 105 } },
    { id: "concrete_stencil", label: "Concrete — stencil / coloured", unit: "m²", category: "concrete",
      regions: { AU: 110, US: 70, UK: 78 } },

    // ---- EARTHWORKS / GROUND ----
    { id: "fill_road_base", label: "Road base / crusher dust", unit: "m³", category: "earthworks",
      regions: { AU: 65, US: 42, UK: 46 } },
    { id: "fill_sand", label: "Fill sand", unit: "m³", category: "earthworks",
      regions: { AU: 55, US: 35, UK: 40 } },
    { id: "fill_topsoil", label: "Garden topsoil", unit: "m³", category: "earthworks",
      regions: { AU: 70, US: 45, UK: 50 } },
    { id: "fill_gravel", label: "Drainage gravel / blue metal", unit: "m³", category: "earthworks",
      regions: { AU: 80, US: 52, UK: 58 } },
    { id: "fill_fcr", label: "Fine crushed rock (compactable)", unit: "m³", category: "earthworks",
      regions: { AU: 68, US: 44, UK: 48 } },

    // ---- WET AREAS ----
    { id: "waterproofing", label: "Wet-area waterproofing membrane", unit: "m²", category: "wet area",
      regions: { AU: 75, US: 48, UK: 54 }, note: "AS 3740 compliant" },
    { id: "shower_screen_glass", label: "Frameless glass shower screen", unit: "ea", category: "wet area",
      regions: { AU: 950, US: 600, UK: 680 } },
    { id: "shower_screen_semi", label: "Semi-frameless shower screen", unit: "ea", category: "wet area",
      regions: { AU: 620, US: 390, UK: 440 } },
    { id: "bath_glass_panel", label: "Glass bath / splash panel", unit: "ea", category: "wet area",
      regions: { AU: 420, US: 270, UK: 300 } },
    { id: "floor_waste", label: "Floor waste / drain (tiled)", unit: "ea", category: "wet area",
      regions: { AU: 180, US: 110, UK: 125 } },

    // ---- FOUNDATION / SLAB ----
    { id: "slab_mesh", label: "Reinforcing mesh (SL82)", unit: "m²", category: "foundation",
      regions: { AU: 9.50, US: 6, UK: 7 } },
    { id: "rebar", label: "Reinforcing bar (N12)", unit: "lin.m", category: "foundation",
      regions: { AU: 4.20, US: 2.60, UK: 3 } },
    { id: "vapour_barrier", label: "Vapour barrier / damp-proof membrane", unit: "m²", category: "foundation",
      regions: { AU: 4.50, US: 2.80, UK: 3.20 } },
    { id: "pier_screw", label: "Screw pier / pile", unit: "ea", category: "foundation",
      regions: { AU: 280, US: 180, UK: 200 } },
    { id: "termite_barrier", label: "Termite barrier (physical/chemical)", unit: "m²", category: "foundation",
      regions: { AU: 18, US: 11, UK: 0 }, note: "AS 3660" },
    { id: "stumps_steel", label: "Adjustable steel stumps", unit: "ea", category: "foundation",
      regions: { AU: 65, US: 42, UK: 46 } },

    // ---- FRAME (more) ----
    { id: "steel_stud", label: "Steel wall stud / track (light gauge)", unit: "lin.m", category: "frame",
      regions: { AU: 7.80, US: 4.50, UK: 5 } },
    { id: "ply_bracing", label: "Structural ply bracing 12mm", unit: "m²", category: "frame",
      regions: { AU: 42, US: 26, UK: 30 } },
    { id: "roof_truss", label: "Prefab roof truss (per truss)", unit: "ea", category: "frame",
      regions: { AU: 165, US: 100, UK: 115 } },
    { id: "wall_frame_prefab", label: "Prefab wall frame (per lin.m)", unit: "lin.m", category: "frame",
      regions: { AU: 95, US: 58, UK: 65 } },
    { id: "particleboard_floor", label: "Structural flooring (yellowtongue 19mm)", unit: "m²", category: "frame",
      regions: { AU: 32, US: 19, UK: 22 } },

    // ---- ROOF (more) ----
    { id: "zincalume_sheet", label: "Zincalume roof sheet", unit: "m²", category: "roof",
      regions: { AU: 32, US: 23, UK: 26 } },
    { id: "terracotta_tile", label: "Terracotta roof tiles", unit: "m²", category: "roof",
      regions: { AU: 58, US: 38, UK: 42 } },
    { id: "sarking", label: "Roof sarking / reflective foil", unit: "m²", category: "roof",
      regions: { AU: 6.50, US: 4, UK: 4.50 } },
    { id: "whirlybird", label: "Roof ventilator / whirlybird", unit: "ea", category: "roof",
      regions: { AU: 120, US: 75, UK: 85 } },
    { id: "skylight", label: "Skylight / roof window", unit: "ea", category: "roof",
      regions: { AU: 680, US: 420, UK: 470 } },
    { id: "downpipe", label: "Downpipe (PVC/metal)", unit: "lin.m", category: "roof",
      regions: { AU: 18, US: 11, UK: 13 } },

    // ---- CLADDING (more) ----
    { id: "cladding_timber", label: "Timber cladding (shiplap/board)", unit: "m²", category: "cladding",
      regions: { AU: 95, US: 58, UK: 65 } },
    { id: "cladding_compressed_sheet", label: "Compressed fibre cement sheet", unit: "m²", category: "cladding",
      regions: { AU: 68, US: 42, UK: 47 } },
    { id: "cladding_metal", label: "Metal cladding (mini-orb/standing seam)", unit: "m²", category: "cladding",
      regions: { AU: 88, US: 54, UK: 60 } },
    { id: "cladding_brick_face", label: "Face brick (full brick)", unit: "m²", category: "cladding",
      regions: { AU: 120, US: 78, UK: 70 } },
    { id: "stone_veneer", label: "Stone cladding / veneer", unit: "m²", category: "cladding",
      regions: { AU: 165, US: 105, UK: 115 } },
    { id: "blueboard_render", label: "Blueboard + acrylic render system", unit: "m²", category: "cladding",
      regions: { AU: 110, US: 68, UK: 76 } },

    // ---- INSULATION ----
    { id: "ceiling_insulation", label: "Ceiling batts R4.0", unit: "m²", category: "insulation",
      regions: { AU: 16, US: 10, UK: 12 } },
    { id: "acoustic_insulation", label: "Acoustic insulation batts", unit: "m²", category: "insulation",
      regions: { AU: 18, US: 11, UK: 13 } },
    { id: "underfloor_insulation", label: "Underfloor insulation", unit: "m²", category: "insulation",
      regions: { AU: 15, US: 9, UK: 11 } },

    // ---- INTERIOR (more) ----
    { id: "plasterboard_wet", label: "Wet-area plasterboard (Aquacheck)", unit: "m²", category: "interior",
      regions: { AU: 46, US: 28, UK: 32 } },
    { id: "plasterboard_fire", label: "Fire-rated plasterboard", unit: "m²", category: "interior",
      regions: { AU: 52, US: 32, UK: 36 } },
    { id: "skirting", label: "Skirting board + install", unit: "lin.m", category: "interior",
      regions: { AU: 22, US: 13, UK: 15 } },
    { id: "architrave", label: "Architrave + install", unit: "lin.m", category: "interior",
      regions: { AU: 18, US: 11, UK: 13 } },
    { id: "floor_vinyl", label: "Vinyl plank flooring + lay", unit: "m²", category: "interior",
      regions: { AU: 65, US: 40, UK: 45 } },
    { id: "floor_laminate", label: "Laminate flooring + lay", unit: "m²", category: "interior",
      regions: { AU: 55, US: 34, UK: 38 } },
    { id: "floor_polished_timber", label: "Solid timber floor + sand & finish", unit: "m²", category: "interior",
      regions: { AU: 185, US: 115, UK: 128 } },
    { id: "wall_tile", label: "Wall tile + adhesive + lay", unit: "m²", category: "interior",
      regions: { AU: 130, US: 80, UK: 90 } },

    // ---- KITCHEN (more) ----
    { id: "kit_bench_timber_solid", label: "Benchtop — solid timber", unit: "lin.m", category: "kitchen",
      regions: { AU: 480, US: 300, UK: 330 } },
    { id: "kit_appliance_pack", label: "Appliance pack (oven/cooktop/rangehood)", unit: "ea", category: "kitchen",
      regions: { AU: 3200, US: 2000, UK: 2200 } },
    { id: "kit_dishwasher", label: "Dishwasher", unit: "ea", category: "kitchen",
      regions: { AU: 850, US: 540, UK: 600 } },
    { id: "kit_pantry", label: "Walk-in pantry fit-out", unit: "ea", category: "kitchen",
      regions: { AU: 2400, US: 1500, UK: 1650 } },

    // ---- BATHROOM (more) ----
    { id: "bath_shower_base", label: "Shower base / tray", unit: "ea", category: "bathroom",
      regions: { AU: 320, US: 200, UK: 225 } },
    { id: "bath_freestanding", label: "Freestanding bath", unit: "ea", category: "bathroom",
      regions: { AU: 1450, US: 900, UK: 1000 } },
    { id: "bath_towel_rail", label: "Heated towel rail", unit: "ea", category: "bathroom",
      regions: { AU: 380, US: 240, UK: 265 } },
    { id: "bath_exhaust_fan", label: "Exhaust fan + light", unit: "ea", category: "bathroom",
      regions: { AU: 220, US: 140, UK: 155 } },
    { id: "bath_mirror_cabinet", label: "Mirror shaving cabinet", unit: "ea", category: "bathroom",
      regions: { AU: 290, US: 180, UK: 200 } },

    // ---- SERVICES (more) ----
    { id: "switchboard", label: "Switchboard upgrade", unit: "ea", category: "services",
      regions: { AU: 1800, US: 1100, UK: 1250 } },
    { id: "ceiling_fan", label: "Ceiling fan + install", unit: "ea", category: "services",
      regions: { AU: 280, US: 175, UK: 195 } },
    { id: "downlight", label: "LED downlight + install", unit: "ea", category: "services",
      regions: { AU: 75, US: 46, UK: 52 } },
    { id: "power_point", label: "Power point (GPO) + install", unit: "ea", category: "services",
      regions: { AU: 145, US: 90, UK: 100 } },
    { id: "data_point", label: "Data / TV point + install", unit: "ea", category: "services",
      regions: { AU: 160, US: 100, UK: 110 } },
    { id: "ducted_ac", label: "Ducted A/C system (whole home)", unit: "ea", category: "services",
      regions: { AU: 14000, US: 9000, UK: 10000 } },
    { id: "rainwater_tank", label: "Rainwater tank + pump", unit: "ea", category: "services",
      regions: { AU: 2200, US: 1400, UK: 1550 } },
    { id: "septic_system", label: "Septic / wastewater system", unit: "ea", category: "services",
      regions: { AU: 12000, US: 7500, UK: 8500 } },

    // ---- OUTDOOR / SITE ----
    { id: "fence_colorbond", label: "Colorbond fence (supply+install)", unit: "lin.m", category: "outdoor",
      regions: { AU: 110, US: 70, UK: 78 } },
    { id: "fence_timber_paling", label: "Timber paling fence", unit: "lin.m", category: "outdoor",
      regions: { AU: 95, US: 60, UK: 67 } },
    { id: "retaining_wall", label: "Retaining wall (besser/sleeper)", unit: "m²", category: "outdoor",
      regions: { AU: 320, US: 200, UK: 225 } },
    { id: "driveway_concrete", label: "Concrete driveway", unit: "m²", category: "outdoor",
      regions: { AU: 110, US: 70, UK: 78 } },
    { id: "paving", label: "Paving (supply + lay)", unit: "m²", category: "outdoor",
      regions: { AU: 95, US: 60, UK: 67 } },
    { id: "turf", label: "Turf / instant lawn", unit: "m²", category: "outdoor",
      regions: { AU: 18, US: 11, UK: 13 } },
    { id: "pergola_kit", label: "Pergola kit (per m² covered)", unit: "m²", category: "outdoor",
      regions: { AU: 220, US: 140, UK: 155 } },
    { id: "carport", label: "Carport (single, supply+build)", unit: "ea", category: "outdoor",
      regions: { AU: 6500, US: 4200, UK: 4700 } },

    // ---- DEMOLITION / PREP ----
    { id: "demo_strip_out", label: "Strip-out / demolition (internal)", unit: "m²", category: "demolition",
      regions: { AU: 65, US: 42, UK: 46 } },
    { id: "skip_bin", label: "Skip bin / waste removal", unit: "ea", category: "demolition",
      regions: { AU: 480, US: 300, UK: 330 } },
    { id: "asbestos_removal", label: "Asbestos removal (licensed)", unit: "m²", category: "demolition",
      regions: { AU: 95, US: 60, UK: 67 }, note: "Licensed removal only" },
    { id: "site_scaffold", label: "Scaffolding hire (per m² face)", unit: "m²", category: "demolition",
      regions: { AU: 45, US: 28, UK: 32 } },

    // ---- TIMBER (species & products) ----
    { id: "timber_treated_70x35", label: "Treated pine 70×35 (H3)", unit: "lin.m", category: "frame",
      regions: { AU: 5.20, US: 2.90, UK: 3.20 } },
    { id: "timber_hardwood_f17", label: "Hardwood F17 90×45", unit: "lin.m", category: "frame",
      regions: { AU: 18, US: 11, UK: 12 } },
    { id: "timber_oregon", label: "Oregon / Douglas fir 90×45", unit: "lin.m", category: "frame",
      regions: { AU: 14, US: 8, UK: 9 } },
    { id: "timber_merbau_post", label: "Merbau post 90×90", unit: "lin.m", category: "frame",
      regions: { AU: 52, US: 32, UK: 36 } },
    { id: "timber_ply_form", label: "Formply 17mm", unit: "m²", category: "frame",
      regions: { AU: 48, US: 30, UK: 34 } },
    { id: "timber_cca_sleeper", label: "Treated sleeper 200×75", unit: "lin.m", category: "frame",
      regions: { AU: 28, US: 17, UK: 19 } },
    { id: "timber_dressed_pine", label: "Dressed pine (DAR) 90×19", unit: "lin.m", category: "interior",
      regions: { AU: 7.50, US: 4.50, UK: 5 } },
    { id: "timber_marine_ply", label: "Marine ply 12mm", unit: "m²", category: "frame",
      regions: { AU: 95, US: 60, UK: 67 } },

    // ---- SINKS, TUBS & TAPWARE ----
    { id: "sink_single_bowl", label: "Kitchen sink — single bowl (stainless)", unit: "ea", category: "kitchen",
      regions: { AU: 220, US: 140, UK: 155 } },
    { id: "sink_double_bowl", label: "Kitchen sink — double bowl", unit: "ea", category: "kitchen",
      regions: { AU: 380, US: 240, UK: 265 } },
    { id: "sink_undermount", label: "Kitchen sink — undermount", unit: "ea", category: "kitchen",
      regions: { AU: 450, US: 290, UK: 320 } },
    { id: "sink_farmhouse", label: "Farmhouse / butler sink", unit: "ea", category: "kitchen",
      regions: { AU: 650, US: 420, UK: 460 } },
    { id: "tap_kitchen_mixer", label: "Kitchen mixer tap", unit: "ea", category: "kitchen",
      regions: { AU: 240, US: 150, UK: 165 } },
    { id: "tap_pull_out", label: "Pull-out spray mixer", unit: "ea", category: "kitchen",
      regions: { AU: 360, US: 230, UK: 255 } },
    { id: "tub_laundry", label: "Laundry tub + cabinet", unit: "ea", category: "bathroom",
      regions: { AU: 320, US: 200, UK: 225 } },
    { id: "tap_basin_mixer", label: "Basin mixer tap", unit: "ea", category: "bathroom",
      regions: { AU: 180, US: 115, UK: 128 } },
    { id: "tap_shower_mixer", label: "Shower mixer + rail set", unit: "ea", category: "bathroom",
      regions: { AU: 280, US: 180, UK: 200 } },
    { id: "basin_vanity", label: "Vanity basin (ceramic)", unit: "ea", category: "bathroom",
      regions: { AU: 160, US: 100, UK: 110 } },
    { id: "tap_outdoor", label: "Outdoor garden tap + hose bib", unit: "ea", category: "services",
      regions: { AU: 95, US: 60, UK: 67 } },

    // ---- POOL / OUTDOOR EQUIPMENT ----
    { id: "pool_pump", label: "Pool pump + filter", unit: "ea", category: "outdoor",
      regions: { AU: 1400, US: 900, UK: 1000 } },
    { id: "pool_heater", label: "Pool heat pump", unit: "ea", category: "outdoor",
      regions: { AU: 3200, US: 2100, UK: 2350 } },
    { id: "pool_chlorinator", label: "Salt water chlorinator", unit: "ea", category: "outdoor",
      regions: { AU: 1100, US: 700, UK: 780 } },
    { id: "pool_paving", label: "Pool surround paving", unit: "m²", category: "outdoor",
      regions: { AU: 130, US: 85, UK: 95 } },

    // ---- SITEWORK ----
    { id: "site_clearing", label: "Site clearing & grubbing", unit: "m²", category: "sitework",
      regions: { AU: 8, US: 5, UK: 6 } },
    { id: "earthworks_cut_fill", label: "Bulk earthworks (cut & fill)", unit: "m³", category: "sitework",
      regions: { AU: 45, US: 30, UK: 34 } },
    { id: "erosion_control_fencing", label: "Erosion & sediment control fencing", unit: "lin.m", category: "sitework",
      regions: { AU: 12, US: 8, UK: 9 }, note: "Silt fence, required during earthworks" },

    // ---- FORMWORK (consumable/labour, distinct from equipment hire) ----
    { id: "formwork_slab_edge", label: "Formwork — slab edge", unit: "lin.m", category: "formwork",
      regions: { AU: 32, US: 21, UK: 24 } },
    { id: "formwork_column", label: "Formwork — column/upstand", unit: "m²", category: "formwork",
      regions: { AU: 48, US: 32, UK: 36 } },

    // ---- REINFORCEMENT (beyond the existing rebar_n12) ----
    { id: "rebar_n16", label: "Reinforcement bar (N16)", unit: "tonne", category: "reinforcement",
      regions: { AU: 1900, US: 1250, UK: 1400 } },
    { id: "rebar_n20", label: "Reinforcement bar (N20)", unit: "tonne", category: "reinforcement",
      regions: { AU: 1950, US: 1280, UK: 1430 } },
    { id: "mesh_sl72", label: "Reinforcing mesh (SL72)", unit: "m²", category: "reinforcement",
      regions: { AU: 14, US: 9, UK: 10 } },
    { id: "mesh_sl82", label: "Reinforcing mesh (SL82)", unit: "m²", category: "reinforcement",
      regions: { AU: 18, US: 12, UK: 13 } },

    // ---- STRUCTURAL STEEL (beyond the generic structural_steel line) ----
    { id: "universal_beam", label: "Universal beam (UB), fabricated & installed", unit: "tonne", category: "structural_steel",
      regions: { AU: 5200, US: 3400, UK: 3800 } },
    { id: "universal_column", label: "Universal column (UC), fabricated & installed", unit: "tonne", category: "structural_steel",
      regions: { AU: 5400, US: 3550, UK: 3950 } },
    { id: "steel_purlin", label: "Steel roof purlin (C/Z section)", unit: "lin.m", category: "structural_steel",
      regions: { AU: 22, US: 14, UK: 16 } },

    // ---- MASONRY / BLOCKWORK ----
    { id: "concrete_block_190", label: "Concrete block (190 series), laid", unit: "m²", category: "masonry",
      regions: { AU: 105, US: 68, UK: 76 } },
    { id: "besser_block_filled", label: "Besser block, core-filled + reinforced", unit: "m²", category: "masonry",
      regions: { AU: 145, US: 95, UK: 106 } },
    { id: "retaining_block", label: "Segmental retaining wall block", unit: "m²", category: "masonry",
      regions: { AU: 165, US: 108, UK: 120 } },

    // ---- INSULATION (tiered R-values, beyond roof/wall basics) ----
    { id: "wall_insulation_r4", label: "Wall insulation batts R4.0 (upgrade)", unit: "m²", category: "insulation",
      regions: { AU: 22, US: 14, UK: 16 } },
    { id: "roof_insulation_r6", label: "Roof insulation batts R6.0 (upgrade)", unit: "m²", category: "insulation",
      regions: { AU: 26, US: 17, UK: 19 } },

    // ---- CLADDING (tiered) ----
    { id: "brick_veneer_premium", label: "Brick veneer — premium/handmade finish", unit: "m²", category: "cladding",
      regions: { AU: 145, US: 95, UK: 106 } },
    { id: "weatherboard_composite", label: "Composite weatherboard cladding", unit: "m²", category: "cladding",
      regions: { AU: 88, US: 58, UK: 65 } },
    { id: "cladding_metal_panel", label: "Architectural metal panel cladding", unit: "m²", category: "cladding",
      regions: { AU: 165, US: 108, UK: 120 } },

    // ---- ROOFING (tiered) ----
    { id: "metal_roof_premium", label: "Standing-seam metal roof (premium)", unit: "m²", category: "roof",
      regions: { AU: 78, US: 51, UK: 57 } },
    { id: "slate_tile", label: "Natural slate roof tile", unit: "m²", category: "roof",
      regions: { AU: 165, US: 108, UK: 120 } },

    // ---- WINDOWS & DOORS (tiered) ----
    { id: "window_timber_double", label: "Timber window, double-glazed", unit: "m²", category: "openings",
      regions: { AU: 980, US: 640, UK: 715 } },
    { id: "window_upvc_double", label: "uPVC window, double-glazed", unit: "m²", category: "openings",
      regions: { AU: 650, US: 425, UK: 475 } },
    { id: "door_external_premium", label: "External door — solid timber, premium", unit: "ea", category: "openings",
      regions: { AU: 2800, US: 1850, UK: 2050 } },
    { id: "bifold_door", label: "Bi-fold glass door (per panel)", unit: "ea", category: "openings",
      regions: { AU: 950, US: 620, UK: 690 } },

    // ---- FLOORING (beyond timber/tile/carpet blanket finishes) ----
    { id: "floor_vinyl_plank", label: "Vinyl plank flooring, laid", unit: "m²", category: "interior",
      regions: { AU: 68, US: 45, UK: 50 } },
    { id: "floor_polished_concrete", label: "Polished concrete floor finish", unit: "m²", category: "interior",
      regions: { AU: 95, US: 62, UK: 70 } },
    { id: "floor_hybrid", label: "Hybrid (rigid-core) flooring, laid", unit: "m²", category: "interior",
      regions: { AU: 78, US: 51, UK: 57 } },

    // ---- NAMED PLUMBING / ELECTRICAL / HVAC FIXTURES ----
    { id: "downlight_led", label: "LED downlight, supplied & installed", unit: "ea", category: "services",
      regions: { AU: 45, US: 30, UK: 33 } },
    { id: "power_point_double", label: "Double power point, supplied & installed", unit: "ea", category: "services",
      regions: { AU: 65, US: 42, UK: 47 } },
    { id: "hvac_ducted", label: "Ducted reverse-cycle A/C system", unit: "ea", category: "services",
      regions: { AU: 9800, US: 6400, UK: 7150 }, note: "Whole-house ducted, per system" },
    { id: "switchboard_upgrade", label: "Switchboard + safety switch upgrade", unit: "ea", category: "services",
      regions: { AU: 1200, US: 780, UK: 870 } },

    // ---- LANDSCAPING ----
    { id: "garden_bed", label: "Garden bed — prepared, mulched, planted", unit: "m²", category: "landscaping",
      regions: { AU: 65, US: 42, UK: 47 } },
    { id: "retaining_wall_timber", label: "Timber sleeper retaining wall", unit: "m²", category: "landscaping",
      regions: { AU: 320, US: 210, UK: 235 } },

    // ---- PAVING / DRIVEWAY ----
    { id: "concrete_driveway", label: "Plain concrete driveway", unit: "m²", category: "paving_driveway",
      regions: { AU: 95, US: 62, UK: 70 } },
    { id: "paver_driveway", label: "Paved driveway (concrete pavers)", unit: "m²", category: "paving_driveway",
      regions: { AU: 130, US: 85, UK: 95 } },
    { id: "asphalt_driveway", label: "Asphalt driveway", unit: "m²", category: "paving_driveway",
      regions: { AU: 75, US: 49, UK: 55 } },

    // ---- WATERPROOFING (beyond the existing bath_waterproofing line) ----
    { id: "waterproof_membrane_wet_area", label: "Waterproofing membrane — internal wet area", unit: "m²", category: "waterproofing",
      regions: { AU: 78, US: 51, UK: 57 } },
    { id: "waterproof_membrane_balcony", label: "Waterproofing membrane — external balcony/deck", unit: "m²", category: "waterproofing",
      regions: { AU: 95, US: 62, UK: 70 } },

    // ---- SITE SERVICES CONNECTIONS ----
    { id: "water_connection", label: "Water service connection", unit: "ea", category: "site_services",
      regions: { AU: 2200, US: 1450, UK: 1620 } },
    { id: "sewer_connection", label: "Sewer service connection", unit: "ea", category: "site_services",
      regions: { AU: 3200, US: 2100, UK: 2350 } },
    { id: "power_connection", label: "Power service connection", unit: "ea", category: "site_services",
      regions: { AU: 2800, US: 1850, UK: 2050 } },

    // ---- SAFETY / SITE ESTABLISHMENT ----
    { id: "site_signage", label: "Site safety signage package", unit: "ea", category: "safety_site_establishment",
      regions: { AU: 380, US: 250, UK: 280 } },
    { id: "first_aid_station", label: "Site first-aid station", unit: "ea", category: "safety_site_establishment",
      regions: { AU: 220, US: 145, UK: 162 } },
    { id: "temporary_toilet", label: "Temporary site toilet hire", unit: "ea", category: "safety_site_establishment",
      regions: { AU: 480, US: 315, UK: 350 } },
  ],

  byCategory(cat) {
    return this.catalog.filter((m) => m.category === cat);
  },
  get(id) {
    return this.catalog.find((m) => m.id === id);
  },
  rate(id, region) {
    const m = this.get(id);
    return m ? m.regions[region] ?? 0 : 0;
  },

  /* List all categories currently in the catalogue (for grouped pickers). */
  categories() {
    return [...new Set(this.catalog.map((m) => m.category))];
  },

  /* ---- API-READY: supplier feed adaptor ----
     When a live supplier feed connects, each incoming product is normalised
     into the catalogue shape and merged in. A feed item is expected to look
     roughly like { sku, name, unit, price, category, region }. Unknown fields
     are ignored; missing ones get safe defaults so a partial feed still loads.
     Call: Materials.loadFeed(items, "AU") — returns { added, updated }. */
  loadFeed(items, region = "AU") {
    if (!Array.isArray(items)) return { added: 0, updated: 0 };
    let added = 0, updated = 0;
    for (const raw of items) {
      if (!raw) continue;
      const id = String(raw.sku || raw.id || raw.code || "").trim() || ("feed_" + (raw.name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "_")).slice(0, 40);
      const price = Validate ? Validate.sanitiseNumber(raw.price ?? raw.rate ?? raw.cost, { min: 0, max: 1e7, fallback: 0 }).value : (+raw.price || 0);
      const existing = this.get(id);
      if (existing) {
        // update price for this region, keep other regions
        existing.regions = { ...existing.regions, [region]: price };
        existing.supplier = raw.supplier || existing.supplier;
        existing.live = true;
        updated++;
      } else {
        this.catalog.push({
          id,
          label: String(raw.name || raw.label || raw.description || id).trim(),
          unit: String(raw.unit || raw.uom || "ea").trim(),
          category: String(raw.category || "supplier feed").trim().toLowerCase(),
          regions: { AU: 0, US: 0, UK: 0, [region]: price },
          supplier: raw.supplier || null,
          sku: raw.sku || null,
          live: true,
          note: raw.note || null,
        });
        added++;
      }
    }
    return { added, updated };
  },
};
