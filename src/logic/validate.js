/* =========================================================================
   MODULE: validate.js  — input sanitisation & validation layer
   One place that every external input passes through. Three jobs:
     1. sanitise()      — coerce a value to a safe number in a sane range
     2. checkColumns()  — verify a spreadsheet mapping, return structured issues
     3. detectUnits()   — spot feet/inches vs metres and convert/flag
   Returns STRUCTURED results ({ level, code, message, fix }) so the UI can
   show notices and offer fixes, rather than throwing or silently coercing.
   ========================================================================= */
export const Validate = {
  /* Coerce anything to a finite number, clamped to [min,max]. Returns
     { value, changed, reason } so callers can warn if a value was altered. */
  sanitiseNumber(raw, { min = 0, max = Infinity, fallback = 0 } = {}) {
    let n = typeof raw === "number" ? raw : parseFloat(String(raw == null ? "" : raw).replace(/[^0-9.\-]/g, ""));
    if (!isFinite(n)) return { value: fallback, changed: true, reason: "not a number" };
    if (n < min) return { value: min, changed: true, reason: `below minimum (${min})` };
    if (n > max) return { value: max, changed: true, reason: `above maximum (${max})` };
    return { value: n, changed: false, reason: null };
  },

  /* Validate a detected spreadsheet column mapping. Returns an array of
     structured issues; empty array = all good. */
  checkColumns(mapping, headerRow) {
    const issues = [];
    if (!mapping || mapping.material < 0) {
      issues.push({ level: "error", code: "NO_MATERIAL_COL", message: "No description/material column was detected.", fix: "Pick which column holds the item description in the mapping step." });
    }
    const hasPrice = mapping && (mapping.rate >= 0 || mapping.total >= 0);
    const hasQty = mapping && mapping.quantity >= 0;
    if (!hasPrice && !hasQty) {
      issues.push({ level: "warn", code: "NO_PRICE_OR_QTY", message: "No Rate, Total, or Quantity column found — lines will need prices added by hand.", fix: "Map a Rate or Total column, or fill prices in the editable preview." });
    } else if (!hasPrice) {
      issues.push({ level: "info", code: "NO_PRICE_COL", message: "No Rate or Total column — catalogue rates will be used where a material is recognised.", fix: "Map a Rate or Total column to use your own prices." });
    }
    return issues;
  },

  /* Heuristic unit detection on a column of numbers. If values look like feet
     (lots of values with inch-fractions, or a header mentioning ft/inch),
     flag it. Returns { unit, convertToM, note } or null. */
  detectLengthUnit(headerText, sampleValues) {
    const h = String(headerText || "").toLowerCase();
    if (/\b(ft|feet|foot|inch|in\b|")/.test(h)) {
      return { unit: "ft", convertToM: 0.3048, note: "Header suggests feet/inches — converting to metres." };
    }
    if (/\b(mm|millim)/.test(h)) return { unit: "mm", convertToM: 0.001, note: "Header suggests millimetres — converting to metres." };
    if (/\b(cm|centim)/.test(h)) return { unit: "cm", convertToM: 0.01, note: "Header suggests centimetres — converting to metres." };
    return null; // assume metres (the app default)
  },

  /* Validate a parametric spec before estimating. Returns structured issues
     and a sanitised copy of the spec (numbers clamped to sane ranges). */
  checkSpec(spec) {
    const issues = [];
    const ranges = {
      widthM: [0, 200], lengthM: [0, 200], floors: [1, 8], wallHeightM: [2, 6],
      roofPitch: [0, 60], slabThicknessM: [0.05, 0.5],
    };
    const clean = { ...spec };
    for (const [key, [min, max]] of Object.entries(ranges)) {
      if (spec[key] == null) continue;
      const r = this.sanitiseNumber(spec[key], { min, max, fallback: min });
      clean[key] = r.value;
      if (r.changed) issues.push({ level: "warn", code: "CLAMP_" + key.toUpperCase(), message: `${key} was ${r.reason}; adjusted to ${r.value}.`, fix: null });
    }
    return { issues, clean };
  },
};
