/* =========================================================================
   MODULE: framing.js
   Stick-framed wall layout, member by member, the way a frame shop sets it
   out (AS 1684 practice, simplified):

     bottom plate · double top plate · common studs @ 600 crs ·
     at every opening: full-height jamb studs, jack (trimmer) studs to the
     head, a lintel on the jacks, cripple studs from lintel to top plate,
     and for windows a sill trimmer with cripples under it ·
     a row of noggings at mid-height between studs.

   Pure layout: returns members in wall coordinates (u along the wall from
   its start, y up from the floor, sizes in metres). The house builder turns
   each into a mesh, so every piece is its own selectable part.
   ========================================================================= */

const T = 0.045;          // member thickness on the wall face (45 mm)
const STUD_CRS = 0.6;
const NOG_Y = 1.35;       // nogging centre height

/* Lintel depth by clear span — rough MGP10 sizing, enough to read right. */
const lintelDepth = (span) => (span <= 1.2 ? 0.14 : span <= 1.8 ? 0.19 : span <= 2.7 ? 0.24 : 0.29);

/**
 * @param len      wall length (m)
 * @param H        wall (stud) height, floor to underside of ceiling (m)
 * @param openings [{ u, w, h, sill, kind }] — u = centre along the wall
 * @returns [{ kind, label, u, y, along, height }] — u, y are member centres
 */
export function layoutWallFrame(len, H, openings) {
  const out = [];
  const m = (kind, label, u0, u1, y0, y1) => out.push({ kind, label, u: (u0 + u1) / 2, y: (y0 + y1) / 2, along: u1 - u0, height: y1 - y0 });

  // plates
  m("bottom-plate", "Bottom plate", 0, len, 0, T);
  m("top-plate", "Top plate", 0, len, H - 2 * T, H - T);
  m("top-plate", "Top plate (double)", 0, len, H - T, H);
  const studBot = T, studTop = H - 2 * T;

  // opening zones: [u0, u1] of the rough opening, plus the framed width
  const ops = openings
    .map((o) => {
      const u0 = o.u - o.w / 2, u1 = o.u + o.w / 2;
      const head = (o.kind === "window" ? o.sill + o.h : o.h);
      return { ...o, u0, u1, head, sill: o.kind === "window" ? o.sill : 0 };
    })
    .filter((o) => o.u0 > T && o.u1 < len - T)
    .sort((a, b) => a.u0 - b.u0);
  const blocked = (u) => ops.some((o) => u > o.u0 - 2 * T - 0.02 && u < o.u1 + 2 * T + 0.02);

  // full-height studs: ends, common studs on the 600 module, opening jambs
  const full = [];
  const pushStud = (u, kind, label) => { full.push(u); m(kind, label, u - T / 2, u + T / 2, studBot, studTop); };
  pushStud(T / 2, "stud", "End stud");
  pushStud(len - T / 2, "stud", "End stud");
  for (let u = STUD_CRS; u < len - T; u += STUD_CRS) if (!blocked(u)) pushStud(u, "stud", "Stud");

  ops.forEach((o, i) => {
    const name = o.kind === "window" ? `window ${i + 1}` : `door ${i + 1}`;
    const span = o.w;
    const ld = lintelDepth(span);
    // jamb (king) studs, full height, outside the jacks
    pushStud(o.u0 - T * 1.5, "jamb-stud", `Jamb stud — ${name}`);
    pushStud(o.u1 + T * 1.5, "jamb-stud", `Jamb stud — ${name}`);
    // jack studs carry the lintel
    m("jack-stud", `Jack stud — ${name}`, o.u0 - T, o.u0, studBot, o.head);
    m("jack-stud", `Jack stud — ${name}`, o.u1, o.u1 + T, studBot, o.head);
    // lintel spans the jacks
    const lTop = Math.min(studTop, o.head + ld);
    m("lintel", `Lintel ${Math.round(ld * 1000)}×45 — ${name}`, o.u0 - T, o.u1 + T, o.head, lTop);
    // cripples above the lintel on the stud module
    const cripplesAt = [];
    for (let u = Math.ceil(o.u0 / STUD_CRS) * STUD_CRS; u < o.u1; u += STUD_CRS) cripplesAt.push(u);
    if (!cripplesAt.length) cripplesAt.push(o.u);
    if (studTop - lTop > 0.05) for (const u of cripplesAt) m("cripple", `Cripple stud — ${name}`, u - T / 2, u + T / 2, lTop, studTop);
    // window: sill trimmer + cripples below
    if (o.kind === "window" && o.sill > 0.2) {
      m("sill-trimmer", `Sill trimmer — ${name}`, o.u0, o.u1, o.sill - T, o.sill);
      for (const u of cripplesAt) m("cripple", `Cripple stud — ${name}`, u - T / 2, u + T / 2, studBot, o.sill - T);
    }
  });

  // noggings between neighbouring full-height studs, skipping openings
  const us = [...new Set(full.map((u) => +u.toFixed(4)))].sort((a, b) => a - b);
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i] + T / 2, b = us[i + 1] - T / 2;
    if (b - a < 0.05) continue;
    const mid = (a + b) / 2;
    const inOpening = ops.some((o) => mid > o.u0 - T && mid < o.u1 + T && NOG_Y > o.sill - 0.05 && NOG_Y < o.head + 0.3);
    if (inOpening) continue;
    // stagger alternate bays by a nog-depth so each can be nailed through
    const y = NOG_Y + (i % 2 ? T : 0);
    m("nogging", "Nogging", a, b, y - T / 2, y + T / 2);
  }
  return out;
}

/* Floor joists for an upper storey over a rectangular plate: 240×45 @ 450
   crs spanning the short way, with trimmers at the plate edges. */
export function layoutFloorJoists(plate, depth = 0.24) {
  const spanAlongX = plate.w <= plate.l;             // joists run across the short side
  const run = spanAlongX ? plate.l : plate.w;        // distance the joists are spaced along
  const out = [];
  for (let s = T / 2; s <= run - T / 2 + 1e-6; s += 0.45) out.push({ kind: "joist", label: "Floor joist 240×45", s, spanAlongX });
  out.push({ kind: "joist", label: "Edge trimmer 240×45", s: run - T / 2, spanAlongX });
  return { joists: out, depth, spanAlongX };
}
