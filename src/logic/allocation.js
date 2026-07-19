/* =========================================================================
   MODULE: allocation.js
   Purchase rules — the domain IP that turns an estimated quantity into a
   buyable order. Each rule: estimateUnit -> purchaseUnit, conversion factor,
   and a waste allowance trades actually add for cuts/breakage.
   ========================================================================= */
export const Allocation = {
  /* keyed by catalogue material id */
  rules: {
    brick_veneer:    { buyUnit: "bricks", perEstimateUnit: 50, waste: 0.07, note: "~50 std bricks per m²" },
    concrete_25mpa:  { buyUnit: "m³ (ordered)", perEstimateUnit: 1, waste: 0.05, note: "Order in 0.2 m³ increments" },
    timber_mgp10:    { buyUnit: "lengths (5.4m)", perEstimateUnit: 1 / 5.4, waste: 0.10, note: "Sold in set lengths" },
    plasterboard:    { buyUnit: "sheets (1.2×2.4)", perEstimateUnit: 1 / 2.88, waste: 0.10, note: "2.88 m² per sheet" },
    floor_tile:      { buyUnit: "m² (boxes)", perEstimateUnit: 1, waste: 0.10, note: "Add 10% for cuts" },
    bath_wall_tile:  { buyUnit: "m² (boxes)", perEstimateUnit: 1, waste: 0.12, note: "Add 12% for cuts" },
    colorbond_sheet: { buyUnit: "m² (custom cut)", perEstimateUnit: 1, waste: 0.08, note: "Cut to length" },
    paint:           { buyUnit: "litres", perEstimateUnit: 1 / 6, waste: 0.05, note: "~6 m²/L per coat" },
    wall_insulation: { buyUnit: "m² (batts)", perEstimateUnit: 1, waste: 0.05, note: "Batt packs" },
    guttering:       { buyUnit: "lengths", perEstimateUnit: 1, waste: 0.05, note: "Sold per lin.m" },
  },
  /* Apply purchase rule to a matched line; returns enriched order info or null. */
  forMaterial(matId, estimateQty) {
    const r = this.rules[matId];
    if (!r) return null;
    const withWaste = estimateQty * (1 + r.waste);
    const orderQty = Math.ceil(withWaste * r.perEstimateUnit);
    return { buyUnit: r.buyUnit, orderQty, wastePct: r.waste, note: r.note };
  },
};
