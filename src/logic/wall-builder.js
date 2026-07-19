/* =========================================================================
   MODULE: wall-builder.js
   Turn a single wall (length × height) into priced quote lines: the frame,
   lining, insulation and finish a wall of that size needs, plus optional
   add-ons (power points, switches, a door, etc.). Outputs lines in the same
   shape the quote builder uses, so a wall flows into the one quote.
   ========================================================================= */
import { Materials } from "../data/materials.js";
import { round } from "../lib/format.js";

export const WallBuilder = {
  /* Add-ons: fixed "supply + install" rates per item, by region. */
  addons: [
    { id: "wa_power", label: "Power point (GPO, supply + install)", unit: "ea", kind: "element", regions: { AU: 145, US: 120, UK: 110 } },
    { id: "wa_switch", label: "Light switch (supply + install)", unit: "ea", kind: "element", regions: { AU: 110, US: 90, UK: 85 } },
    { id: "wa_data", label: "Data / TV point", unit: "ea", kind: "element", regions: { AU: 160, US: 130, UK: 120 } },
    { id: "wa_light", label: "Downlight / light fitting", unit: "ea", kind: "element", regions: { AU: 130, US: 105, UK: 95 } },
    { id: "wa_door", label: "Internal door + frame (in wall)", unit: "ea", kind: "element", regions: { AU: 620, US: 430, UK: 380 } },
    { id: "wa_window", label: "Window opening (frame + reveal)", unit: "ea", kind: "element", regions: { AU: 780, US: 540, UK: 480 } },
    { id: "wa_skirting", label: "Skirting + cornice (per wall)", unit: "ea", kind: "element", regions: { AU: 180, US: 130, UK: 115 } },
    { id: "wa_waterproof", label: "Wet-area waterproofing", unit: "m²", kind: "element", regions: { AU: 75, US: 55, UK: 50 } },
    { id: "wa_tile", label: "Wall tiling (supply + lay)", unit: "m²", kind: "element", regions: { AU: 130, US: 95, UK: 85 } },
  ],
  getAddon(id) { return this.addons.find((a) => a.id === id); },

  /* Build quote lines for a wall.
     opts: { lengthM, heightM, construction, insulated, finish, sides, labour } */
  toLines(opts, region, mkId) {
    const L = +opts.lengthM || 0;
    const H = +opts.heightM || 0;
    const area = L * H;
    const lines = [];
    if (area <= 0) return lines;
    const sides = opts.sides === 1 ? 1 : 2; // lined one or both sides
    const push = (kind, materialId, labourId, label, qty, unit, fixedRate) => {
      lines.push({ id: mkId(), kind, materialId: materialId || null, labourId: labourId || null, label, qty: round(qty, 2), unit, fixedRate: fixedRate ?? null });
    };
    const pushLabour = (labourId, label, days) => {
      lines.push({ id: mkId(), kind: "labour", materialId: null, labourId, label, workers: 1, hours: round(days * 8, 1), unit: "hr", fixedRate: null });
    };

    if (opts.construction === "stud") {
      // Framing: studs @450 + top/bottom plates. Approx lin.m of timber ≈ area×2.2
      push("material", "timber_mgp10", null, "Wall framing (studs + plates)", area * 2.2, "lin.m");
      // Lining both sides (or one)
      push("material", "plasterboard", null, `Plasterboard lining (${sides === 2 ? "both sides" : "one side"})`, area * sides, "m²");
      if (opts.insulated) push("material", "wall_insulation", null, "Acoustic / thermal insulation", area, "m²");
    } else if (opts.construction === "brick") {
      push("material", "brick_veneer", null, "Brick / blockwork", area, "m²");
      if (opts.insulated) push("material", "wall_insulation", null, "Insulation", area, "m²");
    }

    // Finish
    if (opts.finish === "paint") push("material", "paint", null, `Paint (${sides === 2 ? "both sides" : "one side"})`, area * sides, "m²");
    else if (opts.finish === "render") push("material", "render", null, "Render finish", area, "m²");
    else if (opts.finish === "tile") push("element", null, null, "Wall tiling (supply + lay)", area, "m²", this.getAddon("wa_tile").regions[region]);

    // Add-ons
    for (const a of (opts.addonList || [])) {
      const def = this.getAddon(a.id);
      if (!def) continue;
      const qty = a.qty || 1;
      push("element", null, null, def.label, qty, def.unit, def.regions[region]);
    }

    // Labour estimate (optional): rough trade-days → converted to hours
    if (opts.labour) {
      const carpDays = opts.construction === "stud" ? Math.max(0.5, round(area / 12, 1)) : Math.max(0.5, round(area / 8, 1));
      pushLabour("lab_carpenter", opts.construction === "stud" ? "Carpenter (frame + line)" : "Bricklayer / blocklayer", carpDays);
      if (opts.finish === "paint" || opts.finish === "render") pushLabour("lab_painter", "Painter / finisher", Math.max(0.5, round(area / 25, 1)));
      const hasElec = (opts.addonList || []).some((a) => ["wa_power", "wa_switch", "wa_data", "wa_light"].includes(a.id));
      if (hasElec) pushLabour("lab_electrician", "Electrician (points + rough-in)", 0.5);
    }
    return lines;
  },

  /* ---- Job presets ----
     Each preset declares the single dimension it needs (area in m², or length
     in m) and produces sensible MATERIAL lines for that job. Labour is added
     only if the user ticks it (a rough trade-day estimate). Add-ons optional. */
  presets: [
    {
      id: "timber_wall", label: "Timber stud wall (frame + lining)", dim: "wall",
      note: "A new stud-framed wall — framing, plasterboard, optional insulation & finish.",
    },
    {
      id: "kitchen_bench", label: "Kitchen bench / cabinetry", dim: "length", dimLabel: "Bench / cabinet run (m)",
      note: "Cabinetry + benchtop for a run of kitchen bench.",
      variants: [
        { id: "flatpack_laminate", label: "Flat-pack + laminate top" },
        { id: "flatpack_stone", label: "Flat-pack + stone top" },
        { id: "custom_stone", label: "Custom joinery + stone top" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "flatpack_laminate";
        const cab = v === "custom_stone" ? "kit_cab_custom" : "kit_cab_flatpack";
        const bench = v === "flatpack_laminate" ? "kit_bench_laminate" : "kit_bench_stone";
        const cabM = Materials.get(cab), benchM = Materials.get(bench);
        return [
          { id: mk(), kind: "material", materialId: cab, label: cabM.label, qty: round(a, 2), unit: "lin.m" },
          { id: mk(), kind: "material", materialId: bench, label: benchM.label, qty: round(a, 2), unit: "lin.m" },
          { id: mk(), kind: "material", materialId: "kit_sink_tap", label: "Sink + mixer tapware", qty: 1, unit: "ea" },
        ];
      },
      labour: (a) => [{ labourId: "lab_carpenter", label: "Cabinetmaker / installer", days: Math.max(0.5, round(a / 4, 1)) }],
      addons: ["wa_power"],
    },
    {
      id: "laundry_cabinet", label: "Laundry / vanity cabinet", dim: "length", dimLabel: "Cabinet run (m)",
      note: "Cabinetry + benchtop + tub/basin for a laundry or vanity run.",
      lines: (a, region, mk) => {
        const tubRate = { AU: 320, US: 230, UK: 200 }[region];
        return [
          { id: mk(), kind: "material", materialId: "kit_cab_flatpack", label: "Cabinetry — flat-pack + install", qty: round(a, 2), unit: "lin.m" },
          { id: mk(), kind: "material", materialId: "kit_bench_laminate", label: "Benchtop — laminate", qty: round(a, 2), unit: "lin.m" },
          { id: mk(), kind: "element", label: "Laundry tub / basin + tapware", qty: 1, unit: "ea", fixedRate: tubRate },
        ];
      },
      labour: (a) => [{ labourId: "lab_carpenter", label: "Cabinetmaker / installer", days: Math.max(0.5, round(a / 4, 1)) }],
      addons: ["wa_power"],
    },
    {
      id: "drywall", label: "Drywall / plasterboard lining", dim: "area", dimLabel: "Wall area (m²)",
      note: "Lining an existing frame — board, set, no framing.",
      lines: (a, region, mk) => {
        const L = [];
        L.push({ id: mk(), kind: "material", materialId: "plasterboard", label: "Plasterboard 10mm + set joints", qty: round(a, 2), unit: "m²" });
        return L;
      },
      labour: (a) => [{ labourId: "lab_plasterer", label: "Plasterer (hang + set)", days: Math.max(0.5, round(a / 30, 1)) }],
      addons: ["wa_skirting", "wa_power", "wa_switch"],
    },
    {
      id: "painting", label: "Painting only", dim: "area", dimLabel: "Area to paint (m²)",
      note: "Prep + 2 coats over existing surface.",
      lines: (a, region, mk) => [{ id: mk(), kind: "material", materialId: "paint", label: "Paint, 2 coats + primer", qty: round(a, 2), unit: "m²" }],
      labour: (a) => [{ labourId: "lab_painter", label: "Painter", days: Math.max(0.5, round(a / 35, 1)) }],
      addons: [],
    },
    {
      id: "flooring", label: "Flooring", dim: "area", dimLabel: "Floor area (m²)",
      note: "Floor covering over a prepared subfloor.",
      variants: [
        { id: "floor_timber", label: "Engineered timber" },
        { id: "floor_tile", label: "Tile" },
        { id: "floor_carpet", label: "Carpet" },
      ],
      lines: (a, region, mk, variant) => {
        const matId = variant || "floor_timber";
        const m = Materials.get(matId);
        return [{ id: mk(), kind: "material", materialId: matId, label: m.label, qty: round(a, 2), unit: "m²" }];
      },
      labour: (a) => [{ labourId: "lab_tiler", label: "Floor layer", days: Math.max(0.5, round(a / 25, 1)) }],
      addons: [],
    },
    {
      id: "fencing", label: "Fencing", dim: "length", dimLabel: "Fence length (m)",
      note: "Various fence types ~1.8m high (panels/palings, posts, footings).",
      variants: [
        { id: "timber_paling", label: "Timber paling" },
        { id: "colorbond", label: "Colorbond steel" },
        { id: "aluminium_slat", label: "Aluminium slat" },
        { id: "pool_glass", label: "Frameless glass (pool)" },
        { id: "chainmesh", label: "Chain mesh" },
        { id: "picket", label: "Timber picket" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "timber_paling";
        const rates = {
          timber_paling: { AU: 95, US: 68, UK: 60 }, colorbond: { AU: 110, US: 78, UK: 70 },
          aluminium_slat: { AU: 220, US: 150, UK: 135 }, pool_glass: { AU: 380, US: 260, UK: 235 },
          chainmesh: { AU: 55, US: 38, UK: 34 }, picket: { AU: 120, US: 82, UK: 74 },
        };
        const labels = {
          timber_paling: "Timber paling fence + rails", colorbond: "Colorbond fence panels",
          aluminium_slat: "Aluminium slat fence", pool_glass: "Frameless glass pool fence + spigots",
          chainmesh: "Chain mesh fence", picket: "Timber picket fence",
        };
        const fenceRate = rates[v][region];
        const postRate = { AU: 38, US: 27, UK: 24 }[region];
        const posts = Math.ceil(a / 2.4) + 1;
        const out = [{ id: mk(), kind: "element", label: labels[v], qty: round(a, 2), unit: "m", fixedRate: fenceRate }];
        if (v !== "pool_glass") out.push({ id: mk(), kind: "element", label: "Posts + concrete footings", qty: posts, unit: "ea", fixedRate: postRate });
        return out;
      },
      labour: (a) => [{ labourId: "lab_carpenter", label: "Fencer", days: Math.max(0.5, round(a / 15, 1)) }],
      addons: ["wa_door"],
    },
    {
      id: "pool", label: "Swimming pool", dim: "area", dimLabel: "Pool surface area (m²)",
      note: "In-ground pool shell + filtration. Excludes deck, fencing & landscaping (add separately).",
      variants: [
        { id: "concrete", label: "Concrete / gunite" },
        { id: "fibreglass", label: "Fibreglass shell" },
        { id: "vinyl", label: "Vinyl liner" },
        { id: "plunge", label: "Plunge / small" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "concrete";
        const m2Rate = { concrete: { AU: 2200, US: 1500, UK: 1700 }, fibreglass: { AU: 1500, US: 1050, UK: 1200 },
          vinyl: { AU: 1100, US: 800, UK: 900 }, plunge: { AU: 1800, US: 1250, UK: 1400 } }[v][region];
        const labels = { concrete: "Concrete pool shell + finish", fibreglass: "Fibreglass pool shell (supply+set)",
          vinyl: "Vinyl liner pool", plunge: "Plunge pool (compact)" };
        const filterRate = { AU: 3500, US: 2400, UK: 2700 }[region];
        const excavRate = { AU: 95, US: 65, UK: 72 }[region];
        return [
          { id: mk(), kind: "element", label: labels[v], qty: round(a, 2), unit: "m²", fixedRate: m2Rate },
          { id: mk(), kind: "element", label: "Excavation + spoil removal", qty: round(a * 1.6, 2), unit: "m³", fixedRate: excavRate },
          { id: mk(), kind: "element", label: "Filtration, pump & plumbing", qty: 1, unit: "ea", fixedRate: filterRate },
          { id: mk(), kind: "material", materialId: "concrete_25mpa", label: "Surround / bond beam concrete", qty: round(a * 0.15, 2), unit: "m³" },
        ];
      },
      labour: (a) => [{ labourId: "lab_concreter", label: "Pool builder / crew", days: Math.max(3, round(a / 4, 1)) }],
      addons: [],
    },
    {
      id: "concreting", label: "Concrete slab / driveway", dim: "area", dimLabel: "Area (m²)",
      note: "Reinforced concrete slab — driveway, shed slab, path, patio.",
      variants: [
        { id: "plain", label: "Plain / broom finish" },
        { id: "exposed", label: "Exposed aggregate" },
        { id: "coloured", label: "Coloured / stencil" },
        { id: "polished", label: "Polished" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "plain";
        const finId = { plain: "concrete_plain", exposed: "concrete_exposed", coloured: "concrete_stencil", polished: "concrete_polished" }[v];
        const fin = Materials.get(finId);
        return [
          { id: mk(), kind: "material", materialId: finId, label: fin.label, qty: round(a, 2), unit: "m²" },
          { id: mk(), kind: "material", materialId: "slab_mesh", label: "Reinforcing mesh", qty: round(a, 2), unit: "m²" },
          { id: mk(), kind: "material", materialId: "fill_road_base", label: "Road base sub-grade", qty: round(a * 0.1, 2), unit: "m³" },
        ];
      },
      labour: (a) => [{ labourId: "lab_concreter", label: "Concreter crew", days: Math.max(0.5, round(a / 30, 1)) }],
      addons: [],
    },
    {
      id: "retaining", label: "Retaining wall", dim: "area", dimLabel: "Wall face area (m²)",
      note: "Retaining wall — sleeper, besser block or concrete sleeper.",
      variants: [
        { id: "timber_sleeper", label: "Treated timber sleeper" },
        { id: "concrete_sleeper", label: "Concrete sleeper + steel posts" },
        { id: "besser", label: "Besser block (core-filled)" },
        { id: "rock", label: "Rock / boulder wall" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "concrete_sleeper";
        const rate = { timber_sleeper: { AU: 260, US: 175, UK: 195 }, concrete_sleeper: { AU: 360, US: 245, UK: 270 },
          besser: { AU: 420, US: 285, UK: 320 }, rock: { AU: 480, US: 325, UK: 360 } }[v][region];
        const labels = { timber_sleeper: "Timber sleeper retaining wall", concrete_sleeper: "Concrete sleeper wall + posts",
          besser: "Besser block wall (core-filled)", rock: "Rock / boulder retaining wall" };
        return [
          { id: mk(), kind: "element", label: labels[v], qty: round(a, 2), unit: "m²", fixedRate: rate },
          { id: mk(), kind: "element", label: "Ag drain + gravel backfill", qty: round(a, 2), unit: "m²", fixedRate: { AU: 45, US: 30, UK: 34 }[region] },
        ];
      },
      labour: (a) => [{ labourId: "lab_concreter", label: "Retaining crew", days: Math.max(1, round(a / 8, 1)) }],
      addons: [],
    },
    {
      id: "tiling", label: "Tiling (wall or floor)", dim: "area", dimLabel: "Area to tile (m²)",
      note: "Tile supply + lay, including adhesive and grout.",
      variants: [
        { id: "ceramic", label: "Ceramic" },
        { id: "porcelain", label: "Porcelain" },
        { id: "stone", label: "Natural stone" },
        { id: "mosaic", label: "Mosaic / feature" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "ceramic";
        const rate = { ceramic: { AU: 110, US: 75, UK: 82 }, porcelain: { AU: 140, US: 95, UK: 105 },
          stone: { AU: 190, US: 130, UK: 145 }, mosaic: { AU: 220, US: 150, UK: 165 } }[v][region];
        const labels = { ceramic: "Ceramic tiles + lay", porcelain: "Porcelain tiles + lay", stone: "Natural stone tiles + lay", mosaic: "Mosaic / feature tiles + lay" };
        return [
          { id: mk(), kind: "element", label: labels[v], qty: round(a, 2), unit: "m²", fixedRate: rate },
          { id: mk(), kind: "element", label: "Waterproofing (wet areas)", qty: round(a, 2), unit: "m²", fixedRate: { AU: 35, US: 24, UK: 27 }[region] },
        ];
      },
      labour: (a) => [{ labourId: "lab_tiler", label: "Tiler", days: Math.max(0.5, round(a / 12, 1)) }],
      addons: [],
    },
    {
      id: "roofing", label: "Roofing / re-roof", dim: "area", dimLabel: "Roof area (m²)",
      note: "Roof covering — sheet or tile, including flashings.",
      variants: [
        { id: "colorbond", label: "Colorbond / metal sheet" },
        { id: "zincalume", label: "Zincalume" },
        { id: "concrete_tile", label: "Concrete tile" },
        { id: "terracotta", label: "Terracotta tile" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "colorbond";
        const matId = { colorbond: "metal_roof_sheet", zincalume: "zincalume_sheet", concrete_tile: "concrete_tile", terracotta: "terracotta_tile" }[v];
        const m = Materials.get(matId);
        return [
          { id: mk(), kind: "material", materialId: matId, label: m.label, qty: round(a, 2), unit: "m²" },
          { id: mk(), kind: "material", materialId: "sarking", label: "Sarking / reflective foil", qty: round(a, 2), unit: "m²" },
          { id: mk(), kind: "material", materialId: "roof_flashing", label: "Ridge capping & flashings", qty: round(Math.sqrt(a) * 2, 2), unit: "lin.m" },
        ];
      },
      labour: (a) => [{ labourId: "lab_roofer", label: "Roofer", days: Math.max(0.5, round(a / 20, 1)) }],
      addons: [],
    },
    {
      id: "carport", label: "Carport / shed", dim: "area", dimLabel: "Covered area (m²)",
      note: "Steel-frame carport or shed — frame, roof, slab.",
      variants: [
        { id: "carport_single", label: "Open carport" },
        { id: "shed_enclosed", label: "Enclosed shed / garage" },
      ],
      lines: (a, region, mk, variant) => {
        const v = variant || "carport_single";
        const rate = { carport_single: { AU: 320, US: 220, UK: 245 }, shed_enclosed: { AU: 520, US: 355, UK: 395 } }[v][region];
        const label = v === "carport_single" ? "Carport frame + roof (steel)" : "Shed frame, roof & walls (steel)";
        return [
          { id: mk(), kind: "element", label, qty: round(a, 2), unit: "m²", fixedRate: rate },
          { id: mk(), kind: "material", materialId: "concrete_plain", label: "Concrete slab", qty: round(a, 2), unit: "m²" },
        ];
      },
      labour: (a) => [{ labourId: "lab_carpenter", label: "Builder / installer", days: Math.max(1, round(a / 12, 1)) }],
      addons: [],
    },
    {
      id: "deck", label: "Deck / pergola", dim: "area", dimLabel: "Deck area (m²)",
      note: "Timber/composite deck on a framed substructure, posts set on stirrups into concrete footings.",
      variants: [
        { id: "deck_merbau", label: "Merbau hardwood" },
        { id: "deck_treated_pine", label: "Treated pine" },
        { id: "deck_composite", label: "Composite (Trex/Modwood)" },
      ],
      lines: (a, region, mk, variant) => {
        const boardId = variant || "deck_merbau";
        const board = Materials.get(boardId);
        // posts: roughly one per ~2.5m² for a low deck; footings ~0.03m³ each
        const posts = Math.max(2, Math.ceil(a / 2.5));
        return [
          { id: mk(), kind: "material", materialId: boardId, label: board.label, qty: round(a, 2), unit: "m²" },
          { id: mk(), kind: "material", materialId: "deck_substructure", label: "Bearers, joists & framing", qty: round(a, 2), unit: "m²" },
          { id: mk(), kind: "material", materialId: "timber_treated_post", label: "Treated posts (in-ground)", qty: round(posts * 0.9, 2), unit: "lin.m" },
          { id: mk(), kind: "material", materialId: "post_stirrup", label: "Post stirrups / brackets", qty: posts, unit: "ea" },
          { id: mk(), kind: "material", materialId: "footing_concrete", label: "Footing concrete (post holes)", qty: round(posts * 0.03, 2), unit: "m³" },
        ];
      },
      labour: (a) => [{ labourId: "lab_carpenter", label: "Carpenter (deck build)", days: Math.max(1, round(a / 10, 1)) }],
      addons: [],
    },
  ],
  getPreset(id) { return this.presets.find((p) => p.id === id); },

  /* Build lines from a chosen preset + dimension (+ optional variant, labour, add-ons). */
  presetToLines(presetId, opts, region, mk) {
    const p = this.getPreset(presetId);
    if (!p) return [];
    // the timber wall uses the richer wall builder (construction/finish/sides/insulation)
    if (p.dim === "wall") {
      return this.toLines({
        lengthM: opts.lengthM, heightM: opts.heightM,
        construction: "stud", insulated: opts.insulated, finish: opts.finish,
        sides: opts.sides, labour: opts.labour, addonList: opts.addonList,
      }, region, mk);
    }
    const dimVal = +opts.dim || 0;
    if (dimVal <= 0) return [];
    const lines = p.lines(dimVal, region, mk, opts.variant);
    // add-ons
    for (const a of (opts.addonList || [])) {
      const def = this.getAddon(a.id);
      if (!def) continue;
      lines.push({ id: mk(), kind: "element", materialId: null, labourId: null, label: def.label, qty: a.qty || 1, unit: def.unit, fixedRate: def.regions[region] });
    }
    // labour (tick-on)
    if (opts.labour && p.labour) {
      for (const lb of p.labour(dimVal)) {
        lines.push({ id: mk(), kind: "labour", materialId: null, labourId: lb.labourId, label: lb.label, workers: 1, hours: round((lb.days || 0) * 8, 1), unit: "hr", fixedRate: null });
      }
    }
    return lines;
  },
};
