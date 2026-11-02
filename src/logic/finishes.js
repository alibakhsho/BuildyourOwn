/* =========================================================================
   MODULE: finishes.js
   The finishes a homeowner can change from inside the 3D walkthrough:
   tiles, splashback, mirror, glass, benchtop, cabinetry, tapware, paint…

   Keyed by the member material (`m.mat` in logic/structure), so one choice
   recolours every piece of that material in the house. The first option of
   each finish is the standard look (no change to the material). Choices
   live on the spec as `spec.finishes = { [mat]: optionId }`.
   Pure data + lookups (no three.js) so the tests can check it.
   ========================================================================= */

const o = (id, name, color, extra = {}) => ({ id, name, color, ...extra });
const STD = (swatch, name = "Standard") => ({ id: "standard", name, swatch });

export const FINISHES = {
  floorTile: { label: "Floor tiles", options: [
    STD("#d9d5cb", "Warm grey porcelain"), o("white", "Matt white", 0xffffff), o("concrete", "Concrete look", 0xa9a8a4),
    o("charcoal", "Charcoal", 0x55575a), o("terracotta", "Terracotta", 0xd08a68), o("sage", "Sage", 0xb4c3ac)] },
  wallTile: { label: "Wall tiles", options: [
    STD("#f7f6f2", "Gloss white subway"), o("grey", "Pale grey", 0xd2d4d5), o("sage", "Sage green", 0xa9bea4),
    o("navy", "Navy", 0x3b4a66), o("blush", "Blush", 0xe8c9bd), o("black", "Gloss black", 0x2c2c2e, { roughness: 0.08 })] },
  splashback: { label: "Splashback", options: [
    STD("#f7f6f2", "Gloss white subway"), o("marble", "Marble look", 0xeeebe5, { roughness: 0.15 }), o("sage", "Sage glass", 0xa6c0ae, { roughness: 0.04 }),
    o("charcoal", "Charcoal", 0x3e4043), o("terracotta", "Terracotta", 0xc9805f), o("mirror", "Mirror", 0xd9e3ea, { metalness: 0.75, roughness: 0.06 })] },
  stone: { label: "Benchtop", options: [
    STD("#e9e7e2", "Pure white stone"), o("calacatta", "Calacatta", 0xf3f0ea), o("concrete", "Concrete", 0xa6a49f, { roughness: 0.5 }),
    o("black", "Black stone", 0x27282b), o("timber", "Timber", 0x9b6b43, { roughness: 0.5 })] },
  joinery: { label: "Cabinetry", options: [
    STD("#f2efe9", "White"), o("oak", "Warm oak", 0xb08a5e), o("sage", "Sage", 0x8fa38a), o("navy", "Navy", 0x2e3c55),
    o("charcoal", "Charcoal", 0x3b3c3e), o("black", "Matt black", 0x1d1e20, { roughness: 0.7 })] },
  mirror: { label: "Mirror", options: [
    STD("#d9e3ea", "Silver"), o("bronze", "Bronze", 0xb89470), o("smoke", "Smoked", 0x7c8287), o("gold", "Gold tint", 0xd8bc80)] },
  glass: { label: "Glass", options: [
    STD("#a9cde0", "Clear"), o("grey", "Grey tint", 0x6f7a84, { opacity: 0.48 }), o("bronze", "Bronze tint", 0x9c7f5f, { opacity: 0.45 }),
    o("frosted", "Frosted", 0xeef2f3, { opacity: 0.8, roughness: 0.6 }), o("lowe", "Low-E blue", 0x7fb0d6, { opacity: 0.38 })] },
  ceramic: { label: "Bath & toilet", options: [
    STD("#ffffff", "Gloss white"), o("matte-black", "Matt black", 0x222325, { roughness: 0.55 }), o("stone", "Stone grey", 0x9c9a95, { roughness: 0.4 }),
    o("sage", "Sage", 0xa9b8a0, { roughness: 0.35 })] },
  chrome: { label: "Tapware & sink", options: [
    STD("#e6e9ec", "Chrome"), o("nickel", "Brushed nickel", 0xb9b6ae, { roughness: 0.4 }), o("black", "Matt black", 0x1e1f21, { roughness: 0.55, metalness: 0.3 }),
    o("brass", "Brushed brass", 0xc9a46a, { roughness: 0.35 }), o("gunmetal", "Gunmetal", 0x55595e)] },
  floorTimber: { label: "Timber floor", options: [
    STD("#c49a6c", "Natural"), o("honey", "Honey", 0xf2d7a8), o("walnut", "Walnut", 0x9c7a5c), o("ebony", "Ebony", 0x5a4a3e), o("greywash", "Grey wash", 0xd0ccc8)] },
  carpet: { label: "Carpet", options: [
    STD("#b9b2a6", "Oatmeal"), o("charcoal", "Charcoal", 0x707072), o("beige", "Wool beige", 0xe0d4bd), o("slate", "Slate blue", 0x8794a6)] },
  plasterboard: { label: "Wall & ceiling paint", options: [
    STD("#f3f1ec", "White"), o("warm", "Warm white", 0xf2e9da), o("greige", "Greige", 0xd8d0c3), o("sage", "Sage", 0xc9d2c0),
    o("blue", "Dusty blue", 0xc6d1db), o("charcoal", "Charcoal", 0x5a5c5f)] },
  doorInt: { label: "Internal doors", options: [
    STD("#f5f3ee", "White"), o("oak", "Oak", 0xb08a5e), o("black", "Black", 0x232426)] },
  doorExt: { label: "Front door", options: [
    STD("#5a3a24", "Merbau"), o("black", "Black", 0x1f2022), o("oak", "Natural oak", 0xb08a5e), o("navy", "Navy", 0x26334a), o("red", "Heritage red", 0x7e2a24)] },
};

/* Swatch colour for an option, as CSS. */
export function swatchOf(opt) {
  if (!opt) return "#cccccc";
  if (opt.swatch) return opt.swatch;
  return "#" + (opt.color >>> 0).toString(16).padStart(6, "0");
}

/* The option chosen for a material (falls back to the standard look). */
export function finishOption(mat, id) {
  const f = FINISHES[mat];
  if (!f) return null;
  return f.options.find((x) => x.id === id) || f.options[0];
}

/* Material overrides for a choice: { color, opacity?, roughness?, metalness? },
   or null for the standard look / an unknown material. */
export function finishProps(mat, id) {
  const opt = finishOption(mat, id);
  if (!opt || opt.id === "standard") return null;
  const { color, opacity, roughness, metalness } = opt;
  return { color, opacity, roughness, metalness };
}

/* True when two specs differ only in their finishes — the 3D can then
   recolour in place instead of rebuilding (which would end a walkthrough). */
export function onlyFinishesChanged(prev, next) {
  if (!prev || !next || prev === next) return false;
  if (prev.finishes === next.finishes) return false;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) if (k !== "finishes" && prev[k] !== next[k]) return false;
  return true;
}
