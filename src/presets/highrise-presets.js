/* =========================================================================
   MODULE: highrise-presets.js
   Whole-building starting points for the high-rise/commercial estimator —
   each entry sets a complete parametric spec in one action. Enum values
   (structureType/facadeType/occupancy) match the option lists rendered by
   HighRisePanel — rc|steel|composite, precast|window_wall|curtain_wall,
   office|residential|mixed.
   ========================================================================= */
export const HIGHRISE_PRESETS = [
  {
    id: "boutique_office_tower",
    label: "Boutique office tower",
    description: "Mid-rise commercial office tower with a modest podium.",
    buildSpec: () => ({
      floorPlateM2: 800,
      floors: 12,
      floorHeightM: 3.6,
      basementLevels: 2,
      structureType: "rc",
      facadeType: "curtain_wall",
      occupancy: "office",
      passengerLifts: 3,
      goodsLifts: 1,
      hasEscalators: false,
      siteCondition: "flat",
    }),
  },
  {
    id: "residential_apartment_tower",
    label: "Residential apartment tower",
    description: "High-rise residential apartment building.",
    buildSpec: () => ({
      floorPlateM2: 1000,
      floors: 30,
      floorHeightM: 3.1,
      basementLevels: 3,
      structureType: "rc",
      facadeType: "precast",
      occupancy: "residential",
      passengerLifts: 4,
      goodsLifts: 1,
      hasEscalators: false,
      siteCondition: "flat",
    }),
  },
  {
    id: "mixed_use_podium",
    label: "Mixed-use podium + tower",
    description: "Retail/commercial podium with a residential or office tower above.",
    buildSpec: () => ({
      floorPlateM2: 1400,
      floors: 20,
      floorHeightM: 3.4,
      basementLevels: 3,
      structureType: "composite",
      facadeType: "window_wall",
      occupancy: "mixed",
      passengerLifts: 5,
      goodsLifts: 2,
      hasEscalators: true,
      siteCondition: "flat",
    }),
  },
];
