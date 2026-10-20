/* =========================================================================
   MODULE: structure/standards.js
   Typical Australian residential construction (AS 1684 span-table practice,
   AS 3700 brick veneer, truss-manufacturer norms). These are the sizes a
   builder would expect to see — INDICATIVE: real member sizes come from the
   engineer and the frame & truss fabricator, and the drawings say so.
   ========================================================================= */

export const FRAME = {
  timber: {
    ext:  { d: 0.090, t: 0.045, profile: "90×45 MGP10", mat: "pine", shape: "box" },
    int:  { d: 0.070, t: 0.035, profile: "70×35 MGP10", mat: "pine", shape: "box" },
    plateT: 0.045,
  },
  steel: {
    ext:  { d: 0.089, t: 0.041, profile: "89×41 C-stud 0.75 BMT", mat: "steelFrame", shape: "channel" },
    int:  { d: 0.064, t: 0.035, profile: "64×35 C-stud 0.55 BMT", mat: "steelFrame", shape: "channel" },
    plateT: 0.035,
  },
};

export const CRS = {
  extStud: 0.45,      // load-bearing external walls
  intStud: 0.60,      // partitions
  maxNog: 1.35,       // max nogging spacing (AS 1684)
  tieDown: 1.20,      // M12 rods along external walls
  joist: 0.45,
  ceilingBatten: 0.45,
  truss: { sheet: 0.90, tile: 0.60 },
  batten: { sheet: 0.90, tile: 0.33 },
  brickTie: { h: 0.60, v: 0.60 },
};

export const STOCK_MAX = 5.4;      // longest plate piece before a joint

/* Cladding build-up outside the frame: how far the frame's outer face sits
   in from the building line (= slab edge = outside of the cladding). */
export const CLADDING = {
  brick:        { leaf: 0.110, cavity: 0.040, label: "Brick veneer" },
  weatherboard: { leaf: 0.020, cavity: 0.006, label: "Weatherboard" },
  render:       { leaf: 0.025, cavity: 0.005, label: "Rendered cladding" },
};
export const LINING_T = 0.010;     // 10 mm plasterboard

export function buildUp(spec) {
  const c = CLADDING[spec.claddingType] || CLADDING.brick;
  const f = (FRAME[spec.framingType] || FRAME.timber).ext;
  const frameOff = c.leaf + c.cavity;
  return { ...c, frameOff, frameD: f.d, lining: LINING_T, total: frameOff + f.d + LINING_T };
}

export const BRICK = { len: 0.230, h: 0.076, d: 0.110, joint: 0.010, course: 0.086 };
export const BOARD = { cover: 0.180, h: 0.200, t: 0.020 };

/* Lintels over openings: the smallest section that spans the opening AND
   fits between the head and the top plates. Two-ply members fill the wall. */
const LINTELS = [
  { d: 0.140, span: 1.2, profile: "2/140×45 MGP10", mat: "pine", plies: 2 },
  { d: 0.190, span: 1.8, profile: "2/190×45 MGP10", mat: "pine", plies: 2 },
  { d: 0.150, span: 2.1, profile: "2/150×45 LVL",   mat: "lvl",  plies: 2 },
  { d: 0.200, span: 2.7, profile: "2/200×45 LVL",   mat: "lvl",  plies: 2 },
  { d: 0.240, span: 3.0, profile: "2/240×45 LVL",   mat: "lvl",  plies: 2 },
  { d: 0.150, span: 3.6, profile: "150 PFC steel",  mat: "steelPaint", plies: 1 },
  { d: 0.200, span: 4.5, profile: "200 PFC steel",  mat: "steelPaint", plies: 1 },
  { d: 0.250, span: 6.0, profile: "250 PFC steel",  mat: "steelPaint", plies: 1 },
  { d: 0.310, span: 7.5, profile: "310UB32 steel",  mat: "steelPaint", plies: 1 },
];
export function lintelFor(span, space, internal = false) {
  if (internal) return { d: Math.min(0.07, Math.max(0.035, space)), span: 1.2, profile: "70×35 head trimmer", mat: "pine", plies: 1, flat: true };
  const fits = LINTELS.filter((x) => x.span >= span - 1e-9 && x.d <= space + 1e-9);
  if (fits.length) return fits[0];
  // nothing fits under the plate: the strongest member that spans it, and
  // the opening head is effectively at the plate (engineer to confirm)
  return LINTELS.find((x) => x.span >= span) || LINTELS[LINTELS.length - 1];
}

/* Roof trusses */
export const TRUSS = {
  chord: { d: 0.090, t: 0.035, profile: "90×35 MGP12 truss chord", mat: "pine" },
  web:   { d: 0.070, t: 0.035, profile: "70×35 MGP10 truss web",   mat: "pine" },
  plate: { w: 0.090, h: 0.120, profile: "Galv. nail plate (gang-nail)" },
  finkMaxSpan: 9.6,
};

export const ROOFING = {
  sheet: { cover: 0.762, d: 0.016, profile: "Corrugated sheet 0.42 BMT", batten: { d: 0.040, w: 0.050, profile: "Top-hat batten 40 mm 0.75 BMT", mat: "galv", shape: "tophat" } },
  tile:  { cover: 0.300, gauge: 0.330, profile: "Concrete roof tile", batten: { d: 0.025, w: 0.050, profile: "50×25 tile batten", mat: "pine", shape: "box" } },
};

export const FLOOR = {
  joist:   { d: 0.240, t: 0.045, profile: "240×45 LVL joist", mat: "lvl" },
  beam:    { d: 0.360, t: 0.063, profile: "2/360×63 LVL flush beam", mat: "lvl" },
  sheet:   { len: 3.6, w: 0.9, t: 0.019, profile: "19 mm structural flooring (yellow tongue)" },
  post:    { d: 0.089, profile: "89×89×5 SHS steel post", mat: "steelPaint" },
  maxSpan: 4.2,
  maxPostCrs: 4.5,
};

export const SLAB = {
  edgeBeam: { w: 0.30, below: 0.30 },
  intBeam:  { w: 0.30, below: 0.25, maxCrs: 4.0 },
  mesh:     { crs: 0.20, r: 0.004, profile: "SL82 mesh (8 mm @ 200)" },
  trench:   { bars: 3, r: 0.006, profile: "3-L11TM trench mesh" },
};
