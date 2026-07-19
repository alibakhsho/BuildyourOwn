/* =========================================================================
   MODULE: residential-presets.js
   Whole-building starting points for the residential estimator — each
   entry sets a COMPLETE parametric spec in one action (distinct from
   WallBuilder's job/element presets, which only insert a few quote lines).
   ========================================================================= */
import { nextId } from "../lib/ids.js";

export const RESIDENTIAL_PRESETS = [
  {
    id: "granny_flat",
    label: "Granny flat / studio",
    description: "Small self-contained studio — 1 bed, 1 bath, no garage.",
    buildSpec: () => ({
      widthM: 8, lengthM: 6, floors: 1, wallHeightM: 2.7, roofPitch: 18,
      siteCondition: "flat",
      framingType: "timber", roofType: "colorbond", claddingType: "weatherboard", floorFinish: "timber",
      hasGarage: false, solar: false,
      staircaseType: "none",
      slabThicknessM: 0.1,
      openings: { windowsCount: 5, windowsM2: 6, doors: 1 },
      rooms: [
        { id: nextId(), name: "Bedroom", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
        { id: nextId(), name: "Living / kitchen", type: "Living", widthM: 4.5, lengthM: 3.8, floorFinish: "timber", robe: "none", robeLengthM: 0 },
      ],
      kitchens: [
        { id: nextId(), benchLengthM: 3.5, cabinetry: "flatpack", benchtop: "laminate", splashback: "tile", appliances: "basic", island: false, sinkTap: true },
      ],
      bathrooms: [
        { id: nextId(), label: "Bathroom", widthM: 2.4, lengthM: 2.0, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
      ],
      extras: [],
    }),
  },
  {
    id: "brick_veneer_3bed",
    label: "3-bed brick veneer",
    description: "Standard single-storey family home — 3 bed, 2 bath, garage.",
    buildSpec: () => ({
      widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22,
      siteCondition: "flat",
      framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
      hasGarage: true, solar: true,
      staircaseType: "none",
      slabThicknessM: 0.1,
      openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
      rooms: [
        { id: nextId(), name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8, floorFinish: "carpet", robe: "built_in", robeLengthM: 3.0 },
        { id: nextId(), name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet", robe: "built_in", robeLengthM: 2.4 },
        { id: nextId(), name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
        { id: nextId(), name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber", robe: "none", robeLengthM: 0 },
        { id: nextId(), name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 },
      ],
      kitchens: [
        { id: nextId(), benchLengthM: 7, cabinetry: "custom", benchtop: "stone", splashback: "tile", appliances: "mid", island: true, sinkTap: true },
      ],
      bathrooms: [
        { id: nextId(), label: "Main bathroom", widthM: 3.0, lengthM: 2.4, hasBath: true, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
        { id: nextId(), label: "Ensuite", widthM: 2.6, lengthM: 2.0, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: true },
      ],
      extras: [],
    }),
  },
  {
    id: "two_storey_4bed",
    label: "4-bed 2-storey",
    description: "Two-storey family home — 4 bed, 3 bath, double garage.",
    buildSpec: () => ({
      widthM: 11, lengthM: 13, floors: 2, wallHeightM: 2.7, roofPitch: 22,
      siteCondition: "flat",
      framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
      hasGarage: true, solar: true,
      staircaseType: "timber",
      slabThicknessM: 0.12,
      openings: { windowsCount: 16, windowsM2: 22, doors: 3 },
      rooms: [
        { id: nextId(), name: "Master bedroom", type: "Bedroom", widthM: 4.5, lengthM: 4.0, floorFinish: "carpet", robe: "walk_in", robeLengthM: 3.5 },
        { id: nextId(), name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet", robe: "built_in", robeLengthM: 2.4 },
        { id: nextId(), name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
        { id: nextId(), name: "Bedroom 4", type: "Bedroom", widthM: 3.2, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
        { id: nextId(), name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber", robe: "none", robeLengthM: 0 },
        { id: nextId(), name: "Study", type: "Study", widthM: 3.0, lengthM: 2.6, floorFinish: "carpet", robe: "none", robeLengthM: 0 },
        { id: nextId(), name: "Laundry", type: "Laundry", widthM: 2.4, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 },
      ],
      kitchens: [
        { id: nextId(), benchLengthM: 8, cabinetry: "custom", benchtop: "stone", splashback: "tile", appliances: "mid", island: true, sinkTap: true },
      ],
      bathrooms: [
        { id: nextId(), label: "Main bathroom", widthM: 3.2, lengthM: 2.6, hasBath: true, hasShower: true, vanityCount: 2, toiletCount: 1, wallTileFullHeight: false },
        { id: nextId(), label: "Ensuite", widthM: 2.8, lengthM: 2.2, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: true },
        { id: nextId(), label: "Powder room", widthM: 1.8, lengthM: 1.4, hasBath: false, hasShower: false, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
      ],
      extras: [],
    }),
  },
  {
    id: "duplex",
    label: "Duplex (attached pair, combined estimate)",
    description: "Two attached 2-bed units modelled as one combined-GFA envelope — a simplification, not literal twin 3D volumes.",
    buildSpec: () => ({
      widthM: 16, lengthM: 12, floors: 1, wallHeightM: 2.7, roofPitch: 20,
      siteCondition: "flat",
      framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
      hasGarage: true, solar: true,
      staircaseType: "none",
      slabThicknessM: 0.1,
      openings: { windowsCount: 16, windowsM2: 20, doors: 4 },
      rooms: [
        { id: nextId(), name: "Unit 1 — Bedroom 1", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet", robe: "built_in", robeLengthM: 2.4 },
        { id: nextId(), name: "Unit 1 — Bedroom 2", type: "Bedroom", widthM: 3.2, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
        { id: nextId(), name: "Unit 1 — Living", type: "Living", widthM: 5.0, lengthM: 4.2, floorFinish: "timber", robe: "none", robeLengthM: 0 },
        { id: nextId(), name: "Unit 2 — Bedroom 1", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet", robe: "built_in", robeLengthM: 2.4 },
        { id: nextId(), name: "Unit 2 — Bedroom 2", type: "Bedroom", widthM: 3.2, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
        { id: nextId(), name: "Unit 2 — Living", type: "Living", widthM: 5.0, lengthM: 4.2, floorFinish: "timber", robe: "none", robeLengthM: 0 },
      ],
      kitchens: [
        { id: nextId(), benchLengthM: 5, cabinetry: "flatpack", benchtop: "laminate", splashback: "tile", appliances: "basic", island: false, sinkTap: true },
        { id: nextId(), benchLengthM: 5, cabinetry: "flatpack", benchtop: "laminate", splashback: "tile", appliances: "basic", island: false, sinkTap: true },
      ],
      bathrooms: [
        { id: nextId(), label: "Unit 1 — Bathroom", widthM: 2.6, lengthM: 2.2, hasBath: true, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
        { id: nextId(), label: "Unit 2 — Bathroom", widthM: 2.6, lengthM: 2.2, hasBath: true, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
      ],
      extras: [],
    }),
  },
  {
    id: "small_warehouse_shed",
    label: "Small warehouse / shed",
    description: "Steel-framed shed/warehouse shell — open span, minimal fit-out.",
    buildSpec: () => ({
      widthM: 15, lengthM: 20, floors: 1, wallHeightM: 4.5, roofPitch: 10,
      siteCondition: "flat",
      framingType: "steel", roofType: "colorbond", claddingType: "weatherboard", floorFinish: "timber",
      hasGarage: false, solar: false,
      staircaseType: "none",
      slabThicknessM: 0.15,
      openings: { windowsCount: 2, windowsM2: 3, doors: 2 },
      rooms: [
        { id: nextId(), name: "Warehouse floor", type: "Other", widthM: 14, lengthM: 19, floorFinish: "timber", robe: "none", robeLengthM: 0 },
      ],
      kitchens: [],
      bathrooms: [
        { id: nextId(), label: "Amenities", widthM: 2.0, lengthM: 1.8, hasBath: false, hasShower: false, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
      ],
      extras: [],
    }),
  },
];
