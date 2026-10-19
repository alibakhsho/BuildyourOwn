/* PDF plan sets: what the text layer tells us about each sheet
   (src/logic/pdf-sheets.js). Fixtures mirror two real sets — the federal
   Design For Place drawings (AU, labelled title-block fields on A3) and a
   US pre-approved ADU set (vertical title strip, project name on every sheet). */
import {
  isPdf, paperOf, findScales, pageScale, pxPerMetreFor, titleBlockFields,
  classifySheet, boilerplateOf, sheetNumber, compactText, isTextHeavy, ptToMm,
} from "../src/logic/pdf-sheets.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const T = (s, x, y, size = 10, w) => ({ s, x, y, size, w: w ?? s.length * size * 0.5 });

/* ---- files + paper ---- */
ok("isPdf by MIME", isPdf({ type: "application/pdf", name: "x" }));
ok("isPdf by extension when the MIME is missing", isPdf({ type: "", name: "Plans.PDF" }));
ok("an image is not a PDF", !isPdf({ type: "image/png", name: "a.png" }));
ok("A3 landscape recognised", paperOf(420, 297) === "A3");
ok("ARCH D recognised (US 24x36)", paperOf(ptToMm(2592), ptToMm(1728)) === "ARCH D");
ok("Letter recognised", paperOf(215.9, 279.4) === "Letter");
ok("odd size is unnamed", paperOf(500, 300) === null);

/* ---- scales ---- */
ok("metric scale with paper", JSON.stringify(findScales(["SCALE 1:100 @ A3"]).map((f) => [f.ratio, f.paper])) === "[[100,\"A3\"]]");
ok("1/4\" = 1'-0\" is 1:48", findScales(["FLOOR PLAN  SCALE: 1/4\" = 1'-0\""])[0]?.ratio === 48);
ok("1/8\" = 1'-0\" is 1:96", findScales(["1/8\" = 1'-0\""])[0]?.ratio === 96);
ok("3\" = 1'-0\" is 1:4", findScales(["3\" = 1'-0\""])[0]?.ratio === 4);
ok("plan scale beats a detail inset", pageScale(["1:100", "DETAIL 1:10", "1:100"]).ratio === 100);
ok("a time like 10:30 is not read as a scale ratio 1:...", findScales(["Issued 10:30"]).length === 0);

const au = [
  T("BANKSIA HOUSE", 895, 668, 33), T("DETAILS", 981, 694, 11),
  T("Drawing title:", 981, 708, 10, 66), T("Roof Plan", 1050, 708, 10),
  T("Scale:", 981, 723, 10, 30), T("1:100", 1013, 723, 10),
  T("Paper size:", 981, 738, 10, 54), T("A3", 1037, 738, 10),
  T("Drawing number:", 981, 753, 10, 88), T("3/11", 1071, 753, 10),
  T("with the Banksia House Cairns ‘Design", 815, 768, 8), T("building specifications and rating", 815, 788, 8),
];
const tb = titleBlockFields(au);
ok("title block: drawing title", tb.title === "Roof Plan", JSON.stringify(tb));
ok("title block: drawing number", tb.number === "3/11");
ok("title block: scale + paper from separate fields", JSON.stringify(pageScale(au)) === JSON.stringify({ ratio: 100, paper: "A3", text: "1:100", mixed: false }), JSON.stringify(pageScale(au)));
ok("inline field 'Drawing title: Floor Plan'", titleBlockFields([T("Drawing title: Floor Plan", 900, 700)]).title === "Floor Plan");

/* ---- px per metre ---- */
// A3 at 3600 px wide: 3600/420 px per paper mm; 1:100 → 10 paper mm per metre
ok("1:100 on A3 at 3600 px = 85.7 px/m", near(pxPerMetreFor({ ratio: 100, paper: "A3" }, { w: 420, h: 297 }, { w: 3600, h: 2546 }), 85.714));
ok("an A3 drawing printed on A4 shrinks with the paper", near(pxPerMetreFor({ ratio: 100, paper: "A3" }, { w: 297, h: 210 }, { w: 3600, h: 2545 }), (3600 / 297) * 10 * (297 / 420)));
ok("no ratio, no suggestion", pxPerMetreFor({ ratio: 0 }, { w: 420, h: 297 }, { w: 3600 }) === null);

/* ---- classifying ---- */
ok("AU: title-block field files the sheet (not the 'DETAILS' caption)", classifySheet(au).kind === "roof");
const auSheet = (title) => au.map((t) => (t.s === "Roof Plan" ? { ...t, s: title } : t));
ok("AU: 'Elevation - East'", classifySheet(auSheet("Elevation - East")).kind === "elevation");
ok("AU: 'Ground Floor Setout' is a dimensioned floor plan", classifySheet(auSheet("Ground Floor Setout")).kind === "floor");
ok("AU: 'Site Plan'", classifySheet(auSheet("Site Plan")).kind === "site");
ok("AU: 'Window and Door' is the schedule", classifySheet(auSheet("Window and Door")).kind === "schedule");
ok("AU: a disclaimer mentioning 'specifications' doesn't make it a notes sheet", classifySheet(auSheet("Section")).kind === "section");

// US: 3600 x 2400 sheet, title in a rotated right-hand strip, project name repeated
const page = { w: 3600, h: 2400 };
const us = (title, extra = []) => [
  T("A3-201", 3320, 2325, 52.1), T(title, 3453, 1739, 34.8), T("PRE-APPROVED ADU", 3331, 1653, 34.8),
  T("CITY OF LAGUNA NIGUEL", 3384, 1644, 26.4), T("2025 CODE UPDATE | INITIAL SUBMITTAL", 3238, 2342, 26.4),
  ...Array.from({ length: 30 }, (_, i) => T(`NOTE ${i} PROVIDE AS REQUIRED`, 300, 200 + i * 20, 13.2)),
  ...extra,
];
const structuralNotes = ["2X4 WOOD STUD WALL. REFER TO STRUCTURAL.", "2X6 WOOD STUD WALL. REFER TO STRUCTURAL.", "WOOD POST, SEE STRUCTURAL", "WOOD BEAM / HEADER, REFER TO STRUCTURAL."]
  .map((s, i) => T(s, 2732, 2255 + i * 18, 13.2));
const sets = [us("FLOOR PLAN 3"), us("ELEVATIONS & SECTIONS - CAL", structuralNotes), us("ROOF PLAN - CALIFORNIA"), us("FOUNDATION PLAN - CALIFORNIA RANCH")];
const bp = boilerplateOf(sets);
ok("boilerplate: the project name repeats on every sheet", bp.has("PRE-APPROVED ADU") && bp.has("CITY OF LAGUNA NIGUEL"));
ok("boilerplate: each sheet's own title does not", !bp.has("FLOOR PLAN 3"));
ok("boilerplate needs a set, not a couple of pages", boilerplateOf(sets.slice(0, 2)).size === 0);
const kinds = sets.map((items) => classifySheet(items, { boilerplate: bp, page }).kind);
ok("US: title strip files each sheet", JSON.stringify(kinds) === JSON.stringify(["floor", "elevation", "roof", "structural"]), JSON.stringify(kinds));
ok("US: big title outweighs small notes that mention 'structural'", classifySheet(sets[1], { boilerplate: bp, page }).label === "ELEVATIONS & SECTIONS - CAL");
ok("US: sheet number A3-201 from the title block", classifySheet(sets[0], { boilerplate: bp, page }).number === "A3-201");
ok("sheet number ignores the paper size 'A3'", sheetNumber([T("A3", 3500, 2300, 30)], page) === null);
ok("sheet number ignores window tags", sheetNumber([T("W03", 3500, 2300, 30), T("A101", 3400, 2350, 20)], page) === "A101");
ok("a page of prose with no title is notes or calcs", ["notes", "calcs"].includes(classifySheet(Array.from({ length: 80 }, (_, i) => T("The contractor shall verify all dimensions on site prior to commencing any work on the building", 100, 100 + i * 12, 9)), { textHeavy: true }).kind));

/* ---- text for the reader ---- */
const ct = compactText([T("BED 2", 400, 300), T("3600", 420, 330), T("LIVING", 900, 300)]);
ok("compact text is top-to-bottom, left-to-right, with positions", ct === "400,300 BED 2\n900,300 LIVING\n420,330 3600\n", JSON.stringify(ct));
ok("compact text is capped", compactText(Array.from({ length: 5000 }, (_, i) => T(`LABEL ${i}`, i, i)), 2000).length <= 2000);
ok("drawing sheets aren't text-heavy", !isTextHeavy(au));

ok("'ROOF FRAMING DETAILS' is a details sheet, not a roof plan", classifySheet(us("ROOF FRAMING DETAILS"), { boilerplate: bp, page }).kind === "detail");

/* ---- the plan reader gets the text layer ---- */
{
  const { readPlanWithClaude } = await import("../api/_lib/plan-reader.js");
  let sent = null;
  const fake = { messages: { create: async (req) => { sent = req; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ rooms: [], schedule: [], scaleNote: "", notes: "" }) }] }; } } };
  await readPlanWithClaude(fake, { image: { mediaType: "image/jpeg", data: "x" }, imageWidth: 2400, imageHeight: 1697, pxPerMetre: 57.1, pageText: "1977,1428 Drawing title:\n2116,1428 Floor Plan\n" });
  const txt = sent.messages[0].content.find((c) => c.type === "text").text;
  ok("plan reader: PDF text goes to the model, marked as exact, in the image's pixel space", /<pdf_text>[\s\S]*Floor Plan[\s\S]*<\/pdf_text>/.test(txt) && /SAME image pixel space/.test(txt));
  ok("plan reader: told the size of the image it actually sees", /2400 x 1697 pixels/.test(txt));
  // A dense US engineered sheet ran past 16k tokens and ~5 min at the default
  // "high" effort; at "medium" the same sheets read in 29–70 s with the same
  // counts. The cap must stay under the SDK's non-streaming ceiling (~21.3k).
  ok("plan reader: runs at medium effort with the JSON schema", sent.output_config?.effort === "medium" && sent.output_config?.format?.type === "json_schema");
  ok("plan reader: token cap leaves room to think but stays non-streamable", sent.max_tokens >= 16000 && sent.max_tokens <= 21333);
  await readPlanWithClaude(fake, { image: { mediaType: "image/jpeg", data: "x" }, imageWidth: 100, imageHeight: 100 });
  ok("plan reader: a plain image sends no text block", !/pdf_text/.test(sent.messages[0].content.find((c) => c.type === "text").text));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
