/* =========================================================================
   MODULE: labour.js
   A small labour & trade rate card so labour lines can auto-price too.
   Rates are indicative supply-of-labour day/hour/unit rates.
   ========================================================================= */
export const LabourRates = {
  /* Hourly rates per worker (day rate ÷ ~8h). A labour line = workers × hours × rate. */
  catalog: [
    { id: "lab_carpenter", label: "Carpenter", regions: { AU: 65, US: 45, UK: 40 } },
    { id: "lab_apprentice", label: "Apprentice", regions: { AU: 35, US: 25, UK: 22 } },
    { id: "lab_bricklayer", label: "Bricklayer", regions: { AU: 70, US: 48, UK: 43 } },
    { id: "lab_concreter", label: "Concreter", regions: { AU: 68, US: 46, UK: 41 } },
    { id: "lab_electrician", label: "Electrician", regions: { AU: 80, US: 55, UK: 49 } },
    { id: "lab_plumber", label: "Plumber", regions: { AU: 80, US: 55, UK: 49 } },
    { id: "lab_plasterer", label: "Plasterer", regions: { AU: 63, US: 43, UK: 38 } },
    { id: "lab_painter", label: "Painter", regions: { AU: 58, US: 40, UK: 35 } },
    { id: "lab_tiler", label: "Tiler", regions: { AU: 65, US: 45, UK: 40 } },
    { id: "lab_roofer", label: "Roofer", regions: { AU: 68, US: 46, UK: 41 } },
    { id: "lab_labourer", label: "General labourer", regions: { AU: 45, US: 31, UK: 28 } },
    { id: "lab_supervisor", label: "Site supervisor", regions: { AU: 90, US: 63, UK: 55 } },
    { id: "lab_crane", label: "Crane + operator", regions: { AU: 275, US: 188, UK: 169 } },
    { id: "lab_excavator", label: "Excavator + operator", regions: { AU: 138, US: 95, UK: 85 } },
  ],
  get(id) { return this.catalog.find((l) => l.id === id); },
  rate(id, region) { const l = this.get(id); return l ? l.regions[region] ?? 0 : 0; }, // per hour
};
