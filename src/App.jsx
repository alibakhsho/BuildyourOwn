// Children/cloneElement went with StaggerReveal, their only consumer.
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { round, fmt, pad, currencySymbol } from "./lib/format.js";
import { nextId } from "./lib/ids.js";
import { Validate } from "./logic/validate.js";
import { LabourRates } from "./data/labour.js";
import { HighRiseMaterials } from "./data/highrise-materials.js";
import { Materials } from "./data/materials.js";
import { Allocation } from "./logic/allocation.js";
import { WallBuilder } from "./logic/wall-builder.js";
import { MaterialsOnly } from "./logic/materials-only.js";
import { Estimator, inferSpecFromImport } from "./logic/estimator.js";
import { HighRiseEstimator } from "./logic/highrise-estimator.js";
import { Engine3D } from "./engine/engine3D.js";
import { Equipment } from "./data/equipment.js";
import {
  getSuppliers, addSupplierOverride, removeSupplierOverride,
  hideSampleSupplier, resetSuppliersToSample,
  resolveEquipmentRate, setEquipmentRateOverride, clearEquipmentRateOverrides,
} from "./data/pricing-providers.js";
import { RESIDENTIAL_PRESETS } from "./presets/residential-presets.js";
import { HIGHRISE_PRESETS } from "./presets/highrise-presets.js";
import { motion, AnimatePresence } from "framer-motion";
import BackgroundScene from "./engine/BackgroundScene.jsx";
import { chat as aiChat } from "./ai/client.js";
import { listProjects, createProject, saveProject, deleteProject, duplicateProject, getProject } from "./state/projects.js";
import { track } from "./lib/analytics.js";
import { PERSONAS, buildSystemPrompt, summariseSpec, summariseEstimate, parseActions } from "./ai/personas.js";
import DesignSystem, { cssVariables } from "./design/system.js";
import { useTheme } from "./design/theme.js";
import { Badge } from "@/components/ui/badge";
import { Icon } from "./design/icons.jsx";
/* Shared UI primitives. These were inline in this file; they carry no domain
   knowledge, so they live in components/ui and are imported back here. */
import Reveal from "./components/ui/Reveal.jsx";
import StaggerReveal from "./components/ui/StaggerReveal.jsx";
import InputCard from "./components/ui/InputCard.jsx";
import InputRow from "./components/ui/InputRow.jsx";
import Field from "./components/ui/Field.jsx";
import Toggle from "./components/ui/Toggle.jsx";
import CostCard from "./components/ui/CostCard.jsx";
import SectionHeader from "./components/ui/SectionHeader.jsx";
import TakeoffTable from "./components/ui/TakeoffTable.jsx";
import BYOLogo from "./components/ui/BYOLogo.jsx";
import HowItWorksIcon from "./components/ui/HowItWorksIcon.jsx";
import { AccountButton, Onboarding } from "./components/AuthModal.jsx";
import AccountDashboard from "./components/AccountDashboard.jsx";
import Landing from "./components/Landing.jsx";
import { UpgradeModal, AiUpsell } from "./components/Plans.jsx";
import { useAuth } from "./state/auth.jsx";
import { MODE_LABEL, BUILD_MODE_IDS } from "./lib/entitlements.js";
import { buildMultiEstimate } from "./logic/multi-dwelling.js";
import { MultiDwellingPanel, MultiCostPlan, MultiProgramme, defaultMultiSpec, houseType } from "./modules/MultiDwelling.jsx";
import DescribeCard from "./components/DescribeCard.jsx";
import { houseSpecFromFeatures, cleanDeveloper } from "./logic/describe.js";
import { useCloudSync } from "./state/cloud-sync.js";
import ConstructionManager from "./modules/ConstructionManager.jsx";
import {
  updateJob as updateCmJob, listJobs as listCmJobs, createJob as createCmJob,
  applyEstimateToBudget, tradeTotalsFromEstimate,
} from "./state/cm.js";

/* Human-readable message for AI failures, shared by every AI feature */
const aiErrMsg = (e) => e?.message || "Couldn't reach the AI service — check your connection.";

const CARD_SHAPES = [
  { borderRadius: 6 },
  { clipPath: "polygon(10% 0, 90% 0, 100% 12%, 100% 88%, 90% 100%, 10% 100%, 0 88%, 0 12%)" },
  { borderRadius: "4px 28px 4px 28px" },
];

/* ---- Tax presentation -------------------------------------------------
   Estimates are computed EXCLUSIVE of tax; `estimate.total` is always the
   ex-tax figure. But the headline number a client sees has to be the one
   they will actually pay — in Australia the Consumer Law requires a single
   GST-inclusive total price, and showing "total + GST" makes the reader do
   the arithmetic themselves, which is exactly what they get wrong.

   So: display gross, and state the tax it already contains. The ex-tax
   figure still appears as its own line in the quote breakdown, because a
   builder reconciling against a supplier invoice needs it.                */
const taxOf   = (est) => (est?.total || 0) * (est?.taxRate || 0);
const grossOf = (est) => (est?.total || 0) + taxOf(est);
/* `taxLabel` already carries the rate ("GST (10%)"), which reads fine on the
   tax line itself but turns into "excl. GST (10%)" inside a qualifier. These
   give the bare name for those: "GST", "VAT", "Sales tax". */
const bareTax = (label) => String(label || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
const taxName = (est) => bareTax(est?.taxLabel);
/** "incl. A$64,075 GST" — the sub-line that sits under a gross total. */
const inclusiveNote = (est, currency) =>
  est?.taxRate > 0 ? `incl. ${currency}${fmt(taxOf(est))} ${est.taxLabel}` : "No tax applied";

/* How it works — same flying-card language as the toolkit, on a dark glass
   band so the ambient build/break scene shows through behind it. */
/* The order is the real workflow, and it now opens where the work actually
   starts — with whatever the client already has in their hand. */
const HOW_STEPS = [
  { n: "01", title: "Bring your takeoff", body: "Drop in a spreadsheet, a SketchUp export, or a photo of the build plans. No file? Type the dimensions instead.",
    icon: <path d="M24 30V6m0 24l-8-8m8 8l8-8M8 34v8h32v-8" /> },
  { n: "02", title: "Watch it rise", body: "The 3D skeleton rebuilds the moment a slider moves. Play the construction sequence stage by stage.",
    icon: <path d="M10 42V22m14 20V12m14 30V28M6 42h36M10 22l14-10 14 16" /> },
  { n: "03", title: "See every line priced", body: "Materials, trade-by-trade labour, equipment hire and margin — itemised against live AU, US or UK rates.",
    icon: <path d="M8 8h24l8 8v24H8V8zm24 0v8h8M14 22h20M14 29h20M14 36h12" /> },
  { n: "04", title: "Send the quote", body: "A client-ready quote with one GST-inclusive total. Print it, save it as a PDF, or hand it to the job.",
    icon: <path d="M6 12h36v24H6V12zm0 0l18 13 18-13M14 42h20" /> },
];



function HowItWorksSection() {
  return (
    <section id="how" style={{ background: "rgba(18, 22, 28, 0.82)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", borderTop: `3px solid ${TOKENS.hivis}`, borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
      <div style={{ maxWidth: 1480, margin: "0 auto", padding: "72px 24px 64px" }}>
        <Reveal variant="fade-up">
          <div className="ec-eyebrow" style={{ marginBottom: 8, color: TOKENS.hivis }}>How it works</div>
          <h2 className="ec-display" style={{ fontSize: "clamp(30px, 4.5vw, 48px)", lineHeight: 1, margin: 0, color: "#f2f4f7", maxWidth: 760 }}>
            Four steps from <span style={{ color: TOKENS.hivis }}>idea</span> to a defendable number.
          </h2>
          <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: "rgba(242,244,247,0.66)", maxWidth: 620, marginBottom: 36 }}>
            No login, no upload, no waiting. Type in your dimensions and watch everything else compute live.
          </p>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {HOW_STEPS.map((s, i) => (
            <motion.div key={s.n}
              initial={{ opacity: 0, x: i % 2 ? 90 : -90, y: 40, rotate: i % 2 ? 6 : -6 }}
              whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ type: "spring", stiffness: 70, damping: 14, delay: (i % 4) * 0.08 }}
              whileHover={{ y: -8, rotate: i % 2 ? -1.5 : 1.5, boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }}
              style={{
                background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.13)",
                padding: "24px 20px", position: "relative", overflow: "hidden",
                ...CARD_SHAPES[i % CARD_SHAPES.length],
              }}>
              <span className="ec-mono" style={{ position: "absolute", top: 12, right: 14, fontSize: 11, letterSpacing: "0.18em", color: TOKENS.hivis, fontWeight: 700 }}>{s.n}</span>
              <motion.svg width="48" height="48" viewBox="0 0 48 48" fill="none"
                stroke={TOKENS.hivis} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 3 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
                style={{ display: "block", marginBottom: 14 }}>
                {s.icon}
              </motion.svg>
              <h3 className="ec-display" style={{ fontSize: 21, margin: "0 0 6px", color: "#f2f4f7", letterSpacing: "0.01em" }}>{s.title}</h3>
              {/* 0.62 alpha measured 4.31:1 on this band — just under the 4.5
                  AA floor for 13px body copy. 0.72 clears it at 5.2:1. */}
              <p style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(242,244,247,0.72)", margin: 0 }}>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}





/* =========================================================================
   MODULE: reveal.js — scroll-driven animations
   Pure IntersectionObserver. Variants: fade-up, fade-in, scale-up,
   slide-left, slide-right. Optional stagger across children.
   ========================================================================= */


/* =========================================================================
   STYLE TOKENS — drafting-room aesthetic
   Palette: concrete dust + deep ink + hi-vis safety yellow
   ========================================================================= */
/* Colors + font stack now live in one place: design/system.js (Colors §1,
   Typography §2). TOKENS is kept as the name every existing call site
   (`TOKENS.ink`, `TOKENS.hivis`, ...) already uses across this file. */
const TOKENS = DesignSystem.colors;
const FONT_URL = DesignSystem.typography.fontUrl;

/* =========================================================================
   MODULE: suppliers.js
   Pre-built search URLs for major suppliers per region.
   These don't query an API — they open the supplier's own search with the
   material name, so prices are always live on the supplier side.
   ========================================================================= */
/* =========================================================================
   MODULE: sketchup.js
   Ingests a model.json exported from SketchUp (via the Ruby exporter below)
   and maps measured quantities onto the materials catalogue.

   The web cannot read native .skp files (proprietary binary). The client runs
   a small Ruby exporter inside SketchUp that measures the model and writes
   model.json. This module consumes that JSON — the quantities are SketchUp's
   own measurements, so the resulting estimate reflects the actual model.
   ========================================================================= */
const SketchUpImport = {
  /* Map a SketchUp material/layer name to one of our catalogue ids.
     Matching is fuzzy + keyword-based so client naming needn't be exact. */
  materialAliases: {
    // surfaces
    brick: "brick_veneer", "brick veneer": "brick_veneer", masonry: "brick_veneer",
    weatherboard: "weatherboard", cladding: "weatherboard", "fibre cement": "weatherboard", hardie: "weatherboard",
    render: "render", rendered: "render", stucco: "render",
    colorbond: "colorbond_sheet", "metal roof": "colorbond_sheet", "steel roof": "colorbond_sheet", roofing: "colorbond_sheet",
    tile: "concrete_tile", "roof tile": "concrete_tile",
    shingle: "asphalt_shingle", asphalt: "asphalt_shingle",
    plasterboard: "plasterboard", gyprock: "plasterboard", drywall: "plasterboard", gypsum: "plasterboard",
    "floor tile": "floor_tile", "ceramic floor": "floor_tile",
    timber: "floor_timber", "timber floor": "floor_timber", hardwood: "floor_timber", "engineered floor": "floor_timber",
    carpet: "floor_carpet",
    glazing: "window_alum_double", glass: "window_alum_double", window: "window_alum_double",
    paint: "paint", painted: "paint",
    insulation: "wall_insulation",
    concrete: "concrete_25mpa", slab: "concrete_25mpa",
    // edges
    framing: "timber_mgp10", stud: "timber_mgp10", frame: "timber_mgp10",
    beam: "lvl_beam", lvl: "lvl_beam", lintel: "steel_lintel",
    gutter: "guttering", guttering: "guttering",
    cornice: "ceiling_cornice", skirting: "ceiling_cornice",
    balustrade: "balustrade", handrail: "balustrade", rail: "balustrade",
    // components
    door: "door_internal", "external door": "door_external", "entry door": "door_external",
    "garage door": "garage_door",
    vanity: "bath_vanity", toilet: "bath_toilet", basin: "bath_vanity",
    shower: "bath_shower_screen", bath: "bath_tub", bathtub: "bath_tub",
    sink: "kit_sink_tap", tap: "kit_sink_tap",
    staircase: "stair_timber", stair: "stair_timber", stairs: "stair_timber",
  },

  resolveMaterial(name) {
    if (!name) return null;
    const key = String(name).toLowerCase().trim();
    if (this.materialAliases[key]) return this.materialAliases[key];
    // keyword scan — longest matching keyword wins
    let best = null, bestLen = 0;
    for (const kw of Object.keys(this.materialAliases)) {
      if (key.includes(kw) && kw.length > bestLen) { best = this.materialAliases[kw]; bestLen = kw.length; }
    }
    return best;
  },

  /* Validate + normalise an uploaded model.json */
  parse(raw) {
    let data;
    try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch (e) { return { ok: false, error: "File isn't valid JSON. Re-run the SketchUp exporter." }; }
    if (!data || typeof data !== "object") return { ok: false, error: "Empty or malformed model.json." };
    const out = {
      meta: data.meta || {},
      surfaces: Array.isArray(data.surfaces) ? data.surfaces : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
      components: Array.isArray(data.components) ? data.components : [],
      rooms: Array.isArray(data.rooms) ? data.rooms : [],
      volumes: Array.isArray(data.volumes) ? data.volumes : [],
    };
    const totalItems = out.surfaces.length + out.edges.length + out.components.length + out.volumes.length;
    if (totalItems === 0) return { ok: false, error: "No measurable geometry found. Did you tag faces by material in SketchUp?" };
    return { ok: true, model: out };
  },

  /* Build cost lines directly from the model + region.
     Returns { lines, matched, unmatched, totals } */
  estimateFromModel(model, region) {
    const lines = [];
    const unmatched = [];
    const add = (matId, qty, sourceLabel) => {
      const m = Materials.get(matId);
      if (!m || qty <= 0) return;
      const rate = Materials.rate(matId, region);
      lines.push({ materialId: matId, category: m.category, label: m.label, unit: m.unit, qty: round(qty, 2), rate: round(rate, 2), total: round(rate * qty, 2), source: sourceLabel });
    };
    const tryMap = (name, qty, kind) => {
      const id = this.resolveMaterial(name);
      if (id) add(id, qty, name);
      else unmatched.push({ name: name || "(unnamed)", qty: round(qty, 2), kind });
    };

    for (const s of model.surfaces) tryMap(s.material || s.layer, +s.area_m2 || +s.area || 0, "surface");
    for (const e of model.edges) tryMap(e.type || e.layer || e.material, +e.length_m || +e.length || 0, "edge");
    for (const c of model.components) tryMap(c.name || c.definition, +c.count || 1, "component");
    for (const v of model.volumes) tryMap(v.material || v.layer, +v.volume_m3 || +v.volume || 0, "volume");

    const matched = lines.length;
    const materialsTotal = lines.reduce((a, l) => a + l.total, 0);
    model.__lines = lines;   // stash for labourFromModel
    return { lines, matched, unmatched, materialsTotal };
  },

  /* Estimate LABOUR from the same model quantities. Uses simple trade
     productivity rates (hours per unit) × the region's hourly labour rate,
     so a model.json yields materials AND labour — a workable estimate. */
  labourFromModel(model, region) {
    const lines = [];
    // hours per unit for each kind of work, keyed by the catalogue material it maps to
    const productivity = {
      // surfaces (hours per m²)
      brick_veneer: { trade: "lab_bricklayer", hrPerUnit: 0.9, label: "Bricklaying" },
      weatherboard: { trade: "lab_carpenter", hrPerUnit: 0.45, label: "Cladding install" },
      render: { trade: "lab_plasterer", hrPerUnit: 0.5, label: "Rendering" },
      colorbond_sheet: { trade: "lab_roofer", hrPerUnit: 0.25, label: "Roof sheeting" },
      concrete_tile: { trade: "lab_roofer", hrPerUnit: 0.4, label: "Roof tiling" },
      plasterboard: { trade: "lab_plasterer", hrPerUnit: 0.35, label: "Plasterboard + set" },
      paint: { trade: "lab_painter", hrPerUnit: 0.18, label: "Painting" },
      floor_tile: { trade: "lab_tiler", hrPerUnit: 0.7, label: "Floor tiling" },
      floor_timber: { trade: "lab_carpenter", hrPerUnit: 0.3, label: "Timber floor lay" },
      window_alum_double: { trade: "lab_carpenter", hrPerUnit: 0.8, label: "Glazing install" },
      // edges (hours per lin.m)
      timber_mgp10: { trade: "lab_carpenter", hrPerUnit: 0.12, label: "Framing / carpentry" },
      lvl_beam: { trade: "lab_carpenter", hrPerUnit: 0.35, label: "Beam install" },
      guttering: { trade: "lab_roofer", hrPerUnit: 0.2, label: "Guttering install" },
      // volumes (hours per m³)
      concrete_25mpa: { trade: "lab_concreter", hrPerUnit: 2.5, label: "Concreting" },
      // components (hours each)
      door_internal: { trade: "lab_carpenter", hrPerUnit: 1.2, label: "Door hang" },
      door_external: { trade: "lab_carpenter", hrPerUnit: 2.0, label: "External door install" },
    };
    // accumulate hours per trade+task from matched lines
    const agg = {};
    for (const l of model.__lines || []) {
      const p = productivity[l.materialId];
      if (!p) continue;
      const key = p.label + "|" + p.trade;
      agg[key] = agg[key] || { trade: p.trade, label: p.label, hours: 0 };
      agg[key].hours += p.hrPerUnit * l.qty;
    }
    let labourTotal = 0;
    for (const k of Object.keys(agg)) {
      const a = agg[k];
      const rate = LabourRates.rate(a.trade, region);
      const hours = round(a.hours, 1);
      const total = round(hours * rate, 2);
      labourTotal += total;
      lines.push({ kind: "labour", labourId: a.trade, label: a.label, workers: 1, hours, rate, total });
    }
    return { lines, labourTotal };
  },

  /* A realistic sample model.json so the feature is testable without SketchUp */
  sampleModel() {
    return {
      meta: { source: "SketchUp 2024", exported: new Date().toISOString().slice(0, 10), units: "metric", model: "Sample — 4 bed single storey" },
      surfaces: [
        { material: "Brick veneer", area_m2: 168 },
        { material: "Colorbond roofing", area_m2: 215 },
        { material: "Plasterboard", area_m2: 520 },
        { material: "Engineered timber floor", area_m2: 142 },
        { material: "Floor tile", area_m2: 38 },
        { material: "Paint", area_m2: 520 },
        { material: "Glazing", area_m2: 22 },
        { material: "Wall insulation", area_m2: 156 },
      ],
      edges: [
        { type: "Timber framing", length_m: 640 },
        { type: "LVL beam", length_m: 48 },
        { type: "Guttering", length_m: 62 },
        { type: "Cornice", length_m: 118 },
      ],
      components: [
        { name: "External door", count: 3 },
        { name: "Internal door", count: 11 },
        { name: "Garage door", count: 1 },
        { name: "Window", count: 14 },
        { name: "Vanity", count: 2 },
        { name: "Toilet", count: 2 },
        { name: "Shower screen", count: 2 },
        { name: "Kitchen sink + tap", count: 1 },
      ],
      volumes: [
        { material: "Concrete slab", volume_m3: 23 },
      ],
      rooms: [
        { name: "Master bedroom", area_m2: 16, finish: "carpet" },
        { name: "Bedroom 2", area_m2: 12, finish: "carpet" },
        { name: "Open living", area_m2: 42, finish: "timber" },
      ],
    };
  },

  /* The Ruby exporter the client pastes into SketchUp's Ruby Console */
  rubyExporter() {
    return `# Build Your Own (BYO) — SketchUp quantity exporter
# Paste into SketchUp: Window > Ruby Console, then press Enter.
# Writes model.json next to your .skp file. Tag faces with materials
# named like "Brick veneer", "Colorbond roofing", "Plasterboard", etc.

require 'json'
require 'sketchup.rb'

model = Sketchup.active_model
ents  = model.entities
M2 = 1.0 / (39.37 * 39.37)   # sq inches -> m^2 (SketchUp works in inches)
M  = 1.0 / 39.37             # inches -> m
M3 = 1.0 / (39.37 ** 3)      # cu inches -> m^3

surfaces = Hash.new(0.0)
edges_by_layer = Hash.new(0.0)
comps = Hash.new(0)
volumes = Hash.new(0.0)

def walk(ents, tr, surfaces, edges_by_layer, comps, volumes, m2, m, m3)
  ents.each do |e|
    case e
    when Sketchup::Face
      mat = e.material ? e.material.display_name : (e.layer ? e.layer.name : 'Untagged')
      surfaces[mat] += e.area * m2
      if e.respond_to?(:volume) && e.volume && e.volume > 0
        volumes[mat] += e.volume * m3
      end
    when Sketchup::Edge
      lyr = e.layer ? e.layer.name : 'Untagged'
      edges_by_layer[lyr] += e.length.to_f * m if e.faces.empty?
    when Sketchup::ComponentInstance
      name = e.definition.name
      comps[name] += 1
      walk(e.definition.entities, tr, surfaces, edges_by_layer, comps, volumes, m2, m, m3)
    when Sketchup::Group
      walk(e.entities, tr, surfaces, edges_by_layer, comps, volumes, m2, m, m3)
    end
  end
end

walk(ents, nil, surfaces, edges_by_layer, comps, volumes, M2, M, M3)

out = {
  'meta' => { 'source' => 'SketchUp', 'units' => 'metric', 'model' => model.title },
  'surfaces' => surfaces.map { |k, v| { 'material' => k, 'area_m2' => v.round(2) } },
  'edges' => edges_by_layer.map { |k, v| { 'type' => k, 'length_m' => v.round(2) } },
  'components' => comps.map { |k, v| { 'name' => k, 'count' => v } },
  'volumes' => volumes.map { |k, v| { 'material' => k, 'volume_m3' => v.round(3) } }
}

path = model.path.empty? ? File.join(Dir.home, 'model.json') :
       File.join(File.dirname(model.path), 'model.json')
File.write(path, JSON.pretty_generate(out))
UI.messagebox("Exported to: #{path}")
`;
  },
};

/* =========================================================================
   MODULE: spreadsheet.js
   Reads an uploaded .xlsx / .csv takeoff via SheetJS, auto-detects the
   material + quantity columns, maps materials to the catalogue, and applies
   allocation rules. Mirrors the read -> review -> allocate pipeline.
   ========================================================================= */
const SpreadsheetImport = {
  /* header keywords used to auto-detect which column is which */
  headerHints: {
    material: ["material", "item", "description", "product", "element", "trade", "desc"],
    quantity: ["qty", "quantity", "amount", "measure", "no.", "number"],
    unit: ["unit", "uom", "units", "measure unit"],
    rate: ["rate", "unit price", "unit cost", "price", "cost/unit", "$/unit"],
    total: ["total", "amount", "line total", "value", "extended", "subtotal"],
  },

  detectColumns(headers) {
    const lc = (headers || []).map((h) => String(h == null ? "" : h).toLowerCase().trim());
    const find = (hints, exclude = []) => {
      for (let i = 0; i < lc.length; i++) {
        if (exclude.includes(i)) continue;
        const cell = lc[i];
        if (!cell) continue;
        if (hints.some((k) => cell === k || cell.includes(k))) return i;
      }
      return -1;
    };
    // order matters: lock rate & total first so "amount"/"total" don't steal the qty column
    const rate = find(this.headerHints.rate);
    const total = find(this.headerHints.total, [rate]);
    const material = find(this.headerHints.material, [rate, total]);
    const quantity = find(this.headerHints.quantity, [rate, total, material]);
    const unit = find(this.headerHints.unit, [rate, total, material, quantity]);
    return { material, quantity, unit, rate, total };
  },

  /* How many distinct column-types a row's cells match — used to score
     which row is the real header (real quotes often have a title row first). */
  headerScore(row) {
    const cols = this.detectColumns(row);
    let score = 0;
    for (const k of ["material", "quantity", "unit", "rate", "total"]) if (cols[k] >= 0) score++;
    return score;
  },

  /* Scan the first ~12 rows and return the index of the row that most looks
     like the header (highest column-match score). Falls back to row 0. */
  findHeaderRow(aoa) {
    let best = 0, bestScore = -1;
    const limit = Math.min(aoa.length, 12);
    for (let i = 0; i < limit; i++) {
      const s = this.headerScore(aoa[i] || []);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return { index: best, score: bestScore };
  },

  /* Is this data row actually a repeated/stray header row? (e.g. the words
     "Description / Quantity / Rate" sitting in the body). It has header
     keywords but no real numbers in its qty/rate/total cells. */
  isHeaderLikeRow(row, mapping) {
    const looksHeader = this.headerScore(row) >= 3;
    if (!looksHeader) return false;
    const anyNumber = ["quantity", "rate", "total"].some((k) => mapping[k] >= 0 && isFinite(this.num(row[mapping[k]])));
    return !anyNumber;
  },

  num(v) {
    if (v == null) return NaN;
    return parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  },

  /* Read EVERY usable row. Never silently drop a line.
     Pricing priority: (1) file's Total column, (2) file's Rate × Qty,
     (3) catalogue rate if the material is recognised. Lines that have a
     name but no usable price are still kept and flagged 'needs price'. */
  /* Words that mark a row as a summary/total line, not a material */
  summaryWords: ["subtotal", "sub total", "sub-total", "total", "grand total", "gst", "vat", "tax", "fees", "fee", "margin", "discount", "amount due", "balance"],

  isSummaryRow(name, hasName, fileTotal, qtyFinite, rateFinite) {
    const n = String(name || "").toLowerCase().trim();
    // explicit keyword in the description
    if (n && this.summaryWords.some((w) => n === w || n.startsWith(w) || n.endsWith(w))) return true;
    // a value in the Total column but no description, no qty, no rate = a bare summary figure
    if (!hasName && isFinite(fileTotal) && !qtyFinite && !rateFinite) return true;
    return false;
  },

  estimate(rows, mapping, region) {
    const lines = [];
    let skipped = 0;
    for (const row of rows) {
      const name = mapping.material >= 0 ? row[mapping.material] : "";
      const qty = mapping.quantity >= 0 ? this.num(row[mapping.quantity]) : NaN;
      const fileRate = mapping.rate >= 0 ? this.num(row[mapping.rate]) : NaN;
      const fileTotal = mapping.total >= 0 ? this.num(row[mapping.total]) : NaN;
      const unitTxt = mapping.unit >= 0 ? String(row[mapping.unit] || "").trim() : "";

      const hasName = name && String(name).trim().length > 0;
      const hasAnyNumber = isFinite(qty) || isFinite(fileRate) || isFinite(fileTotal);
      // skip rows that are clearly blank/headers/section titles with no data at all
      if (!hasName && !hasAnyNumber) { skipped++; continue; }

      // skip summary/total/GST/fees rows — they're not materials and would double-count
      if (this.isSummaryRow(name, hasName, fileTotal, isFinite(qty), isFinite(fileRate))) { skipped++; continue; }

      // skip a stray/repeated header row sitting in the body ("Description / Qty / Rate")
      if (this.isHeaderLikeRow(row, mapping)) { skipped++; continue; }

      const matId = hasName ? SketchUpImport.resolveMaterial(name) : null;
      const m = matId ? Materials.get(matId) : null;

      // ----- pricing priority -----
      let rate = NaN, total = NaN, priceSource = "";
      if (isFinite(fileTotal) && fileTotal !== 0) {
        total = fileTotal;
        rate = isFinite(fileRate) ? fileRate : (isFinite(qty) && qty !== 0 ? fileTotal / qty : NaN);
        priceSource = "file";
      } else if (isFinite(fileRate) && isFinite(qty)) {
        rate = fileRate; total = fileRate * qty; priceSource = "file";
      } else if (matId && isFinite(qty)) {
        rate = Materials.rate(matId, region); total = rate * qty; priceSource = "catalogue";
      } else if (isFinite(fileTotal)) { // includes zero ("By Others")
        total = fileTotal; rate = isFinite(fileRate) ? fileRate : 0; priceSource = "file";
      }

      const needsPrice = !isFinite(total);
      const alloc = matId && isFinite(qty) ? Allocation.forMaterial(matId, qty) : null;

      lines.push({
        materialId: matId || null,
        category: m ? m.category : "uncategorised",
        label: hasName ? String(name).trim() : (m ? m.label : "Unnamed item"),
        catalogueLabel: m ? m.label : null,
        unit: unitTxt || (m ? m.unit : ""),
        qty: isFinite(qty) ? round(qty, 2) : null,
        rate: isFinite(rate) ? round(rate, 2) : null,
        total: isFinite(total) ? round(total, 2) : 0,
        priceSource,         // "file" | "catalogue" | ""
        matched: !!matId,
        needsPrice,
        alloc,
      });
    }
    const materialsTotal = lines.reduce((a, l) => a + (l.total || 0), 0);
    const matchedCount = lines.filter((l) => l.matched).length;
    const fromFile = lines.filter((l) => l.priceSource === "file").length;
    const needPriceCount = lines.filter((l) => l.needsPrice).length;
    return { lines, materialsTotal, read: lines.length, matched: matchedCount, fromFile, needPriceCount, skipped };
  },

  /* Sample with rate + total columns, like a real trade quote */
  sampleCsv() {
    return `Bill Ref,Description,Quantity,Unit,Rate,Total
,Roof area - red,398.10,m2,35.00,13933.65
,Wall plate - blue,369.15,m,6.00,2214.87
By Others,Bulkheads,,m,0.00,0.00
,Fascia,166.60,m,14.00,2332.37
,Box gutter,35.48,m,65.00,2306.50
,Timber Decking - green,29.47,m2,110.00,3242.03
,Timber frame window nook (2400x600) to Bed 3 & 4,2.00,each,650.00,1300.00`;
  },
};

/* =========================================================================
   MODULE: codes.js
   Curated reference of key building-code principles, jurisdiction-specific,
   with authoritative external links. NOT a substitute for the actual code,
   which the user must consult or have certified by a private certifier.
   ========================================================================= */
const BuildingCodes = {
  AU: {
    name: "National Construction Code (NCC) — Australia",
    authority: "Australian Building Codes Board (ABCB)",
    url: "https://ncc.abcb.gov.au/",
    sections: [
      { topic: "Wind region (Townsville)", detail: "Region C, cyclone-prone. Roof tie-down and wall bracing must comply with AS 4055 / AS 1170.2.",
        ref: "AS 4055-2021" },
      { topic: "Termite protection", detail: "Mandatory in QLD. Physical and/or chemical barrier under slab and at penetrations.",
        ref: "AS 3660.1" },
      { topic: "Min. ceiling height (habitable)", detail: "2400 mm minimum in habitable rooms; 2100 mm in kitchens, laundries, corridors.",
        ref: "NCC Vol. 2 — H4D7" },
      { topic: "Smoke alarms", detail: "Interconnected photoelectric alarms in every bedroom, every storey, hallway serving bedrooms.",
        ref: "AS 3786 / NCC Vol. 2" },
      { topic: "Energy efficiency", detail: "Minimum 7-star NatHERS thermal rating (up from 6-star) for new Class 1 dwellings, plus a Whole-of-Home Calculator score of 60+ covering fixed appliances (HVAC, hot water, lighting). QLD adopted NCC 2022's residential energy provisions from 1 May 2024.",
        ref: "NCC Vol. 2 — H6", refUrl: "https://www.housing.qld.gov.au/initiatives/modern-homes/residential-energy-efficiency-standards" },
      { topic: "Stair geometry", detail: "Riser 115–190 mm, going 240–355 mm, 2R+G between 550 and 700.",
        ref: "NCC Vol. 2 — H5D2" },
      { topic: "Glazing safety", detail: "Grade A safety glass below 700 mm sill height, in doors and adjacent panels.",
        ref: "AS 1288 / AS 2208" },
      { topic: "Waterproofing wet areas", detail: "Floors and shower walls to full height, junctions sealed.",
        ref: "AS 3740-2021" },
      { topic: "Plumbing", detail: "Licensed plumber required. Backflow prevention at boundary.",
        ref: "AS/NZS 3500 + QPWC (Queensland Plumbing and Wastewater Code, under the Plumbing and Drainage Regulation 2019)",
        refUrl: "https://www.business.qld.gov.au/industries/building-property-development/building-construction/laws-codes-standards/plumbing/current" },
      { topic: "Electrical", detail: "Licensed electrician required. RCDs on all final sub-circuits.",
        ref: "AS/NZS 3000:2018" },
      { topic: "Approvals (QLD)", detail: "Development Approval from council, then Building Approval from a private certifier before any work starts.",
        ref: "Building Act 1975 (QLD)", refUrl: "https://www.legislation.qld.gov.au/view/html/inforce/current/act-1975-011" },
    ],
  },
  US: {
    name: "International Residential Code (IRC) — United States",
    authority: "International Code Council (ICC)",
    url: "https://codes.iccsafe.org/content/IRC2021P2",
    sections: [
      { topic: "Min. ceiling height", detail: "7 ft (2134 mm) in habitable rooms; 6'8\" in bathrooms.",
        ref: "IRC R305" },
      { topic: "Smoke + CO alarms", detail: "Smoke alarms in every bedroom + outside each sleeping area + each storey. CO alarms outside sleeping areas where fuel-burning appliances exist.",
        ref: "IRC R314 / R315" },
      { topic: "Stair geometry", detail: "Max riser 7¾\", min tread 10\". Min stair width 36\".",
        ref: "IRC R311.7" },
      { topic: "Egress", detail: "Every sleeping room: one emergency escape window or door.",
        ref: "IRC R310" },
      { topic: "Foundation", detail: "Footings below frost line; depth varies by zone (often 12\"–48\").",
        ref: "IRC R403" },
      { topic: "Energy", detail: "Climate-zone specific insulation, air sealing, fenestration U-factor.",
        ref: "IECC / IRC N1101" },
      { topic: "Permits", detail: "Building permit from local Authority Having Jurisdiction (AHJ) before construction. Inspections at footing, framing, rough-in, final.",
        ref: "IRC R105" },
    ],
  },
  UK: {
    name: "Building Regulations — England & Wales",
    authority: "Department for Levelling Up, Housing and Communities",
    url: "https://www.gov.uk/government/collections/approved-documents",
    sections: [
      { topic: "Structure", detail: "Loads, ground conditions, foundations.",
        ref: "Approved Document A" },
      { topic: "Fire safety", detail: "Means of escape, internal fire spread, alarms.",
        ref: "Approved Document B" },
      { topic: "Resistance to moisture", detail: "DPC, DPM, weathertight envelope.",
        ref: "Approved Document C" },
      { topic: "Sound insulation", detail: "Airborne + impact sound between dwellings and rooms.",
        ref: "Approved Document E" },
      { topic: "Ventilation", detail: "Background, extract, and purge ventilation rates.",
        ref: "Approved Document F" },
      { topic: "Energy efficiency", detail: "Fabric and services, SAP calculation required.",
        ref: "Approved Document L" },
      { topic: "Approvals", detail: "Either full plans submission or Building Notice to LABC / Approved Inspector.",
        ref: "Building Act 1984" },
    ],
  },
};

/* =========================================================================
   MODULE: highrise.js
   A SEPARATE engine for multi-storey / high-rise commercial buildings.
   High-rise estimating is a different discipline from residential: costs are
   driven by the structural core, typical-floor cycle, façade system, vertical
   transport (lifts), and fire/life-safety engineering — not by rooms & finishes.
   Costed per m² of GFA per system, with a per-floor structural cycle.
   These are FEASIBILITY-GRADE parametric rates, not tender figures.
   (HighRiseMaterials now lives in data/highrise-materials.js;
    HighRiseEstimator lives in logic/highrise-estimator.js.)
   ========================================================================= */
const HighRiseCodes = {
  AU: {
    name: "National Construction Code — Volume One (Class 2–9)",
    authority: "Australian Building Codes Board (ABCB)",
    url: "https://ncc.abcb.gov.au/",
    sections: [
      { topic: "Rise in storeys / Type A", detail: "Buildings >25m effective height require Type A fire-resisting construction throughout.", ref: "NCC Vol.1 C2D2" },
      { topic: "Fire-isolated egress", detail: "Min 2 fire-isolated exits; travel distance limits; stair pressurisation for high-rise.", ref: "NCC Vol.1 D2/D3" },
      { topic: "Sprinklers", detail: "Automatic sprinkler protection mandatory; fast-response heads above effective height thresholds.", ref: "NCC Vol.1 E1D / AS 2118.1" },
      { topic: "Fire-rated core", detail: "Lift/stair shafts and service risers fire-separated; FRLs to AS 1530.4.", ref: "NCC Vol.1 C3/C4" },
      { topic: "Structural actions", detail: "Wind (region-specific), seismic, and live loads per the Australian Standards loading suite.", ref: "AS 1170 series" },
      { topic: "Lift provision / accessibility", detail: "Accessible lift access to all storeys; emergency lift operation.", ref: "NCC Vol.1 E3 / AS 1735" },
      { topic: "Energy (commercial)", detail: "Section J — façade thermal performance, HVAC efficiency, metering.", ref: "NCC Vol.1 Section J" },
      { topic: "Approvals", detail: "Performance Solution by fire engineer often required; certified by building surveyor.", ref: "Building Act / NCC A2" },
    ],
  },
  US: {
    name: "International Building Code (IBC) — commercial",
    authority: "International Code Council (ICC)",
    url: "https://codes.iccsafe.org/content/IBC2021P1",
    sections: [
      { topic: "Construction type / high-rise", detail: "Buildings >75ft to top occupied floor = high-rise; Type I-A construction typical.", ref: "IBC 403 / 602" },
      { topic: "Sprinklers + standpipes", detail: "Automatic sprinklers and Class I standpipes required throughout high-rises.", ref: "IBC 403.3 / 905" },
      { topic: "Egress", detail: "Min 2 exits; smokeproof enclosures; occupant-load-based stair width.", ref: "IBC 1006 / 1023" },
      { topic: "Fire command + areas of refuge", detail: "Fire command center and emergency systems for high-rises.", ref: "IBC 403.4 / 911" },
      { topic: "Structural loads", detail: "Wind, seismic (SDC), live and dead loads per ASCE 7.", ref: "IBC 1605 / ASCE 7" },
      { topic: "Accessibility", detail: "Accessible route and elevators to all floors.", ref: "IBC 1009 / ICC A117.1" },
      { topic: "Energy", detail: "Envelope, HVAC, lighting power density per IECC commercial.", ref: "IECC-C / ASHRAE 90.1" },
    ],
  },
  UK: {
    name: "Building Regulations — higher-risk / commercial",
    authority: "Building Safety Regulator (HSE) / DLUHC",
    url: "https://www.gov.uk/government/collections/approved-documents",
    sections: [
      { topic: "Higher-risk buildings", detail: "Buildings ≥18m or ≥7 storeys fall under the Building Safety Act gateway regime.", ref: "Building Safety Act 2022" },
      { topic: "Fire safety", detail: "Means of escape, compartmentation, sprinklers ≥11m residential; cladding combustibility limits.", ref: "Approved Document B" },
      { topic: "Structure", detail: "Disproportionate collapse provisions for tall buildings.", ref: "Approved Document A" },
      { topic: "Energy", detail: "Conservation of fuel and power, commercial.", ref: "Approved Document L2" },
      { topic: "Access", detail: "Access to and use of buildings; lift provision.", ref: "Approved Document M" },
      { topic: "Gateways", detail: "BSR approval at design (Gateway 2) and completion (Gateway 3).", ref: "BSR / Gateway regime" },
    ],
  },
};

/* =========================================================================
   MODULE: legislation.js
   An authoritative directory of the governing building Act + regulator for
   each jurisdiction, linked to the official source. This is a links
   directory (not a reproduction of the law) so it stays current and correct.
   AU is broken down by state/territory; pick yours from the selector.
   ========================================================================= */
const Legislation = {
  AU: {
    national: { name: "National Construction Code (NCC)", body: "Australian Building Codes Board (ABCB)", url: "https://ncc.abcb.gov.au/", note: "The NCC is given legal force by each state/territory's own building Act below." },
    jurisdictions: [
      { code: "QLD", name: "Queensland", act: "Building Act 1975 (QLD) + QBCC Act 1991", regulator: "Queensland Building and Construction Commission (QBCC)", regulatorUrl: "https://www.qbcc.qld.gov.au/", actUrl: "https://www.legislation.qld.gov.au/view/html/inforce/current/act-1975-011", qbccActUrl: "https://www.legislation.qld.gov.au/view/html/inforce/current/act-1991-098" },
      { code: "NSW", name: "New South Wales", act: "Home Building Act 1989 + DBP Act 2020", regulator: "Building Commission NSW", regulatorUrl: "https://www.nsw.gov.au/departments-and-agencies/building-commission", actUrl: "https://legislation.nsw.gov.au/view/html/inforce/current/act-1989-147" },
      { code: "VIC", name: "Victoria", act: "Building Act 1993 (VIC) + Building Regulations 2018", regulator: "Building & Plumbing Commission (BPC) / VBA", regulatorUrl: "https://www.vba.vic.gov.au/", actUrl: "https://www.legislation.vic.gov.au/in-force/acts/building-act-1993" },
      { code: "SA", name: "South Australia", act: "Planning, Development and Infrastructure Act 2016 (SA)", regulator: "Consumer & Business Services / PlanSA", regulatorUrl: "https://plan.sa.gov.au/", actUrl: "https://www.legislation.sa.gov.au/lz?path=/c/a/planning%20development%20and%20infrastructure%20act%202016" },
      { code: "WA", name: "Western Australia", act: "Building Act 2011 (WA)", regulator: "Building & Energy (DEMIRS)", regulatorUrl: "https://www.demirs.wa.gov.au/building-and-energy", actUrl: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/main_mrtitle_12333_homepage.html" },
      { code: "TAS", name: "Tasmania", act: "Building Act 2016 (TAS)", regulator: "Consumer, Building & Occupational Services (CBOS)", regulatorUrl: "https://www.cbos.tas.gov.au/", actUrl: "https://www.legislation.tas.gov.au/view/html/inforce/current/act-2016-012" },
      { code: "ACT", name: "Aust. Capital Territory", act: "Building Act 2004 (ACT)", regulator: "Access Canberra", regulatorUrl: "https://www.accesscanberra.act.gov.au/", actUrl: "https://www.legislation.act.gov.au/a/2004-11/" },
      { code: "NT", name: "Northern Territory", act: "Building Act 1993 (NT)", regulator: "NT Building Advisory Services", regulatorUrl: "https://nt.gov.au/property/building-and-development", actUrl: "https://legislation.nt.gov.au/Legislation/BUILDING-ACT-1993" },
    ],
  },
  US: {
    national: { name: "International Codes (I-Codes): IRC / IBC", body: "International Code Council (ICC)", url: "https://codes.iccsafe.org/", note: "The ICC publishes model codes; each state and many local jurisdictions adopt and amend their own version. Always confirm the locally adopted code with your Authority Having Jurisdiction (AHJ)." },
    jurisdictions: [
      { code: "MODEL", name: "Model codes (ICC)", act: "International Residential Code (IRC) / International Building Code (IBC)", regulator: "International Code Council", regulatorUrl: "https://www.iccsafe.org/", actUrl: "https://codes.iccsafe.org/" },
      { code: "CA", name: "California", act: "California Building Standards Code (Title 24)", regulator: "California Building Standards Commission", regulatorUrl: "https://www.dgs.ca.gov/BSC", actUrl: "https://codes.iccsafe.org/codes/california" },
      { code: "TX", name: "Texas", act: "Adopted IRC/IBC (local adoption varies)", regulator: "Texas Dept. of Licensing & Regulation", regulatorUrl: "https://www.tdlr.texas.gov/", actUrl: "https://codes.iccsafe.org/" },
      { code: "FL", name: "Florida", act: "Florida Building Code", regulator: "Florida Building Commission", regulatorUrl: "https://www.floridabuilding.org/", actUrl: "https://codes.iccsafe.org/codes/florida" },
      { code: "NY", name: "New York", act: "NYS Uniform Code / NYC Construction Codes", regulator: "NYS Div. of Building Standards & Codes", regulatorUrl: "https://dos.ny.gov/building-standards-and-codes", actUrl: "https://codes.iccsafe.org/codes/new-york" },
    ],
  },
  UK: {
    national: { name: "The Building Regulations 2010 + Approved Documents", body: "Building Safety Regulator (HSE) / MHCLG", url: "https://www.gov.uk/government/collections/approved-documents", note: "England's Approved Documents shown. Scotland, Wales and Northern Ireland operate separate building standards systems — pick yours below." },
    jurisdictions: [
      { code: "ENG", name: "England", act: "Building Regulations 2010 + Building Safety Act 2022", regulator: "Building Safety Regulator (HSE)", regulatorUrl: "https://www.hse.gov.uk/building-safety/regulator.htm", actUrl: "https://www.gov.uk/government/collections/approved-documents" },
      { code: "WAL", name: "Wales", act: "Building Regulations (Wales)", regulator: "Welsh Government", regulatorUrl: "https://www.gov.wales/building-regulations", actUrl: "https://www.gov.wales/building-regulations-guidance" },
      { code: "SCO", name: "Scotland", act: "Building (Scotland) Act 2003 + Technical Handbooks", regulator: "Scottish Government Building Standards", regulatorUrl: "https://www.gov.scot/policies/building-standards/", actUrl: "https://www.gov.scot/collections/building-standards-technical-handbooks/" },
      { code: "NI", name: "Northern Ireland", act: "Building Regulations (NI) 2012", regulator: "Dept. of Finance (NI)", regulatorUrl: "https://www.finance-ni.gov.uk/topics/building-regulations-and-energy-efficiency-buildings", actUrl: "https://www.finance-ni.gov.uk/articles/technical-booklets" },
    ],
  },
};

/* =========================================================================
   MODULE: reporter.js
   Builds a downloadable text-format report from an estimate.
   ========================================================================= */
const Reporter = {
  build(estimate, projectNo) {
    const { region, spec, takeoff, materialLines, materialsTotal,
            labourLines, labourTotal, equipmentLines, equipmentTotal,
            subtotal, prelims, prelimsPct, margin, contingency, contingencyPct, total, taxRate, taxLabel,
            timeline } = estimate;
    const currency = currencySymbol(region);
    const lines = [];
    const rule = "=".repeat(78);
    const half = "-".repeat(78);

    lines.push(rule);
    lines.push("  ESTIMATING TAKEOFF SHEET & COST REPORT");
    lines.push(`  Project No.: ${projectNo}   |   Region: ${region}   |   Date: ${new Date().toISOString().slice(0,10)}`);
    lines.push(rule);
    lines.push("");

    lines.push("PROJECT BRIEF");
    lines.push(half);
    lines.push(pad("Footprint", 32) + `${spec.widthM} m × ${spec.lengthM} m`);
    lines.push(pad("Floors", 32) + `${spec.floors}`);
    lines.push(pad("Wall height (per floor)", 32) + `${spec.wallHeightM} m`);
    lines.push(pad("Roof pitch", 32) + `${spec.roofPitch}°`);
    lines.push(pad("Site condition", 32) + spec.siteCondition);
    lines.push(pad("Framing", 32) + spec.framingType);
    lines.push(pad("Roof material", 32) + spec.roofType);
    lines.push(pad("Cladding", 32) + spec.claddingType);
    lines.push(pad("Floor finish", 32) + spec.floorFinish);
    lines.push(pad("Kitchens / Bathrooms", 32) + `${(spec.kitchens || []).length} / ${(spec.bathrooms || []).length}`);
    lines.push(pad("Rooms scheduled", 32) + `${(spec.rooms || []).length}`);
    lines.push(pad("Garage", 32) + (spec.hasGarage ? "Yes" : "No"));
    lines.push(pad("Solar PV included", 32) + (spec.solar ? "Yes" : "No"));
    lines.push("");

    lines.push("QUANTITY TAKEOFF");
    lines.push(half);
    lines.push(pad("Gross floor area", 32) + `${takeoff.gfaM2.toFixed(1)} m²`);
    lines.push(pad("Wall area (gross / net)", 32) + `${takeoff.wallAreaM2.toFixed(1)} / ${takeoff.netWallAreaM2.toFixed(1)} m²`);
    lines.push(pad("Roof area", 32) + `${takeoff.roofAreaM2.toFixed(1)} m²`);
    lines.push(pad("Concrete (slab + footings)", 32) + `${takeoff.concreteTotalM3.toFixed(2)} m³`);
    lines.push(pad("Reinforcement", 32) + `${takeoff.rebarTonne.toFixed(2)} tonnes`);
    lines.push("");

    lines.push("MATERIALS — ITEMISED");
    lines.push(half);
    lines.push(pad("Item", 36) + pad("Qty", 12) + pad("Rate", 14) + "Total");
    lines.push(half);
    for (const l of materialLines) {
      lines.push(pad(l.label, 36) + pad(`${l.qty} ${l.unit}`, 12) + pad(`${currency}${fmt(l.rate)}`, 14) + `${currency}${fmt(l.total)}`);
    }
    lines.push(half);
    lines.push(pad("Materials subtotal", 62) + `${currency}${fmt(materialsTotal)}`);
    lines.push("");

    lines.push("LABOUR — BY TRADE");
    lines.push(half);
    for (const l of labourLines) {
      lines.push(pad(l.trade, 62) + `${currency}${fmt(l.total)}`);
    }
    lines.push(half);
    lines.push(pad("Labour subtotal", 62) + `${currency}${fmt(labourTotal)}`);
    lines.push("");

    lines.push("EQUIPMENT & PLANT");
    lines.push(half);
    for (const e of equipmentLines) {
      lines.push(pad(`${e.name}`, 36) + pad(`${e.qty} ${e.unit}`, 12) + pad(`${currency}${fmt(e.rate)}`, 14) + `${currency}${fmt(e.total)}`);
    }
    lines.push(half);
    lines.push(pad("Equipment subtotal", 62) + `${currency}${fmt(equipmentTotal)}`);
    lines.push("");

    lines.push("BUILDER ADD-ONS");
    lines.push(half);
    lines.push(pad("Direct costs subtotal", 62) + `${currency}${fmt(subtotal)}`);
    lines.push(pad(`Preliminaries (${Math.round(prelimsPct * 100)}%)`, 62) + `${currency}${fmt(prelims)}`);
    lines.push(pad("Builder margin (15%)", 62) + `${currency}${fmt(margin)}`);
    lines.push(pad(`Contingency (${Math.round(contingencyPct * 100)}%)`, 62) + `${currency}${fmt(contingency)}`);
    lines.push(half);
    if (taxRate > 0) {
      lines.push(pad(`Subtotal (excl. ${bareTax(taxLabel)})`, 62) + `${currency}${fmt(total)}`);
      lines.push(pad(`${taxLabel}`, 62) + `${currency}${fmt(total * taxRate)}`);
    }
    lines.push(pad(taxRate > 0 ? `TOTAL ESTIMATE (incl. ${bareTax(taxLabel)})` : "TOTAL ESTIMATE", 62) + `${currency}${fmt(total * (1 + taxRate))}`);
    lines.push("");

    lines.push("CONSTRUCTION PROGRAMME");
    lines.push(half);
    lines.push(pad("Stage", 40) + pad("Weeks", 10) + "Span");
    lines.push(half);
    for (const s of timeline.stages) {
      lines.push(pad(s.name, 40) + pad(`${s.weeks}`, 10) + `wk ${s.startWeek}–${s.endWeek}`);
    }
    lines.push(half);
    lines.push(pad("Total programme", 40) + `${timeline.totalWeeks} weeks (~${(timeline.totalWeeks / 4.33).toFixed(1)} months)`);
    lines.push("");

    lines.push("REGULATORY NOTE");
    lines.push(half);
    const code = BuildingCodes[region];
    lines.push(`Refer to: ${code.name}`);
    lines.push(`Authority: ${code.authority}`);
    lines.push(`URL:       ${code.url}`);
    lines.push("");
    lines.push("This document is an indicative estimate based on user inputs and");
    lines.push("market rate guides. It is not a fixed-price quotation and does not");
    lines.push("constitute professional advice. Engage a licensed builder, quantity");
    lines.push("surveyor, and certifier for binding figures and code compliance.");
    lines.push("");
    lines.push(rule);

    return lines.join("\n");
  },

  buildHighRise(est, projectNo) {
    const { region, spec, takeoff, systemLines, systemsTotal, equipmentLines = [], equipmentTotal = 0, prelims, designFees, margin, contingency, total, taxRate, taxLabel, timeline } = est;
    const currency = currencySymbol(region);
    const lines = [];
    const rule = "=".repeat(78), half = "-".repeat(78);
    lines.push(rule);
    lines.push("  DEVELOPER — APARTMENTS / MIXED-USE / TOWER FEASIBILITY REPORT");
    lines.push(`  Project No.: ${projectNo}   |   Region: ${region}   |   Date: ${new Date().toISOString().slice(0,10)}`);
    lines.push(rule);
    lines.push("");
    lines.push("BUILDING PARAMETERS");
    lines.push(half);
    lines.push(pad("Floor plate", 32) + `${spec.floorPlateM2} m²`);
    lines.push(pad("Floors above ground", 32) + `${spec.floors}`);
    lines.push(pad("Floor-to-floor height", 32) + `${spec.floorHeightM} m`);
    lines.push(pad("Overall height", 32) + `${takeoff.totalHeightM.toFixed(1)} m`);
    lines.push(pad("Basement levels", 32) + `${spec.basementLevels}`);
    lines.push(pad("Gross floor area (GFA)", 32) + `${takeoff.gfaM2.toFixed(0)} m²`);
    lines.push(pad("Structure", 32) + spec.structureType);
    lines.push(pad("Façade", 32) + spec.facadeType);
    lines.push(pad("Passenger / goods lifts", 32) + `${spec.passengerLifts} / ${spec.goodsLifts}`);
    lines.push("");
    lines.push("ELEMENTAL COST PLAN");
    lines.push(half);
    lines.push(pad("System", 40) + pad("Qty", 14) + "Total");
    lines.push(half);
    for (const l of systemLines) {
      lines.push(pad(l.label, 40) + pad(`${l.qty} ${l.unit}`, 14) + `${currency}${fmt(l.total)}`);
    }
    lines.push(half);
    lines.push(pad("Systems subtotal (adj.)", 54) + `${currency}${fmt(systemsTotal)}`);
    if (equipmentLines.length) {
      lines.push("");
      lines.push("SITE EQUIPMENT & PLANT");
      lines.push(half);
      for (const l of equipmentLines) {
        lines.push(pad(l.name, 40) + pad(`${l.qty} ${l.unit}`, 14) + `${currency}${fmt(l.total)}`);
      }
      lines.push(half);
      lines.push(pad("Equipment subtotal", 54) + `${currency}${fmt(equipmentTotal)}`);
    }
    lines.push(pad("Preliminaries (12%)", 54) + `${currency}${fmt(prelims)}`);
    lines.push(pad("Design & consultant fees (10%)", 54) + `${currency}${fmt(designFees)}`);
    lines.push(pad("Builder margin (10%)", 54) + `${currency}${fmt(margin)}`);
    lines.push(pad("Contingency (8%)", 54) + `${currency}${fmt(contingency)}`);
    lines.push(half);
    lines.push(pad("TOTAL ESTIMATE", 54) + `${currency}${fmt(total)}`);
    lines.push(pad("Rate per m² GFA", 54) + `${currency}${fmt(total / Math.max(1, takeoff.gfaM2))}/m²`);
    if (taxRate > 0) {
      lines.push(pad(`${taxLabel}`, 54) + `${currency}${fmt(total * taxRate)}`);
      lines.push(pad(`TOTAL ESTIMATE (incl. ${bareTax(taxLabel)})`, 54) + `${currency}${fmt(total * (1 + taxRate))}`);
    }
    lines.push("");
    lines.push("INDICATIVE PROGRAMME");
    lines.push(half);
    for (const s of timeline.stages) lines.push(pad(s.name, 46) + `wk ${s.startWeek}-${s.endWeek} (${s.weeks}w)`);
    lines.push(half);
    lines.push(pad("Total programme", 46) + `${timeline.totalWeeks} weeks (~${(timeline.totalWeeks/52).toFixed(1)} yrs)`);
    lines.push("");
    lines.push("REGULATORY NOTE");
    lines.push(half);
    const code = HighRiseCodes[region];
    lines.push(`Refer to: ${code.name}`);
    lines.push(`Authority: ${code.authority}`);
    lines.push(`URL:       ${code.url}`);
    lines.push("");
    lines.push("FEASIBILITY-GRADE ESTIMATE. Apartment and tower costs depend on structural,");
    lines.push("wind/seismic, fire-engineering and geotechnical design not modelled");
    lines.push("here. Engage a quantity surveyor, structural & fire engineers and a");
    lines.push("builder for tender-grade figures and code compliance.");
    lines.push("");
    lines.push(rule);
    return lines.join("\n");
  },

  buildMaterials(est, projectNo) {
    const { region, lines: matLines, total, byKind, taxRate, taxLabel } = est;
    const currency = currencySymbol(region);
    const out = [];
    const rule = "=".repeat(78), half = "-".repeat(78);
    const kindLabel = { material: "MATERIAL", labour: "LABOUR", element: "JOB/TRADE" };
    out.push(rule);
    out.push("  QUOTE — MATERIAL, LABOUR & TRADES");
    out.push(`  Project No.: ${projectNo}   |   Region: ${region}   |   Date: ${new Date().toISOString().slice(0,10)}`);
    out.push(rule);
    out.push("");
    out.push(pad("Type", 11) + pad("Description", 34) + pad("Qty", 11) + "Total");
    out.push(half);
    for (const l of matLines) {
      out.push(pad(kindLabel[l.kind] || "ITEM", 11) + pad(l.label, 34) + pad(l.qty != null ? `${l.qty} ${l.unit}` : "—", 11) + `${currency}${fmt(l.total)}`);
    }
    out.push(half);
    if (byKind) {
      if (byKind.material) out.push(pad("  Materials", 56) + `${currency}${fmt(byKind.material)}`);
      if (byKind.labour) out.push(pad("  Labour", 56) + `${currency}${fmt(byKind.labour)}`);
      if (byKind.element) out.push(pad("  Trades & jobs", 56) + `${currency}${fmt(byKind.element)}`);
      out.push(half);
    }
    if (taxRate > 0) {
      out.push(pad(`Subtotal (excl. ${bareTax(taxLabel)})`, 56) + `${currency}${fmt(total)}`);
      out.push(pad(`${taxLabel}`, 56) + `${currency}${fmt(total * taxRate)}`);
    }
    out.push(pad(taxRate > 0 ? `QUOTE TOTAL (incl. ${bareTax(taxLabel)})` : "QUOTE TOTAL", 56) + `${currency}${fmt(total * (1 + taxRate))}`);
    out.push("");
    out.push("Feasibility-grade. Indicative rates; confirm materials with suppliers and");
    out.push("labour with your trades. Material order quantities include trade waste.");
    out.push(rule);
    return out.join("\n");
  },
};

/* =========================================================================
   Utility helpers
   ========================================================================= */
function genProjectNo() {
  const d = new Date();
  return `EST-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/* =========================================================================
   REACT — UI shell
   ========================================================================= */
const DEFAULT_HR_SPEC = {
  floorPlateM2: 1200,
  floors: 24,
  floorHeightM: 3.6,
  basementLevels: 3,
  structureType: "rc",
  facadeType: "curtain_wall",
  occupancy: "office",
  passengerLifts: 4,
  goodsLifts: 1,
  hasEscalators: true,
  siteCondition: "flat",
};

const DEFAULT_MAT_SPEC = {
  lines: [
    { id: "m1", kind: "material", materialId: "concrete_25mpa", qty: 25 },
    { id: "m2", kind: "material", materialId: "brick_veneer", qty: 168 },
    { id: "m3", kind: "material", materialId: "timber_mgp10", qty: 640 },
    { id: "l1", kind: "labour", labourId: "lab_carpenter", workers: 1, hours: 16 },
    { id: "l2", kind: "labour", labourId: "lab_bricklayer", workers: 1, hours: 10 },
    { id: "e1", kind: "element", label: "Site clean & rubbish removal", qty: 1, unit: "item", fixedRate: 850 },
  ],
};

const ROOM_TYPES = ["Bedroom", "Living", "Dining", "Study", "Media", "Laundry", "Hallway", "Walk-in robe", "Other"];
const ROOM_DEFAULT_FINISH = {
  Bedroom: "carpet", Living: "timber", Dining: "timber", Study: "carpet",
  Media: "carpet", Laundry: "tile", Hallway: "timber", "Walk-in robe": "carpet", Other: "timber",
};

const DEFAULT_SPEC = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22,
  siteCondition: "flat",
  framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: true, solar: true,
  staircaseType: "none",  // none | timber | steel_glass | concrete
  slabThicknessM: 0.1,
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },

  /* Room schedule — drives internal finishes, robes, internal doors */
  rooms: [
    { id: nextId(), name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8, floorFinish: "carpet", robe: "built_in", robeLengthM: 3.0 },
    { id: nextId(), name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet", robe: "built_in", robeLengthM: 2.4 },
    { id: nextId(), name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
    { id: nextId(), name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber", robe: "none", robeLengthM: 0 },
    { id: nextId(), name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 },
  ],

  /* Detailed kitchen configs (one per kitchen) */
  kitchens: [
    { id: nextId(), benchLengthM: 7, cabinetry: "custom", benchtop: "stone", splashback: "tile", appliances: "mid", island: true, sinkTap: true },
  ],

  /* Detailed bathroom configs (one per bathroom) */
  bathrooms: [
    { id: nextId(), label: "Main bathroom", widthM: 3.0, lengthM: 2.4, hasBath: true, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
    { id: nextId(), label: "Ensuite", widthM: 2.6, lengthM: 2.0, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: true },
  ],

  /* Additional jobs / scope added on top of the base build (quote-builder lines) */
  extras: [],
};

/* ---- Reset templates ----
   EMPTY_* = everything zeroed (Clear all). *_SECTION_CLEAR = per-card zeroing. */
const EMPTY_SPEC = {
  widthM: 0, lengthM: 0, floors: 1, wallHeightM: 2.4, roofPitch: 0,
  siteCondition: "flat",
  framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: false, solar: false,
  staircaseType: "none",
  slabThicknessM: 0.1,
  openings: { windowsCount: 0, windowsM2: 0, doors: 1 },
  rooms: [], kitchens: [], bathrooms: [],
  extras: [],
};

/* Turn Quote-mode line-items into a representative 3D building spec, so the
   viewport renders a real inferred model (footprint + cladding + roof + openings)
   sized from what's been quoted — instead of abstract blocks. Returns null when
   nothing buildable has been quoted yet. */
function specFromQuoteLines(lines) {
  const items = (lines || []).filter((l) => (l.kind === "material" || l.kind === "element") && (+l.qty > 0));
  if (!items.length) return null;
  const inf = inferSpecFromImport(items.map((l) => ({
    materialId: l.materialId || null,
    qty: +l.qty || 0,
    total: +(l.fixedTotal != null ? l.fixedTotal : l.total || 0) || 0,
  })));
  return {
    ...EMPTY_SPEC,
    widthM: inf.side, lengthM: inf.side, floors: 1,
    wallHeightM: 2.7, roofPitch: 18, slabThicknessM: 0.1,
    claddingType: inf.cladding, roofType: inf.roof, floorFinish: inf.floorFinish,
    staircaseType: inf.staircaseType, hasGarage: inf.hasGarage,
    openings: {
      windowsCount: inf.counts.windows || 0,
      windowsM2: (inf.counts.windows || 0) * 1.8,
      doors: inf.counts.doorsExt || 1,
    },
    rooms: [], kitchens: [], bathrooms: [],
  };
}

const RES_SECTION_CLEAR = {
  dimensions: { widthM: 0, lengthM: 0, floors: 1, wallHeightM: 2.4, roofPitch: 0, slabThicknessM: 0.1 },
  materials: { framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber", staircaseType: "none" },
  openings: { openings: { windowsCount: 0, windowsM2: 0, doors: 1 }, hasGarage: false, solar: false },
  site: { siteCondition: "flat" },
};

const EMPTY_HR_SPEC = {
  floorPlateM2: 0, floors: 5, floorHeightM: 3.6, basementLevels: 0,
  structureType: "rc", facadeType: "curtain_wall", occupancy: "office",
  passengerLifts: 1, goodsLifts: 0, hasEscalators: false, siteCondition: "flat",
};

const HR_SECTION_CLEAR = {
  massing: { floorPlateM2: 0, floors: 5, floorHeightM: 3.6, basementLevels: 0 },
  structure: { structureType: "rc", facadeType: "curtain_wall", occupancy: "office" },
  transport: { passengerLifts: 1, goodsLifts: 0, hasEscalators: false },
  site: { siteCondition: "flat" },
};

/* Convert an imported takeoff into a fully editable parametric spec:
   inferred dimensions + materials, and a seeded room/kitchen/bathroom
   schedule derived from detected element counts. No importedLines, so the
   estimator computes parametrically and every card is editable. */
function buildTemplateSpecFromImport(lines, source) {
  const inf = inferSpecFromImport(lines);
  const c = inf.counts;

  const nBath = Math.max(1, Math.max(c.toilets || 0, c.vanities || 0));
  const bathrooms = [];
  for (let i = 0; i < nBath; i++) {
    bathrooms.push({ id: nextId(), label: i === 0 ? "Main bathroom" : (i === nBath - 1 ? "Ensuite" : `Bathroom ${i + 1}`),
      widthM: 2.6, lengthM: 2.2, hasBath: i === 0, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: i > 0 });
  }

  const nKit = Math.max(1, c.kitchenSinks || 0);
  const kitchens = [];
  for (let i = 0; i < nKit; i++) {
    kitchens.push({ id: nextId(), benchLengthM: 6, cabinetry: "flatpack", benchtop: "stone", splashback: "tile", appliances: "mid", island: true, sinkTap: true });
  }

  // bedrooms scaled to inferred GFA (~1 per 45 m², capped), plus living + laundry
  const nBed = Math.min(5, Math.max(1, Math.round(inf.gfa / 45)));
  const rooms = [];
  for (let i = 0; i < nBed; i++) {
    rooms.push({ id: nextId(), name: i === 0 ? "Master bedroom" : `Bedroom ${i + 1}`, type: "Bedroom",
      widthM: i === 0 ? 4.0 : 3.4, lengthM: i === 0 ? 3.6 : 3.0, floorFinish: "carpet",
      robe: i < 2 ? "built_in" : "none", robeLengthM: i < 2 ? 2.4 : 0 });
  }
  rooms.push({ id: nextId(), name: "Open living", type: "Living", widthM: 6, lengthM: 5, floorFinish: inf.floorFinish, robe: "none", robeLengthM: 0 });
  rooms.push({ id: nextId(), name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 });

  return {
    widthM: inf.side, lengthM: inf.side, floors: 1, wallHeightM: 2.7, roofPitch: 20, slabThicknessM: 0.1,
    siteCondition: "flat",
    framingType: "timber", roofType: inf.roof, claddingType: inf.cladding, floorFinish: inf.floorFinish,
    hasGarage: inf.hasGarage, solar: false, staircaseType: inf.staircaseType,
    openings: { windowsCount: c.windows || 10, windowsM2: Math.max(8, (c.windows || 10) * 1.2), doors: Math.max(1, c.doorsExt || 2) },
    rooms, kitchens, bathrooms,
    templateFrom: source || "import",   // marker only; no importedLines so it's fully editable
  };
}



/* ---- Projects screen: every project is one workspace ---- */
/* ---- Dashboard helpers: cost each project from its stored spec ---- */
function projectEstimate(p) {
  const region = p.region || "AU";
  try {
    if (p.buildMode === "highrise" && p.hrSpec) {
      const e = HighRiseEstimator.buildEstimate(p.hrSpec, region);
      return { total: e.total || 0, gfaM2: e.takeoff?.gfaM2 || 0,
        comp: { Structure: e.systemsTotal || 0, "Design fees": e.designFees || 0, Prelims: e.prelims || 0, Margin: e.margin || 0, Contingency: e.contingency || 0 } };
    }
    if (p.buildMode === "multi" && p.mdSpec) {
      const e = buildMultiEstimate(p.mdSpec, region);
      return { total: e.total || 0, gfaM2: e.gfaM2 || 0,
        comp: { Houses: e.materialsTotal + e.labourTotal + e.equipmentTotal, "Site works": e.siteWorks, Prelims: e.prelims, Margin: e.margin, Contingency: e.contingency } };
    }
    if (p.buildMode === "materials" && p.matSpec) {
      const e = MaterialsOnly.buildEstimate(p.matSpec, region);
      return { total: e.total || 0, gfaM2: 0,
        comp: { Materials: e.byKind?.material || 0, Labour: e.byKind?.labour || 0, "Trades & jobs": e.byKind?.element || 0 } };
    }
    if (p.spec) {
      const e = Estimator.buildEstimate(p.spec, region);
      return { total: e.total || 0, gfaM2: e.takeoff?.gfaM2 || 0,
        comp: { Materials: e.materialsTotal || 0, Labour: e.labourTotal || 0, Equipment: e.equipmentTotal || 0, Prelims: e.prelims || 0, Margin: e.margin || 0, Contingency: e.contingency || 0 } };
    }
  } catch { /* legacy / not-yet-opened project — leave at zero */ }
  return { total: 0, gfaM2: 0, comp: {} };
}

/* Construction-toned chart palette: hi-vis, rust, steel-blue, grey, charcoal, concrete */
const CHART_COLORS = ["#D9A514", "#C25A1C", "#5B7C99", "#8A8F98", "#3A4652", "#B8B2A7"];

function StatTile({ label, value, sub, icon, i }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.35 }}
      className="ec-card" style={{ padding: "18px 20px", borderTop: `3px solid ${TOKENS.hivis}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.steel, textTransform: "uppercase" }}>{label}</span>
        <span style={{ color: TOKENS.hivisInk, display: "flex" }}>{icon}</span>
      </div>
      <div className="ec-display" style={{ fontSize: 30, lineHeight: 1.1, marginTop: 10 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: TOKENS.inkSoft, marginTop: 4 }}>{sub}</div>}
    </motion.div>
  );
}

function BarChart({ rows, currency }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.label + i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 10 }}>
            <span style={{ color: TOKENS.ink, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            <span className="ec-mono" style={{ color: TOKENS.inkSoft, flexShrink: 0 }}>{currency}{fmt(r.value)}</span>
          </div>
          <div style={{ height: 10, background: TOKENS.rule, borderRadius: 5, overflow: "hidden" }}>
            {/* Plain div + CSS transition: framer-motion doesn't reliably tween
               percentage width, so drive it directly. */}
            <div style={{ height: "100%", width: `${Math.max(2, (r.value / max) * 100)}%`, background: `linear-gradient(90deg, ${TOKENS.hivisDeep}, ${TOKENS.emberDeep})`, borderRadius: 5, transition: "width 0.6s ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ segments, size = 180 }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = size / 2 - 16, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  let offset = 0;
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={TOKENS.rule} strokeWidth="14" />
        {segments.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <motion.circle key={s.label} cx={cx} cy={cy} r={r} fill="none"
              stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.08 }} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 150, flex: 1 }}>
        {segments.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
            <span style={{ color: TOKENS.inkSoft, flex: 1 }}>{s.label}</span>
            <span className="ec-mono" style={{ color: TOKENS.ink }}>{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Tiny inline stat icons (no icon library — stays on-brand + dependency-free) */
const DASH_ICONS = {
  value: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>,
  count: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M6 21V9l6-5 6 5v12M10 21v-6h4v6" /></svg>,
  rate: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M7 14l4-4 3 3 5-6" /></svg>,
  area: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3zM3 9h18M9 21V9" /></svg>,
};

function ProjectsScreen({ onOpen, onNew, onOpenSiteOffice }) {
  const [projects, setProjects] = useState(listProjects);
  const [name, setName] = useState("");
  const [type, setType] = useState("residential");
  const { can } = useAuth();
  const refresh = () => setProjects(listProjects());
  const sync = useCloudSync();
  const localOnly = new Set(sync.local || []);
  // a sign-in pulls projects from the account into this browser — show them
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener("byo:projects-synced", on);
    return () => window.removeEventListener("byo:projects-synced", on);
  }, []);

  const modeLabel = MODE_LABEL;

  const metrics = useMemo(() => {
    const est = {};
    projects.forEach((p) => { est[p.id] = projectEstimate(p); });
    const pipeline = projects.reduce((a, p) => a + est[p.id].total, 0);
    const totalGfa = projects.reduce((a, p) => a + est[p.id].gfaM2, 0);
    const rated = projects.filter((p) => est[p.id].gfaM2 > 0);
    const avgRate = rated.length ? rated.reduce((a, p) => a + est[p.id].total / est[p.id].gfaM2, 0) / rated.length : 0;
    const regionCounts = {}, byMode = {};
    projects.forEach((p) => {
      const rg = p.region || "AU"; regionCounts[rg] = (regionCounts[rg] || 0) + 1;
      byMode[p.buildMode] = (byMode[p.buildMode] || 0) + 1;
    });
    const regions = Object.keys(regionCounts);
    const domRegion = regions.sort((a, b) => regionCounts[b] - regionCounts[a])[0] || "AU";
    const agg = {};
    projects.forEach((p) => { const c = est[p.id].comp; for (const k in c) agg[k] = (agg[k] || 0) + c[k]; });
    const composition = Object.entries(agg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    const barRows = projects.map((p) => ({ label: p.name, value: est[p.id].total })).sort((a, b) => b.value - a.value).slice(0, 8);
    return { est, pipeline, totalGfa, avgRate, byMode, currency: currencySymbol(domRegion), mixed: regions.length > 1, composition, barRows };
  }, [projects]);

  const { est, pipeline, totalGfa, avgRate, byMode, currency, mixed, composition, barRows } = metrics;
  const modeSub = Object.entries(byMode).map(([m, n]) => `${n} ${modeLabel[m] || m}`).join(" · ");

  const newProjectCard = (
    <div className="ec-card" style={{ padding: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input className="ec-input" placeholder="New project name…" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200, maxWidth: 380 }} />
      <select className="ec-select" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 220 }} aria-label="Project type">
        {BUILD_MODES.map(([m, label]) => <option key={m} value={m}>{label}{can.canUseMode(m) ? "" : " — upgrade"}</option>)}
      </select>
      <button className="ec-btn ec-btn-hivis" onClick={() => onNew(type, name.trim() || "Untitled project")}>+ New project</button>
    </div>
  );

  return (
    <main style={{ maxWidth: 1480, margin: "0 auto", padding: "40px 24px 64px", minHeight: "60vh" }}>
      <div className="ec-eyebrow" style={{ marginBottom: 8 }}>Dashboard</div>
      <h2 className="ec-display" style={{ fontSize: 34, lineHeight: 1, marginBottom: 24 }}>Your build pipeline at a glance.</h2>

      <AccountDashboard projectCount={projects.length} onOpenSiteOffice={onOpenSiteOffice}
        onNew={(mode) => onNew(mode, name.trim() || "Untitled project")} />

      {projects.length === 0 ? (
        <>
          {newProjectCard}
          <p style={{ color: TOKENS.inkSoft, fontSize: 14, marginTop: 20 }}>No projects yet — create your first one above and the dashboard will populate.</p>
        </>
      ) : (
        <>
          {/* KPI tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatTile i={0} label="Pipeline value" icon={DASH_ICONS.value} value={`${currency}${fmt(pipeline)}`} sub={mixed ? "Across mixed regions — indicative" : "Total estimated across all projects"} />
            <StatTile i={1} label="Active projects" icon={DASH_ICONS.count} value={projects.length} sub={modeSub} />
            <StatTile i={2} label="Avg cost / m²" icon={DASH_ICONS.rate} value={avgRate > 0 ? `${currency}${fmt(avgRate)}` : "—"} sub="Residential, multi-dwelling & developer" />
            <StatTile i={3} label="Portfolio floor area" icon={DASH_ICONS.area} value={totalGfa > 0 ? `${fmt(totalGfa)} m²` : "—"} sub="Combined GFA" />
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 28 }}>
            <div className="ec-card" style={{ padding: 20 }}>
              <div className="ec-eyebrow" style={{ marginBottom: 14 }}>Estimated value by project</div>
              {barRows.some((r) => r.value > 0)
                ? <BarChart rows={barRows} currency={currency} />
                : <p style={{ fontSize: 13, color: TOKENS.steel }}>Open a project to generate its estimate.</p>}
            </div>
            <div className="ec-card" style={{ padding: 20 }}>
              <div className="ec-eyebrow" style={{ marginBottom: 14 }}>Portfolio cost composition</div>
              {composition.length
                ? <DonutChart segments={composition} />
                : <p style={{ fontSize: 13, color: TOKENS.steel }}>No costed projects yet.</p>}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>{newProjectCard}</div>

          {/* Project cards */}
          <div className="ec-eyebrow" style={{ marginBottom: 12 }}>All projects</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {projects.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
                className="ec-card" style={{ padding: 18, cursor: "pointer", borderTop: `3px solid ${TOKENS.hivis}` }}
                onClick={() => onOpen(getProject(p.id) || p)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div className="ec-display" style={{ fontSize: 18 }}>{p.name}</div>
                  <span className="ec-mono" style={{ fontSize: 9, letterSpacing: "0.12em", color: TOKENS.steel, textAlign: "right" }}>
                    {modeLabel[p.buildMode] || p.buildMode}
                    {localOnly.has(p.id) && <><br /><span title="Your plan's cloud slots are full — this one is saved in this browser only">THIS DEVICE ONLY</span></>}
                  </span>
                </div>
                <div className="ec-display" style={{ fontSize: 22, color: TOKENS.hivisInk, marginTop: 8 }}>
                  {est[p.id]?.total > 0 ? `${currencySymbol(p.region || "AU")}${fmt(est[p.id].total)}` : "—"}
                </div>
                <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 4 }}>
                  {est[p.id]?.gfaM2 > 0 ? `${fmt(est[p.id].gfaM2)} m² · ` : ""}{p.region} · updated {new Date(p.updatedAt).toLocaleDateString()}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="ec-btn ec-btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }}
                    onClick={(e) => { e.stopPropagation(); duplicateProject(p.id); refresh(); }}>Duplicate</button>
                  <button className="ec-btn ec-btn-ghost" style={{ fontSize: 10, padding: "4px 10px", color: TOKENS.emberInk }}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) { deleteProject(p.id); refresh(); } }}>Delete</button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

/* Build modes, defined once. The Projects picker and the read-only badge
   shown inside a project both read from here, so they cannot drift apart. */
const BUILD_MODES = ["residential", "materials", "multi", "highrise"].map((m) => [m, MODE_LABEL[m]]);
const buildModeLabel = (m) => (BUILD_MODES.find(([id]) => id === m) || [, m])[1];

/* ---- Workflow stepper: the workspace's linear flow ---- */
const WORKFLOW = [
  { id: "estimate", label: "Estimate" },
  { id: "three_d", label: "3D model" },
  { id: "materials", label: "Costs" },
  { id: "timeline", label: "Timeline" },
  { id: "ai", label: "AI crew" },
  { id: "proposal", label: "Quote" },
];

/* What each workspace page shows. Every tab is its own page — nothing is
   stacked and scrolled-to any more. Secondary tabs, where a page has more
   than one view, are listed here so the page and its tab strip agree. */
const PAGE_HEAD = {
  estimate:  ["Estimate", "Specify the build"],
  three_d:   ["3D model", "Walk the build"],
  materials: ["Costs", "Where the money goes"],
  timeline:  ["Timeline", "Build programme"],
};
function stageTabs(stage, buildMode) {
  const imports = [{ id: "spreadsheet", label: "Import spreadsheet" }, { id: "sketchup", label: "Import SketchUp" }, { id: "cadbim", label: "Import CAD / BIM" }];
  const codes = { id: "codes", label: "Codes & compliance" };
  if (buildMode === "multi") return stage === "materials" ? [{ id: "estimate", label: "Project cost plan" }] : stage === "timeline" ? [{ id: "timeline", label: "Programme" }] : [];
  if (stage === "estimate") return buildMode === "highrise" ? [codes] : buildMode === "materials" ? imports : [...imports, codes];
  if (stage === "materials") return [
    { id: "estimate", label: buildMode === "highrise" ? "Elemental cost plan" : buildMode === "materials" ? "Quote breakdown" : "Cost breakdown" },
    { id: "suppliers", label: "Suppliers" },
  ];
  if (stage === "timeline") return [{ id: "timeline", label: "Programme" }];
  return [];
}

function WorkflowStepper({ stage, onStage, buildMode }) {
  /* Not a linear stepper — a jump-anywhere tab row. Every section works
     independently at any point, so there's no numbering, no connector line,
     and no "completed" state; only the active section is highlighted. */
  const stages = WORKFLOW.filter((s) => !(buildMode === "materials" && s.id === "timeline"));
  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", padding: "16px 24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {stages.map((s) => {
          const active = s.id === stage;
          return (
            <motion.button key={s.id} whileHover={{ y: -2 }} onClick={() => onStage(s.id)}
              className="ec-mono" aria-current={active ? "page" : undefined}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
                padding: "8px 14px", fontSize: 11, letterSpacing: "0.08em", fontWeight: 700,
                border: `1px solid ${active ? TOKENS.emphasis : TOKENS.rule}`,
                background: active ? TOKENS.emphasis : TOKENS.paperLight,
                color: active ? TOKENS.onEmphasis : TOKENS.ink,
              }}>
              <Icon name={`workflow.${s.id}`} size={15} strokeWidth={2.2} />
              {s.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ---- AI crew: six specialists that act on the live project ---- */
function AICrewSection({ projectId, projectName, buildMode, region, spec, hrSpec, estimate, currency, onSpecPatch, onAddQuoteLines }) {
  const [personaId, setPersonaId] = useState(PERSONAS[0].id);
  const persona = PERSONAS.find((p) => p.id === personaId);
  const [msgs, setMsgs] = useState(() => (getProject(projectId)?.chats?.[personaId]) || []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPrompts, setShowPrompts] = useState(false);

  const switchPersona = (id) => {
    setPersonaId(id);
    setMsgs((getProject(projectId)?.chats?.[id]) || []);
    setErr("");
  };
  const persist = (id, list) => {
    const p = getProject(projectId);
    if (p) saveProject(projectId, { chats: { ...(p.chats || {}), [id]: list.slice(-30) } });
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput(""); setErr(""); setBusy(true);
    track("ai_chat_message", { persona: persona.id, buildMode, region });
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    try {
      const ctx = {
        name: projectName, buildMode, region,
        specSummary: summariseSpec(buildMode, spec, hrSpec, estimate),
        estimateSummary: summariseEstimate(estimate, currency),
      };
      const reply = await aiChat({
        system: buildSystemPrompt(persona, ctx),
        messages: next.map(({ role, content }) => ({ role, content })),
        maxTokens: 1200,
        tier: "smart",
      });
      const { text: cleaned, actions } = parseActions(reply);
      const done = [...next, { role: "assistant", content: cleaned, actions }];
      setMsgs(done); persist(personaId, done);
    } catch (e) { setErr(aiErrMsg(e)); setMsgs(msgs); }
    setBusy(false);
  };

  const applyAction = (a) => {
    if (a.type === "update_spec" && a.patch) onSpecPatch(a.patch);
    if (a.type === "add_quote_lines" && Array.isArray(a.lines)) onAddQuoteLines(a.lines);
  };

  return (
    <main style={{ maxWidth: 1480, margin: "0 auto", padding: "28px 24px 64px", minHeight: "60vh" }}>
      <div className="ec-eyebrow" style={{ marginBottom: 8 }}>AI crew</div>
      <h2 className="ec-display" style={{ fontSize: 30, lineHeight: 1, marginBottom: 6 }}>
        Six specialists. <span style={{ color: TOKENS.hivisInk }}>One project.</span>
      </h2>
      <p style={{ fontSize: 13, color: TOKENS.inkSoft, maxWidth: 620, marginBottom: 22 }}>
        Not a chatbot — each specialist reads this project's live spec and estimate, and can propose
        changes you apply with one click.
      </p>

      {/* persona cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 22 }}>
        {PERSONAS.map((p, i) => (
          <motion.div key={p.id} whileHover={{ y: -4 }} onClick={() => switchPersona(p.id)}
            style={{
              padding: "14px 12px", cursor: "pointer", textAlign: "center",
              background: p.id === personaId ? TOKENS.emphasis : TOKENS.paperLight,
              border: `1px solid ${p.id === personaId ? TOKENS.emphasis : TOKENS.rule}`,
              borderTop: `3px solid ${p.id === personaId ? TOKENS.hivis : TOKENS.rule}`,
            }}>
            <div style={{ display: "flex", justifyContent: "center", color: p.id === personaId ? TOKENS.hivis : TOKENS.steel }}>
              <Icon name={`persona.${p.id}`} size={24} strokeWidth={2} />
            </div>
            <div className="ec-display" style={{ fontSize: 14, marginTop: 8, color: p.id === personaId ? TOKENS.onEmphasis : TOKENS.ink }}>{p.name}</div>
            <div className="ec-mono" style={{ fontSize: 8.5, letterSpacing: "0.1em", marginTop: 3, color: p.id === personaId ? "rgba(242,244,247,0.7)" : TOKENS.steel }}>{p.role.toUpperCase()}</div>
          </motion.div>
        ))}
      </div>

      {/* chat panel */}
      <div className="ec-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight }}>
          <span className="ec-display" style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name={`persona.${persona.id}`} size={18} color={TOKENS.hivisInk} />
            {persona.name} — {persona.role}
          </span>
          <div style={{ fontSize: 11.5, color: TOKENS.inkSoft, marginTop: 2 }}>{persona.tone}</div>
        </div>
        <div style={{ padding: 18, maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {(msgs.length === 0 || showPrompts) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {persona.starters.map((s) => (
                <button key={s} className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setShowPrompts(false); send(s); }}>{s}</button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                padding: "10px 14px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
                background: m.role === "user" ? TOKENS.ink : TOKENS.card,
                color: m.role === "user" ? TOKENS.paper : TOKENS.ink,
                border: `1px solid ${m.role === "user" ? TOKENS.ink : TOKENS.rule}`,
                borderRadius: m.role === "user" ? "16px 16px 5px 16px" : "16px 16px 16px 5px",
                boxShadow: "0 10px 20px -13px rgba(15,17,20,0.22)",
              }}>{m.content}</div>
              {(m.actions || []).map((a, j) => (
                <button key={j} className="ec-btn ec-btn-hivis" style={{ marginTop: 6, fontSize: 11 }} onClick={() => applyAction(a)}>
                  ⚡ Apply: {a.label || a.type}
                </button>
              ))}
            </motion.div>
          ))}
          {busy && <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{persona.name} is thinking…</div>}
          {err && <div style={{ fontSize: 12, color: TOKENS.emberInk }}>{err}</div>}
        </div>
        <div style={{ padding: 14, borderTop: `1px solid ${TOKENS.rule}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, borderRadius: 26, padding: 6, boxShadow: "0 12px 22px -16px rgba(15,17,20,0.3)" }}>
            <button type="button" onClick={() => setShowPrompts((v) => !v)} title="Quick prompts" aria-label="Quick prompts"
              style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 13, border: "none", cursor: "pointer",
                background: showPrompts ? TOKENS.emphasis : TOKENS.paperLight, color: showPrompts ? TOKENS.onEmphasis : TOKENS.inkSoft,
                display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
              <Icon name="ui.plus" size={18} strokeWidth={2.2} />
            </button>
            <input placeholder={`Ask ${persona.name} about this project…`}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TOKENS.ink, padding: "0 4px" }} />
            <motion.button type="button" whileTap={{ scale: 0.9 }} disabled={busy} onClick={() => send()} aria-label="Send message"
              style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer",
                background: input.trim() && !busy ? "linear-gradient(90deg, #F5C518 0%, #F58E1A 100%)" : TOKENS.rule,
                color: input.trim() && !busy ? TOKENS.ink : TOKENS.steel,
                display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
              <Icon name="ui.send" size={16} strokeWidth={2.2} />
            </motion.button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---- Proposal: the client-facing document, print-ready ---- */
function ProposalSection({ projectName, estimate, currency, region, buildMode, projectNo, reportText, onSendToSiteOffice, onOpenSiteOffice }) {
  const est = estimate || {};
  const [sent, setSent] = useState(null);
  const money = (v) => `${currency}${fmt(v || 0)}`;
  const rows = buildMode === "multi"
    ? [
        ...(est.types || []).map((t) => [`${t.name} — ${fmt(t.gfaM2)} m²`, `${t.count} homes`, money(t.buildCost)]),
        ...(est.siteLines || []).map((l) => [l.label, `${l.qty} ${l.unit}`, money(l.total)]),
        ["Preliminaries — whole project", "", money(est.prelims)],
        ["Builder's margin", "", money(est.margin)],
        ["Contingency", "", money(est.contingency)],
      ]
    : buildMode === "materials"
    ? (est.lines || []).map((l) => [l.label, `${l.qty} ${l.unit || ""}`, money(l.total)])
    : buildMode === "highrise"
    ? (est.systemLines || []).map((l) => [l.label, `${fmt(l.qty)} ${l.unit || ""}`, money(l.total)])
    : [
        ["Materials (waste-adjusted)", "", money(est.materialsTotal)],
        ["Labour — all trades", "", money(est.labourTotal)],
        ["Equipment & site establishment", "", money(est.equipmentTotal)],
        ["Preliminaries", "", money(est.prelims)],
        ["Builder's margin", "", money(est.margin)],
        ["Contingency", "", money(est.contingency)],
      ];
  const doPrint = () => window.print();
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }} className="no-print">
        <div className="ec-eyebrow">Proposal — client-facing</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onSendToSiteOffice && (
            <button className="ec-btn ec-btn-ghost" disabled={!(est.total > 0)}
              onClick={() => setSent(onSendToSiteOffice())}>
              {sent ? "↻ Re-sync budget" : "→ Send to Site Office"}
            </button>
          )}
          <button className="ec-btn ec-btn-hivis" onClick={doPrint}>Print / save as PDF</button>
        </div>
      </div>
      {sent && (
        <div className="no-print" style={{ marginBottom: 16, padding: "12px 14px", background: TOKENS.okWash, border: `1px solid ${TOKENS.ok}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong>{sent.existed ? "Budget re-synced on" : "Job created —"} {sent.job.jobNo}.</strong>{" "}
            Contract sum set to {money(est.total)} and {sent.seeded} cost centre{sent.seeded === 1 ? "" : "s"} budgeted from this quote.
            {/* Say plainly what the split is, because a builder will reconcile
                these numbers against their own and needs to know the basis. */}
            <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 4 }}>
              Trades are budgeted on the labour split, with materials, plant, prelims and margin spread pro-rata. Reallocate in the job budget.
            </div>
          </div>
          {onOpenSiteOffice && (
            <button className="ec-btn ec-btn-ghost" onClick={() => onOpenSiteOffice(sent.job)}>Open the job</button>
          )}
        </div>
      )}
      <style>{`@media print { .no-print, header, footer { display: none !important; } body { background: #fff !important; } }`}</style>
      {/* Fixed shadow, not var(--shadow-lift): the token would resolve inside
          this element's own light palette and vanish against a dark app. */}
      <div className="ec-card byo-doc-light" style={{ padding: "48px 52px", background: "#fff", boxShadow: "0 18px 44px rgba(0,0,0,0.30)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `3px solid ${TOKENS.hivis}`, paddingBottom: 22, marginBottom: 26 }}>
          <div>
            <BYOLogo size={44} />
            <h1 className="ec-display" style={{ fontSize: 30, margin: "16px 0 4px" }}>{projectName || "Project proposal"}</h1>
            <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>
              {projectNo} · {region} · {new Date().toLocaleDateString()}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.steel }}>
              {est.taxRate > 0 ? `PROPOSED TOTAL INCL. ${taxName(est)}` : "PROPOSED TOTAL"}
            </div>
            <div className="ec-display" style={{ fontSize: 34, color: TOKENS.hivisInk }}>{money(grossOf(est))}</div>
            {est.taxRate > 0 && <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>includes {money(taxOf(est))} {est.taxLabel}</div>}
          </div>
        </div>

        <h3 className="ec-display" style={{ fontSize: 16, marginBottom: 10 }}>Scope of works</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: TOKENS.inkSoft, marginBottom: 22 }}>
          {buildMode === "highrise"
            ? `Feasibility estimate for a ${est.spec?.floors}-storey ${est.spec?.occupancy || ""} tower, ${fmt(est.takeoff?.gfaM2 || 0)} m² GFA, prepared from parametric system rates.`
            : buildMode === "materials"
            ? `Itemised quotation covering ${(est.lines || []).length} lines of materials, labour and trade works as listed below.`
            : buildMode === "multi"
            ? `Construction of ${est.dwellings} dwellings across ${(est.types || []).length} house type${(est.types || []).length === 1 ? "" : "s"} (${fmt(est.gfaM2 || 0)} m² GFA in total), including per-lot civil, services, fencing and landscaping, delivered in ${est.waves} stage${est.waves === 1 ? "" : "s"} over about ${est.totalWeeks} weeks.`
            : `Construction of a ${est.spec?.widthM}×${est.spec?.lengthM} m, ${est.spec?.floors}-storey residence (${fmt(est.takeoff?.gfaM2 || 0)} m² GFA) including structure, envelope, services and finishes as itemised below.`}
        </p>

        <h3 className="ec-display" style={{ fontSize: 16, marginBottom: 10 }}>Cost summary</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 22 }}>
          <tbody>
            {rows.map(([a, b, c], i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
                <td style={{ padding: "8px 0" }}>{a}</td>
                <td className="ec-mono" style={{ padding: "8px 0", color: TOKENS.steel, fontSize: 11 }}>{b}</td>
                <td className="ec-mono" style={{ padding: "8px 0", textAlign: "right" }}>{c}</td>
              </tr>
            ))}
            {/* Subtotal → tax → inclusive total. The ex-tax figure stays on the
                page because a builder reconciles against it, but the number set
                in bold is the one the client actually pays. */}
            {est.taxRate > 0 && (
              <>
                <tr style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
                  <td style={{ padding: "8px 0" }}>Subtotal (excl. {taxName(est)})</td>
                  <td />
                  <td className="ec-mono" style={{ padding: "8px 0", textAlign: "right" }}>{money(est.total)}</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
                  <td style={{ padding: "8px 0" }}>{est.taxLabel}</td>
                  <td />
                  <td className="ec-mono" style={{ padding: "8px 0", textAlign: "right" }}>{money(taxOf(est))}</td>
                </tr>
              </>
            )}
            <tr>
              <td className="ec-display" style={{ padding: "12px 0", fontSize: 15 }}>
                TOTAL {est.taxRate > 0 ? `(incl. ${taxName(est)})` : ""}
              </td>
              <td />
              <td className="ec-mono" style={{ padding: "12px 0", textAlign: "right", fontWeight: 700, fontSize: 16, color: TOKENS.hivisInk }}>{money(grossOf(est))}</td>
            </tr>
          </tbody>
        </table>

        {est.timeline?.totalWeeks && (
          <>
            <h3 className="ec-display" style={{ fontSize: 16, marginBottom: 10 }}>Programme</h3>
            <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 22 }}>
              Estimated construction period: <b>{est.timeline.totalWeeks} weeks</b> (~{(est.timeline.totalWeeks / 4.33).toFixed(1)} months), subject to approvals, weather and site conditions.
            </p>
          </>
        )}

        <h3 className="ec-display" style={{ fontSize: 16, marginBottom: 10 }}>Terms & basis</h3>
        <p style={{ fontSize: 11.5, lineHeight: 1.6, color: TOKENS.steel }}>
          This proposal is a feasibility-grade estimate generated from parametric market rates, valid 30 days.
          It is not a fixed-price contract. Final pricing requires supplier quotations, engineering
          documentation and site inspection. All work to comply with local building codes; structural
          elements require certification by a licensed engineer.
        </p>
      </div>
    </main>
  );
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [region, setRegion] = useState("AU");
  const [buildMode, setBuildMode] = useState("residential"); // residential | highrise
  const [spec, setSpec] = useState(DEFAULT_SPEC);
  const [hrSpec, setHrSpec] = useState(DEFAULT_HR_SPEC);
  const [matSpec, setMatSpec] = useState(DEFAULT_MAT_SPEC);
  const [mdSpec, setMdSpec] = useState(defaultMultiSpec);
  /* Plan gating. `upgrade` holds the feature someone just reached for that
     their plan doesn't include (a build mode, "ai" or "siteOffice"). */
  const { can } = useAuth();
  const [upgrade, setUpgrade] = useState(null);
  const [tab, setTab] = useState("estimate");

  /* ---- Workspace navigation: landing → projects → project workspace ----
     Every project lives in ONE workspace, walked as a linear workflow:
     Estimate → 3D → Materials → Timeline → AI → Quote → Proposal. */
  const [screen, setScreen] = useState("landing");     // landing | projects | workspace
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState("");
  // Set when the estimator hands a quote to a specific job, so Site Office
  // opens on that job rather than its dashboard. Cleared on plain navigation.
  const [manageJobId, setManageJobId] = useState(null);
  const [userType, setUserType] = useState(null);      // homeowner | tradie | developer — gates which build modes show
  const [stage, setStage] = useState("estimate");      // workflow stage id

  const openProject = useCallback((p) => {
    const mode = p.buildMode || "residential";
    if (!can.canUseMode(mode)) { setUpgrade(mode); return; }
    setProjectId(p.id); setProjectName(p.name);
    setUserType(p.userType || null);
    setBuildMode(p.buildMode || "residential");
    setRegion(p.region || "AU");
    if (p.spec) setSpec(p.spec);
    if (p.hrSpec) setHrSpec(p.hrSpec);
    if (p.matSpec) setMatSpec(p.matSpec);
    setMdSpec(p.mdSpec || defaultMultiSpec());
    setStage("estimate");
    setTab("estimate");
    setScreen("workspace");
    window.scrollTo({ top: 0 });
  }, [can]);

  /* Accepts a build mode, or a legacy audience id from the landing cards. */
  const newProject = useCallback((modeOrType, name) => {
    const fromType = { homeowner: "residential", developer: "highrise", tradie: "materials", builder: "multi" };
    const buildMode = BUILD_MODE_IDS.includes(modeOrType) ? modeOrType : (fromType[modeOrType] || "residential");
    if (!can.canUseMode(buildMode)) { setUpgrade(buildMode); return; }
    const p = createProject({ name, userType: modeOrType, buildMode, region, mdSpec: buildMode === "multi" ? defaultMultiSpec() : undefined });
    openProject(p);
  }, [region, openProject, can]);

  /* Autosave the open project whenever its data changes (debounced) */
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => {
      saveProject(projectId, { spec, hrSpec, matSpec, mdSpec, region, buildMode, name: projectName });
    }, 700);
    return () => clearTimeout(t);
  }, [projectId, spec, hrSpec, matSpec, region, buildMode, projectName]);
  const [ratesVersion, setRatesVersion] = useState(0); // bumped after equipment rate overrides change
  const [projectNo] = useState(genProjectNo);
  const [autoRotate, setAutoRotate] = useState(true);
  const [viewMode, setViewMode] = useState("finished"); // 3D: finished | structural (skin faded)
  const [progress, setProgress] = useState(1); // start fully built
  const [walkMode, setWalkMode] = useState(false);
  const [walkRoom, setWalkRoom] = useState("");
  const [walkT, setWalkT] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const viewportRef = useRef(null);
  const engineRef = useRef(null);
  const ioRef = useRef(null);

  /* Create the Three.js engine the first time the viewport container actually
     lands in the DOM, via a callback ref — NOT a one-shot mount effect. The
     container doesn't exist on the landing screen and unmounts on the AI/
     Proposal stages, so a []-deps effect ran too early and never retried,
     leaving the 3D blank everywhere. On later remounts the same canvas moves
     to the new node; the build effect below runs the first build once ready. */
  const attachViewport = useCallback((node) => {
    viewportRef.current = node;
    if (!node) return; // unmounting — keep the engine; its canvas detaches with the old node
    if (engineRef.current) {
      engineRef.current.remount(node);
    } else {
      const eng = new Engine3D(node);
      engineRef.current = eng;
      if (import.meta.env.DEV) window.__byoEngine = eng; // dev-only: headless 3D verification
      eng.onComplete = () => setProgress(1);
      eng.onWalkProgress = (t, name) => { setWalkT(t); setWalkRoom(name || ""); };
      eng.onModeChange = (m) => setWalkMode(m === "walk");
      setEngineReady(true);
    }
    // Pause rendering when the viewport scrolls off-screen — the biggest perf win.
    ioRef.current?.disconnect();
    ioRef.current = new IntersectionObserver(
      ([e]) => engineRef.current?.setPaused(!e.isIntersecting),
      { threshold: 0.01 }
    );
    ioRef.current.observe(node);
  }, []);

  /* Pause when the tab is hidden; tidy up if the app ever unmounts. */
  useEffect(() => {
    const onVis = () => engineRef.current?.setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      ioRef.current?.disconnect();
      engineRef.current?.dispose();
    };
  }, []);

  /* Hammer cursor: on across the app, and "taps" (swings down) while a button
     is pressed. Pointer-fine only, so touch devices are unaffected. */
  useEffect(() => {
    if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) return;
    const root = document.documentElement;
    root.classList.add("byo-hammer");
    const down = () => root.classList.add("byo-hammer-down");
    const up = () => root.classList.remove("byo-hammer-down");
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      root.classList.remove("byo-hammer", "byo-hammer-down");
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, []);

  /* Rebuild on spec or mode change (exit walkthrough first) */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.mode === "walk") { eng.stopWalk(); setWalkMode(false); }
    if (buildMode === "multi") {
      eng.isTower = false;
      eng.buildEstate(mdSpec.types);
      eng.setProgress(progress);
    } else if (buildMode === "highrise") {
      eng.isTower = true;
      eng.buildTower(hrSpec);
      setProgress(1);
    } else if (buildMode === "materials") {
      eng.isTower = false;
      const qSpec = specFromQuoteLines(matSpec.lines);
      if (qSpec) { eng.buildFromSpec(qSpec); eng.setProgress(1); }  // real inferred building from the quote
      else eng.buildMassing([]);                                    // nothing quoted yet → empty viewport
    } else {
      eng.isTower = false;
      eng.buildFromSpec(spec);
      eng.setProgress(progress);
    }
  }, [spec, hrSpec, matSpec, mdSpec, buildMode, engineReady]);

  useEffect(() => { if (buildMode === "residential" || buildMode === "multi") engineRef.current?.setProgress(progress); }, [progress, buildMode]);
  useEffect(() => { if (!walkMode) engineRef.current?.setAutoRotate(autoRotate); }, [autoRotate, walkMode]);

  /* The current page's secondary tabs, and which one is showing. A stale
     `tab` from another page falls back to this page's first view. */
  const pageTabs = stageTabs(stage, buildMode);
  // The Estimate page's extras (importers, codes) stay closed until asked for;
  // every other page opens on its first view.
  const activeTab = pageTabs.some((t) => t.id === tab) ? tab : stage === "estimate" ? null : pageTabs[0]?.id;

  /* Estimate (memoised) — switches engine by mode */
  const estimate = useMemo(
    () => buildMode === "multi" ? buildMultiEstimate(mdSpec, region)
      : buildMode === "highrise" ? HighRiseEstimator.buildEstimate(hrSpec, region)
      : buildMode === "materials" ? MaterialsOnly.buildEstimate(matSpec, region)
      : Estimator.buildEstimate(spec, region),
    [spec, hrSpec, matSpec, mdSpec, buildMode, region, ratesVersion]
  );

  /* Track estimate completion when total changes meaningfully */
  useEffect(() => {
    if (estimate && estimate.total > 0) {
      track("estimate_completed", { buildMode, region, total: Math.round(estimate.total) });
    }
  }, [estimate?.total, buildMode, region]);

  /* Representative building inferred from the quote — drives the Quote-mode viewport label */
  const quoteMassingSpec = useMemo(
    () => (buildMode === "materials" ? specFromQuoteLines(matSpec.lines) : null),
    [buildMode, matSpec]
  );

  /* Spec update helper */
  const update = useCallback((patch) => setSpec((s) => ({ ...s, ...patch })), []);
  const updateOpenings = useCallback((patch) =>
    setSpec((s) => ({ ...s, openings: { ...s.openings, ...patch } })), []);

  /* Send the finished quote across to the management side. This was the one
     direction the join never ran: a job could open its estimate, but a quote
     had no way to become a job. Reuses the job already linked to this project
     so pressing it twice re-syncs the budget rather than creating a duplicate. */
  const sendToSiteOffice = useCallback(() => {
    if (!projectId || !estimate || !(estimate.total > 0)) return null;
    let job = listCmJobs().find((j) => j.estimateProjectId === projectId) || null;
    const existed = !!job;
    if (!job) {
      job = createCmJob({
        name: projectName || "Untitled quote",
        buildMode, region,
        estimateProjectId: projectId,
        // The quote total becomes the contract sum the job is measured against.
        contractValue: Math.round(estimate.total),
      });
    } else {
      updateCmJob(job.id, { contractValue: Math.round(estimate.total), region, buildMode });
    }
    const seeded = applyEstimateToBudget(job.id, tradeTotalsFromEstimate(estimate));
    return { job, existed, seeded };
  }, [projectId, projectName, buildMode, region, estimate]);

  /* ---- Reset / clear helpers ----
     clearSection zeroes one card's fields; clearAll wipes the active engine. */
  const clearSection = useCallback((section) => {
    if (buildMode === "highrise") {
      setHrSpec((s) => ({ ...s, ...HR_SECTION_CLEAR[section] }));
      return;
    }
    if (section === "rooms") { setSpec((s) => ({ ...s, rooms: [] })); return; }
    if (section === "kitchens") { setSpec((s) => ({ ...s, kitchens: [] })); return; }
    if (section === "bathrooms") { setSpec((s) => ({ ...s, bathrooms: [] })); return; }
    setSpec((s) => ({ ...s, ...(RES_SECTION_CLEAR[section] || {}) }));
  }, [buildMode]);

  const clearAll = useCallback(() => {
    if (buildMode === "highrise") setHrSpec({ ...EMPTY_HR_SPEC });
    else if (buildMode === "materials") setMatSpec({ lines: [] });
    else setSpec({ ...EMPTY_SPEC });
  }, [buildMode]);

  const resetDefaults = useCallback(() => {
    if (buildMode === "highrise") setHrSpec({ ...DEFAULT_HR_SPEC });
    else setSpec({ ...DEFAULT_SPEC, rooms: DEFAULT_SPEC.rooms.map((r) => ({ ...r, id: nextId() })), kitchens: DEFAULT_SPEC.kitchens.map((k) => ({ ...k, id: nextId() })), bathrooms: DEFAULT_SPEC.bathrooms.map((b) => ({ ...b, id: nextId() })) });
  }, [buildMode]);

  /* Load a whole-building preset — sets a complete spec in one action,
     the same way an import does, but from a curated template rather than
     a file. */
  const applyPreset = useCallback((presetId) => {
    if (!presetId) return;
    if (buildMode === "highrise") {
      const preset = HIGHRISE_PRESETS.find((p) => p.id === presetId);
      if (preset) setHrSpec({ ...EMPTY_HR_SPEC, ...preset.buildSpec() });
    } else if (buildMode === "residential") {
      const preset = RESIDENTIAL_PRESETS.find((p) => p.id === presetId);
      if (preset) setSpec(preset.buildSpec());
    }
    setTab("estimate");
  }, [buildMode]);

  /* Push imported takeoff lines into the estimator: clears everything first,
     sizes a representative 3D massing from the data, and infers settings. */
  const applyImport = useCallback((lines, sourceLabel) => {
    const inf = inferSpecFromImport(lines);
    setBuildMode("residential");
    setSpec({
      ...EMPTY_SPEC,
      widthM: inf.side, lengthM: inf.side, floors: 1, wallHeightM: 2.7, roofPitch: 20, slabThicknessM: 0.1,
      claddingType: inf.cladding, roofType: inf.roof, floorFinish: inf.floorFinish,
      staircaseType: inf.staircaseType, hasGarage: inf.hasGarage,
      openings: { windowsCount: 0, windowsM2: 0, doors: 1 },
      rooms: [], kitchens: [], bathrooms: [],
      importedLines: lines,
      importMeta: { source: sourceLabel || "import", lineCount: lines.length, gfa: inf.gfa, detected: inf.detected },
    });
    setTab("estimate");
  }, []);

  const clearImport = useCallback(() => {
    setSpec({ ...DEFAULT_SPEC, rooms: DEFAULT_SPEC.rooms.map((r) => ({ ...r, id: nextId() })), kitchens: DEFAULT_SPEC.kitchens.map((k) => ({ ...k, id: nextId() })), bathrooms: DEFAULT_SPEC.bathrooms.map((b) => ({ ...b, id: nextId() })) });
  }, []);

  /* Import as an editable template: seeds rooms/kitchens/bathrooms so the user
     can keep designing. No importedLines, so all cards are editable. */
  const applyImportTemplate = useCallback((lines, sourceLabel) => {
    setBuildMode("residential");
    setSpec(buildTemplateSpecFromImport(lines, sourceLabel));
    setTab("estimate");
  }, []);

  /* Convert an already-applied (locked) import into the editable template. */
  const unlockImport = useCallback(() => {
    setSpec((s) => (s.importedLines && s.importedLines.length
      ? buildTemplateSpecFromImport(s.importedLines, (s.importMeta && s.importMeta.source) || "import")
      : s));
  }, []);

  /* Materials-only: load imported lines as raw material entries (no build). */
  const applyMaterialsImport = useCallback((lines) => {
    const matLines = lines.map((l) => ({
      id: nextId(),
      kind: "material",
      materialId: l.materialId || null,
      label: l.label || (l.catalogueLabel || "Item"),
      qty: l.qty,
      unit: l.unit || "",
      fixedRate: (l.priceSource === "file" || l.priceSource === "manual") ? l.rate : null,
      fixedTotal: l.priceSource === "file" ? l.total : null,
    }));
    setMatSpec({ lines: matLines });
    setBuildMode("materials");
    setTab("estimate");
  }, []);

  /* Toggle interior walkthrough */
  const toggleWalk = () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.mode === "walk") {
      eng.stopWalk();
      setWalkMode(false);
    } else {
      const ok = eng.startWalk();
      if (!ok) { setWalkRoom("Add rooms to enable the walkthrough"); return; }
      setProgress(1);
      setWalkMode(true);
    }
  };

  /* Play construction animation */
  const playConstruction = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.progress = 0;
    setProgress(0);
    eng.setProgress(0);
    eng.setPlaying(true);
    /* poll React state during play */
    const tick = () => {
      if (!eng.playing) {
        setProgress(eng.progress);
        return;
      }
      setProgress(eng.progress);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const [copied, setCopied] = useState(false);

  /* Save/share report as text — works across desktop and mobile.
     Phones: use the native share sheet (Save to Files, Notes, message, etc.).
     Desktop: download a .txt. Always offer copy-to-clipboard as a fallback. */
  const buildReportText = () => (
    buildMode === "multi" ? [
      `MULTI-DWELLING ESTIMATE — ${projectName} (${projectNo})`,
      `${estimate.dwellings} dwellings · ${fmt(estimate.gfaM2)} m² GFA · ${estimate.totalWeeks} weeks`, "",
      ...(estimate.types || []).map((t) => `${t.count} × ${t.name}  ${fmt(t.gfaM2)} m²  ${currency}${fmt(t.buildCost)}`), "",
      ...(estimate.siteLines || []).map((l) => `${l.label}  ${currency}${fmt(l.total)}`), "",
      `Preliminaries  ${currency}${fmt(estimate.prelims)}`, `Margin  ${currency}${fmt(estimate.margin)}`, `Contingency  ${currency}${fmt(estimate.contingency)}`,
      `PROJECT TOTAL (ex ${estimate.taxLabel})  ${currency}${fmt(estimate.total)}`,
      `Per dwelling  ${currency}${fmt(estimate.perDwelling)}`,
    ].join("\n")
    : buildMode === "highrise" ? Reporter.buildHighRise(estimate, projectNo)
    : buildMode === "materials" ? Reporter.buildMaterials(estimate, projectNo)
    : Reporter.build(estimate, projectNo)
  );

  const downloadReport = async () => {
    const text = buildReportText();
    const filename = `${projectNo}_${buildMode}_estimate.txt`;
    // 1. On phones with a share sheet, share a text file (or the text itself)
    try {
      if (navigator.share) {
        const file = new File([text], filename, { type: "text/plain" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Estimate", text: "Estimate from BYO" });
          return;
        }
        await navigator.share({ title: "Estimate", text });
        return;
      }
    } catch (e) { /* user cancelled or unsupported — fall through to download */ }
    // 2. Desktop / Android: trigger a file download
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      // 3. Last resort: copy to clipboard
      copyReport();
    }
  };

  const copyReport = async () => {
    const text = buildReportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // very old browsers: open the text so they can select & copy manually
      const w = window.open("", "_blank");
      if (w) { w.document.write("<pre>" + text.replace(/</g, "&lt;") + "</pre>"); }
    }
  };

  const updateHr = useCallback((patch) => setHrSpec((s) => ({ ...s, ...patch })), []);

  /* "Describe your project" → project data. The reader (built-in engine or
     AI) only identified features; WallBuilder / the house builder / the
     developer clamps turn them into priced inputs here. Returns a one-line
     summary for the card. */
  const scopeToLines = (items) => (items || []).flatMap((it) => {
    const pr = WallBuilder.getPreset(it.preset);
    if (!pr) return [];
    const opts = pr.dim === "wall"
      ? { lengthM: +it.lengthM || 3, heightM: +it.heightM || 2.4, finish: it.finish || "paint", sides: +it.sides || 2, insulated: true, labour: !!it.labour,
          addonList: (it.addons || []).filter((a) => a && a.id).map((a) => ({ id: a.id, qty: +a.qty || 1 })) }
      : { dim: +it.dim || 0, variant: it.variant || (pr.variants ? pr.variants[0].id : undefined), labour: !!it.labour, addonList: [] };
    return WallBuilder.presetToLines(it.preset, opts, region, nextId);
  });
  const applyDescribe = (r) => {
    if (r.kind === "scope") {
      const lines = scopeToLines(r.items);
      setMatSpec((m) => ({ lines: [...(m.lines || []), ...lines] }));
      return `Added ${lines.length} priced line${lines.length === 1 ? "" : "s"}.`;
    }
    if (r.kind === "developer") {
      const patch = cleanDeveloper(r.features);
      updateHr(patch);
      return `Filled in ${Object.keys(patch).length} building settings.`;
    }
    if (r.kind === "multi") {
      const types = r.types.map((t, i) => {
        const base = houseType(t.name || `Type ${String.fromCharCode(65 + i)}`);
        return { ...base, count: t.count, spec: houseSpecFromFeatures(t.features || {}, base.spec) };
      });
      setMdSpec((m) => ({ ...m, types }));
      return `Set up ${types.length} house type${types.length === 1 ? "" : "s"}, ${types.reduce((a, t) => a + t.count, 0)} dwellings.`;
    }
    const extras = scopeToLines(r.extras);
    setSpec((sp) => ({ ...houseSpecFromFeatures(r.features || {}, sp), extras: [...(sp.extras || []), ...extras] }));
    return `Updated the house${extras.length ? ` and added ${extras.length} extra line${extras.length === 1 ? "" : "s"}` : ""}.`;
  };
  const currency = currencySymbol(region);

  return (
    <div style={{ minHeight: "100vh", color: TOKENS.ink, fontFamily: "'Inter', sans-serif" }}>
      {/* Ambient 3D: structure endlessly assembling & breaking apart behind the app */}
      <BackgroundScene opacity={0.45} />
      {/* Content layer — translucent paper so the scene ghosts through between cards */}
      <div style={{ position: "relative", zIndex: 1, background: TOKENS.contentVeil }}>
      {/* Inline style block for fonts + custom colors (Tailwind core only supports utility classes) */}
      <style>{`
        @import url('${FONT_URL}');
        /* The single source of colour for the whole app. TOKENS.* are var()
           references (design/system.js), so flipping data-theme on <html>
           re-colours every inline style and .ec-* class at once. */
        :root {
          ${cssVariables("light")}
          color-scheme: light;
        }
        :root[data-theme="dark"] {
          ${cssVariables("dark")}
          color-scheme: dark;
        }
        /* A client-facing document is a sheet of white paper. It gets printed
           and PDF'd, so its surface cannot follow the app theme — but its text
           uses the same --ink/--steel/--hivis-deep tokens as everything else,
           and in dark mode those flip to near-white and land invisibly on the
           white page. Re-declaring the LIGHT palette on the sheet itself makes
           every token inside resolve against white again, so one class fixes
           the whole document rather than 40 hand-patched call sites. */
        .byo-doc-light {
          ${cssVariables("light")}
          color-scheme: light;
          color: var(--ink);
        }
        html { scroll-behavior: smooth; }
        body { background: var(--paper); overflow-x: hidden; }
        html { overflow-x: hidden; max-width: 100%; }
        .ec-display { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.01em; }
        .ec-mono { font-family: 'JetBrains Mono', monospace; font-feature-settings: "tnum"; }
        .ec-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--steel); }
        .ec-rule { border-top: 1px solid var(--rule); }
        .ec-rule-strong { border-top: 2px solid var(--ink); }
        .ec-paper {
          background-image:
            linear-gradient(var(--grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .ec-card {
          background: var(--card);
          border: 1px solid var(--rule);
          transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
        }
        .ec-card:hover { border-color: var(--ink); }
        .ec-tag {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 2px 8px;
          background: var(--ink); color: var(--paper);
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
        }
        /* --on-hivis, not --ink: safety yellow is a light colour in BOTH
           themes, so its text stays near-black. Using --ink here would flip
           to near-white on dark and give yellow-on-white. */
        .ec-tag-hivis { background: var(--hivis); color: var(--on-hivis); }
        .ec-input, .ec-select {
          width: 100%;
          background: var(--paper-light);
          border: 1px solid var(--rule);
          padding: 9px 11px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--ink);
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .ec-input:hover, .ec-select:hover { background: var(--card); }
        .ec-input:focus, .ec-select:focus { border-color: var(--ink); background: var(--card); }
        .ec-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 5px;
          display: block;
        }
        .ec-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px;
          background: var(--ink); color: var(--paper);
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: none;
          cursor: pointer;
          transition: background 0.18s, transform 0.18s;
        }
        .ec-btn:hover { background: #000; }
        .ec-btn:active { transform: translateY(1px); }
        .ec-btn-hivis { background: var(--hivis); color: var(--on-hivis); }
        .ec-btn-hivis:hover { background: var(--hivis-deep); }
        .ec-btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--ink); }
        .ec-btn-ghost:hover { background: var(--ink); color: var(--paper); }
        /* Pressed/selected ghost button. This exists as a class because doing
           it with an inline colour beat the :hover rule above on specificity
           — hovering an unselected nav button gave it an ink background while
           the inline colour kept the label ink too, i.e. invisible. */
        .ec-btn-ghost-on,
        .ec-btn-ghost-on:hover { background: var(--ink); color: var(--paper); }
        /* The strip scrolls sideways rather than wrapping. Each tab must keep
           its natural width — flex items shrink by default, and combined with
           white-space:nowrap that squeezed every box to ~50px while the text
           kept full width, so labels overlapped their neighbours and the tap
           target no longer matched the words you were aiming at. */
        .ec-tabstrip { display: flex; gap: 0; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }
        /* Hide the scrollbar without losing the scroll — the underline rule is
           the visual boundary here and a gutter breaks it. */
        .ec-tabstrip { scrollbar-width: none; -ms-overflow-style: none; }
        .ec-tabstrip::-webkit-scrollbar { display: none; }
        .ec-tab { flex: 0 0 auto; scroll-snap-align: start; display: flex; align-items: center; min-height: 44px; padding: 11px 18px; font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--steel); cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.18s, border-bottom-color 0.18s; white-space: nowrap; -webkit-tap-highlight-color: transparent; user-select: none; }
        .ec-tab:hover { color: var(--ink); }
        .ec-tab-active { color: var(--ink); border-bottom-color: var(--hivis); }
        .ec-link { color: var(--ink); text-decoration: underline; text-decoration-color: var(--hivis); text-decoration-thickness: 2px; text-underline-offset: 3px; }
        .ec-link:hover { text-decoration-color: var(--ink); }

        /* ===== Hammer cursor — brand personality; "taps" (swings down) on click ===== */
        html.byo-hammer, html.byo-hammer * {
          cursor: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI4IDI4Ij48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtNDIgMTQgMTQpIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTUiIGhlaWdodD0iNiIgcng9IjEuNiIgZmlsbD0iIzNCNDE0QSIgc3Ryb2tlPSIjMTQxNzFBIiBzdHJva2Utd2lkdGg9IjEuMyIvPjxyZWN0IHg9IjEwIiB5PSI5LjUiIHdpZHRoPSI0IiBoZWlnaHQ9IjE0IiByeD0iMS4zIiBmaWxsPSIjRDlBQzAwIiBzdHJva2U9IiMxNDE3MUEiIHN0cm9rZS13aWR0aD0iMS4zIi8+PC9nPjwvc3ZnPg==") 6 5, auto !important;
        }
        html.byo-hammer.byo-hammer-down, html.byo-hammer.byo-hammer-down * {
          cursor: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI4IDI4Ij48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtMTYgMTQgMTQpIj48cmVjdCB4PSI0IiB5PSI3IiB3aWR0aD0iMTUiIGhlaWdodD0iNiIgcng9IjEuNiIgZmlsbD0iIzNCNDE0QSIgc3Ryb2tlPSIjMTQxNzFBIiBzdHJva2Utd2lkdGg9IjEuMyIvPjxyZWN0IHg9IjEwIiB5PSIxMi41IiB3aWR0aD0iNCIgaGVpZ2h0PSIxNCIgcng9IjEuMyIgZmlsbD0iI0Q5QUMwMCIgc3Ryb2tlPSIjMTQxNzFBIiBzdHJva2Utd2lkdGg9IjEuMyIvPjwvZz48L3N2Zz4=") 8 9, auto !important;
        }
        /* keep text fields usable — real text cursor when typing */
        html.byo-hammer input:not([type=range]):not([type=checkbox]):not([type=radio]),
        html.byo-hammer textarea,
        html.byo-hammer [contenteditable="true"] { cursor: text !important; }

        /* ===== HERO ===== */
        .ec-hero-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .ec-hero-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%);
          pointer-events: none;
        }
        .ec-hero-bottom-fade {
          position: absolute; left: 0; right: 0; bottom: 0; height: 30%;
          background: linear-gradient(to bottom, transparent, var(--paper));
          pointer-events: none;
        }
        @keyframes fade-in-down {
          from { opacity: 0; transform: translate3d(0, -20px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translate3d(0, 30px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes scroll-bob {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50%      { transform: translateY(8px); opacity: 1; }
        }
        .ec-fade-down { animation: fade-in-down 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .ec-fade-up   { animation: fade-in-up   0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .ec-delay-1 { animation-delay: 0.15s; }
        .ec-delay-2 { animation-delay: 0.30s; }
        .ec-delay-3 { animation-delay: 0.45s; }
        .ec-delay-4 { animation-delay: 0.60s; }
        .ec-scroll-bob { animation: scroll-bob 2s ease-in-out infinite; }

        /* Live blip */
        @keyframes blink { 50% { opacity: 0.3; } }
        .ec-live { animation: blink 1.4s infinite; }
        /* keyboard focus */
        button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--hivis); outline-offset: 2px; }
        /* phones: the trust badge repeats the line under the buttons — drop it so the hero fits */
        @media (max-width: 560px) { .ec-hero-badge { display: none !important; } }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .ec-live, .ec-scroll-bob, .ec-fade-down, .ec-fade-up { animation: none !important; }
        }
      `}</style>

      {screen === "landing" && (
        <Landing region={region} setRegion={setRegion}
          onStart={() => newProject("residential", "My build")}
          onPickAudience={(id) => {
            if (id === "homeowner") { newProject("residential", "My build"); return; }
            setScreen("projects"); window.scrollTo({ top: 0 });
          }}
          onSignedIn={() => { setScreen("projects"); window.scrollTo({ top: 0 }); }}
          howItWorks={<HowItWorksSection />} />
      )}

      {screen !== "landing" && <>
      {/* ====== STICKY TOPBAR: header + workflow stepper pinned together ====== */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        background: TOKENS.contentVeil,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: `1px solid ${TOKENS.rule}`,
      }}>
      <header style={{
        borderBottom: screen === "workspace" ? `1px solid ${TOKENS.rule}` : "none",
      }}>
        <div className="hdr-in" style={{ maxWidth: 1480, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span onClick={() => setScreen("landing")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <BYOLogo size={28} />
              <div className="ec-display hdr-word" style={{ fontSize: 16, color: TOKENS.ink, letterSpacing: "0.02em" }}>BUILD YOUR OWN</div>
            </span>
            <button className={"ec-btn ec-btn-ghost" + (screen === "projects" ? " ec-btn-ghost-on" : "")}
              onClick={() => setScreen("projects")} style={{ marginLeft: 6 }}>
              Dashboard
            </button>
            {/* The management side: jobs, takeoffs, budgets, claims. Separate
                from Projects because it answers a different question — not
                "what will this cost" but "how is this job actually going". */}
            <button className={"ec-btn ec-btn-ghost" + (screen === "manage" ? " ec-btn-ghost-on" : "")}
              onClick={() => { if (!can.siteOffice) { setUpgrade("siteOffice"); return; } setManageJobId(null); setScreen("manage"); }}>
              Site Office{can.siteOffice ? "" : " 🔒"}
            </button>
            {screen === "workspace" && (
              <input className="ec-input" value={projectName} onChange={(e) => setProjectName(e.target.value)}
                title="Project name" style={{ width: 170, fontWeight: 600, fontSize: 13 }} />
            )}
          </div>
          {/* Build mode and region are DECISIONS made when a project is set
              up, so they are only editable on the Projects screen. Once
              you're inside a project they become read-only labels: changing
              a job's build mode halfway through would silently invalidate
              every quantity already measured against it. */}
          <div className="hdr-actions" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {screen === "projects" && (
              <>
                <div style={{ display: "flex", border: `1px solid ${TOKENS.emberDeep}`, borderRadius: 2, overflow: "hidden" }}>
                  {BUILD_MODES.map(([m, label]) => (
                    <button key={m} title={can.canUseMode(m) ? label : `${label} — upgrade to unlock`}
                      onClick={() => { if (!can.canUseMode(m)) { setUpgrade(m); return; } setBuildMode(m); setTab("estimate"); }}
                      className="ec-mono"
                      style={{
                        padding: "6px 12px",
                        background: buildMode === m ? TOKENS.emberDeep : "transparent",
                        color: buildMode === m ? TOKENS.onEmber : TOKENS.emberInk,
                        border: "none", cursor: "pointer",
                        fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
                        opacity: can.canUseMode(m) ? 1 : 0.55,
                      }}>{label}{can.canUseMode(m) ? "" : " 🔒"}</button>
                  ))}
                </div>
                <div style={{ display: "flex", border: `1px solid ${TOKENS.ink}` }}>
                  {["AU","US","UK"].map((r) => (
                    <button key={r} onClick={() => setRegion(r)}
                      className="ec-mono"
                      style={{
                        padding: "5px 10px",
                        background: region === r ? TOKENS.ink : "transparent",
                        color: region === r ? TOKENS.paper : TOKENS.ink,
                        border: "none", cursor: "pointer",
                        fontSize: 10, letterSpacing: "0.12em",
                      }}>{r}</button>
                  ))}
                </div>
              </>
            )}

            {screen === "workspace" && (
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Badge variant="outline" className="border-ember-deep text-ember-ink">
                  {buildModeLabel(buildMode)}
                </Badge>
                <Badge variant="outline">{region}</Badge>
              </div>
            )}

            {/* Export only once there is a real priced quote behind it — an
                empty estimate produces a document that makes the app look
                broken to whoever it gets sent to. */}
            {screen === "workspace" && estimate?.total > 0 && (
              <>
                <button className="ec-btn ec-btn-hivis" onClick={downloadReport}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16" /></svg>
                  Save / share
                </button>
                <button className="ec-btn ec-btn-ghost hdr-copy" onClick={copyReport} title="Copy estimate text">
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </>
            )}

            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <AccountButton />
          </div>
        </div>
      </header>

      {/* Post-signup "how will you use BYO" page. Self-gating: renders only for
          a signed-in user who hasn't picked a segment yet. */}
      <Onboarding />
      {upgrade && <UpgradeModal feature={upgrade} onClose={() => setUpgrade(null)} />}

      {/* ====== WORKFLOW STEPPER (workspace) — pinned under the header ====== */}
      {screen === "workspace" && (
        <WorkflowStepper stage={stage} onStage={(s) => {
          setStage(s);
          window.scrollTo({ top: 0 });
        }} buildMode={buildMode} />
      )}
      </div>

      {/* ============== PROJECTS SCREEN ============== */}
      {screen === "projects" && (
        <ProjectsScreen onOpen={openProject} onNew={newProject}
          onOpenSiteOffice={() => { if (!can.siteOffice) { setUpgrade("siteOffice"); return; } setManageJobId(null); setScreen("manage"); window.scrollTo({ top: 0 }); }} />
      )}

      {/* ============== CONSTRUCTION MANAGEMENT ============== */}
      {screen === "manage" && (
        <ConstructionManager
          key={manageJobId || "dash"}
          initialJobId={manageJobId}
          onOpenEstimator={(job) => {
            // A job either already points at an estimator project or gets a
            // fresh one created and linked, so the two sides stay joined
            // rather than drifting into duplicate records.
            let project = job.estimateProjectId ? getProject(job.estimateProjectId) : null;
            if (!project) {
              project = createProject({ name: job.name, buildMode: job.buildMode, region: job.region });
              updateCmJob(job.id, { estimateProjectId: project.id });
            }
            openProject(project);
            setScreen("workspace");
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {/* ============== MAIN GRID (estimator tool) ============== */}
      {screen === "workspace" && !["ai", "proposal"].includes(stage) && (
      <main id="tool" style={{ maxWidth: 1480, margin: "0 auto", padding: "28px 24px 64px", display: "grid", gridTemplateColumns: stage === "estimate" ? "minmax(320px, 380px) 1fr" : "1fr", gap: 28 }} className={"grid-responsive" + (stage === "three_d" ? " stage-3d" : "")}>
        <style>{`
          main.grid-responsive { box-sizing: border-box; }
          main.grid-responsive * { min-width: 0; }
          input, select, textarea, button { max-width: 100%; }
          /* 3D viewport controls — compact bar under the live view */
          .ec-viewport-controls .ec-btn { padding: 7px 11px; font-size: 12px; }
          @media (max-width: 560px) {
            .ec-viewport-controls { gap: 6px !important; padding: 6px !important; }
            .ec-viewport-controls .ec-btn { padding: 6px 9px; font-size: 11px; }
            .ec-viewport-controls > div { min-width: 110px !important; }
          }
          @media (max-width: 960px) {
            main.grid-responsive { grid-template-columns: 1fr !important; padding: 32px 16px 48px !important; gap: 20px !important; }
          }
          @media (max-width: 560px) {
            main.grid-responsive { padding: 24px 12px 40px !important; }
            .ec-viewport { height: 320px !important; }
            main.stage-3d .ec-viewport { height: 62vh !important; }  /* the 3D page is the model — let it fill the phone */
          }
          /* Compact one-row sticky header on small screens — never eat the viewport */
          @media (max-width: 880px) {
            .hdr-in { padding: 8px 12px !important; gap: 8px !important; flex-wrap: nowrap !important; }
            .hdr-word, .hdr-proj, .hdr-copy { display: none !important; }
            .hdr-actions { gap: 8px !important; flex-wrap: nowrap !important; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
            .hdr-actions::-webkit-scrollbar { display: none; }
            .hdr-actions > * { flex-shrink: 0; }
          }
        `}</style>

        {/* ===== LEFT — INPUT PANEL (Estimate page only) ===== */}
        {stage === "estimate" && (
        <section>
          <Reveal variant="slide-left">
            <div className="ec-eyebrow" style={{ marginBottom: 8 }}>01 — Configure</div>
            <h2 className="ec-display" style={{ fontSize: 28, lineHeight: 1, marginBottom: 12 }}>Building specification</h2>
            {/* Start of the workflow: describe it, then fine-tune below. On a
                plan without AI this runs on the built-in engine — no credits. */}
            {!(buildMode === "residential" && spec.importedLines && spec.importedLines.length > 0) && (
              <DescribeCard key={buildMode} mode={buildMode} useAi={can.ai} onApply={applyDescribe} />
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={clearAll}
                className="ec-mono"
                style={{ flex: 1, padding: "8px 10px", border: `1px solid ${TOKENS.alert}`, background: "transparent", color: TOKENS.alert, cursor: "pointer", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.alert; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TOKENS.alert; }}>
                ⨯ Clear all figures
              </button>
              <button onClick={resetDefaults}
                className="ec-mono"
                style={{ flex: 1, padding: "8px 10px", border: `1px solid ${TOKENS.ink}`, background: "transparent", color: TOKENS.ink, cursor: "pointer", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.ink; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TOKENS.ink; }}>
                ↺ Reset to sample
              </button>
            </div>
            {buildMode !== "materials" && (
              <select className="ec-input ec-mono" defaultValue=""
                style={{ width: "100%", marginBottom: 16, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}
                onChange={(e) => { applyPreset(e.target.value); e.target.value = ""; }}>
                <option value="" disabled>▤ Load a building preset…</option>
                {(buildMode === "highrise" ? HIGHRISE_PRESETS : RESIDENTIAL_PRESETS).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            )}
          </Reveal>

          {/* keyed remount + enter animation only — an exit-blocking transition
              (mode="wait") can leave the stale panel visible in rAF-throttled
              background tabs, so the old panel is dropped instantly instead */}
          <motion.div key={"panel-" + buildMode}
            initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}>
          {buildMode === "multi" ? (
            <MultiDwellingPanel mdSpec={mdSpec} setMdSpec={setMdSpec} estimate={estimate} currency={currencySymbol(region)} />
          ) : buildMode === "materials" ? (
            <MaterialsPanel lines={matSpec.lines} setLines={(l) => setMatSpec({ lines: l })} region={region} currency={currencySymbol(region)} summary={estimate} />
          ) : buildMode === "highrise" ? (
            <HighRisePanel hrSpec={hrSpec} updateHr={updateHr} estimate={estimate} clearSection={clearSection} />
          ) : spec.importedLines && spec.importedLines.length > 0 ? (
            <ImportedPanel spec={spec} estimate={estimate} currency={currencySymbol(region)} onClear={clearImport} onUnlock={unlockImport} />
          ) : (
          <>
          <InputCard title="Dimensions" badge="Parametric" onClear={() => clearSection("dimensions")}>
            <SliderField label="Length" value={spec.lengthM} unit="m" min={3} max={60} step={0.5} onChange={(v) => update({ lengthM: v })} />
            <SliderField label="Width" value={spec.widthM} unit="m" min={3} max={60} step={0.5} onChange={(v) => update({ widthM: v })} />
            <SliderField label="Wall height" value={spec.wallHeightM} unit="m" min={2.4} max={4.0} step={0.1} onChange={(v) => update({ wallHeightM: v })} />
            <SliderField label="Roof pitch" value={spec.roofPitch} unit="°" min={0} max={45} step={1} onChange={(v) => update({ roofPitch: v })} />
            <InputRow>
              <Field label="Floors"><input className="ec-input" type="number" min="1" max="4" step="1" value={spec.floors} onChange={(e) => update({ floors: +e.target.value })} /></Field>
              <Field label="Slab thickness (m)"><input className="ec-input" type="number" min="0.08" max="0.3" step="0.01" value={spec.slabThicknessM} onChange={(e) => update({ slabThicknessM: +e.target.value })} /></Field>
            </InputRow>
          </InputCard>

          <InputCard defaultOpen={false} title="Materials" onClear={() => clearSection("materials")}>
            <Field label="Framing">
              <select className="ec-select" value={spec.framingType} onChange={(e) => update({ framingType: e.target.value })}>
                <option value="timber">Timber (MGP10 / LVL)</option>
                <option value="steel">Light steel frame</option>
              </select>
            </Field>
            <Field label="Roof material">
              <select className="ec-select" value={spec.roofType} onChange={(e) => update({ roofType: e.target.value })}>
                <option value="colorbond">Colorbond steel sheet</option>
                <option value="tile">Concrete tile</option>
                <option value="shingle">Asphalt shingle</option>
              </select>
            </Field>
            <Field label="External cladding">
              <select className="ec-select" value={spec.claddingType} onChange={(e) => update({ claddingType: e.target.value })}>
                <option value="brick">Brick veneer</option>
                <option value="weatherboard">Weatherboard (fibre cement)</option>
                <option value="render">Acrylic render</option>
              </select>
            </Field>
            <Field label="Floor finish">
              <select className="ec-select" value={spec.floorFinish} onChange={(e) => update({ floorFinish: e.target.value })}>
                <option value="timber">Engineered timber</option>
                <option value="tile">Tile</option>
                <option value="carpet">Carpet</option>
              </select>
            </Field>
            <Field label="Staircase">
              <select className="ec-select" value={spec.staircaseType} onChange={(e) => update({ staircaseType: e.target.value })}>
                <option value="none">None (single storey)</option>
                <option value="timber">Timber flight + stringers</option>
                <option value="steel_glass">Steel + glass balustrade</option>
                <option value="concrete">Precast concrete</option>
              </select>
            </Field>
            {spec.staircaseType !== "none" && spec.floors < 2 && (
              <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.alert, marginTop: 4, lineHeight: 1.4 }}>
                Set floors to 2+ for the staircase to appear in the model & estimate.
              </p>
            )}
          </InputCard>

          <InputCard defaultOpen={false} title="Openings" onClear={() => clearSection("openings")}>
            <InputRow>
              <Field label="Windows (count)"><input className="ec-input" type="number" min="0" max="60" step="1" value={spec.openings.windowsCount} onChange={(e) => updateOpenings({ windowsCount: +e.target.value })} /></Field>
              <Field label="Window area (m²)"><input className="ec-input" type="number" min="0" max="200" step="0.5" value={spec.openings.windowsM2} onChange={(e) => updateOpenings({ windowsM2: +e.target.value })} /></Field>
            </InputRow>
            <InputRow>
              <Field label="External doors"><input className="ec-input" type="number" min="1" max="8" step="1" value={spec.openings.doors} onChange={(e) => updateOpenings({ doors: +e.target.value })} /></Field>
              <Field label=" "><div style={{ display: "flex", gap: 8 }}>
                <Toggle label="Garage" value={spec.hasGarage} onChange={(v) => update({ hasGarage: v })} />
                <Toggle label="Solar" value={spec.solar} onChange={(v) => update({ solar: v })} />
              </div></Field>
            </InputRow>
          </InputCard>

          <RoomScheduleCard spec={spec} setSpec={setSpec} />

          <KitchenCard spec={spec} setSpec={setSpec} />

          <BathroomCard spec={spec} setSpec={setSpec} />

          <InputCard defaultOpen={false} title="Site conditions" onClear={() => clearSection("site")}>
            <Field label="Block type">
              <select className="ec-select" value={spec.siteCondition} onChange={(e) => update({ siteCondition: e.target.value })}>
                <option value="flat">Flat / good access</option>
                <option value="sloping">Sloping / battered</option>
                <option value="difficult">Difficult / reactive soil / restricted</option>
              </select>
            </Field>
            <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
              Sloping sites add ~12% to labour, difficult sites add ~25%, reflecting earthworks, retaining, and crane access.
            </p>
          </InputCard>

          {/* Additional jobs / scope on top of the base build */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `2px dashed ${TOKENS.rule}` }}>
            <MaterialsPanel lines={spec.extras || []} setLines={(l) => update({ extras: l })} region={region} currency={currencySymbol(region)} embed />
          </div>
          </>
          )}
          </motion.div>
        </section>
        )}

        {/* ===== RIGHT — the page's own content ===== */}
        <section>
          {stage !== "estimate" && (
            <div style={{ marginBottom: 16 }}>
              <div className="ec-eyebrow" style={{ marginBottom: 8 }}>{(PAGE_HEAD[stage] || [])[0]}</div>
              <h2 className="ec-display" style={{ fontSize: 28, lineHeight: 1, margin: 0 }}>{(PAGE_HEAD[stage] || [])[1]}</h2>
            </div>
          )}

          {/* 3D viewport — a compact live preview while you edit, full size on its own page */}
          {(stage === "estimate" || stage === "three_d") && (<>
          <div id="ws-viewport" className="ec-card ec-paper ec-viewport" style={{ position: "relative", padding: 0, height: stage === "three_d" ? "min(72vh, 760px)" : 360, overflow: "hidden" }}>
            <div ref={attachViewport} style={{ position: "absolute", inset: 0 }} />
            {/* Dimension annotations overlay */}
            <div style={{ position: "absolute", top: 16, left: 16, maxWidth: "55%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, pointerEvents: "none" }}>
              <span className="ec-tag ec-tag-hivis">VIEWPORT</span>
              {buildMode === "materials" ? (
                quoteMassingSpec ? (
                  <>
                    <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                      {quoteMassingSpec.widthM}m × {quoteMassingSpec.lengthM}m · inferred model
                    </div>
                    <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                      Massed from quoted items
                    </div>
                  </>
                ) : (
                  <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                    Add quote items to see the 3D model
                  </div>
                )
              ) : buildMode === "multi" ? (
                <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                  {estimate.dwellings} dwellings{estimate.dwellings > 24 ? " · first 24 shown" : ""} · {fmt(estimate.gfaM2 || 0)} m²
                </div>
              ) : buildMode === "highrise" ? (
                <>
                  <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                    {hrSpec.floors} floors · {(estimate.takeoff?.totalHeightM || 0).toFixed(0)}m
                  </div>
                  <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                    GFA · {fmt(estimate.takeoff?.gfaM2 || 0)} m²
                  </div>
                </>
              ) : (
                <>
                  <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                    {spec.widthM}m × {spec.lengthM}m × {(spec.wallHeightM * spec.floors).toFixed(1)}m
                  </div>
                  <div className="ec-mono" style={{ fontSize: 11, background: TOKENS.cardVeil, padding: "4px 8px", color: TOKENS.ink }}>
                    GFA · {(estimate.takeoff?.gfaM2 || 0).toFixed(0)} m²
                  </div>
                </>
              )}
            </div>
            {/* Live indicator + current room (walk mode) */}
            <div style={{ position: "absolute", top: 16, right: 16, maxWidth: "42%", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span className="ec-tag"><span className="ec-live" style={{ width: 6, height: 6, background: TOKENS.hivis, borderRadius: "50%", display: "inline-block" }} />{walkMode ? "WALKTHROUGH" : "LIVE"}</span>
              {walkMode && walkRoom && (
                <div className="ec-mono" style={{ fontSize: 12, background: TOKENS.emphasis, color: TOKENS.onEmphasis, padding: "5px 10px", letterSpacing: "0.04em" }}>
                  ▸ {walkRoom}
                </div>
              )}
            </div>
          </div>{/* end #ws-viewport */}
            {/* Controls — sit BELOW the live view, never over it (mobile-safe) */}
            <div className="ec-viewport-controls" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: TOKENS.paperLight, padding: 8, borderRadius: 4, border: `1px solid ${TOKENS.rule}` }}>
              {buildMode === "materials" ? (
                <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, background: TOKENS.cardVeil, padding: "8px 12px", border: `1px solid ${TOKENS.rule}` }}>
                  Quote builder — material, labour & trades in one total
                </div>
              ) : !walkMode ? (
                <>
                  <button className="ec-btn ec-btn-hivis" onClick={playConstruction}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Play demo
                  </button>
                  <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, background: TOKENS.cardVeil, padding: "6px 10px", border: `1px solid ${TOKENS.rule}` }}>
                    <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>STAGE</span>
                    <input type="range" min="0" max="1" step="0.01" value={progress}
                      onChange={(e) => { setProgress(+e.target.value); engineRef.current?.setPlaying(false); }}
                      style={{ flex: 1, accentColor: TOKENS.ink }} />
                    <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink, minWidth: 50, textAlign: "right" }}>
                      {stageLabel(progress)}
                    </span>
                  </div>
                  <button className="ec-btn ec-btn-ghost" onClick={() => {
                    const next = viewMode === "structural" ? "finished" : "structural";
                    setViewMode(next);
                    engineRef.current?.setViewMode(next);
                  }}>
                    {viewMode === "finished" ? "Show skeleton" : "Show finished"}
                  </button>
                  <button className="ec-btn" onClick={toggleWalk} style={{ background: TOKENS.emberDeep, color: TOKENS.onEmber }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/><path d="M12 7v6m0 0l-3 7m3-7l3 7M8 9h8" strokeLinecap="round"/></svg>
                    Walk through
                  </button>
                  <button className={"ec-btn ec-btn-ghost" + (autoRotate ? " ec-btn-ghost-on" : "")} onClick={() => setAutoRotate((v) => !v)}>
                    {autoRotate ? "Auto-rotate ON" : "Auto-rotate OFF"}
                  </button>
                </>
              ) : (
                <>
                  <button className="ec-btn ec-btn-hivis" onClick={toggleWalk}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M6 18L18 6" strokeLinecap="round"/></svg>
                    Exit walkthrough
                  </button>
                  <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, background: TOKENS.cardVeil, padding: "6px 10px", border: `1px solid ${TOKENS.rule}` }}>
                    <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>TOUR</span>
                    <input type="range" min="0" max="1" step="0.005" value={walkT}
                      onChange={(e) => { engineRef.current?.setWalkT(+e.target.value); setWalkT(+e.target.value); }}
                      style={{ flex: 1, accentColor: TOKENS.emberDeep }} />
                    <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink, minWidth: 40, textAlign: "right" }}>{Math.round(walkT * 100)}%</span>
                  </div>
                </>
              )}
            </div>
          </>)}

          {/* Headline cost cards — Estimate and Costs pages */}
          {(stage === "estimate" || stage === "materials") && (
          <div id="ws-results" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: stage === "estimate" ? 16 : 0 }}>
            <StaggerReveal variant="fade-up" stagger={0.06}>
              {buildMode === "multi" ? [
                <CostCard key="t" label="Project total" value={`${currency}${fmt(grossOf(estimate))}`} hivis sub={inclusiveNote(estimate, currency)} />,
                <CostCard key="d" label="Per dwelling" value={`${currency}${fmt(estimate.perDwelling)}`} sub={`${estimate.dwellings} homes · ex tax`} />,
                <CostCard key="s" label="Saving vs one-off" value={`${currency}${fmt(Math.max(0, estimate.oneOffTotal - estimate.houseOnlyTotal))}`} sub="Houses only, same specs" />,
                <CostCard key="w" label="Site works" value={`${currency}${fmt(estimate.siteWorks)}`} />,
                <CostCard key="p" label="Programme" value={`${estimate.totalWeeks} wks`} sub={`${estimate.waves} wave${estimate.waves === 1 ? "" : "s"}`} />,
                <CostCard key="r" label={`${currency}/m² GFA`} value={`${currency}${fmt(estimate.ratePerM2)}`} />,
              ] : buildMode === "materials" ? [
                <CostCard key="t" label="Quote total" value={`${currency}${fmt(grossOf(estimate))}`} hivis sub={inclusiveNote(estimate, currency)} />,
                <CostCard key="m" label="Materials" value={`${currency}${fmt((estimate.byKind || {}).material || 0)}`} />,
                <CostCard key="l" label="Labour" value={`${currency}${fmt((estimate.byKind || {}).labour || 0)}`} />,
                <CostCard key="e" label="Trades & jobs" value={`${currency}${fmt((estimate.byKind || {}).element || 0)}`} sub={`${estimate.lines.length} lines`} />,
              ] : buildMode === "highrise" ? [
                <CostCard key="t" label="Total estimate" value={`${currency}${fmt(grossOf(estimate))}`} hivis sub={inclusiveNote(estimate, currency)} />,
                <CostCard key="s" label="Systems (adj.)" value={`${currency}${fmt(estimate.systemsTotal)}`} />,
                <CostCard key="d" label="Design fees" value={`${currency}${fmt(estimate.designFees)}`} />,
                <CostCard key="g" label="GFA" value={`${fmt(estimate.takeoff.gfaM2)} m²`} sub={`${estimate.spec.floors} floors`} />,
                <CostCard key="p" label="Programme" value={`${estimate.timeline.totalWeeks} wks`} sub={`~${(estimate.timeline.totalWeeks / 52).toFixed(1)} yrs`} />,
                <CostCard key="r" label={`${currency}/m² GFA`} value={`${currency}${fmt(estimate.total / Math.max(1, estimate.takeoff.gfaM2))}`} />,
              ] : [
                <CostCard key="t" label="Total estimate" value={`${currency}${fmt(grossOf(estimate))}`} hivis sub={inclusiveNote(estimate, currency)} />,
                <CostCard key="m" label="Materials" value={`${currency}${fmt(estimate.materialsTotal)}`} />,
                <CostCard key="l" label="Labour" value={`${currency}${fmt(estimate.labourTotal)}`} />,
                <CostCard key="e" label="Equipment" value={`${currency}${fmt(estimate.equipmentTotal)}`} />,
                <CostCard key="p" label="Programme" value={`${estimate.timeline.totalWeeks} wks`} sub={`~${(estimate.timeline.totalWeeks / 4.33).toFixed(1)} months`} />,
                <CostCard key="r" label={`${currency}/m² GFA`} value={`${currency}${fmt(estimate.total / Math.max(1, estimate.takeoff.gfaM2))}`} />,
              ]}
            </StaggerReveal>
          </div>
          )}

          {/* ===== Secondary tabs (only where a page has more than one view) ===== */}
          {(pageTabs.length > 1 || stage === "estimate") && pageTabs.length > 0 && (<>
          <div className="ec-rule-strong" style={{ marginTop: 28 }} />
          {stage === "estimate" && (
            <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: TOKENS.steel, marginTop: 14 }}>
              More tools: bring in an existing takeoff, or check the building codes
            </div>
          )}
          <div className="ec-tabstrip" style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
            {pageTabs.map((t) => (
              <div key={t.id} className={"ec-tab" + (activeTab === t.id ? " ec-tab-active" : "")}
                onClick={() => setTab(stage === "estimate" && activeTab === t.id ? "" : t.id)}>{t.label}</div>
            ))}
          </div>
          </>)}

          <div style={{ marginTop: pageTabs.length > 1 ? 20 : 0 }}>
              <motion.div key={stage + "-" + activeTab + "-" + buildMode}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}>
            {activeTab === "estimate" && buildMode === "multi" && <MultiCostPlan estimate={estimate} currency={currency} />}
            {activeTab === "timeline" && buildMode === "multi" && <MultiProgramme estimate={estimate} />}
            {activeTab === "estimate" && buildMode !== "multi" && (buildMode === "highrise" ? <HighRiseEstimateTab estimate={estimate} currency={currency} /> : buildMode === "materials" ? <MaterialsEstimateTab estimate={estimate} currency={currency} /> : <EstimateTab estimate={estimate} currency={currency} region={region} onRatesChanged={() => setRatesVersion((v) => v + 1)} />)}
            {activeTab === "timeline" && buildMode !== "materials" && buildMode !== "multi" && (buildMode === "highrise" ? <HighRiseTimelineTab estimate={estimate} /> : <TimelineTab estimate={estimate} />)}
            {activeTab === "spreadsheet" && buildMode === "residential" && <SpreadsheetTab region={region} currency={currency} onApply={applyImport} onApplyTemplate={applyImportTemplate} />}
            {activeTab === "spreadsheet" && buildMode === "materials" && <SpreadsheetTab region={region} currency={currency} onApplyMaterials={applyMaterialsImport} materialsMode />}
            {activeTab === "sketchup" && buildMode === "residential" && <SketchUpTab region={region} currency={currency} onApply={applyImport} onApplyTemplate={applyImportTemplate} />}
            {activeTab === "sketchup" && buildMode === "materials" && <SketchUpTab region={region} currency={currency} onApplyMaterials={applyMaterialsImport} materialsMode />}
            {activeTab === "cadbim" && buildMode === "residential" && <CadBimTab region={region} currency={currency} onApply={applyImport} onApplyTemplate={applyImportTemplate} />}
            {activeTab === "cadbim" && buildMode === "materials" && <CadBimTab region={region} currency={currency} onApplyMaterials={applyMaterialsImport} materialsMode />}
            {activeTab === "codes" && buildMode !== "materials" && <CodesTab region={region} highrise={buildMode === "highrise"} />}
            {activeTab === "suppliers" && <SuppliersTab region={region} estimate={estimate} highrise={buildMode === "highrise"} />}
              </motion.div>
          </div>
        </section>
      </main>
      )}

      {/* ============== AI CREW STAGE ============== */}
      {screen === "workspace" && stage === "ai" && !can.ai && <AiUpsell />}
      {screen === "workspace" && stage === "ai" && can.ai && (
        <AICrewSection projectId={projectId} projectName={projectName} buildMode={buildMode} region={region}
          spec={buildMode === "multi" ? mdSpec : spec} hrSpec={hrSpec} estimate={estimate} currency={currency}
          onSpecPatch={(patch) => {
            if (buildMode === "highrise") updateHr(patch);
            else if (buildMode === "materials" || buildMode === "multi") return; // no single building spec to patch
            else update(patch);
          }}
          onAddQuoteLines={(lines) => {
            const mk = (l) => ({ id: nextId(), kind: l.kind || "element", label: l.label || "AI line", qty: +l.qty || 1, unit: l.unit || "ea", rate: +l.rate || 0, useCustomRate: true });
            if (buildMode === "multi") return; // project extras aren't modelled per type yet
            if (buildMode === "materials") setMatSpec((s) => ({ lines: [...(s.lines || []), ...lines.map(mk)] }));
            else setSpec((s) => ({ ...s, extras: [...(s.extras || []), ...lines.map(mk)] }));
          }} />
      )}

      {/* ============== PROPOSAL STAGE ============== */}
      {screen === "workspace" && stage === "proposal" && (
        <ProposalSection projectName={projectName} estimate={estimate} currency={currency} region={region}
          buildMode={buildMode} projectNo={projectNo} reportText={buildReportText}
          onSendToSiteOffice={sendToSiteOffice}
          onOpenSiteOffice={(job) => { setManageJobId(job?.id || null); setScreen("manage"); window.scrollTo({ top: 0 }); }} />
      )}
      </>}

      {/* Footer disclaimer */}
      <footer style={{ borderTop: `1px solid ${TOKENS.rule}`, marginTop: 48, padding: "20px 24px", background: TOKENS.paperLight }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Disclaimer</div>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: TOKENS.inkSoft, margin: 0 }}>
              All figures are <em>indicative estimates</em> generated from market-rate guides and the inputs above. Real costs vary by supplier, region, season, and scope. Use this as a planning tool — not a contract. Engage a licensed builder, quantity surveyor, and certifier before relying on these numbers.
            </p>
          </div>
          <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>
            BUILD YOUR OWN · 3D ESTIMATOR<br />
            REGION · {region} · REV A
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}

/* =========================================================================
   UI subcomponents
   ========================================================================= */
/* ---- Room schedule (with built-in robes) ---- */
function RoomScheduleCard({ spec, setSpec }) {
  const rooms = spec.rooms || [];
  const setRooms = (next) => setSpec((s) => ({ ...s, rooms: next }));
  const updateRoom = (id, patch) => setRooms(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRoom = () => {
    const type = "Bedroom";
    setRooms([...rooms, { id: nextId(), name: `Room ${rooms.length + 1}`, type, widthM: 3.5, lengthM: 3.0, floorFinish: ROOM_DEFAULT_FINISH[type], robe: "none", robeLengthM: 0 }]);
  };
  const removeRoom = (id) => setRooms(rooms.filter((r) => r.id !== id));

  const totalArea = rooms.reduce((a, r) => a + (r.widthM || 0) * (r.lengthM || 0), 0);
  const robeLM = rooms.reduce((a, r) => a + (r.robe !== "none" ? (r.robeLengthM || 0) : 0), 0);

  return (
    <InputCard defaultOpen={false} title="Room schedule" badge={`${rooms.length} rooms · ${totalArea.toFixed(0)} m²`} onClear={() => setRooms([])}>
      <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginBottom: 12, lineHeight: 1.5, letterSpacing: "0.02em" }}>
        Drives flooring, internal walls, doors & robes. {robeLM > 0 ? `${robeLM.toFixed(1)} lin.m of robes scheduled.` : ""}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rooms.map((r) => (
          <div key={r.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="ec-input" style={{ flex: 1 }} value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} />
              <button onClick={() => removeRoom(r.id)} title="Remove room"
                style={{ width: 34, flexShrink: 0, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <select className="ec-select" value={r.type} onChange={(e) => updateRoom(r.id, { type: e.target.value, floorFinish: ROOM_DEFAULT_FINISH[e.target.value] || r.floorFinish })}>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="ec-select" value={r.floorFinish} onChange={(e) => updateRoom(r.id, { floorFinish: e.target.value })}>
                <option value="timber">Timber floor</option>
                <option value="tile">Tile floor</option>
                <option value="carpet">Carpet floor</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Width (m)</span><input className="ec-input" type="number" min="0.5" max="20" step="0.1" value={r.widthM} onChange={(e) => updateRoom(r.id, { widthM: +e.target.value })} /></label>
              <label><span className="ec-label">Length (m)</span><input className="ec-input" type="number" min="0.5" max="20" step="0.1" value={r.lengthM} onChange={(e) => updateRoom(r.id, { lengthM: +e.target.value })} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label><span className="ec-label">Built-in robe</span>
                <select className="ec-select" value={r.robe} onChange={(e) => updateRoom(r.id, { robe: e.target.value, robeLengthM: e.target.value === "none" ? 0 : (r.robeLengthM || 2.4) })}>
                  <option value="none">None</option>
                  <option value="built_in">Sliding BIR</option>
                  <option value="hinged">Hinged BIR</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </label>
              <label><span className="ec-label">Robe length (m)</span>
                <input className="ec-input" type="number" min="0" max="12" step="0.1" value={r.robeLengthM} disabled={r.robe === "none"}
                  style={{ opacity: r.robe === "none" ? 0.4 : 1 }}
                  onChange={(e) => updateRoom(r.id, { robeLengthM: +e.target.value })} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button className="ec-btn ec-btn-ghost" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={addRoom}>+ Add room</button>
    </InputCard>
  );
}

/* ---- Kitchen estimating ---- */
function KitchenCard({ spec, setSpec }) {
  const kitchens = spec.kitchens || [];
  const setKitchens = (next) => setSpec((s) => ({ ...s, kitchens: next }));
  const updateKit = (id, patch) => setKitchens(kitchens.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const addKit = () => setKitchens([...kitchens, { id: nextId(), benchLengthM: 5, cabinetry: "flatpack", benchtop: "laminate", splashback: "tile", appliances: "basic", island: false, sinkTap: true }]);
  const removeKit = (id) => setKitchens(kitchens.filter((k) => k.id !== id));

  return (
    <InputCard defaultOpen={false} title="Kitchens" badge={`${kitchens.length}`} onClear={() => setKitchens([])}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {kitchens.map((k, i) => (
          <div key={k.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: TOKENS.emberInk, fontWeight: 700 }}>KITCHEN {i + 1}</span>
              {kitchens.length > 0 && <button onClick={() => removeKit(k.id)} style={{ width: 28, height: 24, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 15 }}>×</button>}
            </div>
            <label style={{ display: "block", marginBottom: 8 }}><span className="ec-label">Bench run total (lin.m)</span>
              <input className="ec-input" type="number" min="1" max="30" step="0.5" value={k.benchLengthM} onChange={(e) => updateKit(k.id, { benchLengthM: +e.target.value })} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Cabinetry</span>
                <select className="ec-select" value={k.cabinetry} onChange={(e) => updateKit(k.id, { cabinetry: e.target.value })}>
                  <option value="flatpack">Flat-pack</option>
                  <option value="custom">Custom joinery</option>
                </select></label>
              <label><span className="ec-label">Benchtop</span>
                <select className="ec-select" value={k.benchtop} onChange={(e) => updateKit(k.id, { benchtop: e.target.value })}>
                  <option value="laminate">Laminate</option>
                  <option value="stone">Engineered stone</option>
                  <option value="natural">Natural stone</option>
                  <option value="timber">Solid timber</option>
                </select></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Splashback</span>
                <select className="ec-select" value={k.splashback} onChange={(e) => updateKit(k.id, { splashback: e.target.value })}>
                  <option value="tile">Tiled</option>
                  <option value="glass">Glass</option>
                  <option value="stone">Stone slab</option>
                </select></label>
              <label><span className="ec-label">Appliances</span>
                <select className="ec-select" value={k.appliances} onChange={(e) => updateKit(k.id, { appliances: e.target.value })}>
                  <option value="basic">Basic</option>
                  <option value="mid">Mid-range</option>
                  <option value="premium">Premium</option>
                </select></label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Toggle label="Island" value={k.island} onChange={(v) => updateKit(k.id, { island: v })} />
              <Toggle label="Sink + tap" value={k.sinkTap} onChange={(v) => updateKit(k.id, { sinkTap: v })} />
            </div>
          </div>
        ))}
      </div>
      <button className="ec-btn ec-btn-ghost" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={addKit}>+ Add kitchen</button>
    </InputCard>
  );
}

/* ---- Bathroom estimating ---- */
function BathroomCard({ spec, setSpec }) {
  const bathrooms = spec.bathrooms || [];
  const setBaths = (next) => setSpec((s) => ({ ...s, bathrooms: next }));
  const updateBath = (id, patch) => setBaths(bathrooms.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addBath = () => setBaths([...bathrooms, { id: nextId(), label: `Bathroom ${bathrooms.length + 1}`, widthM: 2.4, lengthM: 2.0, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false }]);
  const removeBath = (id) => setBaths(bathrooms.filter((b) => b.id !== id));

  return (
    <InputCard defaultOpen={false} title="Bathrooms" badge={`${bathrooms.length}`} onClear={() => setBaths([])}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bathrooms.map((b) => (
          <div key={b.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="ec-input" style={{ flex: 1 }} value={b.label} onChange={(e) => updateBath(b.id, { label: e.target.value })} />
              <button onClick={() => removeBath(b.id)} style={{ width: 34, flexShrink: 0, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Width (m)</span><input className="ec-input" type="number" min="0.8" max="8" step="0.1" value={b.widthM} onChange={(e) => updateBath(b.id, { widthM: +e.target.value })} /></label>
              <label><span className="ec-label">Length (m)</span><input className="ec-input" type="number" min="0.8" max="8" step="0.1" value={b.lengthM} onChange={(e) => updateBath(b.id, { lengthM: +e.target.value })} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Vanities</span><input className="ec-input" type="number" min="0" max="3" step="1" value={b.vanityCount} onChange={(e) => updateBath(b.id, { vanityCount: +e.target.value })} /></label>
              <label><span className="ec-label">Toilets</span><input className="ec-input" type="number" min="0" max="2" step="1" value={b.toiletCount} onChange={(e) => updateBath(b.id, { toiletCount: +e.target.value })} /></label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Toggle label="Shower" value={b.hasShower} onChange={(v) => updateBath(b.id, { hasShower: v })} />
              <Toggle label="Bath" value={b.hasBath} onChange={(v) => updateBath(b.id, { hasBath: v })} />
              <Toggle label="Full-height tile" value={b.wallTileFullHeight} onChange={(v) => updateBath(b.id, { wallTileFullHeight: v })} />
            </div>
          </div>
        ))}
      </div>
      <button className="ec-btn ec-btn-ghost" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={addBath}>+ Add bathroom</button>
    </InputCard>
  );
}

/* Light / dark switch. Labelled with the mode you'd be switching TO, which is
   what people reach for — a sun icon while already in light mode reads as
   "you are here" and gets clicked by mistake. */
function ThemeToggle({ theme, onToggle }) {
  const goingDark = theme !== "dark";
  return (
    <button
      onClick={onToggle}
      className="ec-mono"
      title={`Switch to ${goingDark ? "dark" : "light"} mode`}
      aria-label={`Switch to ${goingDark ? "dark" : "light"} mode`}
      style={{
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
        padding: "5px 10px", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
        border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.inkSoft,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {goingDark ? (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
      {goingDark ? "DARK" : "LIGHT"}
    </button>
  );
}








function stageLabel(p) {
  if (p < 0.05) return "SITE";
  if (p < 0.2) return "FOUNDATION";
  if (p < 0.4) return "FRAME";
  if (p < 0.6) return "WALLS";
  if (p < 0.8) return "ROOF";
  if (p < 0.99) return "FINISHES";
  return "COMPLETE";
}

/* ---- Carport-style parametric slider row (label · live value · range) ---- */
function SliderField({ label, value, unit, min, max, step, onChange }) {
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: TOKENS.inkSoft, letterSpacing: "0.03em" }}>{label}</span>
        <span className="ec-mono" style={{ color: TOKENS.ink, fontVariantNumeric: "tabular-nums" }}>{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        style={{ width: "100%", accentColor: TOKENS.hivisDeep }}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

/* ---- Unified quote builder: material + labour + trades in one list ---- */
function MaterialsPanel({ lines: linesProp, setLines: setLinesProp, region, currency, embed, summary }) {
  const lines = linesProp || [];
  const setLines = setLinesProp;
  const updateLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const clearLines = () => setLines([]);

  const addMaterial = () => { const m = Materials.catalog[0]; setLines([...lines, { id: nextId(), kind: "material", materialId: m.id, label: m.label, qty: 1, unit: m.unit }]); };
  const addLabour = () => { const l = LabourRates.catalog[0]; setLines([...lines, { id: nextId(), kind: "labour", labourId: l.id, label: l.label, workers: 1, hours: 8 }]); };
  const addElement = () => setLines([...lines, { id: nextId(), kind: "element", label: "", qty: 1, unit: "item", fixedRate: 0 }]);

  /* element builder ("What do you want to build/add?") */
  const [showBuild, setShowBuild] = useState(false);
  const [buildId, setBuildId] = useState("timber_wall");
  const [bDim, setBDim] = useState(20);          // area or length for non-wall presets
  const [bLen, setBLen] = useState(4);            // wall length
  const [bHt, setBHt] = useState(2.4);            // wall height
  const [bFinish, setBFinish] = useState("paint");
  const [bSides, setBSides] = useState(2);
  const [bInsulated, setBInsulated] = useState(true);
  const [bVariant, setBVariant] = useState("");
  const [bLabour, setBLabour] = useState(false);
  const [bAddonQty, setBAddonQty] = useState({});
  // custom ("something else") fields
  const [cLabel, setCLabel] = useState("");
  const [cQty, setCQty] = useState(1);
  const [cUnit, setCUnit] = useState("ea");
  const [cRate, setCRate] = useState(0);
  const isCustom = buildId === "custom";
  const buildPreset = isCustom ? null : WallBuilder.getPreset(buildId);
  const isWall = buildPreset && buildPreset.dim === "wall";
  const buildPreview = isCustom ? ((+cQty || 0) * (+cRate || 0) > 0 || (cLabel.trim() ? 1 : 0)) : (isWall ? (+bLen || 0) * (+bHt || 0) : (+bDim || 0));

  const UNIT_OPTIONS = ["ea", "item", "lin.m", "m²", "m³", "hr", "kg", "L", "pack", "day"];

  const doBuild = () => {
    if (isCustom) {
      if (!cLabel.trim()) { setShowBuild(false); return; }
      const newLines = [{ id: nextId(), kind: "element", materialId: null, labourId: null, label: cLabel.trim(), qty: +cQty || 0, unit: cUnit, fixedRate: +cRate || 0 }];
      if (bLabour) newLines.push({ id: nextId(), kind: "labour", labourId: "custom", label: cLabel.trim() + " — labour", workers: 1, hours: 8, fixedRate: 0 });
      setLines([...lines, ...newLines]);
      setShowBuild(false); setCLabel(""); setCQty(1); setCRate(0);
      return;
    }
    const addonList = Object.entries(bAddonQty).filter(([, q]) => +q > 0).map(([id, q]) => ({ id, qty: +q }));
    const opts = isWall
      ? { lengthM: bLen, heightM: bHt, finish: bFinish, sides: bSides, insulated: bInsulated, labour: bLabour, addonList }
      : { dim: bDim, variant: bVariant || (buildPreset.variants ? buildPreset.variants[0].id : undefined), labour: bLabour, addonList };
    const newLines = WallBuilder.presetToLines(buildId, opts, region, nextId);
    if (newLines.length) setLines([...lines, ...newLines]);
    setShowBuild(false); setBAddonQty({});
  };

  const matCats = useMemo(() => {
    const g = {};
    for (const m of Materials.catalog) { (g[m.category] = g[m.category] || []).push(m); }
    return g;
  }, []);

  const calcLine = (l) => {
    if (l.kind === "labour") {
      const workers = +l.workers || 1, hours = +l.hours || 0;
      const hourly = l.fixedRate != null && isFinite(l.fixedRate) ? +l.fixedRate : (l.labourId ? LabourRates.rate(l.labourId, region) : 0);
      return { rate: hourly, total: workers * hours * hourly };
    }
    if (l.fixedTotal != null && isFinite(l.fixedTotal) && !l.qty) return { rate: l.fixedRate || 0, total: +l.fixedTotal || 0 };
    if (l.fixedRate != null && isFinite(l.fixedRate)) return { rate: +l.fixedRate, total: (+l.fixedRate) * (+l.qty || 0) };
    if (l.materialId) { const r = Materials.rate(l.materialId, region); return { rate: r, total: r * (+l.qty || 0) }; }
    return { rate: 0, total: +l.fixedTotal || 0 };
  };

  // plain-language hint for what a unit means
  const unitHint = (u) => ({ "lin.m": "metres of length", "m²": "square metres (area)", "m³": "cubic metres (volume)", "ea": "each (count)", "hr": "hours", "item": "per item" }[u] || u);

  const kindMeta = {
    material: { tag: "MAT", color: TOKENS.hivisInk },
    labour: { tag: "LAB", color: TOKENS.emberInk },
    element: { tag: "JOB", color: TOKENS.steel },
  };

  const renderLine = (l) => {
    const kind = l.kind || "material";
    const meta = kindMeta[kind];
    const calc = calcLine(l);
    const usesCatalogue = (kind === "material" && l.materialId);
    return (
      <div key={l.id} style={{ border: `1px solid ${TOKENS.rule}`, borderLeft: `3px solid ${meta.color}`, padding: 8, background: TOKENS.paperLight }}>
        {/* row 1: tag + name/select + delete */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span className="ec-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: meta.color, border: `1px solid ${meta.color}`, padding: "2px 4px", borderRadius: 2 }}>{meta.tag}</span>
          {kind === "material" ? (
            l.freeText ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, minWidth: 0 }}>
                <input className="ec-input" style={{ minWidth: 0 }} placeholder="Material description" value={l.label || ""} onChange={(e) => updateLine(l.id, { label: e.target.value })} />
                <button title="Pick from catalogue" onClick={() => { const m = Materials.catalog[0]; updateLine(l.id, { freeText: false, materialId: m.id, label: m.label, unit: m.unit, fixedRate: null, fixedTotal: null }); }}
                  style={{ border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.steel, fontSize: 10, padding: "0 6px", cursor: "pointer" }}>list</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, minWidth: 0 }}>
                <select className="ec-select" style={{ minWidth: 0 }} value={l.materialId || ""} onChange={(e) => { const m = Materials.get(e.target.value); updateLine(l.id, { materialId: e.target.value, label: m.label, unit: m.unit, fixedRate: null, fixedTotal: null }); }}>
                  {Object.entries(matCats).map(([cat, items]) => (
                    <optgroup key={cat} label={cat}>{items.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
                  ))}
                </select>
                <button title="Rename / type your own" onClick={() => updateLine(l.id, { freeText: true, materialId: null, fixedRate: l.rate != null ? l.rate : (l.materialId ? Materials.rate(l.materialId, region) : 0) })}
                  style={{ border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.steel, fontSize: 11, padding: "0 6px", cursor: "pointer" }}>✎</button>
              </div>
            )
          ) : kind === "labour" ? (
            l.labourId === "custom" || (l.labourId == null && l.label != null && !LabourRates.get(l.labourId)) ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, minWidth: 0 }}>
                <input className="ec-input" style={{ minWidth: 0 }} placeholder="Trade / role name" value={l.label || ""} onChange={(e) => updateLine(l.id, { label: e.target.value })} />
                <button title="Back to trade list" onClick={() => { const lr = LabourRates.catalog[0]; updateLine(l.id, { labourId: lr.id, label: lr.label, fixedRate: null }); }}
                  style={{ border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.steel, fontSize: 10, padding: "0 6px", cursor: "pointer" }}>list</button>
              </div>
            ) : (
              <select className="ec-select" style={{ minWidth: 0 }} value={l.labourId || ""} onChange={(e) => {
                if (e.target.value === "custom") { updateLine(l.id, { labourId: "custom", label: "", fixedRate: 0 }); return; }
                const lr = LabourRates.get(e.target.value); updateLine(l.id, { labourId: e.target.value, label: lr.label, fixedRate: null });
              }}>
                {LabourRates.catalog.map((lr) => <option key={lr.id} value={lr.id}>{lr.label}</option>)}
                <option value="custom">+ Custom trade / role…</option>
              </select>
            )
          ) : (
            <input className="ec-input" style={{ minWidth: 0 }} placeholder="Describe the job / trade / allowance" value={l.label || ""} onChange={(e) => updateLine(l.id, { label: e.target.value })} />
          )}
          <button onClick={() => removeLine(l.id)} title="Delete line" style={{ width: 26, height: 26, flexShrink: 0, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 14, lineHeight: 1, borderRadius: 2 }}>×</button>
        </div>

        {kind === "labour" ? (
          /* labour: workers × hours × $/hr */
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 0.9fr 1fr 1.1fr", gap: 5, alignItems: "center" }}>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.08em" }}>WORKERS</span>
              <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="1" step="1" value={l.workers ?? 1} onChange={(e) => updateLine(l.id, { workers: e.target.value === "" ? 1 : +e.target.value })} />
            </label>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.08em" }}>HOURS</span>
              <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="0" step="0.5" value={l.hours ?? ""} onChange={(e) => updateLine(l.id, { hours: e.target.value === "" ? null : +e.target.value })} />
            </label>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.08em" }}>{currency}/HR</span>
              <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="0" step="1" value={l.fixedRate ?? ""} placeholder={fmt(calc.rate)} onChange={(e) => updateLine(l.id, { fixedRate: e.target.value === "" ? null : +e.target.value })} />
            </label>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.08em" }}>TOTAL</span>
              <div className="ec-mono" style={{ padding: "5px 5px", fontSize: 12, fontWeight: 700, color: TOKENS.ink, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currency}{fmt(calc.total)}</div>
            </label>
          </div>
        ) : (
          /* material / job: qty | unit | rate | total */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1fr 1.1fr", gap: 5, alignItems: "center" }}>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>QTY</span>
              <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="0" step="0.5" value={l.qty ?? ""} onChange={(e) => updateLine(l.id, { qty: e.target.value === "" ? null : +e.target.value })} />
            </label>
            <label style={{ display: "block" }} title={unitHint(l.unit)}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>UNIT</span>
              <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} value={l.unit || ""} onChange={(e) => updateLine(l.id, { unit: e.target.value })} />
            </label>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>RATE {currency}</span>
              {usesCatalogue && (l.fixedRate == null) ? (
                <div className="ec-mono" style={{ padding: "5px 5px", fontSize: 12, color: TOKENS.inkSoft, background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, borderRadius: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmt(calc.rate)}</div>
              ) : (
                <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="0" step="1" value={l.fixedRate ?? ""} placeholder={fmt(calc.rate)} onChange={(e) => updateLine(l.id, { fixedRate: e.target.value === "" ? null : +e.target.value, fixedTotal: null })} />
              )}
            </label>
            <label style={{ display: "block" }}>
              <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>TOTAL</span>
              <div className="ec-mono" style={{ padding: "5px 5px", fontSize: 12, fontWeight: 700, color: TOKENS.ink, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currency}{fmt(calc.total)}</div>
            </label>
          </div>
        )}
        {kind !== "labour" && l.unit && (
          <div className="ec-mono" style={{ fontSize: 9, color: TOKENS.steel, marginTop: 4 }}>unit: {l.unit} = {unitHint(l.unit)}</div>
        )}
      </div>
    );
  };

  const bk = (summary && summary.byKind) || {};
  const linesTotal = lines.reduce((a, l) => a + (calcLine(l).total || 0), 0);

  /* Build-sequence explainer: ask the AI to lay out the job step by step. */
  const [steps, setSteps] = useState(null);
  const [stepsBusy, setStepsBusy] = useState(false);
  const [stepsErr, setStepsErr] = useState("");
  const runSteps = async () => {
    if (!lines.length || stepsBusy) return;
    setStepsBusy(true); setStepsErr(""); setSteps(null);
    const itemList = lines.map((l) => `- ${l.label}${l.qty ? ` (${l.qty} ${l.unit || ""})` : ""} [${l.kind}]`).join("\n");
    const sys = `You are an experienced Australian builder. Given a list of quoted materials, labour and jobs, write the ACTUAL build sequence — the order the work happens on site, from ground prep to finishing. Be practical and specific to what's in the list. For each step give: a short title, what happens, and which of the listed materials/trades are used.
Respond as ONLY JSON, no markdown:
{"steps":[{"n":1,"title":"<step>","detail":"<what happens, 1-2 sentences>","uses":"<materials/trades from the list>"}],"summary":"<one line on total sequence>"}`;
    try {
      const textOut = (await aiChat({
        system: sys, maxTokens: 1500, tier: "fast",
        messages: [{ role: "user", content: `The quote contains:\n${itemList}` }],
      })).trim();
      const st = textOut.indexOf("{"), en = textOut.lastIndexOf("}");
      let parsed = null;
      if (st >= 0 && en > st) { try { parsed = JSON.parse(textOut.slice(st, en + 1)); } catch (e2) {} }
      if (!parsed || !Array.isArray(parsed.steps)) { setStepsErr("Couldn't read the steps — hit the button again."); setStepsBusy(false); return; }
      setSteps(parsed);
    } catch (e) { setStepsErr(aiErrMsg(e)); }
    setStepsBusy(false);
  };
  return (
    <>
      <div style={{ padding: 12, border: `1px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)", marginBottom: 12 }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.emberInk, fontWeight: 700, marginBottom: 4 }}>
          {embed ? "ADD TO YOUR BUILD — MATERIAL · LABOUR · ELEMENTS" : "QUOTE BUILDER — MATERIAL · LABOUR · TRADES"}
        </div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: 0, lineHeight: 1.5 }}>
          {embed
            ? "Add scope on top of the base build — extra rooms, a deck, a feature wall, fit-out, allowances. Each line adds to your total at its entered price."
            : "One quote, every line — from a single wall to a whole job. Quick-add a wall by its size, or add materials, labour days, or any trade/allowance. Everything prices into one total."}
        </p>
      </div>

      <InputCard title={embed ? "What do you want to add?" : "Quote lines"} badge={`${currency}${fmt(linesTotal)}`} onClear={clearLines}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.length === 0 && <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, padding: "8px 0" }}>{embed ? "Nothing added yet — add scope below or leave empty." : "Empty quote — add a line below or import a sheet."}</div>}
          {lines.map(renderLine)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 12 }}>
          <button className="ec-btn ec-btn-ghost" style={{ justifyContent: "center", padding: "8px 6px", fontSize: 11 }} onClick={addMaterial}>+ Material</button>
          <button className="ec-btn ec-btn-ghost" style={{ justifyContent: "center", padding: "8px 6px", fontSize: 11 }} onClick={addLabour}>+ Labour</button>
          <button className="ec-btn" style={{ justifyContent: "center", padding: "8px 6px", fontSize: 11, background: TOKENS.emberDeep, color: TOKENS.onEmber }} onClick={addElement}>+ Job/Trade</button>
        </div>

        <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => setShowBuild((v) => !v)}>
          {showBuild ? "× Close" : (embed ? "▦ What do you want to add?" : "▦ What do you want to build?")}
        </button>

        {showBuild && (
          <div style={{ marginTop: 10, padding: 12, border: `1px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.05)" }}>
            <label style={{ display: "block", marginBottom: 8 }}>
              <span className="ec-label">I want to build…</span>
              <select className="ec-select" value={buildId} onChange={(e) => { setBuildId(e.target.value); setBVariant(""); setBAddonQty({}); }}>
                {WallBuilder.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">✏️ Something else (type your own)</option>
              </select>
            </label>
            {buildPreset && buildPreset.note && (
              <div style={{ fontSize: 11, color: TOKENS.inkSoft, lineHeight: 1.4, marginBottom: 10 }}>{buildPreset.note}</div>
            )}

            {isCustom ? (
              <>
                <div style={{ fontSize: 11, color: TOKENS.inkSoft, lineHeight: 1.4, marginBottom: 10 }}>
                  Type anything we don't have a template for — describe it, set the quantity, pick the unit, and put your rate. It'll add a priced line you can edit later.
                </div>
                <label style={{ display: "block", marginBottom: 8 }}>
                  <span className="ec-label">What is it?</span>
                  <input className="ec-input" placeholder="e.g. Steel beam install, pool fencing, render patch…" value={cLabel} onChange={(e) => setCLabel(e.target.value)} />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <label><span className="ec-label">Qty</span>
                    <input className="ec-input" type="number" min="0" step="0.5" value={cQty} onChange={(e) => setCQty(+e.target.value)} />
                  </label>
                  <label><span className="ec-label">Unit</span>
                    <select className="ec-select" value={cUnit} onChange={(e) => setCUnit(e.target.value)}>
                      {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                  <label><span className="ec-label">Rate {currency}</span>
                    <input className="ec-input" type="number" min="0" step="1" value={cRate} onChange={(e) => setCRate(+e.target.value)} />
                  </label>
                </div>
                <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink, textAlign: "right", marginBottom: 4 }}>
                  Line total: {currency}{fmt((+cQty || 0) * (+cRate || 0))}
                </div>
              </>
            ) : isWall ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <label><span className="ec-label">Length (m)</span><input className="ec-input" type="number" min="0" step="0.1" value={bLen} onChange={(e) => setBLen(+e.target.value)} /></label>
                  <label><span className="ec-label">Height (m)</span><input className="ec-input" type="number" min="0" step="0.1" value={bHt} onChange={(e) => setBHt(+e.target.value)} /></label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <label><span className="ec-label">Finish</span>
                    <select className="ec-select" value={bFinish} onChange={(e) => setBFinish(e.target.value)}>
                      <option value="paint">Paint</option><option value="render">Render</option><option value="tile">Tile</option><option value="none">None / raw</option>
                    </select>
                  </label>
                  <label><span className="ec-label">Lined</span>
                    <select className="ec-select" value={bSides} onChange={(e) => setBSides(+e.target.value)}>
                      <option value={2}>Both sides</option><option value={1}>One side</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <input type="checkbox" checked={bInsulated} onChange={(e) => setBInsulated(e.target.checked)} />
                  <span className="ec-mono" style={{ fontSize: 11 }}>Insulated</span>
                </label>
              </>
            ) : (
              <>
                <label style={{ display: "block", marginBottom: 8 }}>
                  <span className="ec-label">{buildPreset ? buildPreset.dimLabel : "Size"}</span>
                  <input className="ec-input" type="number" min="0" step="0.1" value={bDim} onChange={(e) => setBDim(+e.target.value)} />
                </label>
                {buildPreset && buildPreset.variants && (
                  <label style={{ display: "block", marginBottom: 8 }}>
                    <span className="ec-label">Type</span>
                    <select className="ec-select" value={bVariant || buildPreset.variants[0].id} onChange={(e) => setBVariant(e.target.value)}>
                      {buildPreset.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </label>
                )}
              </>
            )}

            {/* optional add-ons for this preset (wall shows the full list) */}
            {(() => {
              const addonIds = isWall ? WallBuilder.addons.filter((a) => a.id !== "wa_tile").map((a) => a.id) : (buildPreset && buildPreset.addons) || [];
              if (!addonIds.length) return null;
              return (
                <>
                  <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: TOKENS.steel, fontWeight: 700, margin: "10px 0 6px" }}>OPTIONAL ADD-ONS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {addonIds.map((id) => { const a = WallBuilder.getAddon(id); if (!a) return null; return (
                      <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr 64px", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: TOKENS.ink }}>{a.label} <span style={{ color: TOKENS.steel }}>· {currency}{fmt(a.regions[region])}/{a.unit}</span></span>
                        <input className="ec-input" type="number" min="0" step="1" placeholder="0" value={bAddonQty[id] ?? ""} onChange={(e) => setBAddonQty((m) => ({ ...m, [id]: e.target.value }))} />
                      </div>
                    ); })}
                  </div>
                </>
              );
            })()}

            <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, margin: "10px 0 4px" }}>
              {isWall ? `Wall area ≈ ${fmt(buildPreview)} m²` : null}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0 10px" }}>
              <input type="checkbox" checked={bLabour} onChange={(e) => setBLabour(e.target.checked)} />
              <span className="ec-mono" style={{ fontSize: 11 }}>{isCustom ? "Add a labour line too" : "Add labour estimate (trade days)"}</span>
            </label>
            <button className="ec-btn" style={{ width: "100%", justifyContent: "center", background: TOKENS.emberDeep, color: TOKENS.onEmber }} onClick={doBuild} disabled={isCustom ? !cLabel.trim() : buildPreview <= 0}>
              + Add to quote
            </button>
          </div>
        )}
      </InputCard>

      {lines.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={runSteps} disabled={stepsBusy}>
            {stepsBusy ? "Working out the sequence…" : "✦ Show me the build steps"}
          </button>
          {stepsErr && <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.alert, marginTop: 8 }}>{stepsErr}</div>}
          {steps && (
            <div style={{ marginTop: 10, border: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight, padding: 12 }}>
              <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: TOKENS.emberInk, fontWeight: 700, marginBottom: 4 }}>HOW THIS GETS BUILT</div>
              {steps.summary && <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 10px", lineHeight: 1.5 }}>{steps.summary}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.steps.map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start" }}>
                    <div className="ec-mono" style={{ width: 26, height: 26, borderRadius: 13, background: TOKENS.ink, color: TOKENS.paper, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{s.n || i + 1}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.ink, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.45 }}>{s.detail}</div>
                      {s.uses && <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 3 }}>Uses: {s.uses}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${TOKENS.rule}`, lineHeight: 1.4 }}>
                Indicative sequence — a guide, not a construction plan. Confirm with your builder and engineer.
              </div>
            </div>
          )}
        </div>
      )}

      {!embed && summary && (
        <div style={{ padding: 14, border: `2px solid ${TOKENS.ink}`, background: TOKENS.card }}>
          <div className="ec-eyebrow" style={{ marginBottom: 8 }}>
            Quote total{summary.taxRate > 0 ? ` (incl. ${taxName(summary)})` : ""}
          </div>
          <div className="ec-display" style={{ fontSize: 30, lineHeight: 1, color: TOKENS.ink }}>{currency}{fmt(grossOf(summary))}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
            {[["material", "Materials"], ["labour", "Labour"], ["element", "Trades & jobs"]].map(([k, lbl]) => (
              (bk[k] > 0) ? (
                <div key={k} className="ec-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKENS.inkSoft }}>
                  <span>{lbl}</span><span>{currency}{fmt(bk[k])}</span>
                </div>
              ) : null
            ))}
            {summary.taxRate > 0 && (
              <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKENS.steel, marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${TOKENS.rule}` }}>
                <span>incl. {summary.taxLabel}</span><span>{currency}{fmt(summary.total * summary.taxRate)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ---- Materials-only cost breakdown (with order quantities) ---- */
function MaterialsEstimateTab({ estimate, currency }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const l of estimate.lines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [estimate]);

  if (estimate.lines.length === 0) {
    return <div className="ec-mono" style={{ fontSize: 13, color: TOKENS.steel, padding: 20, textAlign: "center", border: `1px dashed ${TOKENS.rule}` }}>Add materials on the left, or import a spreadsheet, to see the supply cost.</div>;
  }

  return (
    <div>
      <SectionHeader index="M" title="Quote breakdown — material, labour & trades" />
      {Object.entries(grouped).map(([cat, lines]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisInk, marginBottom: 6, fontWeight: 700 }}>{cat}</div>
          <div className="ec-mono" style={{ fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.1fr 0.9fr", padding: "6px 0", fontSize: 10, letterSpacing: "0.12em", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}` }}>
              <span>MATERIAL</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>ORDER (waste)</span><span style={{ textAlign: "right" }}>COST</span>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.1fr 0.9fr", padding: "7px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "baseline" }}>
                <span style={{ color: TOKENS.ink }}>{l.label}</span>
                <span style={{ textAlign: "right", color: TOKENS.inkSoft }}>
                  {l.kind === "labour" ? `${l.workers || 1}×${l.hours || 0} hr` : `${l.qty} ${l.unit}`}
                </span>
                <span style={{ textAlign: "right", color: TOKENS.ink }}>
                  {l.kind === "labour" ? <span style={{ color: TOKENS.steel }}>@{currency}{fmt(l.rate)}/hr</span>
                    : l.alloc ? <>{fmt(l.alloc.orderQty)} {l.alloc.buyUnit}<span style={{ color: TOKENS.hivisInk, fontSize: 10 }}> +{Math.round(l.alloc.wastePct * 100)}%</span></>
                    : <span style={{ color: TOKENS.steel }}>—</span>}
                </span>
                <span style={{ textAlign: "right", color: TOKENS.ink, fontWeight: 500 }}>{currency}{fmt(l.total)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {estimate.taxRate > 0 && (
        <>
          <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${TOKENS.rule}`, fontSize: 12, color: TOKENS.inkSoft }}>
            <span>Subtotal (excl. {taxName(estimate)})</span><span>{currency}{fmt(estimate.total)}</span>
          </div>
          <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: TOKENS.inkSoft }}>
            <span>{estimate.taxLabel}</span><span>{currency}{fmt(taxOf(estimate))}</span>
          </div>
        </>
      )}
      <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
        <span>QUOTE TOTAL{estimate.taxRate > 0 ? ` (incl. ${taxName(estimate)})` : ""}</span>
        <span>{currency}{fmt(grossOf(estimate))}</span>
      </div>
    </div>
  );
}

function ImportedPanel({ spec, estimate, currency, onClear, onUnlock }) {
  const meta = spec.importMeta || {};
  const grouped = useMemo(() => {
    const g = {};
    for (const l of estimate.materialLines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [estimate]);
  return (
    <>
      <div style={{ padding: 14, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)", marginBottom: 12 }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.emberInk, fontWeight: 700, marginBottom: 6 }}>IMPORTED TAKEOFF — DRIVING ESTIMATE</div>
        <div className="ec-display" style={{ fontSize: 18, lineHeight: 1.1, marginBottom: 6 }}>{meta.source || "Imported data"}</div>
        <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, lineHeight: 1.6 }}>
          {meta.lineCount} line items · materials {currency}{fmt(estimate.materialsTotal)}<br />
          Representative GFA ≈ {fmt(meta.gfa)} m² (sized for the 3D model)
        </div>
        <button className="ec-btn" style={{ marginTop: 12, width: "100%", justifyContent: "center", background: TOKENS.emberDeep }} onClick={onUnlock}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 4 }}><path d="M12 20h9M3 17l9-9 4 4-9 9H3v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Unlock &amp; edit as template
        </button>
        <button className="ec-btn ec-btn-ghost" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={onClear}>
          ↺ Clear import &amp; return to manual
        </button>
      </div>

      {meta.detected && meta.detected.length > 0 && (
        <InputCard title="Detected elements">
          <div className="ec-mono" style={{ fontSize: 12 }}>
            {meta.detected.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${TOKENS.rule}` }}>
                <span style={{ color: TOKENS.ink }}>{d.label}</span>
                <span style={{ color: TOKENS.inkSoft }}>{fmt(d.qty)} {d.unit}</span>
              </div>
            ))}
          </div>
        </InputCard>
      )}

      <InputCard title="Imported line items" badge={`${estimate.materialLines.length}`}>
        <div className="ec-mono" style={{ fontSize: 11 }}>
          {Object.entries(grouped).map(([cat, lines]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: TOKENS.hivisInk, fontWeight: 700, marginBottom: 4 }}>{cat}</div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: TOKENS.inkSoft }}>
                  <span>{l.label}</span><span>{currency}{fmt(l.total)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </InputCard>
    </>
  );
}

function HighRisePanel({ hrSpec, updateHr, estimate, clearSection }) {
  const t = estimate.takeoff;

  return (
    <>
      <div style={{ padding: 12, border: `1px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)", marginBottom: 12 }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.emberInk, fontWeight: 700, marginBottom: 4 }}>DEVELOPER ENGINE — APARTMENTS, MIXED-USE &amp; TOWERS</div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: 0, lineHeight: 1.5 }}>
          Costed by structural & façade systems per m² GFA, with a per-floor structural cycle. Feasibility-grade — not a tender figure.
        </p>
      </div>

      <InputCard title="Massing" badge={`${fmt(t.gfaM2)} m² GFA`} onClear={() => clearSection("massing")}>
        <SliderField label="Floor plate" value={hrSpec.floorPlateM2} unit="m²" min={150} max={5000} step={50} onChange={(v) => updateHr({ floorPlateM2: v })} />
        <SliderField label="Floors (above ground)" value={hrSpec.floors} unit="" min={2} max={120} step={1} onChange={(v) => updateHr({ floors: v })} />
        <SliderField label="Floor-to-floor" value={hrSpec.floorHeightM} unit="m" min={3.0} max={6.0} step={0.1} onChange={(v) => updateHr({ floorHeightM: v })} />
        <InputRow>
          <Field label="Basement levels"><input className="ec-input" type="number" min="0" max="8" step="1" value={hrSpec.basementLevels} onChange={(e) => updateHr({ basementLevels: +e.target.value })} /></Field>
        </InputRow>
        <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 4 }}>
          Overall height ≈ {t.totalHeightM.toFixed(0)} m{t.totalHeightM > 25 ? " · Type A construction (NCC) / high-rise (IBC)" : ""}
        </p>
      </InputCard>

      <InputCard defaultOpen={false} title="Structure & façade" onClear={() => clearSection("structure")}>
        <Field label="Structural system">
          <select className="ec-select" value={hrSpec.structureType} onChange={(e) => updateHr({ structureType: e.target.value })}>
            <option value="rc">RC core + PT slabs</option>
            <option value="composite">Composite steel / concrete</option>
            <option value="steel">Structural steel frame</option>
          </select>
        </Field>
        <Field label="Façade system">
          <select className="ec-select" value={hrSpec.facadeType} onChange={(e) => updateHr({ facadeType: e.target.value })}>
            <option value="curtain_wall">Unitised curtain wall</option>
            <option value="window_wall">Window-wall</option>
            <option value="precast">Precast concrete panels</option>
          </select>
        </Field>
        <Field label="Occupancy">
          <select className="ec-select" value={hrSpec.occupancy} onChange={(e) => updateHr({ occupancy: e.target.value })}>
            <option value="office">Commercial office</option>
            <option value="residential">Residential apartments</option>
            <option value="mixed">Mixed use</option>
          </select>
        </Field>
        <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 4 }}>Façade area ≈ {fmt(t.facadeArea)} m²</p>
      </InputCard>

      <InputCard defaultOpen={false} title="Vertical transport" onClear={() => clearSection("transport")}>
        <InputRow>
          <Field label="Passenger lifts"><input className="ec-input" type="number" min="1" max="40" step="1" value={hrSpec.passengerLifts} onChange={(e) => updateHr({ passengerLifts: +e.target.value })} /></Field>
          <Field label="Goods lifts"><input className="ec-input" type="number" min="0" max="10" step="1" value={hrSpec.goodsLifts} onChange={(e) => updateHr({ goodsLifts: +e.target.value })} /></Field>
        </InputRow>
        <Toggle label="Escalators (podium)" value={hrSpec.hasEscalators} onChange={(v) => updateHr({ hasEscalators: v })} />
      </InputCard>

      <InputCard defaultOpen={false} title="Site conditions" onClear={() => clearSection("site")}>
        <Field label="Site type">
          <select className="ec-select" value={hrSpec.siteCondition} onChange={(e) => updateHr({ siteCondition: e.target.value })}>
            <option value="flat">Flat / good access</option>
            <option value="sloping">Constrained urban site</option>
            <option value="difficult">Difficult / deep services</option>
          </select>
        </Field>
        <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
          {t.fireStairs} fire-isolated egress stairs required for this plate.
        </p>
      </InputCard>
    </>
  );
}

/* ---- High-rise elemental cost plan ---- */
function HighRiseEstimateTab({ estimate, currency }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const l of estimate.systemLines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [estimate]);
  const catLabels = { substructure: "Substructure", superstructure: "Superstructure", facade: "Façade", transport: "Vertical transport", services: "Building services (MEP)", fire: "Fire & life safety", fitout: "Base-building fit-out" };
  return (
    <div>
      <SectionHeader index="A" title="Elemental cost plan" />
      {Object.entries(grouped).map(([cat, lines]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisInk, marginBottom: 6, fontWeight: 700 }}>{catLabels[cat] || cat}</div>
          <TakeoffTable rows={lines.map((l) => ({ label: l.label, qty: `${fmt(l.qty)} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
        </div>
      ))}
      {estimate.equipmentLines?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionHeader index="B" title="Site equipment & plant" />
          <TakeoffTable rows={estimate.equipmentLines.map((l) => ({ label: l.name, qty: `${fmt(l.qty)} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
          <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
            <span>EQUIPMENT SUBTOTAL</span><span>{currency}{fmt(estimate.equipmentTotal)}</span>
          </div>
        </div>
      )}
      <div style={{ marginTop: 12, background: TOKENS.card, border: `2px solid ${TOKENS.ink}`, padding: 16 }}>
        <SectionHeader index="C" title="Cost build-up" />
        <div className="ec-mono" style={{ fontSize: 13 }}>
          {[["Systems subtotal (adj.)", estimate.systemsTotal], ["Preliminaries (12%)", estimate.prelims], ["Design & consultant fees (10%)", estimate.designFees], ["Builder margin (10%)", estimate.margin], ["Contingency (8%)", estimate.contingency]].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}` }}>
              <span>{label}</span><span>{currency}{fmt(val)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", marginTop: 4, marginLeft: -16, marginRight: -16, marginBottom: -16, fontSize: 18, fontWeight: 700, background: TOKENS.hivis }}>
            <span>TOTAL ESTIMATE</span><span>{currency}{fmt(estimate.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- High-rise programme ---- */
function HighRiseTimelineTab({ estimate }) {
  const { timeline } = estimate;
  const maxWeek = timeline.totalWeeks;
  return (
    <div>
      <SectionHeader index="C" title="Indicative programme" />
      <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.steel, marginBottom: 16, letterSpacing: "0.06em" }}>
        TOTAL · {timeline.totalWeeks} WEEKS · ~{(timeline.totalWeeks / 52).toFixed(1)} YEARS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {timeline.stages.map((s, i) => {
          const leftPct = ((s.startWeek - 1) / maxWeek) * 100;
          const widthPct = (s.weeks / maxWeek) * 100;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 2.5fr 70px", alignItems: "center", gap: 12 }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink }}>
                <span style={{ color: TOKENS.steel, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>{s.name}
              </div>
              <div style={{ position: "relative", height: 22, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${leftPct}%`, width: `${widthPct}%`, background: TOKENS.emberDeep, borderRight: `2px solid ${TOKENS.ink}` }} />
              </div>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, textAlign: "right" }}>{s.weeks} wk</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Cost breakdown charts (visual summary above the itemised tables) ----
   Two single-hue horizontal bar charts: each is one measure (cost) across
   categories, sorted descending, value + % always shown as text so identity is
   never colour-alone. Fills use the steel palette; the hi-vis cap is the brand
   accent; hover promotes a bar to full ink. No rainbow, no dual axis. */
function CostBar({ label, value, max, total, currency, fill, hovered, onHover, idx }) {
  const widthPct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  const pct = total > 0 ? (value / total) * 100 : 0;
  const isHover = hovered === idx;
  return (
    <div
      onMouseEnter={() => onHover(idx)}
      onMouseLeave={() => onHover(null)}
      title={`${label}: ${currency}${fmt(value)} (${pct.toFixed(1)}%)`}
      aria-label={`${label}: ${currency}${fmt(value)}, ${pct.toFixed(1)} percent`}
      style={{ display: "grid", gridTemplateColumns: "minmax(110px, 168px) 1fr minmax(104px, auto)", alignItems: "center", gap: 12, padding: "3px 0", cursor: "default" }}
    >
      <div className="ec-mono" style={{ fontSize: 11, color: isHover ? TOKENS.ink : TOKENS.inkSoft, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: isHover ? 600 : 400 }}>
        {label}
      </div>
      <div style={{ position: "relative", height: 20, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}`, borderRadius: 3 }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: `${widthPct}%`,
          background: isHover ? TOKENS.ink : fill,
          borderRadius: "3px 4px 4px 3px",
          borderRight: `2px solid ${TOKENS.hivisDeep}`,
          transition: `width 260ms ${DesignSystem.motion.ease.swift}, background ${DesignSystem.motion.duration.instant} ${DesignSystem.motion.ease.standard}`,
        }} />
      </div>
      <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.ink, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>
        {currency}{fmt(value)}
        <span style={{ color: TOKENS.steel, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function CostBreakdown({ estimate, currency }) {
  const [hoverA, setHoverA] = useState(null);
  const [hoverB, setHoverB] = useState(null);

  const buildup = useMemo(() => {
    const rows = [
      { label: "Materials", value: estimate.materialsTotal },
      { label: "Labour", value: estimate.labourTotal },
      { label: "Equipment", value: estimate.equipmentTotal },
      { label: "Preliminaries", value: estimate.prelims },
      { label: "Builder margin", value: estimate.margin },
      { label: "Contingency", value: estimate.contingency },
    ];
    if (estimate.extrasTotal > 0) rows.push({ label: "Additional items", value: estimate.extrasTotal });
    return rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  }, [estimate]);

  const byCategory = useMemo(() => {
    const g = {};
    for (const l of estimate.materialLines) g[l.category] = (g[l.category] || 0) + (l.total || 0);
    return Object.entries(g).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [estimate]);

  if (!estimate.total || estimate.total <= 0) return null;

  const buildMax = Math.max(...buildup.map((r) => r.value), 1);
  const catMax = Math.max(...byCategory.map((r) => r.value), 1);
  const matTotal = estimate.materialsTotal || 1;

  const gfa = estimate.takeoff?.gfaM2 || 0;
  const taxAmt = estimate.total * (estimate.taxRate || 0);
  const perM2 = gfa > 0 ? estimate.total / gfa : 0;
  const summary = [
    { label: `Estimate (ex ${estimate.taxLabel ? estimate.taxLabel.split(" ")[0] : "tax"})`, value: `${currency}${fmt(estimate.total)}` },
    ...(estimate.taxRate > 0 ? [{ label: estimate.taxLabel, value: `${currency}${fmt(taxAmt)}` }] : []),
    { label: "Total incl. tax", value: `${currency}${fmt(estimate.total + taxAmt)}`, hivis: true },
    ...(gfa > 0 ? [{ label: `${currency}/m² · ${fmt(gfa)} m²`, value: `${currency}${fmt(perM2)}` }] : []),
  ];

  return (
    <div style={{ marginBottom: 30 }}>
      <SectionHeader index="∑" title="Cost breakdown — at a glance" />
      {/* Headline numbers a homeowner actually wants: ex-tax, tax, total, and $/m² */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 22 }}>
        {summary.map((s) => (
          <div key={s.label} style={{ padding: "12px 14px", background: s.hivis ? TOKENS.hivis : TOKENS.paperLight, border: `1px solid ${s.hivis ? TOKENS.hivisDeep : TOKENS.rule}`, borderRadius: 4 }}>
            <div className="ec-mono" style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: s.hivis ? TOKENS.onHivisSoft : TOKENS.steel, marginBottom: 4 }}>{s.label}</div>
            <div className="ec-display" style={{ fontSize: 20, color: s.hivis ? TOKENS.onHivis : TOKENS.ink, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28 }}>
        <div>
          <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.steel, marginBottom: 10 }}>
            Total breakdown · {currency}{fmt(estimate.total)}
          </div>
          {buildup.map((r, i) => (
            <CostBar key={r.label} idx={i} label={r.label} value={r.value} max={buildMax} total={estimate.total} currency={currency} fill={TOKENS.inkSoft} hovered={hoverA} onHover={setHoverA} />
          ))}
        </div>
        {byCategory.length > 0 && (
          <div>
            <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.steel, marginBottom: 10 }}>
              Materials by category · {currency}{fmt(estimate.materialsTotal)}
            </div>
            {byCategory.map((r, i) => (
              <CostBar key={r.label} idx={i} label={r.label} value={r.value} max={catMax} total={matTotal} currency={currency} fill={TOKENS.steel} hovered={hoverB} onHover={setHoverB} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EstimateTab({ estimate, currency, region, onRatesChanged }) {
  const groupedMaterials = useMemo(() => {
    const groups = {};
    for (const l of estimate.materialLines) {
      groups[l.category] = groups[l.category] || [];
      groups[l.category].push(l);
    }
    return groups;
  }, [estimate]);

  const [editingRates, setEditingRates] = useState(false);
  const setRate = (equipmentId, value) => {
    const n = +value;
    if (equipmentId && isFinite(n) && n >= 0) setEquipmentRateOverride(equipmentId, region, n);
    onRatesChanged?.();
  };
  const restoreDefaultRates = () => {
    clearEquipmentRateOverrides();
    onRatesChanged?.();
  };

  return (
    <div>
      <CostBreakdown estimate={estimate} currency={currency} />
      <SectionHeader index="A" title="Materials — itemised takeoff" />
      <div style={{ overflowX: "auto" }}>
        {Object.entries(groupedMaterials).map(([cat, lines]) => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisInk, marginBottom: 6, fontWeight: 700 }}>
              {cat}
            </div>
            <TakeoffTable rows={lines.map((l) => ({ label: l.label, qty: `${l.qty} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
          </div>
        ))}
      </div>
      <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
        <span>MATERIALS SUBTOTAL</span><span>{currency}{fmt(estimate.materialsTotal)}</span>
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionHeader index="B" title="Labour — by trade" />
        <TakeoffTable rows={estimate.labourLines.map((l) => ({ label: l.trade, qty: "", rate: "", total: `${currency}${fmt(l.total)}` }))} />
        <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
          <span>LABOUR SUBTOTAL</span><span>{currency}{fmt(estimate.labourTotal)}</span>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <SectionHeader index="C" title="Equipment & plant" />
          <button onClick={() => setEditingRates((v) => !v)} style={{ border: "none", background: "none", color: TOKENS.steel, cursor: "pointer", fontSize: 12, textDecoration: "underline", whiteSpace: "nowrap" }}>
            {editingRates ? "Done editing" : "Edit rates"}
          </button>
        </div>
        {editingRates ? (
          <div className="ec-mono" style={{ fontSize: 12 }}>
            {estimate.equipmentLines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 110px", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "center" }}>
                <span style={{ color: TOKENS.ink }}>{l.name}</span>
                <span style={{ textAlign: "right" }}>{l.qty} {l.unit}</span>
                <input type="number" className="ec-input" style={{ textAlign: "right", padding: "4px 6px" }}
                  defaultValue={l.rate} onBlur={(e) => setRate(l.equipmentId, e.target.value)} />
                <span style={{ textAlign: "right" }}>{currency}{fmt(l.total)}</span>
              </div>
            ))}
            <button onClick={restoreDefaultRates} style={{ border: "none", background: "none", color: TOKENS.steel, cursor: "pointer", fontSize: 11, textDecoration: "underline", marginTop: 8 }}>
              Restore default equipment rates
            </button>
          </div>
        ) : (
          <TakeoffTable rows={estimate.equipmentLines.map((l) => ({ label: l.name, qty: `${l.qty} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
        )}
        <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
          <span>EQUIPMENT SUBTOTAL</span><span>{currency}{fmt(estimate.equipmentTotal)}</span>
        </div>
      </div>

      <div style={{ marginTop: 28, background: TOKENS.card, border: `2px solid ${TOKENS.ink}`, padding: 16 }}>
        <SectionHeader index="D" title="Builder build-up" />
        <div className="ec-mono" style={{ fontSize: 13 }}>
          {[
            ["Direct costs subtotal", estimate.subtotal],
            [`Preliminaries (${Math.round(estimate.prelimsPct * 100)}%)`, estimate.prelims],
            ["Builder margin (15%)", estimate.margin],
            [`Contingency (${Math.round(estimate.contingencyPct * 100)}%)`, estimate.contingency],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}` }}>
              <span>{label}</span><span>{currency}{fmt(val)}</span>
            </div>
          ))}
          {estimate.extrasTotal > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}`, fontWeight: 600 }}>
                <span>Base build</span><span>{currency}{fmt(estimate.buildTotal)}</span>
              </div>
              {(estimate.extrasLines || []).map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 5px 12px", borderBottom: `1px dotted ${TOKENS.rule}`, fontSize: 12, color: TOKENS.inkSoft }}>
                  <span>+ {l.label}{l.kind === "labour" ? ` (${l.workers || 1}×${l.hours || 0}hr)` : l.qty ? ` (${l.qty} ${l.unit})` : ""}</span>
                  <span>{currency}{fmt(l.total)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}`, fontWeight: 600 }}>
                <span>Additional items (added at entered price)</span><span>{currency}{fmt(estimate.extrasTotal)}</span>
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 4, fontSize: 18, fontWeight: 700, color: TOKENS.onHivis, background: TOKENS.hivis, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16, marginBottom: -16 }}>
            <span>TOTAL ESTIMATE</span><span>{currency}{fmt(estimate.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}



/* ---- Timeline tab ---- */
function TimelineTab({ estimate }) {
  const { timeline } = estimate;
  const maxWeek = timeline.totalWeeks;
  return (
    <div>
      <SectionHeader index="E" title="Construction programme" />
      <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.steel, marginBottom: 16, letterSpacing: "0.06em" }}>
        TOTAL · {timeline.totalWeeks} WEEKS  ·  ~{(timeline.totalWeeks / 4.33).toFixed(1)} MONTHS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {timeline.stages.map((s, i) => {
          const leftPct = ((s.startWeek - 1) / maxWeek) * 100;
          const widthPct = (s.weeks / maxWeek) * 100;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr 70px", alignItems: "center", gap: 12 }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink }}>
                <span style={{ color: TOKENS.steel, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>{s.name}
              </div>
              <div style={{ position: "relative", height: 22, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${leftPct}%`, width: `${widthPct}%`,
                  background: TOKENS.hivis,
                  borderRight: `2px solid ${TOKENS.ink}`,
                }} />
                <div style={{
                  position: "absolute", top: 2, left: `calc(${leftPct}% + 6px)`,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TOKENS.ink, fontWeight: 600,
                }}>
                  W{s.startWeek}–{s.endWeek}
                </div>
              </div>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, textAlign: "right" }}>{s.weeks} wk</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Codes tab ---- */
function CodesTab({ region, highrise }) {
  const code = highrise ? HighRiseCodes[region] : BuildingCodes[region];
  const leg = Legislation[region];
  const [juris, setJuris] = useState(0);
  const j = leg.jurisdictions[juris] || leg.jurisdictions[0];
  return (
    <div>
      <SectionHeader index="F" title="Code & compliance reference" />
      <div className="ec-card" style={{ padding: 16, marginBottom: 16, background: TOKENS.paperLight }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Authority</div>
        <div className="ec-display" style={{ fontSize: 20, lineHeight: 1.2, marginBottom: 4 }}>{code.name}</div>
        <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 8 }}>{code.authority}</div>
        <a href={code.url} target="_blank" rel="noopener noreferrer" className="ec-link ec-mono" style={{ fontSize: 12 }}>
          Open authoritative source ↗
        </a>
      </div>

      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 12, letterSpacing: "0.12em" }}>
        KEY PROVISIONS RELEVANT TO YOUR DESIGN
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {code.sections.map((s, i) => (
          <div key={i} className="ec-card" style={{ padding: 14 }}>
            <div className="ec-display" style={{ fontSize: 14, letterSpacing: "0.02em", marginBottom: 6 }}>{s.topic}</div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: TOKENS.inkSoft, margin: "0 0 8px" }}>{s.detail}</p>
            <a href={s.refUrl || code.url} target="_blank" rel="noopener noreferrer" className="ec-mono"
              title={`Open source for ${s.ref}`}
              style={{ fontSize: 10, letterSpacing: "0.1em", color: TOKENS.hivisInk, fontWeight: 700, textDecoration: "none", borderBottom: `1px solid ${TOKENS.hivisDeep}`, paddingBottom: 1 }}>
              REF · {s.ref} ↗
            </a>
          </div>
        ))}
      </div>

      {/* ---- Legislation directory (official Acts + regulators) ---- */}
      <div style={{ marginTop: 28 }}>
        <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 4, letterSpacing: "0.12em" }}>
          GOVERNING LEGISLATION &amp; REGULATOR
        </div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5, maxWidth: 720 }}>
          {leg.national.note} Select your jurisdiction for the Act that applies and the regulator who administers it.
        </p>

        {/* national / model code card */}
        <div className="ec-card" style={{ padding: 14, marginBottom: 12, borderLeft: `3px solid ${TOKENS.hivisDeep}` }}>
          <div className="ec-display" style={{ fontSize: 15, marginBottom: 2 }}>{leg.national.name}</div>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, marginBottom: 8 }}>{leg.national.body}</div>
          <a href={leg.national.url} target="_blank" rel="noopener noreferrer" className="ec-link ec-mono" style={{ fontSize: 11 }}>Open official source ↗</a>
        </div>

        {/* jurisdiction selector */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {leg.jurisdictions.map((jj, i) => (
            <button key={jj.code} onClick={() => setJuris(i)} className="ec-mono"
              style={{ padding: "6px 10px", fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer",
                border: `1px solid ${juris === i ? TOKENS.ink : TOKENS.rule}`,
                background: juris === i ? TOKENS.ink : "transparent",
                color: juris === i ? TOKENS.paper : TOKENS.ink }}>
              {jj.code}
            </button>
          ))}
        </div>

        {/* selected jurisdiction detail */}
        <div className="ec-card" style={{ padding: 16, borderLeft: `3px solid ${TOKENS.emberDeep}` }}>
          <div className="ec-eyebrow" style={{ marginBottom: 4 }}>{j.name}</div>
          <div className="ec-display" style={{ fontSize: 16, lineHeight: 1.25, marginBottom: 6 }}>{j.act}</div>
          <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 12 }}>Regulator: {j.regulator}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a href={j.actUrl} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-hivis" style={{ fontSize: 11 }}>Read the Act ↗</a>
            {j.qbccActUrl && <a href={j.qbccActUrl} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }}>QBCC Act ↗</a>}
            <a href={j.regulatorUrl} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }}>Regulator ↗</a>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 14, border: `1px dashed ${TOKENS.alert}`, background: "rgba(200,72,14,0.04)" }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.alert, fontWeight: 700, marginBottom: 4 }}>NOTE</div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.inkSoft, margin: 0 }}>
          This is a curated summary with links to the official, current legislation — not a reproduction of the law, which is updated by each authority. Always verify with your certifier or building control authority before construction.
        </p>
      </div>
    </div>
  );
}

/* ---- Suppliers tab ---- */
/* ---- SketchUp import tab ---- */
/* ---- Spreadsheet import tab: read -> review -> allocate -> estimate ---- */
function SpreadsheetTab({ region, currency, onApply, onApplyTemplate, onApplyMaterials, materialsMode }) {
  const [stage, setStage] = useState(1);            // 1 upload, 2 map cols, 3 review, 4 allocate
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({ material: -1, quantity: -1, unit: -1 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState([]);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef(null);

  const parseWorkbook = (data, name, isText) => {
    try {
      const wb = isText ? XLSX.read(data, { type: "string" }) : XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      if (!aoa.length) { setError("That sheet looks empty."); return; }
      // find the real header row (real quotes often have a title/blank rows above the table)
      const hr = SpreadsheetImport.findHeaderRow(aoa);
      const hdr = aoa[hr.index] || aoa[0];
      const body = aoa.slice(hr.index + 1);
      const detected = SpreadsheetImport.detectColumns(hdr);
      setHeaders(hdr); setRows(body); setMapping(detected);
      setFileName(name); setError("");
      setIssues(Validate.checkColumns(detected, hdr));
      const canEstimate = detected.material >= 0 && (detected.quantity >= 0 || detected.rate >= 0 || detected.total >= 0);
      setStage(canEstimate ? 3 : 2);
      if (canEstimate) runEstimate(body, detected); else setResult(null);
    } catch (e) { setError("Couldn't read that file. Is it a valid .xlsx or .csv?"); }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(f.name);
    reader.onload = () => parseWorkbook(isCsv ? reader.result : new Uint8Array(reader.result), f.name, isCsv);
    reader.onerror = () => setError("Could not read that file.");
    if (isCsv) reader.readAsText(f); else reader.readAsArrayBuffer(f);
  };

  const loadSample = () => parseWorkbook(SpreadsheetImport.sampleCsv(), "sample-takeoff.csv", true);

  const runEstimate = (bodyRows, map) => {
    const est = SpreadsheetImport.estimate(bodyRows, map, region);
    setResult(est); setStage(4);
  };

  // Edit/delete lines directly in the preview, before applying anywhere
  const recompute = (lines) => ({
    lines,
    materialsTotal: lines.reduce((a, l) => a + (l.total || 0), 0),
    read: lines.length,
    matched: lines.filter((l) => l.matched).length,
    fromFile: lines.filter((l) => l.priceSource === "file").length,
    needPriceCount: lines.filter((l) => l.needsPrice).length,
    skipped: result ? result.skipped : 0,
  });
  const removePreviewLine = (idx) => setResult((r) => recompute(r.lines.filter((_, i) => i !== idx)));
  const updatePreviewLine = (idx, patch) => setResult((r) => recompute(r.lines.map((l, i) => {
    if (i !== idx) return l;
    const next = { ...l, ...patch };
    // recompute this line's total from whichever of qty/rate/total changed
    if ("rate" in patch || "qty" in patch) {
      const q = +next.qty || 0, rt = +next.rate || 0;
      if (isFinite(q) && isFinite(rt) && (next.qty != null && next.rate != null)) { next.total = round(q * rt, 2); next.needsPrice = false; }
    }
    if ("total" in patch) { next.total = +patch.total || 0; next.needsPrice = false; }
    return next;
  })));

  useEffect(() => {
    if (result && mapping.material >= 0 && mapping.quantity >= 0) {
      setResult(SpreadsheetImport.estimate(rows, mapping, region));
    }
  }, [region]); // eslint-disable-line

  const steps = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Map columns" },
    { n: 3, label: "Review" },
    { n: 4, label: "Allocate" },
  ];

  return (
    <div>
      <SectionHeader index="S" title={`Import spreadsheet · ${region}`} />

      {/* process stepper — always visible */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, flexWrap: "wrap" }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
              background: stage >= s.n ? TOKENS.ink : TOKENS.paperLight,
              border: `1px solid ${stage >= s.n ? TOKENS.ink : TOKENS.rule}` }}>
              <span className="ec-mono" style={{ fontSize: 12, fontWeight: 700, color: stage >= s.n ? TOKENS.hivis : TOKENS.steel }}>{s.n}</span>
              <span className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: stage >= s.n ? "#fff" : TOKENS.steel }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ width: 18, height: 1, background: TOKENS.rule }} />}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 16, lineHeight: 1.6, maxWidth: 760 }}>
        Upload a takeoff spreadsheet (.xlsx or .csv). The columns are auto-detected, you confirm the mapping, review what matched, and the allocator converts quantities into orderable amounts with trade waste factors built in.
      </p>

      {/* Stage 1 — upload */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { const isCsv = /\.csv$/i.test(f.name); const r = new FileReader(); r.onload = () => parseWorkbook(isCsv ? r.result : new Uint8Array(r.result), f.name, isCsv); if (isCsv) r.readAsText(f); else r.readAsArrayBuffer(f); } }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${TOKENS.rule}`, borderRadius: 4, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: TOKENS.paperLight, marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: "none" }} />
        <div className="ec-mono" style={{ fontSize: 13, color: TOKENS.inkSoft }}>
          {fileName ? `Loaded: ${fileName} — click to replace` : "Drag a .xlsx or .csv here, or click to browse"}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="ec-btn ec-btn-hivis" onClick={(e) => { e.stopPropagation(); loadSample(); }}>Try a sample takeoff</button>
        </div>
      </div>
      {error && <div style={{ marginBottom: 14, padding: 10, border: `1px solid ${TOKENS.alert}`, color: TOKENS.alert, fontSize: 12, background: "rgba(200,72,14,0.05)" }} className="ec-mono">{error}</div>}

      {issues.length > 0 && (
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {issues.map((iss, i) => {
            const c = iss.level === "error" ? TOKENS.alert : iss.level === "warn" ? TOKENS.emberDeep : TOKENS.steel;
            const tag = iss.level === "error" ? "MUST FIX" : iss.level === "warn" ? "HEADS UP" : "NOTE";
            return (
              <div key={i} style={{ padding: 10, border: `1px solid ${c}`, background: "rgba(0,0,0,0.015)", borderLeft: `3px solid ${c}` }}>
                <div className="ec-mono" style={{ fontSize: 9, letterSpacing: "0.12em", color: c, fontWeight: 700, marginBottom: 3 }}>{tag}</div>
                <div style={{ fontSize: 12, color: TOKENS.ink, lineHeight: 1.45 }}>{iss.message}</div>
                {iss.fix && <div style={{ fontSize: 11, color: TOKENS.inkSoft, marginTop: 4 }}>→ {iss.fix}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Stage 2/3 — column mapping */}
      {headers.length > 0 && (
        <div className="ec-card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: TOKENS.hivisInk, fontWeight: 700, marginBottom: 4 }}>CONFIRM COLUMN MAPPING</div>
          <p style={{ fontSize: 11, color: TOKENS.steel, margin: "0 0 10px", lineHeight: 1.5 }}>
            If your sheet has Rate or Total columns, they're used directly — your numbers, not ours. Material is the only required column.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["material", "Material / description *"], ["quantity", "Quantity"], ["rate", "Rate (optional)"], ["total", "Total (optional)"], ["unit", "Unit (optional)"]].map(([key, label]) => (
              <label key={key}>
                <span className="ec-label">{label}</span>
                <select className="ec-select" value={mapping[key]}
                  onChange={(e) => { const mp = { ...mapping, [key]: +e.target.value }; setMapping(mp); setIssues(Validate.checkColumns(mp, headers)); if (mp.material >= 0 && (mp.quantity >= 0 || mp.rate >= 0 || mp.total >= 0)) runEstimate(rows, mp); }}>
                  <option value={-1}>— none —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{String(h || `Column ${i + 1}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8 }}>{rows.length} rows detected</div>
        </div>
      )}

      {/* Stage 4 — results: every line kept */}
      {result && (
        <Reveal variant="fade-up">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <CostCard label="Total from sheet" value={`${currency}${fmt(result.materialsTotal)}`} hivis sub={result.fromFile > 0 ? `${result.fromFile} priced from your file` : "priced from catalogue"} />
            <CostCard label="Lines read" value={`${result.read}`} sub={`${result.matched} catalogue-matched`} />
            {result.needPriceCount > 0 && <CostCard label="Need a price" value={`${result.needPriceCount}`} sub="no rate/total in file" />}
          </div>

          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: TOKENS.hivisInk, fontWeight: 700, marginBottom: 4 }}>EVERY LINE FROM YOUR FILE — EDIT OR DELETE HERE</div>
          <p style={{ fontSize: 11, color: TOKENS.steel, margin: "0 0 8px", lineHeight: 1.5 }}>Rename anything (including unnamed lines), fix a qty or rate, or remove a row with ×. Changes here flow through when you apply.</p>
          <div className="ec-mono" style={{ fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.7fr 0.7fr 0.7fr 0.8fr 0.4fr 28px", gap: 4, padding: "6px 0", fontSize: 9, letterSpacing: "0.08em", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}` }}>
              <span>DESCRIPTION</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>RATE</span><span style={{ textAlign: "right" }}>TOTAL</span><span style={{ textAlign: "right" }}>SRC</span><span></span>
            </div>
            {result.lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.7fr 0.7fr 0.7fr 0.8fr 0.4fr 28px", gap: 4, padding: "5px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "center" }}>
                <input className="ec-input" style={{ fontSize: 11, padding: "3px 5px" }} value={l.label}
                  placeholder="(name this line)"
                  onChange={(e) => updatePreviewLine(i, { label: e.target.value })} />
                <input className="ec-input" style={{ fontSize: 11, padding: "3px 5px", textAlign: "right" }} type="number" placeholder="—"
                  value={l.qty ?? ""} onChange={(e) => updatePreviewLine(i, { qty: e.target.value === "" ? null : +e.target.value })} />
                <input className="ec-input" style={{ fontSize: 11, padding: "3px 5px", textAlign: "right" }} type="number" placeholder="—"
                  value={l.rate ?? ""} onChange={(e) => updatePreviewLine(i, { rate: e.target.value === "" ? null : +e.target.value })} />
                <span style={{ textAlign: "right", color: l.needsPrice ? TOKENS.alert : TOKENS.ink, fontWeight: 600, fontSize: 11 }}>
                  {l.needsPrice ? "—" : `${currency}${fmt(l.total)}`}
                </span>
                <span style={{ textAlign: "right", fontSize: 9, letterSpacing: "0.06em", color: l.priceSource === "file" ? TOKENS.ok : l.priceSource === "catalogue" ? TOKENS.hivisInk : TOKENS.steel }}>
                  {l.priceSource === "file" ? "FILE" : l.priceSource === "catalogue" ? "CAT" : l.priceSource === "manual" ? "YOU" : "—"}
                </span>
                <button onClick={() => removePreviewLine(i)} title="Delete this line"
                  style={{ width: 24, height: 24, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 14, lineHeight: 1, borderRadius: 2 }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
              <span>TOTAL FROM SHEET</span><span>{currency}{fmt(result.materialsTotal)}</span>
            </div>
          </div>

          <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
            SRC: <span style={{ color: TOKENS.ok }}>FILE</span> = your sheet's price · <span style={{ color: TOKENS.hivisInk }}>CAT</span> = catalogue rate · YOU = you edited it. Summary rows (Subtotal, GST, Total) are skipped automatically.
          </div>

          {onApplyMaterials && (
            <div style={{ marginTop: 18, padding: 16, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)" }}>
              <div className="ec-display" style={{ fontSize: 16, marginBottom: 4 }}>Use as materials list</div>
              <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
                Loads all {result.read} lines as a supply-only list, keeping your file's pricing where present.
              </p>
              <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyMaterials(result.lines)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Load as materials list
              </button>
            </div>
          )}

          {(onApply || onApplyTemplate) && (
            <div style={{ marginTop: 18, padding: 16, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)" }}>
              <div className="ec-display" style={{ fontSize: 16, marginBottom: 4 }}>Use this takeoff</div>
              <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
                Both clear your current inputs first. <b>Fixed takeoff</b> keeps all {result.read} lines and their pricing exactly. <b>Edit as template</b> turns the catalogue-matched ones into an editable design you can play with.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {onApplyTemplate && (
                  <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyTemplate(result.lines, fileName)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 20h9M3 17l9-9 4 4-9 9H3v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Edit as template
                  </button>
                )}
                {onApply && (
                  <button className="ec-btn ec-btn-ghost" onClick={() => onApply(result.lines, fileName)}>
                    Fixed takeoff
                  </button>
                )}
              </div>
            </div>
          )}
        </Reveal>
      )}
    </div>
  );
}

/* ---- CAD / BIM import: quantity schedules exported from Revit, ArchiCAD,
   Tekla or an IFC QTO tool (CSV/XLSX) run through the same column-mapping
   engine as spreadsheet import. Native .rvt/.ifc/.dwg parsing is a future
   provider — schedules are the lingua franca every BIM tool can export. */
function CadBimTab(props) {
  return (
    <div>
      <div style={{ border: `1px solid ${TOKENS.rule}`, borderLeft: `4px solid ${TOKENS.hivisDeep}`, background: TOKENS.paperLight, padding: "14px 16px", marginBottom: 18 }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>CAD / BIM import</div>
        <p style={{ fontSize: 13, color: TOKENS.inkSoft, lineHeight: 1.6, margin: 0 }}>
          Export a <b>material or quantity schedule</b> from your BIM tool and drop it here —
          Revit (schedule → export CSV), ArchiCAD (interactive schedule), Tekla, or any
          IFC quantity-takeoff export saved as CSV/XLSX. Columns for material, quantity and
          rate are auto-detected below, exactly like a spreadsheet takeoff. Native .rvt /
          .ifc / .dwg geometry parsing is on the roadmap.
        </p>
      </div>
      <SpreadsheetTab {...props} />
    </div>
  );
}

function SketchUpTab({ region, currency, onApply, onApplyTemplate, onApplyMaterials, materialsMode }) {
  const [result, setResult] = useState(null);   // { model, est }
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [showRuby, setShowRuby] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const ingest = (raw, name) => {
    const parsed = SketchUpImport.parse(raw);
    if (!parsed.ok) { setError(parsed.error); setResult(null); return; }
    const est = SketchUpImport.estimateFromModel(parsed.model, region);
    const lab = SketchUpImport.labourFromModel(parsed.model, region);
    setError("");
    setFileName(name || "model.json");
    setResult({ model: parsed.model, est, lab });
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => ingest(reader.result, f.name);
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(f);
  };

  const loadSample = () => ingest(SketchUpImport.sampleModel(), "sample-model.json");

  const copyRuby = () => {
    const text = SketchUpImport.rubyExporter();
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  // re-estimate when region changes and we have a model
  useEffect(() => {
    if (result?.model) {
      setResult((r) => ({ ...r, est: SketchUpImport.estimateFromModel(r.model, region), lab: SketchUpImport.labourFromModel(r.model, region) }));
    }
  }, [region]);

  const grouped = useMemo(() => {
    if (!result) return {};
    const g = {};
    for (const l of result.est.lines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [result]);

  return (
    <div>
      <SectionHeader index="H" title={`Import from SketchUp · ${region}`} />
      <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 16, lineHeight: 1.6, maxWidth: 760 }}>
        Browsers can't open native <span className="ec-mono" style={{ fontSize: 12 }}>.skp</span> files, so the workflow is two steps: run the exporter inside SketchUp to measure your model, then drop the resulting <span className="ec-mono" style={{ fontSize: 12 }}>model.json</span> here. Quantities come straight from your geometry, so the estimate reflects the real model — not a guess.
      </p>

      {/* Step 1 */}
      <div className="ec-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span className="ec-mono" style={{ fontSize: 18, color: TOKENS.emberInk, fontWeight: 700 }}>1</span>
          <h4 className="ec-display" style={{ fontSize: 16, margin: 0, letterSpacing: "0.02em" }}>RUN THE EXPORTER IN SKETCHUP</h4>
        </div>
        <p style={{ fontSize: 13, color: TOKENS.inkSoft, margin: "0 0 10px", lineHeight: 1.5 }}>
          In SketchUp: <span className="ec-mono" style={{ fontSize: 12 }}>Window → Ruby Console</span>, paste the script, press Enter. It writes <span className="ec-mono" style={{ fontSize: 12 }}>model.json</span> beside your file. Tag faces with material names like "Brick veneer" or "Colorbond roofing" for best matching.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ec-btn ec-btn-ghost" onClick={() => setShowRuby((v) => !v)}>{showRuby ? "Hide script" : "Show Ruby script"}</button>
          <button className="ec-btn" onClick={copyRuby}>{copied ? "✓ Copied" : "Copy script"}</button>
        </div>
        {showRuby && (
          /* A code block is dark in BOTH themes — `ink` is TEXT and flips to
             near-white in dark, which put pale green on a white slab. The
             emphasis/onEmphasisSoft pair stays dark either way. */
          <pre className="ec-mono" style={{ marginTop: 12, padding: 12, background: TOKENS.emphasis, color: TOKENS.onEmphasisSoft, fontSize: 11, lineHeight: 1.5, overflowX: "auto", maxHeight: 280, borderRadius: 2, border: `1px solid ${TOKENS.rule}` }}>
            {SketchUpImport.rubyExporter()}
          </pre>
        )}
      </div>

      {/* Step 2 */}
      <div className="ec-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span className="ec-mono" style={{ fontSize: 18, color: TOKENS.emberInk, fontWeight: 700 }}>2</span>
          <h4 className="ec-display" style={{ fontSize: 16, margin: 0, letterSpacing: "0.02em" }}>DROP YOUR MODEL.JSON</h4>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => ingest(r.result, f.name); r.readAsText(f); } }}
          onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${TOKENS.rule}`, borderRadius: 4, padding: "28px 16px", textAlign: "center", cursor: "pointer", background: TOKENS.paperLight }}>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: "none" }} />
          <div className="ec-mono" style={{ fontSize: 13, color: TOKENS.inkSoft }}>Drag <b>model.json</b> here, or click to browse</div>
          <div style={{ marginTop: 12 }}>
            <button className="ec-btn ec-btn-hivis" onClick={(e) => { e.stopPropagation(); loadSample(); }}>Try a sample model</button>
          </div>
        </div>
        {error && <div style={{ marginTop: 10, padding: 10, border: `1px solid ${TOKENS.alert}`, color: TOKENS.alert, fontSize: 12, background: "rgba(200,72,14,0.05)" }} className="ec-mono">{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <Reveal variant="fade-up">
          <div style={{ marginTop: 8 }}>
            <SectionHeader index="✓" title={`Mapped: ${fileName}`} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <CostCard label="Materials from model" value={`${currency}${fmt(result.est.materialsTotal)}`} hivis />
              <CostCard label="Labour (estimated)" value={`${currency}${fmt(result.lab ? result.lab.labourTotal : 0)}`} />
              <CostCard label="Lines matched" value={`${result.est.matched}`} sub={`${result.est.unmatched.length} need attention`} />
            </div>

            {Object.entries(grouped).map(([cat, lines]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisInk, marginBottom: 6, fontWeight: 700 }}>{cat}</div>
                <TakeoffTable rows={lines.map((l) => ({ label: `${l.label}  ·  ${l.source}`, qty: `${l.qty} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
              </div>
            ))}

            {result.lab && result.lab.lines.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisInk, marginBottom: 6, fontWeight: 700 }}>Labour · trades</div>
                <TakeoffTable rows={result.lab.lines.map((l) => ({ label: l.label, qty: `${l.hours} hr`, rate: `${currency}${fmt(l.rate)}/hr`, total: `${currency}${fmt(l.total)}` }))} />
              </div>
            )}

            <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: TOKENS.inkSoft }}>
              <span>Materials</span><span>{currency}{fmt(result.est.materialsTotal)}</span>
            </div>
            <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: TOKENS.inkSoft }}>
              <span>Labour (estimated)</span><span>{currency}{fmt(result.lab ? result.lab.labourTotal : 0)}</span>
            </div>
            <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
              <span>MATERIALS + LABOUR</span><span>{currency}{fmt(result.est.materialsTotal + (result.lab ? result.lab.labourTotal : 0))}</span>
            </div>

            {(onApply || onApplyTemplate) && (
              <div style={{ marginTop: 18, padding: 16, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)" }}>
                <div className="ec-display" style={{ fontSize: 16, marginBottom: 4 }}>Use this model</div>
                <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
                  <b>Edit as template</b> turns these {result.est.matched} lines into an editable design you can build on. <b>Fixed takeoff</b> prices them exactly. Both clear current inputs first.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onApplyTemplate && (
                    <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyTemplate(result.est.lines, fileName)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 20h9M3 17l9-9 4 4-9 9H3v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Edit as template
                    </button>
                  )}
                  {onApply && (
                    <button className="ec-btn ec-btn-ghost" onClick={() => onApply(result.est.lines, fileName)}>
                      Fixed takeoff
                    </button>
                  )}
                  {onApplyMaterials && (
                    <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyMaterials(result.est.lines)}>
                      Load into quote builder
                    </button>
                  )}
                </div>
              </div>
            )}

            {result.est.unmatched.length > 0 && (
              <div style={{ marginTop: 18, padding: 14, border: `1px dashed ${TOKENS.alert}`, background: "rgba(200,72,14,0.04)" }}>
                <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.alert, fontWeight: 700, marginBottom: 8 }}>UNMATCHED — RENAME IN SKETCHUP OR PRICE MANUALLY</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.est.unmatched.map((u, i) => (
                    <span key={i} className="ec-mono" style={{ fontSize: 11, padding: "4px 8px", border: `1px solid ${TOKENS.rule}`, background: TOKENS.card }}>
                      {u.name} <span style={{ color: TOKENS.steel }}>({u.qty}, {u.kind})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}

function resolveSupplierUrl(s, q) {
  if (typeof s.url === "function") return s.url(q);
  if (s.urlTemplate) return s.urlTemplate.includes("{q}") ? s.urlTemplate.replace("{q}", encodeURIComponent(q)) : s.urlTemplate;
  return "#";
}

function SuppliersTab({ region, estimate }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const suppliers = useMemo(() => getSuppliers(region), [region, refreshKey]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", tier: "Custom", coverage: "", urlTemplate: "" });

  const addSupplier = () => {
    if (!newSupplier.name.trim()) return;
    addSupplierOverride(region, { ...newSupplier });
    setNewSupplier({ name: "", tier: "Custom", coverage: "", urlTemplate: "" });
    setAdding(false);
    setRefreshKey((k) => k + 1);
  };
  const removeSupplier = (s) => {
    if (s.custom) removeSupplierOverride(region, s.name);
    else hideSampleSupplier(region, s.name);
    setRefreshKey((k) => k + 1);
  };
  const resetToSample = () => {
    resetSuppliersToSample(region);
    setRefreshKey((k) => k + 1);
  };

  /* Build a unique list of labels from the takeoff, ordered by total cost desc.
     Residential estimates expose materialLines; high-rise exposes systemLines. */
  const materialQueries = useMemo(() => {
    const lines = estimate.materialLines || estimate.systemLines || estimate.lines || [];
    const seen = new Set();
    return lines
      .filter((l) => !seen.has(l.label) && seen.add(l.label))
      .sort((a, b) => b.total - a.total)
      .slice(0, 14);
  }, [estimate]);

  return (
    <div>
      <SectionHeader index="G" title={`Supplier search · ${region}`} />
      <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 16, lineHeight: 1.5, maxWidth: 720 }}>
        Click any item below to search live prices on a supplier site — your query runs on their search, so prices and stock are current. Or type your own material query.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "stretch" }}>
        <input className="ec-input" style={{ flex: 1 }} placeholder="e.g. 90×35 MGP10 pine framing" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 8, letterSpacing: "0.12em" }}>
        TOP ITEMS FROM YOUR QUOTE — TAP TO SEARCH
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
        {materialQueries.map((m) => (
          <button key={m.label} onClick={() => setQuery(m.label)}
            style={{
              padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              border: `1px solid ${TOKENS.rule}`, background: query === m.label ? TOKENS.hivis : TOKENS.card,
              color: query === m.label ? TOKENS.onHivis : TOKENS.ink, cursor: "pointer", letterSpacing: "0.02em",
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {(() => {
        const q = query || materialQueries[0]?.label || "framing timber";
        // group suppliers by tier, preserving first-seen order
        const tiers = [];
        const byTier = {};
        for (const s of suppliers) {
          const t = s.tier || "Suppliers";
          if (!byTier[t]) { byTier[t] = []; tiers.push(t); }
          byTier[t].push(s);
        }
        return tiers.map((t) => (
          <div key={t} style={{ marginBottom: 22 }}>
            <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: TOKENS.hivisInk, fontWeight: 700, marginBottom: 10 }}>{t.toUpperCase()}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {byTier[t].map((s) => (
                <div key={s.name} className="ec-card" style={{ padding: 16, position: "relative" }}>
                  <button onClick={(e) => { e.preventDefault(); removeSupplier(s); }} title={s.custom ? "Remove" : "Hide"}
                    style={{ position: "absolute", top: 8, right: 8, border: "none", background: "none", color: TOKENS.steel, cursor: "pointer", fontSize: 14 }}>×</button>
                  <a href={resolveSupplierUrl(s, q)} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: "none", color: TOKENS.ink, display: "block" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, paddingRight: 16 }}>
                      <div className="ec-display" style={{ fontSize: 17, lineHeight: 1.1 }}>{s.name}{s.custom ? " ✎" : ""}</div>
                      <span style={{ fontSize: 18, color: TOKENS.hivisInk }}>↗</span>
                    </div>
                    <div style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.4, marginBottom: 10 }}>{s.coverage}</div>
                    <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, paddingTop: 8, borderTop: `1px dashed ${TOKENS.rule}` }}>
                      SEARCH · "{q.length > 34 ? q.slice(0, 34) + "…" : q}"
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        ));
      })()}

      <div style={{ marginTop: 4, padding: 12, border: `1px dashed ${TOKENS.rule}`, background: TOKENS.paperLight, marginBottom: 16 }}>
        <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, margin: 0, lineHeight: 1.6 }}>
          Local FNQ suppliers are listed for the Cairns region. Some local yards quote by phone/account rather than online search — their link opens the supplier so you can request a trade quote. National suppliers deliver to FNQ from down south.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="ec-btn" onClick={() => setAdding((v) => !v)}>+ Add supplier</button>
        <button onClick={resetToSample} style={{ border: "none", background: "none", color: TOKENS.steel, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>
          ↺ Reset to sample suppliers
        </button>
      </div>
      {adding && (
        <div className="ec-card" style={{ padding: 16, marginTop: 12, maxWidth: 480 }}>
          <InputRow>
            <Field label="Name"><input className="ec-input" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></Field>
            <Field label="Tier"><input className="ec-input" value={newSupplier.tier} onChange={(e) => setNewSupplier({ ...newSupplier, tier: e.target.value })} /></Field>
          </InputRow>
          <Field label="Coverage"><input className="ec-input" value={newSupplier.coverage} onChange={(e) => setNewSupplier({ ...newSupplier, coverage: e.target.value })} /></Field>
          <Field label="Search URL (use {q} where the search term goes)">
            <input className="ec-input" placeholder="https://example.com/search?q={q}" value={newSupplier.urlTemplate} onChange={(e) => setNewSupplier({ ...newSupplier, urlTemplate: e.target.value })} />
          </Field>
          <button className="ec-btn" style={{ marginTop: 8 }} onClick={addSupplier}>Add</button>
        </div>
      )}
    </div>
  );
}

