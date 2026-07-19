/* =========================================================================
   MODULE: design/system.js — BuildYourOwn Design System
   Single source of truth, in this fixed order:
     Colors → Typography → Spacing → Radius → Elevation → Motion → Icons
     → Components → Charts → Forms → Tables → 3D Objects
   Every value below was extracted from the running app (App.jsx, engine3D.js)
   — this is a consolidation of what already exists, not a new invented look.
   `App.jsx`'s TOKENS object equals DesignSystem.colors, so nothing broke when
   this file was introduced; existing `TOKENS.ink` etc. call sites are unchanged.
   ========================================================================= */

/* -------------------------------------------------------------------------
   1. COLORS — the "blueprint" palette: light paper/ink neutrals, a hi-vis
   safety-yellow primary accent, and an ember-orange secondary accent that
   bridges the hero's 3D shader into flat UI. Flat, bordered surfaces over
   shadowed ones — see Elevation.
   ------------------------------------------------------------------------- */
export const colors = {
  // Surfaces
  paper: "#EDEEF0",        // page background
  paperLight: "#F6F7F8",   // input/inset background
  card: "#FFFFFF",         // raised surface (cards, popovers)
  // Ink (text & structure)
  ink: "#14171A",          // primary text, active states, borders-on-dark
  inkSoft: "#3B414A",      // secondary text
  steel: "#6B7279",        // tertiary text, mid-tone rules — also engine3D's grid-line color
  rule: "#D5D8DC",         // hairline borders/dividers
  // Primary accent — hi-vis safety yellow (workflow highlight, primary CTA, active states)
  hivis: "#F5C518",
  hivisDeep: "#D9AC00",    // hover/active variant of hivis
  // Secondary accent — ember orange (hero warmth, bridges the 3D background shader to flat UI)
  ember: "#F58E1A",
  emberDeep: "#D96E0A",
  // Semantic
  alert: "#C8480E",        // destructive actions, error states
  ok: "#3A7D44",           // success states
  // Decorative
  grid: "rgba(20,23,26,0.045)", // faint blueprint grid overlay (.ec-paper)
};

/* -------------------------------------------------------------------------
   2. TYPOGRAPHY — three roles, no more. Display carries personality
   (condensed, confident, uppercase-leaning); body is plain system-adjacent
   Inter; mono is used liberally for anything numeric or structural (labels,
   data, tags) — a quantity-surveyor register that matches the subject matter.
   ------------------------------------------------------------------------- */
export const typography = {
  fontUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap",
  roles: {
    display: { family: "'Barlow Condensed', sans-serif", weight: 700, letterSpacing: "0.01em", className: "ec-display", use: "Headings, hero type, section titles" },
    body: { family: "Inter, sans-serif", weight: 400, use: "Default body copy (no dedicated class — the unstyled default)" },
    mono: { family: "'JetBrains Mono', monospace", weight: 400, featureSettings: '"tnum"', className: "ec-mono", use: "Data, quantities, tags, form inputs, timestamps — tabular figures on" },
  },
  eyebrow: { className: "ec-eyebrow", family: "mono", size: 10, letterSpacing: "0.18em", transform: "uppercase", color: "steel" },
  // Observed scale (px) — display sizes cluster at these stops across hero/section/card headings
  scale: { xs: 9, sm: 10, base: 11, md: 12, lg: 13, xl: 14, "2xl": 16, "3xl": 18, "4xl": 20, "5xl": 22, "6xl": 28, "7xl": 30, "8xl": 34, hero: "clamp(30px, 4.5vw, 48px)" },
};

/* -------------------------------------------------------------------------
   3. SPACING — an organic (not strict 4/8pt) scale, hand-tuned across a
   dense data-heavy UI. These are the stops that already recur most often in
   the app; treat them as the sanctioned set for new work rather than
   picking arbitrary pixel values.
   ------------------------------------------------------------------------- */
export const spacing = {
  0: 0, 1: 4, 2: 6, 3: 8, 4: 10, 5: 12, 6: 14, 7: 16,
  8: 20, 9: 24, 10: 28, 11: 32, 12: 40, 13: 48, 14: 64, 15: 72,
};

/* -------------------------------------------------------------------------
   4. RADIUS — mostly sharp (0–4px), matching the blueprint/technical-drawing
   feel of tables and cards. Pills for status dots/tags/CTAs. One signature
   asymmetric treatment for hero cards.
   ------------------------------------------------------------------------- */
export const radius = {
  none: 0,        // tables, dashed rules
  sm: 2,          // tags, small controls, delete buttons
  md: 3,          // chart bars
  lg: 4,          // cards, dropzones, viewport chrome
  xl: 6,          // misc rounded panels
  pill: "50%",    // status dots
  full: 100,      // pill badges/buttons
  signature: "4px 28px 4px 28px", // hero/feature cards — one sharp pair of corners, one swept
};

/* -------------------------------------------------------------------------
   5. ELEVATION — mostly flat. Cards are distinguished by a 1px border
   (`--rule`) that darkens to `--ink` on hover, not by shadow — shadows are
   reserved for two specific moments: a hover "lift" on interactive cards,
   and an ember glow on the primary hero CTA.
   ------------------------------------------------------------------------- */
export const elevation = {
  flat: "none",                                             // default card state — border only
  lift: "0 18px 40px rgba(15,17,20,0.18)",                   // card hover, light surfaces
  liftOnDark: "0 18px 40px rgba(0,0,0,0.45)",                // card hover, on the dark hero
  glow: "0 10px 30px -10px rgba(245,142,26,0.6)",            // primary CTA resting (ember)
  glowHover: "0 14px 36px -8px rgba(245,142,26,0.7)",        // primary CTA hover (ember)
};

/* -------------------------------------------------------------------------
   6. MOTION — one signature ease for orchestrated/entrance motion, fast
   linear-ish easing for micro-interactions. Keep new motion on these tokens
   rather than picking a new curve per component.
   ------------------------------------------------------------------------- */
export const motion = {
  ease: {
    signature: "cubic-bezier(0.16, 1, 0.3, 1)",  // entrances, reveals, fades — the app's one signature curve
    swift: "cubic-bezier(0.22, 1, 0.36, 1)",     // snappy data transitions (chart bar fills)
    standard: "ease",
  },
  duration: {
    instant: "0.15s",   // input focus/hover
    fast: "0.18s",      // button/card hover, tab switches
    base: "0.2s",       // panel/menu transitions
    slow: "0.9s",       // page-load entrance (fade-in-up/down)
  },
  hover: {
    liftCard: { y: -8 },     // feature/preset cards
    liftButton: { y: -2 },   // stepper buttons, small controls
  },
  stagger: 0.06,          // StaggerReveal default per-item delay
};

/* -------------------------------------------------------------------------
   7. ICONS — inline SVG, no icon font/library. One consistent stroke system;
   the BYO logo is the one bespoke (non-stroke) mark.
   ------------------------------------------------------------------------- */
export const icons = {
  system: "inline SVG, hand-drawn per use, plus a centralised construction-domain set",
  file: "design/icons.jsx — <Icon name=\"electrical\" /> or <Icon name=\"workflow.three_d\" />",
  viewBox: "0 0 24 24",
  stroke: { width: { default: 2, bold: 2.5 }, linecap: "round", linejoin: "round", fill: "none", color: "currentColor" },
  sizes: [12, 14, 16, 18, 20],
  logo: { component: "BYOLogo", viewBox: "0 0 48 48", note: "bespoke mark, not part of the stroke-icon set" },
  registries: {
    workflow: "7 — one per WorkflowStepper stage (estimate, three_d, materials, timeline, ai, quote, proposal); wired into WorkflowStepper",
    trade: "14 — matches estimator.js humaniseTradeName keys (siteworks, concrete, frame, roof, brick, electrical, plumbing, hvac, plaster, paint, tile, joinery, kitchen_bath_fit, finishes); not yet wired into TakeoffTable — labourCosts() would need to return the raw trade key alongside the humanised label",
    equip: "7 — matches data/equipment.js catalogue ids (excavator_5t, scaffold_perimeter, formwork_hire, mobile_crane, skip_bin_general, site_fencing, material_hoist); not yet wired into the Equipment table",
  },
};

/* -------------------------------------------------------------------------
   8. COMPONENTS — the shared building blocks already in App.jsx, catalogued
   here so their contract is discoverable in one place. (Registry, not a
   reimplementation — see each component's JSDoc/definition for props.)
   ------------------------------------------------------------------------- */
export const components = {
  SectionHeader: "Numbered/lettered section title with a trailing rule — used across every results tab",
  InputCard: "Bordered `.ec-card` wrapper for a config section, with title, optional badge, optional clear action",
  Field: "Label + control wrapper (`.ec-label` + child input/select)",
  InputRow: "Two-up grid layout for a pair of Fields",
  SliderField: "Labelled range input with live value readout, hivisDeep accent thumb",
  CostCard: "Headline stat tile (label, value, optional sub-line, optional hivis emphasis)",
  WorkflowStepper: "The 1–7 stage pills (Estimate → 3D → Materials → Timeline → AI → Quote → Proposal); pinned to the sticky topbar",
  StaggerReveal: "Framer-motion wrapper applying `motion.stagger` to a list of children on mount/scroll",
  Reveal: "Single-element entrance wrapper (slide/fade variants) using `motion.ease.signature`",
  BYOLogo: "Bespoke SVG wordmark icon (see Icons)",
};

/* -------------------------------------------------------------------------
   9. CHARTS — CostBar / CostBreakdown (Estimate tab): single-hue horizontal
   bar charts, sorted descending, value+% always shown as text (never
   color-only), hivisDeep end-cap, hover promotes a bar to full ink.
   ------------------------------------------------------------------------- */
export const charts = {
  CostBreakdown: {
    component: "CostBreakdown",
    primitive: "CostBar",
    rule: "One hue per chart (inkSoft for cost build-up, steel for materials-by-category) — never a rainbow palette across categories",
    fill: { transition: `width ${"260ms"} ${motion.ease.swift}, background ${motion.duration.instant} ${motion.ease.standard}` },
    endCap: "2px solid hivisDeep",
    radius: radius.md,
  },
};

/* -------------------------------------------------------------------------
   10. FORMS — `.ec-input` / `.ec-select` / `.ec-btn` family (defined in
   App.jsx's global <style> block, driven by the CSS custom properties in
   Colors/Typography above).
   ------------------------------------------------------------------------- */
export const forms = {
  input: { className: "ec-input", background: "paperLight", border: "1px solid rule", font: "mono 13px", focus: "border-color → ink, background → card" },
  select: { className: "ec-select", sharesStylesWith: "ec-input" },
  label: { className: "ec-label", font: "mono 10px", letterSpacing: "0.14em", transform: "uppercase", color: "inkSoft" },
  button: {
    base: { className: "ec-btn", background: "ink", color: "paper", font: "display 14px uppercase" },
    hivis: { className: "ec-btn-hivis", background: "hivis → hivisDeep on hover", use: "primary action" },
    ghost: { className: "ec-btn-ghost", background: "transparent, 1px ink border", use: "secondary action" },
  },
};

/* -------------------------------------------------------------------------
   11. TABLES — TakeoffTable: mono grid rows (ITEM / QTY / RATE / TOTAL),
   dashed row dividers, uppercase mono column headers in `steel`.
   ------------------------------------------------------------------------- */
export const tables = {
  TakeoffTable: {
    component: "TakeoffTable",
    columns: "1fr 100px 100px 110px",
    header: { font: "mono 10px", letterSpacing: "0.14em", color: "steel", border: "1px solid rule" },
    row: { border: "1px dashed rule", totalWeight: 500 },
    footerTotal: { border: "2px solid ink", weight: 700 },
  },
};

/* -------------------------------------------------------------------------
   12. 3D OBJECTS — Engine3D (three.js) conventions: exposed structural-steel
   skeleton aesthetic, consistent lighting rig and material presets across
   residential, tower, and quote-massing builds.
   ------------------------------------------------------------------------- */
export const threeD = {
  scene: { background: "0xe8eaec", fog: "0xe8eaec, near 50, far 140" },
  lighting: {
    hemisphere: "0xdfeeff / 0xb9a98a @ 0.55",
    ambient: "0xffffff @ 0.25",
    directionalKey: "0xfff4d6 @ 1.05, castShadow",
    directionalFill: "0xcfe0ff @ 0.25",
  },
  ground: { color: "0xc4bfae", roughness: 1.0, gridHelper: "steel (0x6b7279) / rule (0xc9ccd0) — same steel token as Colors" },
  materialPresets: {
    structuralSteel: { metalness: 0.35, roughness: 0.6, note: "frame members" },
    masonryConcrete: { metalness: 0, roughness: 0.9 },
    slab: { metalness: 0, roughness: 0.9 },
  },
  shadowRule: "castShadow on all structural/envelope meshes; receiveShadow on ground + slabs",
  buildModes: {
    residential: "buildFromSpec(spec) — full parametric massing with construction-progress playback",
    highrise: "buildTower(hrSpec) — extruded floor-plate tower",
    materials: "buildFromSpec(specFromQuoteLines(lines)) when items exist, else buildMassing([]) — quote line-items are inferred into a real building spec (see logic/estimator.js inferSpecFromImport), not abstract blocks",
  },
};

/* Ordered export — iterate Object.entries(DesignSystem) to walk the system
   in the canonical Colors → … → 3D Objects order. */
export const DesignSystem = {
  colors, typography, spacing, radius, elevation, motion, icons,
  components, charts, forms, tables, threeD,
};

export default DesignSystem;
