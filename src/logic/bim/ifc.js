/* =========================================================================
   MODULE: bim/ifc.js
   The building model as an IFC4 file (ISO 16739, STEP physical file) — the
   open BIM format Revit, ArchiCAD, Tekla, Vectorworks, Solibri, BIMcollab,
   Navisworks and every IFC viewer read. Pure: string in, string out.

   What goes in:
     Project → Site → Building → one storey per floor
     IfcSpace per room (with its floor area and height)
     every piece of the model as the IFC class a consultant expects
       (IfcMember / IfcSlab / IfcCovering / IfcDoor / IfcWindow / IfcOutlet /
        IfcLightFixture / IfcPipeSegment / IfcSanitaryTerminal …), each with
       its mark as Tag, its product as Description, and its geometry as an
       extruded box or cylinder along the member axis
     one IfcSystem per trade (structure, electrical, plumbing, drainage …)
       so a services consultant can isolate their trade in one click

   detail: "coordination" (default) — brick veneer as wall panels and no
             screws, nail plates or ties: what a clash check needs, at a
             size a browser can download
           "full" — every brick, bolt and screw

   Axes: the model is Y-up (three.js); IFC is Z-up. (x, y, z) → (x, −z, y),
   a proper rotation, so the building is not mirrored.
   ========================================================================= */
import { basis, SYSTEMS } from "../structure/model.js";
import { buildStructure } from "../structure/index.js";

const FINE = new Set(["screw", "tie", "nailplate", "nut", "washer", "hinge", "rose", "lever", "deadlock", "clamp", "bracket", "hanger"]);

/* IFC class for a piece. Every class listed takes the 9 standard
   IfcElement attributes (… Tag, PredefinedType), except doors/windows. */
export function ifcClassOf(m) {
  const k = m.kind || "", n = m.name || "";
  switch (m.sys) {
    case "foundation": return /footing|beam|pier|pad/i.test(n) ? "IFCFOOTING" : "IFCSLAB";
    case "reo": return "IFCBUILDINGELEMENTPROXY";
    case "wallFrame": case "floorFrame": case "roofFrame":
      return /lintel|beam|bearer|joist|ledger|trimmer/i.test(n) ? "IFCBEAM" : /floor(ing)? sheet|particleboard/i.test(n) ? "IFCSLAB" : "IFCMEMBER";
    case "fixings": return "IFCMECHANICALFASTENER";
    case "cladding": return "IFCCOVERING";
    case "roofing": return k === "downpipe" ? "IFCPIPESEGMENT" : k === "gutter" ? "IFCPIPESEGMENT" : "IFCCOVERING";
    case "openings":
      if (k === "sash" || k === "glass" || /window/i.test(n)) return "IFCWINDOW";
      if (/door/i.test(n) && (k === "leaf" || k === "door")) return "IFCDOOR";
      return "IFCMEMBER";
    case "linings": return "IFCCOVERING";
    case "interior":
      if (k === "floor") return "IFCCOVERING";
      if (["tread", "riser", "stringer", "step"].includes(k)) return "IFCSTAIRFLIGHT";
      if (["handrail", "baluster", "post", "glass"].includes(k)) return "IFCRAILING";
      if (["wc", "vanity", "shower", "bath", "sink"].includes(k)) return "IFCSANITARYTERMINAL";
      return "IFCFURNITURE";
    case "solar": return k === "panel" ? "IFCSOLARDEVICE" : k === "inverter" ? "IFCELECTRICAPPLIANCE" : "IFCMEMBER";
    case "electrical":
      return { gpo: "IFCOUTLET", data: "IFCOUTLET", tv: "IFCOUTLET", switch: "IFCSWITCHINGDEVICE", isolator: "IFCSWITCHINGDEVICE", light: "IFCLIGHTFIXTURE",
        smoke: "IFCALARM", fan: "IFCFAN", board: "IFCELECTRICDISTRIBUTIONBOARD", meterbox: "IFCFLOWMETER", cable: "IFCCABLESEGMENT" }[k] || "IFCBUILDINGELEMENTPROXY";
    case "plumbing":
      return { pipe: "IFCPIPESEGMENT", hwu: "IFCTANK", meter: "IFCFLOWMETER", valve: "IFCVALVE", trough: "IFCSANITARYTERMINAL", taps: "IFCVALVE", tap: "IFCVALVE", point: "IFCPIPEFITTING" }[k] || "IFCBUILDINGELEMENTPROXY";
    case "drainage":
      return { pipe: "IFCPIPESEGMENT", floorwaste: "IFCWASTETERMINAL", trap: "IFCPIPEFITTING", org: "IFCWASTETERMINAL", io: "IFCPIPEFITTING", pit: "IFCDISTRIBUTIONCHAMBERELEMENT", kerb: "IFCPIPEFITTING" }[k] || "IFCBUILDINGELEMENTPROXY";
    case "fencing": return k === "post" || k === "rail" ? "IFCMEMBER" : k === "footing" ? "IFCFOOTING" : ["sheet", "paling", "picket", "plinth"].includes(k) ? "IFCPLATE" : "IFCBUILDINGELEMENTPROXY";
    case "decking":
      if (k === "board" || k === "fascia") return "IFCCOVERING";
      if (k === "joist" || k === "bearer") return "IFCBEAM";
      if (k === "stump") return "IFCMEMBER";
      if (k === "pad") return "IFCFOOTING";
      return ["screw", "clamp", "bracket"].includes(k) ? "IFCMECHANICALFASTENER" : "IFCBUILDINGELEMENTPROXY";
    case "paving": return k === "slab" ? "IFCSLAB" : k === "paver" || k === "stone" ? "IFCCOVERING" : k === "edging" ? "IFCMEMBER" : "IFCGEOGRAPHICELEMENT";
    case "garden": case "lawn": return k === "edging" ? "IFCMEMBER" : "IFCGEOGRAPHICELEMENT";
    case "retaining": return k === "sleeper" ? "IFCWALL" : k === "post" ? "IFCMEMBER" : k === "footing" ? "IFCFOOTING" : k === "pipe" ? "IFCPIPESEGMENT" : "IFCBUILDINGELEMENTPROXY";
    default: return "IFCBUILDINGELEMENTPROXY";
  }
}

const TRADE = {
  foundation: "Structure", reo: "Structure", wallFrame: "Structure", floorFrame: "Structure", roofFrame: "Structure", fixings: "Structure",
  cladding: "Envelope", roofing: "Envelope", openings: "Envelope",
  linings: "Interiors", interior: "Interiors",
  electrical: "Electrical", solar: "Electrical", plumbing: "Plumbing", drainage: "Drainage & stormwater", site: "Site",
  fencing: "Fencing", decking: "Carpentry (deck)", paving: "Landscaping", garden: "Landscaping", lawn: "Landscaping", retaining: "Landscaping",
};

/* ---------- STEP encoding ---------- */

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/* Deterministic IFC GlobalId (22 chars, IFC base-64) from a seed string:
   the same model exports with the same ids, so re-imports update in place. */
export function ifcGuid(seed) {
  // four rounds of FNV-1a with different offsets → 128 bits
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((h0) => {
    let h = h0 >>> 0;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h >>> 0;
  });
  let bits = "";
  for (const w of words) bits += w.toString(2).padStart(32, "0");
  let out = B64[parseInt(bits.slice(0, 2), 2)];
  for (let i = 2; i < 128; i += 6) out += B64[parseInt(bits.slice(i, i + 6), 2)];
  return out;
}

/* A STEP string: quotes doubled, backslashes doubled, anything outside
   printable ASCII as \X2\hhhh\X0\ (ISO 10303-21 §6.4.3). */
export function stepStr(s) {
  if (s == null || s === "") return "$";
  let out = "";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (c >= 32 && c < 127) out += ch;
    else if (c <= 0xffff) out += `\\X2\\${c.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
    else out += `\\X4\\${c.toString(16).toUpperCase().padStart(8, "0")}\\X0\\`;
  }
  return `'${out}'`;
}

/* A STEP REAL: always has a decimal point. */
export function stepReal(v) {
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return "0.";
  const s = String(r);
  return /[.eE]/.test(s) ? s.replace(/e/, "E") : `${s}.`;
}

const toIfc = (p) => [p[0], -p[2], p[1]];

/**
 * @param S     buildStructure(spec) result (full detail)
 * @param info  { project, author, organisation, date (ISO), detail }
 * @returns string — the .ifc file
 */
export function exportIfc(S, info = {}) {
  const detail = info.detail === "full" ? "full" : "coordination";
  // quantity-only pieces (dig-out, road base, mesh, oil …) have no shape worth exporting
  let members = S.members.filter((m) => !m.noRender);
  if (detail === "coordination") {
    const hasBricks = members.some((m) => m.kind === "brick");
    members = members.filter((m) => !FINE.has(m.kind) && !(hasBricks && (m.kind === "brick" || m.kind === "mortar")));
    if (hasBricks) {
      // the veneer as panels, from the street-detail model of the same spec
      const lite = buildStructure(S.spec, { detail: "lite" }).members.filter((m) => m.sys === "cladding" && m.kind !== "soffit" && /cladding|infill/i.test(m.name));
      members = members.concat(lite.map((m) => ({ ...m, mark: `V${m.mark}` })));
    }
  }

  const lines = [];
  let n = 0;
  const E = (body) => { lines.push(`#${++n}=${body};`); return `#${n}`; };
  const ref = (list) => `(${list.join(",")})`;
  const projectName = info.project || "BuildYourOwn project";
  const seed = `${projectName}|${S.env.w}|${S.env.l}|${S.env.floors}`;
  let gi = 0;
  const guid = (tag) => ifcGuid(`${seed}|${tag}|${gi++}`);

  /* shared geometry pools */
  const pts = new Map(), dirs = new Map(), profiles = new Map();
  const pt = (p) => {
    const k = p.map(stepReal).join(",");
    if (!pts.has(k)) pts.set(k, E(`IFCCARTESIANPOINT((${k}))`));
    return pts.get(k);
  };
  const dir = (d) => {
    const k = d.map((v) => stepReal(Math.round(v * 1e6) / 1e6)).join(",");
    if (!dirs.has(k)) dirs.set(k, E(`IFCDIRECTION((${k}))`));
    return dirs.get(k);
  };

  /* ---------- header-ish entities ---------- */
  const person = E(`IFCPERSON($,${stepStr(info.author || "Builder")},$,$,$,$,$,$)`);
  const org = E(`IFCORGANIZATION($,${stepStr(info.organisation || "BuildYourOwn")},$,$,$)`);
  const po = E(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const byo = E(`IFCORGANIZATION($,'BuildYourOwn',$,$,$)`);
  const app = E(`IFCAPPLICATION(${byo},'1.0','BuildYourOwn','BYO')`);
  const created = Math.floor(new Date(info.date || Date.now()).getTime() / 1000);
  const oh = E(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,$,$,$,${created})`);

  const units = E(`IFCUNITASSIGNMENT(${ref([
    E("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"),
    E("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),
    E("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"),
    E("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)"),
  ])})`);
  const origin = pt([0, 0, 0]);
  const zUp = dir([0, 0, 1]), xDir = dir([1, 0, 0]);
  const wcs = E(`IFCAXIS2PLACEMENT3D(${origin},${zUp},${xDir})`);
  // explicit (shared) positions for profiles and solids: optional in IFC4,
  // but older importers (IFC2x3-era readers) expect them
  const pos2 = E(`IFCAXIS2PLACEMENT2D(${E("IFCCARTESIANPOINT((0.,0.))")},$)`);
  const pos3 = E(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
  const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
  const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const project = E(`IFCPROJECT('${guid("project")}',${oh},${stepStr(projectName)},$,$,$,$,(${ctx}),${units})`);

  const sitePl = E(`IFCLOCALPLACEMENT($,${wcs})`);
  const site = E(`IFCSITE('${guid("site")}',${oh},'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,0.,$,$)`);
  const bldPl = E(`IFCLOCALPLACEMENT(${sitePl},${wcs})`);
  const building = E(`IFCBUILDING('${guid("building")}',${oh},${stepStr(projectName)},$,$,${bldPl},$,$,.ELEMENT.,${stepReal(S.env.ffl)},0.,$)`);
  E(`IFCRELAGGREGATES('${guid("agg")}',${oh},$,$,${project},(${site}))`);
  E(`IFCRELAGGREGATES('${guid("agg")}',${oh},$,$,${site},(${building}))`);

  const floors = S.env.floors;
  const storeys = [], storeyPl = [];
  for (let f = 0; f < floors; f++) {
    const elev = S.env.levelY(f);
    const pl = E(`IFCLOCALPLACEMENT(${bldPl},${E(`IFCAXIS2PLACEMENT3D(${pt([0, 0, elev])},${zUp},${xDir})`)})`);
    storeyPl.push(pl);
    storeys.push(E(`IFCBUILDINGSTOREY('${guid(`storey${f}`)}',${oh},${stepStr(f === 0 ? "Ground floor" : f === 1 ? "First floor" : `Level ${f}`)},$,$,${pl},$,$,.ELEMENT.,${stepReal(elev)})`));
  }
  E(`IFCRELAGGREGATES('${guid("agg")}',${oh},$,$,${building},${ref(storeys)})`);

  /* ---------- rooms as IfcSpace ---------- */
  const spacesBy = storeys.map(() => []);
  for (const fl of S.layout.floors) {
    for (const c of fl.cells) {
      const loc = toIfc([c.x, 0, c.z + c.l]);       // back-left corner of the room in plan, at storey level
      const place = E(`IFCLOCALPLACEMENT(${storeyPl[fl.level]},${E(`IFCAXIS2PLACEMENT3D(${pt([loc[0] + c.w / 2, loc[1] + c.l / 2, 0])},${zUp},${xDir})`)})`);
      const prof = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos2},${stepReal(c.w)},${stepReal(c.l)})`);
      const solid = E(`IFCEXTRUDEDAREASOLID(${prof},${pos3},${zUp},${stepReal(S.env.wallH)})`);
      const rep = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)}))`);
      spacesBy[fl.level].push(E(`IFCSPACE('${guid(`space-${c.item.name}`)}',${oh},${stepStr(c.item.name)},${stepStr(c.item.type)},$,${place},${rep},${stepStr(`${c.item.name} — ${(c.w * c.l).toFixed(1)} m²`)},.ELEMENT.,.INTERNAL.,$)`));
    }
  }
  spacesBy.forEach((list, f) => { if (list.length) E(`IFCRELAGGREGATES('${guid("agg")}',${oh},$,$,${storeys[f]},${ref(list)})`); });

  /* ---------- every piece ---------- */
  const byStorey = storeys.map(() => []);
  const byTrade = new Map();
  const bySys = new Map();
  const storeyOf = (m) => {
    const y = Math.min(m.a[1], m.b[1]);
    let f = 0;
    for (let k = 0; k < floors; k++) if (y >= S.env.levelY(k) - 0.3) f = k;
    return f;
  };
  for (const m of members) {
    const { X, Y } = basis(m);
    const a = toIfc(m.a);
    const ax = toIfc(X), rx = toIfc(Y);
    const place = E(`IFCLOCALPLACEMENT(${sitePl},${E(`IFCAXIS2PLACEMENT3D(${pt(a)},${dir(ax)},${dir(rx)})`)})`);
    const cyl = m.shape === "cyl" || m.shape === "hex";
    const pk = cyl ? `c${stepReal(m.d / 2)}` : `r${stepReal(m.d)}x${stepReal(m.w)}`;
    if (!profiles.has(pk)) {
      profiles.set(pk, cyl ? E(`IFCCIRCLEPROFILEDEF(.AREA.,$,${pos2},${stepReal(m.d / 2)})`) : E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos2},${stepReal(m.d)},${stepReal(m.w)})`));
    }
    const solid = E(`IFCEXTRUDEDAREASOLID(${profiles.get(pk)},${pos3},${zUp},${stepReal(m.len)})`);
    const rep = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)}))`);
    const cls = ifcClassOf(m);
    const common = `'${guid(m.mark)}',${oh},${stepStr(m.name)},${stepStr(m.host ? `${m.profile} — ${m.host}` : m.profile)},`;
    const objType = stepStr(m.profile);
    let el;
    if (cls === "IFCDOOR" || cls === "IFCWINDOW") {
      el = E(`${cls}(${common}${objType},${place},${rep},${stepStr(m.mark)},$,$,$,$,$)`);
    } else if (cls === "IFCMECHANICALFASTENER") {
      el = E(`${cls}(${common}${objType},${place},${rep},${stepStr(m.mark)},$,$,.USERDEFINED.)`);
    } else if (cls === "IFCSTAIRFLIGHT") {
      el = E(`${cls}(${common}${objType},${place},${rep},${stepStr(m.mark)},$,$,$,$,.USERDEFINED.)`);
    } else {
      // ObjectType carries the product, so PredefinedType is USERDEFINED
      // (IFC4 where-rule CorrectPredefinedType)
      el = E(`${cls}(${common}${objType},${place},${rep},${stepStr(m.mark)},.USERDEFINED.)`);
    }
    byStorey[storeyOf(m)].push(el);
    const t = TRADE[m.sys] || "Other";
    (byTrade.get(t) || byTrade.set(t, []).get(t)).push(el);
    (bySys.get(m.sys) || bySys.set(m.sys, []).get(m.sys)).push(el);
  }
  byStorey.forEach((list, f) => { if (list.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid("cont")}',${oh},$,$,${ref(list)},${storeys[f]})`); });

  /* trades as systems, each serving the building */
  for (const [t, list] of byTrade) {
    const sys = E(`IFCSYSTEM('${guid(`sys-${t}`)}',${oh},${stepStr(t)},${stepStr(`${t} — ${list.length} pieces`)},$)`);
    E(`IFCRELASSIGNSTOGROUP('${guid("grp")}',${oh},$,$,${ref(list)},$,${sys})`);
    E(`IFCRELSERVICESBUILDINGS('${guid("svc")}',${oh},$,$,${sys},(${building}))`);
  }
  /* layer = the model's system, as a property every viewer shows */
  for (const [sysKey, list] of bySys) {
    const props = [
      E(`IFCPROPERTYSINGLEVALUE('System',$,IFCLABEL(${stepStr(SYSTEMS[sysKey]?.label || sysKey)}),$)`),
      E(`IFCPROPERTYSINGLEVALUE('Trade',$,IFCLABEL(${stepStr(TRADE[sysKey] || "Other")}),$)`),
      E(`IFCPROPERTYSINGLEVALUE('Status',$,IFCLABEL('Indicative - for coordination and pricing, not for construction'),$)`),
    ];
    const pset = E(`IFCPROPERTYSET('${guid(`pset-${sysKey}`)}',${oh},'BYO_Common',$,${ref(props)})`);
    E(`IFCRELDEFINESBYPROPERTIES('${guid("defs")}',${oh},$,$,${ref(list)},${pset})`);
  }

  const stamp = new Date(info.date || Date.now()).toISOString().slice(0, 19);
  const head = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${stepStr(`${projectName}.ifc`)},'${stamp}',(${stepStr(info.author || "")}),(${stepStr(info.organisation || "BuildYourOwn")}),'BuildYourOwn','BuildYourOwn','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  return [...head, ...lines, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
}
