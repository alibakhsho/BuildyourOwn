/* =========================================================================
   MODULE: logic/pdf-sheets.js
   What a plan PDF's text layer tells us about each page — pure functions,
   no pdf.js, so they run headless in the tests (lib/pdf-pages.js does the
   rendering and feeds these the text it pulls off each page).

   A drawn-in-CAD PDF carries far more than its pixels: the paper size is
   exact, every dimension string and room label is real text, and the title
   block states the scale. That gives us three things a scan can't:

     1. Sorting — each page filed as floor plan / elevation / section /
        structural / schedule / … so a 30-sheet set lands in order.
     2. A suggested scale — "1:100 @ A3" on a page we know is A3 gives an
        exact pixels-per-metre. Still only a suggestion: a sheet can mix
        scales, so the builder confirms it against a known dimension.
     3. Exact text for the plan reader — labels and figured dimensions as
        printed, so the model reads them instead of guessing at pixels.
   ========================================================================= */

export const isPdf = (file) =>
  /^application\/(x-)?pdf$/i.test(file?.type || "") || /\.pdf$/i.test(file?.name || "");

const PT_MM = 25.4 / 72;
export const ptToMm = (pt) => pt * PT_MM;

/* ---- Paper sizes -------------------------------------------------------- */

/** Portrait width × height in mm. ISO A-series plus the US sheets plan sets use. */
export const PAPER = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
  "ARCH E": [914.4, 1219.2], "ARCH D": [609.6, 914.4], "ARCH C": [457.2, 609.6],
  "ANSI D": [558.8, 863.6], "ANSI C": [431.8, 558.8], "ANSI B": [279.4, 431.8],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6],
};

/** Name the paper a page is printed on (orientation-free, within 2%), or null. */
export function paperOf(wMm, hMm) {
  const s = Math.min(wMm, hMm), l = Math.max(wMm, hMm);
  for (const [name, [pw, ph]] of Object.entries(PAPER)) {
    if (Math.abs(s - pw) / pw < 0.02 && Math.abs(l - ph) / ph < 0.02) return name;
  }
  return null;
}

/* ---- Scale -------------------------------------------------------------- */

// Architectural imperial scales: 1/4" = 1'-0" is 1:48, and so on.
const IMPERIAL = /(\d+)\s*\/\s*(\d+)\s*(?:"|''|in\b|”)\s*=\s*1\s*(?:'|’|ft\b)\s*-?\s*0?\s*(?:"|”)?/gi;
const IMPERIAL_WHOLE = /\b(1|2|3)\s*(?:"|''|”)\s*=\s*1\s*(?:'|’)\s*-?\s*0?\s*(?:"|”)?/gi;
const METRIC = /\b1\s*:\s*(\d{1,4})\b(?:\s*@\s*(A[0-4]))?/gi;

/**
 * Every scale stated on a page. Returns [{ ratio, paper|null, text }].
 * `items` are text items ({ s }) or plain strings.
 */
export function findScales(items) {
  const out = [];
  const lines = joinLines(items);
  for (const line of lines) {
    for (const m of line.matchAll(METRIC)) {
      const ratio = +m[1];
      if (ratio >= 1 && ratio <= 5000) out.push({ ratio, paper: m[2] ? m[2].toUpperCase() : statedPaper(line), text: m[0].trim() });
    }
    for (const m of line.matchAll(IMPERIAL)) {
      const inches = +m[1] / +m[2];
      if (inches > 0 && inches <= 3) out.push({ ratio: Math.round(12 / inches), paper: null, text: m[0].trim() });
    }
    for (const m of line.matchAll(IMPERIAL_WHOLE)) out.push({ ratio: Math.round(12 / +m[1]), paper: null, text: m[0].trim() });
  }
  return out;
}
const statedPaper = (line) => { const m = /@\s*(A[0-4])\b/i.exec(line); return m ? m[1].toUpperCase() : null; };

/* ---- Title block -------------------------------------------------------- */

// "Drawing title: Roof Plan", "Scale: 1:100", "Paper size: A3", "Drawing number: 3/11"
const FIELDS = {
  title: /^(?:(?:drawing|sheet|dwg\.?)\s*(?:title|name)|title)\s*:?$/i,
  number: /^(?:drawing|sheet|dwg\.?)\s*(?:no\.?|number|#)\s*:?$/i,
  scale: /^scale\s*:?$/i,
  paper: /^(?:paper|sheet)\s*size\s*:?$/i,
};
const INLINE = /^((?:drawing|sheet|dwg\.?)\s*(?:title|name|no\.?|number|#)|title|scale|(?:paper|sheet)\s*size)\s*:\s*(.+)$/i;

/**
 * Labelled fields in the title block. Many CAD title blocks are the only
 * real text on the sheet (the drawing's own text is often outlined), and
 * the fields say exactly what the sheet is: read them before anything else.
 * The value is the nearest text to the right on the same line, else just below.
 */
export function titleBlockFields(items) {
  const arr = (items || []).filter((it) => typeof it === "object" && it.s && it.s.trim());
  const out = {};
  const put = (key, val) => { if (val && !out[key]) out[key] = val.trim(); };
  for (const it of arr) {
    const s = it.s.trim();
    const inl = INLINE.exec(s);
    if (inl) { put(fieldKey(inl[1]), inl[2]); continue; }
    for (const [key, re] of Object.entries(FIELDS)) {
      if (!re.test(s)) continue;
      const size = it.size || 8;
      const right = arr
        .filter((o) => o !== it && Math.abs(o.y - it.y) <= size * 0.6 && o.x > it.x && o.x - it.x < size * 40 && !isFieldLabel(o.s))
        .sort((a, b) => a.x - b.x)[0];
      const below = arr
        .filter((o) => o !== it && o.y > it.y && o.y - it.y <= size * 2.6 && Math.abs(o.x - it.x) <= size * 3 && !isFieldLabel(o.s))
        .sort((a, b) => a.y - b.y)[0];
      put(key, (right || below)?.s);
    }
  }
  return out;
}
const isFieldLabel = (s) => Object.values(FIELDS).some((re) => re.test(String(s).trim())) || INLINE.test(String(s).trim());
const fieldKey = (label) => (/scale/i.test(label) ? "scale" : /size/i.test(label) ? "paper" : /title|name/i.test(label) ? "title" : "number");

/**
 * The scale this page is drawn at, as far as the text says. A title-block
 * "Scale:" field wins outright. Otherwise plan scales (1:50–1:500) beat
 * detail scales (1:1–1:20), then the most frequent wins, so a floor plan
 * with a 1:10 detail inset still reads 1:100.
 */
export function pageScale(items) {
  const tb = titleBlockFields(items);
  const tbPaper = tb.paper && /^A[0-4]$/i.test(tb.paper.trim()) ? tb.paper.trim().toUpperCase() : null;
  if (tb.scale) {
    const own = findScales([tb.scale]);
    if (own.length) return { ratio: own[0].ratio, paper: own[0].paper || tbPaper, text: own[0].text, mixed: false };
  }
  const found = findScales(items);
  if (!found.length) return null;
  if (tbPaper) for (const f of found) f.paper = f.paper || tbPaper;
  const tally = new Map();
  for (const f of found) {
    const k = `${f.ratio}|${f.paper || ""}`;
    const t = tally.get(k) || { ...f, count: 0 };
    t.count++;
    tally.set(k, t);
  }
  const planLike = (r) => (r >= 48 && r <= 500 ? 1 : 0);
  const best = [...tally.values()].sort((a, b) => planLike(b.ratio) - planLike(a.ratio) || b.count - a.count || b.ratio - a.ratio)[0];
  // a stated paper size on any matching mention applies to the winner
  if (!best.paper) best.paper = found.find((f) => f.ratio === best.ratio && f.paper)?.paper || null;
  return { ratio: best.ratio, paper: best.paper, text: best.text, mixed: tally.size > 1 };
}

/**
 * Pixels per real metre for a page rendered at `pagePx` from a sheet of
 * `pageMm`, drawn at 1:ratio. If the title block says "@ A3" but the PDF page
 * is A4 (a set reduced for email), everything on it is smaller by the ratio
 * of the two sheets, and the suggestion has to follow.
 */
export function pxPerMetreFor({ ratio, paper }, pageMm, pagePx) {
  if (!ratio || !pageMm?.w || !pagePx?.w) return null;
  const pxPerPaperMm = pagePx.w / pageMm.w;
  let paperMmPerMetre = 1000 / ratio;
  if (paper && PAPER[paper]) {
    const statedLong = PAPER[paper][1], actualLong = Math.max(pageMm.w, pageMm.h);
    if (Math.abs(actualLong - statedLong) / statedLong > 0.02) paperMmPerMetre *= actualLong / statedLong;
  }
  return pxPerPaperMm * paperMmPerMetre;
}

/* ---- Sorting sheets ------------------------------------------------------ */

export const SHEET_KINDS = [
  ["floor", "Floor plans"],
  ["site", "Site & setout"],
  ["roof", "Roof plans"],
  ["elevation", "Elevations"],
  ["section", "Sections"],
  ["structural", "Structural"],
  ["schedule", "Schedules"],
  ["detail", "Details"],
  ["services", "Electrical & plumbing"],
  ["calcs", "Calculations"],
  ["notes", "Cover & notes"],
  ["other", "Other sheets"],
];
export const SHEET_KIND_LABEL = Object.fromEntries(SHEET_KINDS);
const KIND_RANK = Object.fromEntries(SHEET_KINDS.map(([k], i) => [k, i]));
export const kindRank = (k) => KIND_RANK[k] ?? KIND_RANK.other;

// Order matters only for ties. Patterns test one text line at a time.
const RULES = [
  ["structural", /\b(FOOTING|FOUNDATION|SLAB)\s+(PLAN|LAYOUT|DETAILS?)\b|\bFRAMING\s+PLAN\b|\bSTRUCTURAL\b|\bSHEAR\s*WALL\b|\bHOLD-?DOWN\b|\bBRACING\s+PLAN\b|\bTIE-?DOWN\b|\bBEAM\s+SCHEDULE\b/i],
  ["roof", /\bROOF\s+(PLAN|FRAMING(?!\s+DETAILS?)|LAYOUT|DRAINAGE)\b|\bTRUSS\s+LAYOUT\b/i],
  ["site", /\bSITE\s+(PLAN|ANALYSIS|LAYOUT|SURVEY|SET-?\s?OUT)\b|\bLOCATION\s+PLAN\b|\bPLOT\s+PLAN\b/i],
  ["floor", /\b(GROUND|FIRST|SECOND|UPPER|LOWER|MAIN|BASEMENT)\s+(FLOOR\s+)?PLAN\b|\bFLOOR\s+PLAN\b|\bDIMENSION(ED)?\s+PLAN\b|\bLEVEL\s+\d+\s+PLAN\b|\bPROPOSED\s+PLAN\b|\bSET-?\s?OUT\b/i],   // a building setout is the fully dimensioned floor plan
  ["elevation", /\bELEVATIONS?\b/i],
  ["section", /\bSECTIONS?\b(?!\s*\d)/i],
  ["schedule", /\b(WINDOW|DOOR|FINISHES|FIXTURE|ROOM|OPENING)S?\s+SCHEDULE\b|\bSCHEDULE\s+OF\b|^\s*(WINDOWS?|DOORS?)\s+(AND|&)\s+(WINDOWS?|DOORS?)\b/i],
  ["detail", /\bDETAILS?\b/i],
  ["services", /\b(ELECTRICAL|LIGHTING|POWER)\s+(PLAN|LAYOUT)\b|\bPLUMBING\b|\bDRAINAGE\s+PLAN\b|\bREFLECTED\s+CEILING\b|\bRCP\b|\bHYDRAULIC\b|\bMECHANICAL\b/i],
  ["calcs", /\bCALCULATIONS?\b|\bDESIGN\s+(CRITERIA|LOADS)\b|\bLOAD\s+COMBINATIONS?\b/i],
  ["notes", /\bGENERAL\s+NOTES\b|\bCOVER\s+SHEET\b|\bSHEET\s+INDEX\b|\bDRAWING\s+(INDEX|LIST|REGISTER)\b|^\s*SPECIFICATIONS?\s*$|\bTITLE\s*24\b|\bENERGY\s+(COMPLIANCE|REPORT)\b/i],
];

/**
 * File a page. Returns { kind, label, number } where label is the title as printed.
 *
 *  1. A labelled "Drawing title:" field settles it when it names a kind.
 *  2. Otherwise every line that names a kind scores by type size — the
 *     drawing title under a plan is set larger than a "SECTION A" callout —
 *     and text in the title block (a right-hand strip, or the bottom-right
 *     corner) scores six times over: that's where the sheet says what it is.
 *  3. `boilerplate` (see boilerplateOf) drops the project name, firm and
 *     disclaimer that repeat on every sheet and would otherwise vote on all.
 */
export function classifySheet(items, { textHeavy = false, boilerplate = null, page = null } = {}) {
  const tb = titleBlockFields(items);
  const number = tb.number || sheetNumber(items, page);
  if (tb.title && !textHeavy) {
    for (const [kind, re] of RULES) if (re.test(tb.title)) return { kind, label: tb.title, number };
  }
  const arr = (items || []).filter((it) => typeof it !== "object" || !boilerplate || !boilerplate.has(norm(it.s)));
  const objs = arr.filter((it) => typeof it === "object");
  const W = page?.w || (objs.length ? Math.max(...objs.map((it) => it.x + (it.w || 0))) : 1);
  const H = page?.h || (objs.length ? Math.max(...objs.map((it) => it.y)) : 1);
  const inTitleBlock = (l) => l.x0 > W * 0.86 || (l.y > H * 0.9 && l.x0 > W * 0.6);
  // type size relative to the sheet's body text, squared: a title at 2.5x body
  // outweighs a handful of notes that merely mention a kind
  const sizes = objs.map((it) => it.size || 1).sort((a, b) => a - b);
  const body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 1;

  const score = new Map(), tbScore = new Map(), bestLine = new Map(), bestTb = new Map();
  for (const line of joinLines(arr, true)) {
    const { text, size } = line;
    const inTb = inTitleBlock(line);
    for (const [kind, re] of RULES) {
      const m = re.exec(text);
      if (!m) continue;
      // short lines are titles, long ones are notes; a bare one-word heading
      // ("DETAILS", "SECTION") is usually a caption, not the sheet's subject
      const bare = /^[A-Z]+S?:?$/i.test(text.trim());
      const w = Math.max(1, size / body) ** 2 * (text.length < 48 ? 1.5 : 1) * (bare ? 0.15 : 1) * (inTb ? 6 : 1);
      score.set(kind, (score.get(kind) || 0) + w);
      const label = text.length < 60 ? text : m[0];
      const prev = bestLine.get(kind);
      if (!prev || w > prev.w) bestLine.set(kind, { w, text: label });
      if (inTb) {
        tbScore.set(kind, (tbScore.get(kind) || 0) + w);
        const pt = bestTb.get(kind);
        if (!pt || w > pt.w) bestTb.set(kind, { w, text: label });
      }
    }
  }
  const top = (m) => { let k = null, v = 0; for (const [kk, vv] of m) if (vv > v) { v = vv; k = kk; } return k; };
  let kind = top(tbScore);
  const fromTitleBlock = !!kind;
  if (!kind) kind = top(score) || "other";
  // a page that is all prose and no drawing is calcs or notes, whatever it mentions
  if (textHeavy && !fromTitleBlock && !["calcs", "notes", "schedule"].includes(kind)) kind = score.has("calcs") ? "calcs" : "notes";
  const label = tb.title || bestTb.get(kind)?.text || bestLine.get(kind)?.text || null;
  return { kind, label: label ? label.trim() : null, number };
}

const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Strings that repeat on most sheets of a set — project name, firm,
 * disclaimer, title-block captions. Pass the text items of every page.
 */
export function boilerplateOf(pages) {
  if (!pages || pages.length < 4) return new Set();
  const seen = new Map();
  for (const items of pages) {
    for (const k of new Set((items || []).map((it) => norm(typeof it === "string" ? it : it.s)).filter((k) => k.length > 2))) {
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.5));
  return new Set([...seen].filter(([, n]) => n >= min).map(([k]) => k));
}

/** Sheet number from the title block — A101, A-201, A3-101, S1.0, SK-03. */
export function sheetNumber(items, page = null) {
  const arr = (items || []).filter((it) => typeof it === "object" && it.s != null);
  if (!arr.length) return null;
  const W = page?.w || Math.max(...arr.map((it) => it.x)), H = page?.h || Math.max(...arr.map((it) => it.y));
  const re = /^(?:SHEET\s*(?:NO\.?)?\s*)?([A-Z]{1,3}\d{0,2}[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?)$/i;
  const hits = arr
    .map((it) => ({ it, m: re.exec(it.s.trim()) }))
    // not a window/door tag, not a paper size
    .filter(({ m, it }) => m && !/^(W|D|WD|SD|GD)\d/i.test(m[1]) && !/^A[0-4]$/i.test(m[1]) && it.x > W * 0.55 && it.y > H * 0.6)
    .sort((a, b) => b.it.size - a.it.size);
  return hits[0]?.m[1].toUpperCase() || null;
}

/* ---- Text for the plan reader ------------------------------------------- */

/**
 * The page's text as compact lines — "x,y text" in image pixels, top to
 * bottom — capped so a dense sheet can't blow the request size.
 */
export function compactText(items, maxChars = 12000) {
  const arr = (items || []).filter((it) => it.s && it.s.trim());
  arr.sort((a, b) => a.y - b.y || a.x - b.x);
  let out = "";
  for (const it of arr) {
    const line = `${Math.round(it.x)},${Math.round(it.y)} ${it.s.trim().replace(/\s+/g, " ")}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

/** Text items on the same baseline, left to right, joined into lines. */
function joinLines(items, withSize = false) {
  const arr = (items || []).map((it) => (typeof it === "string" ? { s: it, x: 0, y: 0, size: 1 } : it)).filter((it) => it.s && it.s.trim());
  arr.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of arr) {
    const last = lines[lines.length - 1];
    const tol = Math.max(2, (it.size || 1) * 0.4);
    if (last && Math.abs(last.y - it.y) <= tol && it.x >= last.x1 - 2 && it.x - last.x1 < (it.size || 4) * 2.5) {
      last.text += (it.x - last.x1 > (it.size || 4) * 0.15 ? " " : "") + it.s.trim();
      last.x1 = it.x + (it.w || it.s.length * (it.size || 4) * 0.5);
      last.size = Math.max(last.size, it.size || 1);
    } else {
      lines.push({ text: it.s.trim(), y: it.y, x0: it.x, x1: it.x + (it.w || it.s.length * (it.size || 4) * 0.5), size: it.size || 1 });
    }
  }
  return withSize ? lines : lines.map((l) => l.text);
}

/** Lots of words, few short labels: a calcs or spec page rather than a drawing. */
export function isTextHeavy(items) {
  const arr = (items || []).filter((it) => it.s && it.s.trim());
  const words = arr.reduce((a, it) => a + it.s.trim().split(/\s+/).length, 0);
  const long = arr.filter((it) => it.s.length > 40).length;
  return words > 600 && long / Math.max(1, arr.length) > 0.25;
}
