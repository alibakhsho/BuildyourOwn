/* IFC4 and DXF export (src/logic/bim) — the file-format rules an IFC or
   CAD reader would reject a file for. (The files were also opened with
   web-ifc and ezdxf when this was written: every element produced a mesh,
   and the DXF audited clean.) */
import { buildStructure } from "../src/logic/structure/index.js";
import { exportIfc, ifcGuid, stepStr, stepReal, ifcClassOf } from "../src/logic/bim/ifc.js";
import { planDxf, DXF_LAYERS } from "../src/logic/bim/dxf.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};

const spec = {
  widthM: 12, lengthM: 15, floors: 2, wallHeightM: 2.7, roofPitch: 22, slabThicknessM: 0.1,
  roofType: "colorbond", claddingType: "brick", framingType: "timber", hasGarage: true, solar: true, staircaseType: "timber",
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },
  rooms: [{ id: 1, name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8 }, { id: 2, name: "Living", type: "Living", widthM: 6, lengthM: 5 }, { id: 3, name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2 }],
  kitchens: [{ id: 4, benchLengthM: 6 }], bathrooms: [{ id: 5, label: "Main bathroom", widthM: 3, lengthM: 2.4 }],
};
const S = buildStructure(spec);

/* ---- STEP primitives ---- */
ok("REAL always has a decimal point", stepReal(3) === "3." && stepReal(0) === "0." && stepReal(-0) === "0." && stepReal(0.045) === "0.045" && stepReal(-2.5) === "-2.5");
ok("strings escape quotes and encode non-ASCII", stepStr("O'Brien 90×45 — m²") === "'O''Brien 90\\X2\\00D7\\X0\\45 \\X2\\2014\\X0\\ m\\X2\\00B2\\X0\\'" && stepStr("") === "$");
const g = ifcGuid("x");
ok("GlobalId is 22 chars of the IFC alphabet, first char 0-3", /^[0-3][0-9A-Za-z_$]{21}$/.test(g));
ok("GlobalId is deterministic", ifcGuid("abc") === ifcGuid("abc") && ifcGuid("abc") !== ifcGuid("abd"));

/* ---- IFC file ---- */
for (const detail of ["coordination", "full"]) {
  const t = exportIfc(S, { project: "Test house", detail, date: "2026-10-27T00:00:00Z" });
  const lines = t.split("\n");
  ok(`${detail}: STEP envelope`, lines[0] === "ISO-10303-21;" && t.includes("FILE_SCHEMA(('IFC4'));") && t.trimEnd().endsWith("END-ISO-10303-21;"));
  const data = lines.filter((x) => /^#\d+=/.test(x));
  const ids = new Set(data.map((x) => x.match(/^#(\d+)=/)[1]));
  const refs = [...t.matchAll(/#(\d+)(?!=)/g)].map((m) => m[1]);
  ok(`${detail}: every #reference resolves (${data.length} entities)`, refs.every((r) => ids.has(r)));
  ok(`${detail}: every entity line is balanced and terminated`, data.every((x) => x.endsWith(");") && (x.replace(/'([^']|'')*'/g, "").match(/\(/g) || []).length === (x.replace(/'([^']|'')*'/g, "").match(/\)/g) || []).length));
  const guids = [...t.matchAll(/^#\d+=IFC[A-Z]+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]);
  ok(`${detail}: GlobalIds unique (${guids.length})`, new Set(guids).size === guids.length);
  ok(`${detail}: one project, site, building and a storey per floor`,
    (t.match(/=IFCPROJECT\(/g) || []).length === 1 && (t.match(/=IFCSITE\(/g) || []).length === 1 && (t.match(/=IFCBUILDING\(/g) || []).length === 1 && (t.match(/=IFCBUILDINGSTOREY\(/g) || []).length === S.env.floors);
  ok(`${detail}: a space per room`, (t.match(/=IFCSPACE\(/g) || []).length === S.layout.floors.reduce((a, f) => a + f.cells.length, 0));
  // every element is contained in a storey exactly once
  const elementIds = data.filter((x) => /=IFC[A-Z]+\('[^']{22}',#\d+,[^,]*,[^,]*,[^,]*,#\d+,#\d+,'[^']*'/.test(x) && !/IFCSPACE|IFCSITE|IFCBUILDING/.test(x)).map((x) => x.match(/^#(\d+)/)[1]);
  const contained = [...t.matchAll(/IFCRELCONTAINEDINSPATIALSTRUCTURE\('[^']+',#\d+,\$,\$,\(([^)]*)\)/g)].flatMap((m) => m[1].split(",").map((s) => s.slice(1)));
  ok(`${detail}: every element sits in a storey (${elementIds.length})`, elementIds.length > 100 && elementIds.every((id) => contained.includes(id)) && new Set(contained).size === contained.length);
  ok(`${detail}: trades grouped as systems`, ["Structure", "Electrical", "Plumbing", "Drainage & stormwater"].every((n) => t.includes(`IFCSYSTEM('`) && t.includes(`,'${n}',`)));
  ok(`${detail}: services as typed MEP elements`, ["IFCOUTLET", "IFCLIGHTFIXTURE", "IFCSWITCHINGDEVICE", "IFCALARM", "IFCPIPESEGMENT", "IFCCABLESEGMENT", "IFCSANITARYTERMINAL", "IFCWASTETERMINAL"].every((c) => t.includes(`=${c}(`)));
  if (detail === "coordination") ok("coordination: no individual bricks or screws", !/'Brick'/.test(t) && !/'(Screw|Brick tie)'/.test(t));
}
const full = exportIfc(S, { detail: "full" }), coord = exportIfc(S, {});
ok("coordination file is much smaller than full", coord.length < full.length / 3, `${(coord.length / 1e6).toFixed(1)} vs ${(full.length / 1e6).toFixed(1)} MB`);
ok("same model → identical IFC", exportIfc(S, { date: "2026-01-01" }) === exportIfc(S, { date: "2026-01-01" }));
ok("every member maps to an IFC class", S.members.every((m) => /^IFC[A-Z]+$/.test(ifcClassOf(m))));

/* ---- DXF ---- */
for (let f = 0; f < S.env.floors; f++) {
  const d = planDxf(S, f, { project: "Test" });
  const rows = d.split("\r\n");
  if (rows[rows.length - 1] === "") rows.pop();
  ok(`DXF L${f}: group code / value pairs`, rows.length % 2 === 0 && rows.every((r, i) => i % 2 || /^\s*-?\d+$/.test(r)));
  ok(`DXF L${f}: R12, millimetres, ends with EOF`, d.includes("AC1009") && rows.slice(-2).join("|") === "0|EOF");
  const layersUsed = new Set(); for (let i = 0; i < rows.length - 1; i += 2) if (rows[i] === "8") layersUsed.add(rows[i + 1]);
  ok(`DXF L${f}: every layer used is declared`, [...layersUsed].every((l) => DXF_LAYERS[l]));
  ok(`DXF L${f}: text is plain ASCII`, /^[\x0d\x0a\x20-\x7e]*$/.test(d));
  if (f === 0) ok("DXF ground: electrical, plumbing and drainage layers drawn", ["E-POWR", "E-LITE", "P-DOMW", "D-SANR", "D-STRM"].every((l) => layersUsed.has(l)));
  const poly = (d.match(/\r\nPOLYLINE\r\n/g) || []).length, seq = (d.match(/\r\nSEQEND\r\n/g) || []).length;
  ok(`DXF L${f}: every polyline closed off (${poly})`, poly > 50 && poly === seq);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
