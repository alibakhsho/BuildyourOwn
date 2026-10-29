/* =========================================================================
   MODULE: bim/dxf.js
   Floor plans as DXF (AutoCAD R12, the dialect every CAD package reads —
   AutoCAD, BricsCAD, DraftSight, LibreCAD, QCAD, Revit/ArchiCAD import).
   Pure: building model in, DXF text out. Units: millimetres.

   One plan per storey, drawn from the same pieces as the 3D model, on a
   layer per trade (ISO 13567-style names) so each trade turns on only
   what is theirs:
     S-SLAB  S-REO  S-FRAM  S-ROOF   structure (reo and roof framing frozen by default)
     A-CLAD  A-OPEN  A-LINE  A-CEIL  A-FITT  A-ROOM   architecture
     (linings and ceiling framing frozen by default)
     E-POWR  E-LITE  E-SWCH  E-ALRM  E-CABL  E-BORD   electrical
     P-DOMW  P-FIXT                       plumbing
     D-SANR  D-STRM                       drainage & stormwater
     X-PV                                 solar
   Point devices (power points, lights, alarms …) also get their mark as
   text, so the plan reads as a services layout, not just outlines.
   ========================================================================= */
import { corners } from "../structure/model.js";
import { buildStructure } from "../structure/index.js";

/* name, ACI colour, frozen */
export const DXF_LAYERS = {
  "S-SLAB": [8, false], "S-REO": [252, true], "S-FRAM": [30, false], "S-ROOF": [34, true],
  "A-CLAD": [1, false], "A-CEIL": [9, true], "A-OPEN": [4, false], "A-LINE": [9, true], "A-FITT": [6, false], "A-ROOM": [7, false],
  "E-POWR": [1, false], "E-LITE": [2, false], "E-SWCH": [6, false], "E-ALRM": [10, false], "E-CABL": [253, true], "E-BORD": [1, false],
  "P-DOMW": [5, false], "P-FIXT": [5, false],
  "D-SANR": [3, false], "D-STRM": [140, false],
  "X-PV": [150, false],
  "L-FENC": [33, false], "L-DECK": [32, false], "L-PAVE": [8, false], "L-PLNT": [94, false], "L-TURF": [82, true], "L-RETW": [253, false],
};

export function dxfLayerOf(m) {
  const k = m.kind || "";
  if (/ceiling/i.test(m.host || "") && ["wallFrame", "roofFrame", "linings", "floorFrame"].includes(m.sys)) return "A-CEIL";
  switch (m.sys) {
    case "foundation": return "S-SLAB";
    case "reo": return "S-REO";
    case "wallFrame": case "floorFrame": case "fixings": return "S-FRAM";
    case "roofFrame": case "roofing": return "S-ROOF";
    case "cladding": return "A-CLAD";
    case "openings": return "A-OPEN";
    case "linings": return "A-LINE";
    case "interior": return "A-FITT";
    case "solar": return "X-PV";
    case "fencing": return "L-FENC";
    case "decking": return "L-DECK";
    case "paving": return "L-PAVE";
    case "garden": return "L-PLNT";
    case "lawn": return "L-TURF";
    case "retaining": return "L-RETW";
    case "electrical":
      if (k === "cable") return "E-CABL";
      if (k === "light") return "E-LITE";
      if (k === "switch" || k === "isolator") return "E-SWCH";
      if (k === "smoke" || k === "fan") return "E-ALRM";
      if (k === "board" || k === "meterbox") return "E-BORD";
      return "E-POWR";
    case "plumbing": return k === "pipe" ? "P-DOMW" : "P-FIXT";
    case "drainage": return /storm|downpipe|kerb|pit/i.test(`${m.name} ${k}`) ? "D-STRM" : "D-SANR";
    default: return "A-FITT";
  }
}

const POINT_KINDS = new Set(["gpo", "data", "tv", "switch", "isolator", "light", "smoke", "fan", "board", "meterbox", "floorwaste", "tap", "taps", "trough", "hwu", "meter", "trap", "org", "io", "pit"]);
const SKIP = new Set(["screw", "tie", "nailplate", "nut", "washer", "hinge", "rose", "lever", "deadlock", "clamp", "bracket", "hanger", "mortar", "brick", "tile", "batt"]);

/* convex hull (monotone chain) */
function hull(P) {
  const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const mm = (v) => (Math.round(v * 10000) / 10).toString();   // metres → mm, 0.1 mm
const plan = (p) => [p[0], -p[2]];                             // model (x, y-up, z) → plan (x, y), north = back

/**
 * DXF for one storey's plan.
 * @param S  buildStructure(spec) result
 * @param f  storey index
 */
export function planDxf(S, f, info = {}) {
  const { env } = S;
  const y0 = env.levelY(f), yTop = y0 + env.wallH;
  const top = f === env.floors - 1;
  const inStorey = (m) => {
    const lo = Math.min(m.a[1], m.b[1]), hi = Math.max(m.a[1], m.b[1]);
    if (m.sys === "roofFrame" || m.sys === "roofing" || m.sys === "solar") return top;
    if (f === 0 && hi < y0 + 0.05) return true;               // slab, footings, everything under ground
    return hi > y0 + 0.02 && lo < yTop - 0.01;              // the floor above belongs to the plan above
  };
  let members = S.members.filter((m) => !SKIP.has(m.kind) && !m.noRender && inStorey(m));
  if (S.members.some((m) => m.kind === "brick")) {
    members = members.concat(buildStructure(S.spec, { detail: "lite" }).members.filter((m) => m.sys === "cladding" && /cladding/i.test(m.name) && inStorey(m)));
  }

  const ent = [];
  const add = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) ent.push(String(pairs[i]), String(pairs[i + 1])); };
  const polyline = (layer, pts, closed) => {
    add(0, "POLYLINE", 8, layer, 66, 1, 70, closed ? 1 : 0, 10, 0, 20, 0, 30, 0);
    for (const p of pts) add(0, "VERTEX", 8, layer, 10, mm(p[0]), 20, mm(p[1]), 30, 0);
    add(0, "SEQEND", 8, layer);
  };
  const text = (layer, p, h, s) => add(0, "TEXT", 8, layer, 10, mm(p[0]), 20, mm(p[1]), 30, 0, 40, mm(h), 1, asciiOnly(s));

  for (const m of members) {
    const layer = dxfLayerOf(m);
    const linear = m.shape === "cyl" && m.len > 0.2 && (m.kind === "pipe" || m.kind === "cable" || m.kind === "downpipe");
    if (linear) {
      const a = plan(m.a), b = plan(m.b);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-3) polyline(layer, [a, b], false);
      continue;
    }
    const h = hull(corners(m).map(plan));
    if (h.length >= 3) polyline(layer, h, true);
    if (m.sys === "electrical" || m.sys === "plumbing" || m.sys === "drainage" ? POINT_KINDS.has(m.kind) : false) {
      const c = plan([(m.a[0] + m.b[0]) / 2, 0, (m.a[2] + m.b[2]) / 2]);
      add(0, "CIRCLE", 8, layer, 10, mm(c[0]), 20, mm(c[1]), 30, 0, 40, mm(0.09));
      text(layer, [c[0] + 0.12, c[1] + 0.05], 0.1, m.mark);
    }
  }
  // room names and areas
  for (const c of S.layout.floors[f]?.cells || []) {
    const p = plan([c.x + c.w / 2, 0, c.z + c.l / 2]);
    text("A-ROOM", [p[0] - 0.8, p[1] + 0.1], 0.2, c.item.name);
    text("A-ROOM", [p[0] - 0.8, p[1] - 0.2], 0.15, `${(c.w * c.l).toFixed(1)} m2`);
  }
  // title
  const title = `${info.project || "BuildYourOwn"} - ${f === 0 ? "Ground floor" : f === 1 ? "First floor" : `Level ${f}`} plan - indicative, not for construction`;
  text("A-ROOM", [-env.w / 2, -env.l / 2 - 1.2], 0.3, title);

  const used = new Set(Object.keys(DXF_LAYERS));
  const out = [];
  const o = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };
  o(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSUNITS", 70, 4, 9, "$MEASUREMENT", 70, 1, 0, "ENDSEC");
  o(0, "SECTION", 2, "TABLES");
  o(0, "TABLE", 2, "LTYPE", 70, 1, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0, 0, "ENDTAB");
  o(0, "TABLE", 2, "LAYER", 70, used.size + 1);
  o(0, "LAYER", 2, "0", 70, 0, 62, 7, 6, "CONTINUOUS");
  for (const name of used) {
    const [col, frozen] = DXF_LAYERS[name];
    o(0, "LAYER", 2, name, 70, frozen ? 1 : 0, 62, col, 6, "CONTINUOUS");
  }
  o(0, "ENDTAB", 0, "ENDSEC");
  o(0, "SECTION", 2, "ENTITIES");
  for (const v of ent) out.push(v);       // not push(...ent): a big yard overflows the argument limit
  o(0, "ENDSEC", 0, "EOF");
  return out.join("\r\n") + "\r\n";
}

/* R12 text is single-byte: swap the typographic characters our names use. */
function asciiOnly(s) {
  return String(s ?? "")
    .replace(/×/g, "x").replace(/²/g, "2").replace(/³/g, "3").replace(/°/g, " deg").replace(/[—–]/g, "-").replace(/·/g, "-")
    .replace(/[^\x20-\x7e]/g, "");
}
