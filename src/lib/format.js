/* =========================================================================
   MODULE: format.js
   Shared numeric/string formatting helpers used across data, logic, and
   engine modules.
   ========================================================================= */
export function round(n, d = 2) { const f = Math.pow(10, d); return Math.round(n * f) / f; }
export function fmt(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
export function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + " " : s + " ".repeat(n - s.length); }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function currencySymbol(region) { return { AU: "A$", US: "$", UK: "£" }[region] || "$"; }
