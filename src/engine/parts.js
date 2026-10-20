/* =========================================================================
   MODULE: parts.js
   The editable-parts catalogue: what each kind of piece can be swapped to.

   Every mesh the house builder makes carries userData.part:
     { id, kind, cat, label, group?, groupLabel? }
   - id     stable for the same spec (build order + position), so saved edits
            land on the same piece after a rebuild
   - kind   what it is ("stud", "lintel", "door-front", "benchtop", ...)
   - cat    which catalogue below it swaps within
   - group  the assembly it belongs to (one cabinet, one window) so a click
            can widen from "this drawer front" to "the whole cabinet"

   Edits are { [partId]: { preset?, color? } } — saved on the spec as
   spec.partEdits and re-applied after every rebuild.
   ========================================================================= */
import * as THREE from "three";

/* preset: { id, label, color, roughness, metalness } — colour is the
   preset's default; a colour edit overrides it but keeps the finish. */
export const CATALOGUE = {
  framing: {
    label: "Framing timber",
    presets: [
      { id: "mgp10", label: "Treated pine MGP10", color: 0xd8c9a6, roughness: 0.75 },
      { id: "h2f", label: "H2 blue pine", color: 0xb9c4c9, roughness: 0.75 },
      { id: "hardwood", label: "Hardwood F17", color: 0x8b5a3c, roughness: 0.7 },
      { id: "lvl", label: "LVL beam", color: 0xc9a46a, roughness: 0.6 },
      { id: "steel", label: "Steel (galv.)", color: 0x9aa4b0, roughness: 0.45, metalness: 0.6 },
    ],
  },
  cabinet: {
    label: "Cabinet finish",
    presets: [
      { id: "2pac", label: "2-pac polyurethane", color: 0xf3f1ec, roughness: 0.35 },
      { id: "laminate", label: "Laminate", color: 0xe9e6df, roughness: 0.55 },
      { id: "oak", label: "Oak veneer", color: 0xb48a5a, roughness: 0.6 },
      { id: "walnut", label: "Walnut veneer", color: 0x5b3e2b, roughness: 0.55 },
      { id: "melamine", label: "Melamine", color: 0xf7f7f5, roughness: 0.65 },
    ],
    swatches: [0xf3f1ec, 0x2b2f33, 0x5c6b5a, 0x2f4357, 0xc9b79c, 0x8f8a83, 0xb48a5a, 0x7a1f2b],
  },
  carcass: {
    label: "Carcass board",
    presets: [
      { id: "whiteboard", label: "White melamine", color: 0xf4f4f1, roughness: 0.7 },
      { id: "greyboard", label: "Grey melamine", color: 0x9a9c9b, roughness: 0.7 },
      { id: "ply", label: "Birch ply", color: 0xd9c19a, roughness: 0.65 },
    ],
  },
  benchtop: {
    label: "Benchtop",
    presets: [
      { id: "stone", label: "Engineered stone", color: 0xe8e6e1, roughness: 0.18 },
      { id: "granite", label: "Granite", color: 0x3a3a3c, roughness: 0.15 },
      { id: "marble", label: "Marble", color: 0xf1efea, roughness: 0.12 },
      { id: "laminate", label: "Laminate", color: 0xd8d2c6, roughness: 0.45 },
      { id: "timber", label: "Blackbutt timber", color: 0xc49a6c, roughness: 0.5 },
      { id: "stainless", label: "Stainless steel", color: 0xc7cacc, roughness: 0.25, metalness: 0.9 },
    ],
    swatches: [0xe8e6e1, 0xf1efea, 0x3a3a3c, 0x8f8a83, 0xc49a6c, 0x1d1f21],
  },
  handle: {
    label: "Handle",
    presets: [
      { id: "nickel", label: "Brushed nickel", color: 0xb9bcbd, roughness: 0.3, metalness: 0.9 },
      { id: "black", label: "Matte black", color: 0x1d1f21, roughness: 0.5, metalness: 0.4 },
      { id: "brass", label: "Brushed brass", color: 0xb8933f, roughness: 0.3, metalness: 0.9 },
    ],
  },
  splashback: {
    label: "Splashback",
    presets: [
      { id: "tile", label: "Gloss subway tile", color: 0xf2f2ef, roughness: 0.15 },
      { id: "glass", label: "Coloured glass", color: 0x9fb8b3, roughness: 0.05, metalness: 0.1 },
      { id: "stone", label: "Stone slab", color: 0xe8e6e1, roughness: 0.18 },
    ],
    swatches: [0xf2f2ef, 0x9fb8b3, 0x2f4357, 0xd9c7a7, 0x1d1f21],
  },
  wall: {
    label: "Wall lining",
    presets: [
      { id: "plaster", label: "Plasterboard, painted", color: 0xf1ede5, roughness: 0.92 },
      { id: "vj", label: "VJ panelling", color: 0xeceae3, roughness: 0.8 },
    ],
    swatches: [0xf1ede5, 0xe4e0d6, 0xcfd6d0, 0xd9cfc0, 0xb8c4cc, 0x8e9a8a],
  },
  cladding: { label: "Cladding", presets: [], swatches: [0xa4553a, 0xc9b79c, 0xe9e6df, 0x6e6a64, 0x3c4146] },
  roofing: { label: "Roofing", presets: [], swatches: [0x2f3a45, 0x6e7378, 0xe1e1dc, 0x4b5a49, 0x7a3a2a] },
  flooring: {
    label: "Flooring",
    presets: [
      { id: "tile", label: "Porcelain tile", color: 0xd9d5cb, roughness: 0.35 },
      { id: "carpet", label: "Carpet", color: 0x9d9189, roughness: 1 },
      { id: "polished", label: "Polished concrete", color: 0xb8b4ad, roughness: 0.3 },
      { id: "particle", label: "Particleboard flooring", color: 0xc8b48c, roughness: 0.85 },
    ],
  },
  door: {
    label: "Door",
    presets: [
      { id: "painted", label: "Painted", color: 0xf1ede5, roughness: 0.5 },
      { id: "oak", label: "Oak", color: 0xb48a5a, roughness: 0.55 },
      { id: "merbau", label: "Merbau", color: 0x4a3424, roughness: 0.55 },
    ],
    swatches: [0x4a3424, 0x1d1f21, 0x2f4357, 0xf1ede5, 0x5c6b5a],
  },
  frame: { label: "Window / door frame", presets: [], swatches: [0x2b2f33, 0xf2f2ef, 0x8f8a83, 0x5b3e2b] },
  stair: {
    label: "Stair",
    presets: [
      { id: "timber", label: "Spotted gum", color: 0x9c6b3f, roughness: 0.6 },
      { id: "concrete", label: "Concrete", color: 0xb8b4ad, roughness: 0.9 },
      { id: "steel", label: "Steel", color: 0x8a9099, roughness: 0.4, metalness: 0.6 },
    ],
  },
  concrete: { label: "Concrete", presets: [], swatches: [] },
  solar: { label: "Solar", presets: [], swatches: [] },
  trim: { label: "Trim", presets: [], swatches: [0xf2f2ef, 0x2b2f33, 0x8f8a83] },
};

/* Plural, human names for "select every ___". */
export const KIND_PLURAL = {
  stud: "studs", "jamb-stud": "jamb studs", "jack-stud": "jack studs", cripple: "cripple studs",
  "bottom-plate": "bottom plates", "top-plate": "top plates", nogging: "noggings", lintel: "lintels",
  "sill-trimmer": "sill trimmers", joist: "floor joists", rafter: "rafters", "ceiling-joist": "ceiling joists",
  "door-front": "cabinet doors", "drawer-front": "drawer fronts", handle: "handles", carcass: "carcasses",
  kickboard: "kickboards", benchtop: "benchtops", "wall-cabinet-door": "overhead doors", "internal-wall": "internal walls",
  cladding: "cladding panels", "roof-sheet": "roof sheets", floor: "floors", tread: "stair treads",
};

const matCache = new Map();
/* One shared material per (preset, colour) so a hundred re-coloured studs
   are one material, not a hundred. */
export function materialFor(cat, edit, base) {
  const preset = CATALOGUE[cat]?.presets.find((p) => p.id === edit.preset);
  const key = `${cat}|${edit.preset || ""}|${edit.color ?? ""}|${base?.uuid || ""}`;
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (preset) {
    m = new THREE.MeshStandardMaterial({
      color: edit.color ?? preset.color, roughness: preset.roughness ?? 0.7, metalness: preset.metalness ?? 0,
    });
  } else {
    // colour-only edit: keep the original finish (texture, roughness), tint it
    m = base.clone();
    if (edit.color != null) m.color = new THREE.Color(edit.color);
  }
  matCache.set(key, m);
  return m;
}

export const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, "0")}`;
