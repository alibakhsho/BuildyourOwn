/* =========================================================================
   MODULE: labour.js
   A small labour & trade rate card so labour lines can auto-price too.
   A labour line = workers × hours × rate. Rates are per-worker CHARGE-OUT
   rates (what a trade bills, incl. their overhead), not take-home wages.

   Updated 2026-07 to current industry chargeout levels. AU is the primary,
   researched market — licensed trades sit ~$75–120/hr and labourers ~$55–75/hr
   (Sydney premium; ABS flags bricklayers/carpenters/concreters commanding
   pricing power after ~6% p.a. construction wage growth 2021–24). US and UK
   are scaled from the AU set (~×0.72 and ~×0.63) as reasonable estimates
   pending market-specific research. Sources noted in the project notes.
   ========================================================================= */
export const LabourRates = {
  /* Chargeout rate per worker per hour, by region. */
  catalog: [
    { id: "lab_carpenter", label: "Carpenter", regions: { AU: 90, US: 65, UK: 57 } },
    { id: "lab_apprentice", label: "Apprentice", regions: { AU: 48, US: 34, UK: 30 } },
    { id: "lab_bricklayer", label: "Bricklayer", regions: { AU: 95, US: 68, UK: 60 } },
    { id: "lab_concreter", label: "Concreter", regions: { AU: 90, US: 65, UK: 57 } },
    { id: "lab_electrician", label: "Electrician", regions: { AU: 100, US: 72, UK: 63 } },
    { id: "lab_plumber", label: "Plumber", regions: { AU: 105, US: 76, UK: 66 } },
    { id: "lab_plasterer", label: "Plasterer", regions: { AU: 85, US: 61, UK: 54 } },
    { id: "lab_painter", label: "Painter", regions: { AU: 75, US: 54, UK: 47 } },
    { id: "lab_tiler", label: "Tiler", regions: { AU: 90, US: 65, UK: 57 } },
    { id: "lab_roofer", label: "Roofer", regions: { AU: 90, US: 65, UK: 57 } },
    { id: "lab_labourer", label: "General labourer", regions: { AU: 62, US: 45, UK: 39 } },
    { id: "lab_supervisor", label: "Site supervisor", regions: { AU: 120, US: 86, UK: 76 } },
    { id: "lab_crane", label: "Crane + operator", regions: { AU: 320, US: 230, UK: 202 } },
    { id: "lab_excavator", label: "Excavator + operator", regions: { AU: 165, US: 118, UK: 104 } },
  ],
  get(id) { return this.catalog.find((l) => l.id === id); },
  rate(id, region) { const l = this.get(id); return l ? l.regions[region] ?? 0 : 0; }, // per hour
};
