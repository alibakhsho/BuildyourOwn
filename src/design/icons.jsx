/* =========================================================================
   MODULE: design/icons.jsx — BuildYourOwn icon set
   Hand-built inline SVG, following the exact spec catalogued in
   design/system.js §7 Icons: 24×24 viewBox, currentColor stroke, round
   caps/joins, stroke-width 2 (2.5 for emphasis). No icon font, no external
   library — same approach the app's existing icons (Save/share, Walk
   through, etc.) already use, just centralised and named so new ones don't
   drift from the convention or get redrawn ad hoc per callsite.

   Usage:
     import { Icon } from "./design/icons.jsx";
     <Icon name="electrical" size={16} />
     <Icon name="workflow.three_d" size={18} strokeWidth={2.5} color={TOKENS.hivis} />
   ========================================================================= */
import React from "react";

const base = (strokeWidth) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

/* ---- Workflow stages (Estimate → 3D → Materials → Timeline → AI → Quote → Proposal) ---- */
const Workflow = {
  estimate: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="7" y1="7.5" x2="17" y2="7.5" />
      <circle cx="8" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  three_d: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" />
      <polyline points="4,7.5 12,12 20,7.5" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </svg>
  ),
  materials: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <polygon points="12,4 21,9 12,14 3,9" />
      <polyline points="3,13 12,18 21,13" />
      <polyline points="3,17 12,21.5 21,17" />
    </svg>
  ),
  timeline: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="4" y1="6" x2="14" y2="6" />
      <line x1="4" y1="12" x2="19" y2="12" />
      <line x1="4" y1="18" x2="10" y2="18" />
      <circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  ai: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z" />
      <circle cx="19" cy="5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  ),
  quote: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <polyline points="15,3 15,7 19,7" />
      <line x1="7.5" y1="12" x2="16" y2="12" />
      <line x1="7.5" y1="15.5" x2="16" y2="15.5" />
      <line x1="7.5" y1="19" x2="12.5" y2="19" />
    </svg>
  ),
  proposal: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <polyline points="15,3 15,7 19,7" />
      <polyline points="8,14.5 10.5,17 16,11.5" />
    </svg>
  ),
};

/* ---- Trades (estimator.js humaniseTradeName keys) ---- */
const Trade = {
  siteworks: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="6" y1="19" x2="16" y2="9" />
      <path d="M14 7 L19 12 L16 15 L11 10 Z" />
      <line x1="4" y1="21" x2="8" y2="21" />
    </svg>
  ),
  concrete: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="8" y1="6" x2="8" y2="18" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <line x1="16" y1="6" x2="16" y2="18" />
    </svg>
  ),
  frame: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="5" y1="3" x2="5" y2="21" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="19" y1="3" x2="19" y2="21" />
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="17" x2="19" y2="17" />
    </svg>
  ),
  roof: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <polyline points="3,15 12,5 21,15" />
      <line x1="6" y1="15" x2="6" y2="20" />
      <line x1="18" y1="15" x2="18" y2="20" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </svg>
  ),
  brick: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="3.5" y="4" width="17" height="16" rx="1" />
      <line x1="3.5" y1="9.3" x2="20.5" y2="9.3" />
      <line x1="3.5" y1="14.7" x2="20.5" y2="14.7" />
      <line x1="9.5" y1="4" x2="9.5" y2="9.3" />
      <line x1="15.5" y1="4" x2="15.5" y2="9.3" />
      <line x1="12.5" y1="9.3" x2="12.5" y2="14.7" />
      <line x1="6.5" y1="14.7" x2="6.5" y2="20" />
      <line x1="17.5" y1="14.7" x2="17.5" y2="20" />
    </svg>
  ),
  electrical: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <polygon points="13,2 5,14 11,14 9,22 19,9 13,9" />
    </svg>
  ),
  plumbing: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="7" y1="21" x2="7" y2="13" />
      <path d="M7 13a5 5 0 0 1 5-5h5" />
      <circle cx="17" cy="8" r="2.4" />
      <line x1="4" y1="21" x2="10" y2="21" />
    </svg>
  ),
  hvac: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12 C12 8 10 6 12 3" />
      <path d="M12 12 C16 12 18 10 21 12" />
      <path d="M12 12 C12 16 14 18 12 21" />
      <path d="M12 12 C8 12 6 14 3 12" />
    </svg>
  ),
  plaster: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <polygon points="4,9 19,7 19,13 4,15" />
      <line x1="11" y1="10.5" x2="11" y2="6" />
      <rect x="9" y="3" width="4" height="3" rx="1" />
    </svg>
  ),
  paint: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="4" y="5" width="10" height="6" rx="1" />
      <line x1="14" y1="7" x2="18" y2="7" />
      <line x1="14" y1="9" x2="18" y2="9" />
      <path d="M18 6.5 h1.5 a1 1 0 0 1 1 1 v1 a1 1 0 0 1-1 1 H18 Z" />
      <line x1="6" y1="11" x2="6" y2="20" />
      <line x1="12" y1="11" x2="12" y2="15" />
      <line x1="6" y1="20" x2="12" y2="15" />
    </svg>
  ),
  tile: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="3.5" y="3.5" width="8" height="8" rx="0.6" />
      <rect x="12.5" y="3.5" width="8" height="8" rx="0.6" />
      <rect x="3.5" y="12.5" width="8" height="8" rx="0.6" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="0.6" />
    </svg>
  ),
  joinery: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="3" y="9" width="8" height="5" rx="2.3" />
      <polygon points="11,10 21,8.5 21,10.5 11,13" />
    </svg>
  ),
  kitchen_bath_fit: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M4 12 h16 a1 1 0 0 1-1 1 c0 4-3 6-7 6 s-7-2-7-6 a1 1 0 0 1-1-1 Z" />
      <path d="M9 12 V6 a2 2 0 0 1 4 0" />
      <line x1="9" y1="4" x2="15" y2="4" />
    </svg>
  ),
  finishes: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M15 3 L21 9 L11 19 L6 20 L7 15 Z" />
      <line x1="6" y1="20" x2="4" y2="22" />
    </svg>
  ),
};

/* ---- Equipment (data/equipment.js catalogue) ---- */
const Equip = {
  excavator_5t: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="2.5" y="17" width="12" height="3" rx="1" />
      <rect x="5" y="11" width="6.5" height="6" rx="0.8" />
      <line x1="11" y1="12.5" x2="18" y2="7" />
      <line x1="18" y1="7" x2="20" y2="13" />
      <polyline points="20,13 22.5,14.5 19.5,16.5" />
    </svg>
  ),
  scaffold_perimeter: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="4" y1="3" x2="4" y2="21" />
      <line x1="20" y1="3" x2="20" y2="21" />
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="4" y1="21" x2="20" y2="21" />
      <line x1="4" y1="8" x2="20" y2="15" />
    </svg>
  ),
  formwork_hire: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="4" y="4" width="16" height="16" rx="0.8" />
      <line x1="4" y1="4" x2="20" y2="20" />
      <line x1="20" y1="4" x2="4" y2="20" />
    </svg>
  ),
  mobile_crane: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="7" y1="21" x2="7" y2="4" />
      <line x1="7" y1="4" x2="21" y2="4" />
      <line x1="3.5" y1="6" x2="7" y2="4" />
      <line x1="16" y1="4" x2="16" y2="10" />
      <circle cx="16" cy="11" r="1.1" />
      <rect x="4" y="19" width="8" height="2.5" rx="0.6" />
    </svg>
  ),
  skip_bin_general: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M5 8 L19 8 L17 19 H7 Z" />
      <line x1="3.5" y1="8" x2="20.5" y2="8" />
      <line x1="8" y1="8" x2="8" y2="4" />
      <line x1="16" y1="8" x2="16" y2="4" />
    </svg>
  ),
  site_fencing: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="4" y1="6" x2="4" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="20" y1="6" x2="20" y2="20" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <line x1="4" y1="10" x2="12" y2="16" />
      <line x1="12" y1="10" x2="20" y2="16" />
    </svg>
  ),
  material_hoist: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="7" y1="21" x2="7" y2="3" />
      <line x1="11" y1="21" x2="11" y2="3" />
      <line x1="7" y1="7" x2="11" y2="7" />
      <line x1="7" y1="12" x2="11" y2="12" />
      <line x1="7" y1="17" x2="11" y2="17" />
      <rect x="13" y="10" width="6" height="4" rx="0.5" />
      <polyline points="16,3 13,7 19,7" />
      <line x1="16" y1="3" x2="16" y2="9" />
    </svg>
  ),
};

/* ---- AI crew specialists (persona ids in ai/personas.js) ---- */
const Persona = {
  construction: (p) => ( // hard hat
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M4 18h16" />
      <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M12 5.5V8" />
      <path d="M9.5 8h5" />
    </svg>
  ),
  estimating: (p) => ( // QS ruler
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="2.5" y="9" width="19" height="6" rx="1" />
      <line x1="7" y1="9" x2="7" y2="11.5" />
      <line x1="11" y1="9" x2="11" y2="12" />
      <line x1="15" y1="9" x2="15" y2="11.5" />
      <line x1="19" y1="9" x2="19" y2="12" />
    </svg>
  ),
  structural: (p) => ( // I-beam
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="6" y1="5" x2="18" y2="5" />
      <line x1="6" y1="19" x2="18" y2="19" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </svg>
  ),
  interior: (p) => ( // armchair
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <path d="M4 11a2 2 0 0 1 2 2v3h12v-3a2 2 0 0 1 2-2" />
      <line x1="6" y1="19" x2="6" y2="21" />
      <line x1="18" y1="19" x2="18" y2="21" />
    </svg>
  ),
  planner: (p) => ( // calendar + gantt
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <rect x="4" y="5" width="16" height="15" rx="1" />
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
      <line x1="7" y1="13" x2="13" y2="13" />
      <line x1="10" y1="16.5" x2="16" y2="16.5" />
    </svg>
  ),
  procurement: (p) => ( // shipping box
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M4 8h16v12H4z" />
      <path d="M4 8 L7 4 H17 L20 8" />
      <line x1="12" y1="8" x2="12" y2="20" />
    </svg>
  ),
};

/* ---- UI glyphs (tools + chat controls) ---- */
const Ui = {
  tools: (p) => ( // wrench
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  plus: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </svg>
  ),
  send: (p) => (
    <svg {...base(p.sw)} width={p.size} height={p.size}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9z" />
    </svg>
  ),
};

const REGISTRY = { workflow: Workflow, trade: Trade, equip: Equip, persona: Persona, ui: Ui };

/**
 * <Icon name="electrical" /> or <Icon name="workflow.three_d" />.
 * Unprefixed names resolve trade → equip in that order.
 */
export function Icon({ name, size = 16, strokeWidth = 2, color, style, ...rest }) {
  if (!name) return null;
  let group, key;
  if (name.includes(".")) [group, key] = name.split(".");
  else {
    key = name;
    group = Trade[key] ? "trade" : Equip[key] ? "equip" : Workflow[key] ? "workflow"
          : Persona[key] ? "persona" : Ui[key] ? "ui" : null;
  }
  const render = group && REGISTRY[group] && REGISTRY[group][key];
  if (!render) return null;
  return (
    <span style={{ display: "inline-flex", color, lineHeight: 0, ...style }} {...rest}>
      {render({ size, sw: strokeWidth })}
    </span>
  );
}

export const TradeIcons = Trade;
export const EquipIcons = Equip;
export const WorkflowIcons = Workflow;
export const PersonaIcons = Persona;
export const UiIcons = Ui;
export const ICON_NAMES = {
  workflow: Object.keys(Workflow),
  trade: Object.keys(Trade),
  equip: Object.keys(Equip),
  persona: Object.keys(Persona),
  ui: Object.keys(Ui),
};
