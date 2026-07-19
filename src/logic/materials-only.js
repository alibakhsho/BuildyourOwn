/* =========================================================================
   MODULE: materials-only.js
   Pure material pricing — no labour, equipment, margin, or programme.
   You list materials + quantities (or import a sheet) and get the raw
   supply cost, plus order quantities with waste. Ideal for sanity-checking
   the catalogue and for "supply only" quotes.
   ========================================================================= */
/* =========================================================================
   MODULE: quote-builder.js  (was materials-only)
   A single editable quote of mixed line items. Each line has a `kind`:
     - "material" → priced from the Materials catalogue (or a fixed/file rate)
     - "labour"   → priced from the LabourRates card (or a fixed rate)
     - "element"  → a free-text job/trade/allowance with the rate you type
   Everything sums into ONE total, grouped by kind, so a client gets a single
   quote covering material + labour + trades, not three separate ones.
   ========================================================================= */
import { Materials } from "../data/materials.js";
import { LabourRates } from "../data/labour.js";
import { Allocation } from "./allocation.js";
import { round } from "../lib/format.js";

export const MaterialsOnly = {
  rateFor(item, region) {
    if (item.kind === "labour" && item.labourId) return LabourRates.rate(item.labourId, region);
    if ((item.kind === "material" || !item.kind) && item.materialId) return Materials.rate(item.materialId, region);
    return null;
  },
  catalogLabel(item) {
    if (item.kind === "labour" && item.labourId) return LabourRates.get(item.labourId)?.label;
    if (item.materialId) return Materials.get(item.materialId)?.label;
    return null;
  },
  catalogUnit(item) {
    if (item.kind === "labour" && item.labourId) return LabourRates.get(item.labourId)?.unit;
    if (item.materialId) return Materials.get(item.materialId)?.unit;
    return "";
  },

  buildEstimate(matSpec, region) {
    const lines = [];
    for (const item of (matSpec.lines || [])) {
      const kind = item.kind || "material";
      const qty = +item.qty || 0;
      const catLabel = this.catalogLabel(item);
      const catUnit = this.catalogUnit(item);
      const catRate = this.rateFor(item, region);
      const materialId = kind === "material" ? (item.materialId || null) : null;

      // ---- LABOUR: workers × hours × hourly rate ----
      if (kind === "labour") {
        const workers = +item.workers || 1;
        const hours = +item.hours || 0;
        const hourly = item.fixedRate != null && isFinite(item.fixedRate) ? +item.fixedRate : (catRate || 0);
        const total = workers * hours * hourly;
        lines.push({
          kind: "labour", materialId: null, labourId: item.labourId || null,
          category: "labour",
          label: item.label || catLabel || "Labour",
          workers, hours, unit: "hr",
          rate: round(hourly, 2),
          qty: round(workers * hours, 2),  // total man-hours, for display
          total: round(total, 2),
          priceSource: item.fixedRate != null ? "manual" : "catalogue",
          needsPrice: hourly <= 0, alloc: null,
        });
        continue;
      }

      // pricing priority: file total → fixed rate → catalogue rate
      let rate = null, total = null, priceSource = "";
      if (item.fixedTotal != null && isFinite(item.fixedTotal)) {
        total = item.fixedTotal;
        rate = item.fixedRate != null ? item.fixedRate : (qty ? item.fixedTotal / qty : null);
        priceSource = "file";
      } else if (item.fixedRate != null && isFinite(item.fixedRate)) {
        rate = item.fixedRate; total = item.fixedRate * qty; priceSource = "manual";
      } else if (catRate != null && qty > 0) {
        rate = catRate; total = catRate * qty; priceSource = "catalogue";
      }

      const needsPrice = total == null;
      lines.push({
        kind, materialId,
        labourId: null,
        category: kind === "element" ? "trades & elements" : (item.materialId ? Materials.get(item.materialId)?.category : "materials"),
        label: item.label || catLabel || (kind === "element" ? "Item" : "Material"),
        unit: item.unit || catUnit || "",
        qty: qty || null,
        rate: rate != null ? round(rate, 2) : null,
        total: total != null ? round(total, 2) : 0,
        priceSource, needsPrice,
        alloc: materialId && qty > 0 ? Allocation.forMaterial(materialId, qty) : null,
      });
    }
    const total = lines.reduce((a, l) => a + (l.total || 0), 0);
    const byKind = { material: 0, labour: 0, element: 0 };
    for (const l of lines) byKind[l.kind] = (byKind[l.kind] || 0) + (l.total || 0);
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    return { mode: "materials", region, spec: matSpec, lines, materialsTotal: total, total, byKind, taxRate, taxLabel };
  },
};
