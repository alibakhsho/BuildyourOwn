/* =========================================================================
   MODULE: structure/model.js
   The building as a list of real pieces — every stud, plate, truss member,
   bolt, brick, sheet and hinge — like the object model behind a CAD/BIM
   file. Pure data (no three.js): the 3D viewer instances these, the
   drawings project them, and the schedule counts them, so all three always
   describe the same building.

   A member is a straight prism (or cylinder) from point `a` to point `b`:
     d  = section size measured along `up`
     w  = section size along the third axis (a→b × up)
   so a 90×45 stud standing in a wall is a=(bottom) b=(top), up=wall normal,
   d=0.090, w=0.045. Units: metres.
   ========================================================================= */

export const SYSTEMS = {
  site:        { label: "Site",                    order: 0 },
  foundation:  { label: "Slab & footings",         order: 1 },
  reo:         { label: "Reinforcement",           order: 2 },
  wallFrame:   { label: "Wall framing",            order: 3 },
  floorFrame:  { label: "Floor framing",           order: 4 },
  roofFrame:   { label: "Roof trusses & battens",  order: 5 },
  fixings:     { label: "Bolts, plates & brackets", order: 6 },
  cladding:    { label: "Brickwork & cladding",    order: 7 },
  roofing:     { label: "Roof sheeting & gutters", order: 8 },
  openings:    { label: "Windows & doors",         order: 9 },
  linings:     { label: "Insulation & linings",    order: 10 },
  interior:    { label: "Floors, stairs & fit-out", order: 11 },
  electrical:  { label: "Electrical",              order: 12 },
  plumbing:    { label: "Plumbing (water)",        order: 13 },
  drainage:    { label: "Drainage & stormwater",   order: 14 },
  solar:       { label: "Solar PV",                order: 15 },
  fencing:     { label: "Fencing & gates",         order: 16 },
  decking:     { label: "Deck",                    order: 17 },
  paving:      { label: "Paths, driveway & gravel", order: 18 },
  garden:      { label: "Garden beds & planting",  order: 19 },
  lawn:        { label: "Lawn",                    order: 20 },
  retaining:   { label: "Retaining wall",          order: 21 },
  furniture:   { label: "Furniture & styling",     order: 22 },
};

/* Construction stage each system belongs to (AU progress-payment stages). */
export const STAGE_OF = {
  site: "foundation", foundation: "foundation", reo: "foundation",
  wallFrame: "frame", floorFrame: "frame", roofFrame: "frame", fixings: "frame",
  roofing: "roof", cladding: "walls", openings: "walls",
  linings: "finishes", interior: "finishes", solar: "finishes",
  drainage: "foundation", electrical: "frame", plumbing: "frame",
  // the yard goes in last, after the house is finished
  fencing: "finishes", decking: "finishes", paving: "finishes", garden: "finishes", lawn: "finishes", retaining: "finishes",
  furniture: "finishes",
};

export const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
export const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
export const mul = (p, k) => [p[0] * k, p[1] * k, p[2] * k];
export const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
export const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
export const len3 = (p) => Math.hypot(p[0], p[1], p[2]);
export const norm = (p) => { const L = len3(p) || 1; return [p[0] / L, p[1] / L, p[2] / L]; };
export const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/* Orthonormal frame of a member: X along a→b, Y along up (made
   perpendicular), Z = X × Y. Shared by the renderer and the tests. */
export function basis(m) {
  const X = norm(sub(m.b, m.a));
  let up = m.up || [0, 1, 0];
  let Y = sub(up, mul(X, dot(up, X)));
  if (len3(Y) < 1e-6) { up = Math.abs(X[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; Y = sub(up, mul(X, dot(up, X))); }
  Y = norm(Y);
  return { X, Y, Z: cross(X, Y) };
}

/* The eight corners of a member's box (for bounds checks and drawings). */
export function corners(m) {
  const { Y, Z } = basis(m);
  const out = [];
  for (const p of [m.a, m.b]) {
    for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
      out.push(add(p, add(mul(Y, sy * m.d), mul(Z, sz * m.w))));
    }
  }
  return out;
}

export class Model {
  constructor() {
    this.members = [];
    this._marks = new Map();
  }

  /**
   * Add one piece.
   * @param {object} m
   *   sys, kind, name, profile, mat, shape ("box" default), a, b, d, w, up,
   *   host (where it is, e.g. "Front wall · Ground floor"), code (mark prefix),
   *   unit ("lm" | "ea" | "m2" | "m3"), skin (hides the structure in the
   *   frame view), tint (per-piece colour variation 0..1)
   */
  add(m) {
    const L = len3(sub(m.b, m.a));
    if (!(L > 1e-4) || !(m.d > 0) || !(m.w > 0)) return null;
    const prefix = m.code || "X";
    const n = (this._marks.get(prefix) || 0) + 1;
    this._marks.set(prefix, n);
    const rec = {
      id: this.members.length,
      mark: `${prefix}${String(n).padStart(prefix.length > 4 ? 2 : 3, "0")}`,
      shape: "box",
      unit: "lm",
      ...m,
      a: m.a.map(r4), b: m.b.map(r4),
      len: r4(L),
    };
    this.members.push(rec);
    return rec;
  }

  /** Convenience: a vertical member from (x,y0,z) to (x,y1,z). */
  vertical(x, z, y0, y1, d, w, up, rest) {
    return this.add({ a: [x, y0, z], b: [x, y1, z], d, w, up, ...rest });
  }

  bySys(sys) { return this.members.filter((m) => m.sys === sys); }
}

/* Quantity of one member in its schedule unit. */
export function quantityOf(m) {
  switch (m.unit) {
    case "ea": return 1;
    // sheets: the larger cross dimension is the sheet width (the smaller is
    // its thickness); triangles carry areaFactor 0.5
    case "m2": return m.len * Math.max(m.d, m.w) * (m.areaFactor || 1);
    case "m3": return m.len * m.w * m.d;
    default: return m.len;
  }
}

/* The schedule: every distinct product (system + profile), how many pieces,
   the total quantity, and — for linear stock — the cut list (each distinct
   length and how many of it), like a frame & truss manufacturer's list. */
export function schedule(members) {
  const rows = new Map();
  for (const m of members) {
    if (m.noSchedule) continue;
    const key = `${m.sys}|${m.profile}|${m.unit}|${m.name}`;
    let r = rows.get(key);
    if (!r) {
      r = { sys: m.sys, system: SYSTEMS[m.sys]?.label || m.sys, item: m.name, profile: m.profile, unit: m.unit, pieces: 0, qty: 0, cuts: new Map() };
      rows.set(key, r);
    }
    r.pieces++;
    r.qty += quantityOf(m);
    if (m.unit === "lm") {
      const mm = Math.round(m.len * 1000);
      r.cuts.set(mm, (r.cuts.get(mm) || 0) + 1);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, qty: Math.round(r.qty * 1000) / 1000, cuts: [...r.cuts.entries()].sort((a, b) => b[0] - a[0]).map(([mm, n]) => ({ mm, n })) }))
    .sort((a, b) => (SYSTEMS[a.sys]?.order ?? 99) - (SYSTEMS[b.sys]?.order ?? 99) || a.profile.localeCompare(b.profile) || a.item.localeCompare(b.item));
}

const UNIT_LABEL = { lm: "lin. m", ea: "each", m2: "m²", m3: "m³" };
export const unitLabel = (u) => UNIT_LABEL[u] || u;

/* Cut list / schedule as CSV (opens in Excel / Numbers / Sheets). */
export function scheduleCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["System", "Item", "Profile / product", "Pieces", "Quantity", "Unit", "Cut lengths (mm × qty)"].map(esc).join(",")];
  for (const r of rows) {
    const cuts = r.cuts.map((c) => `${c.mm}×${c.n}`).join(" ");
    lines.push([r.system, r.item, r.profile, r.pieces, r.qty, unitLabel(r.unit), cuts].map(esc).join(","));
  }
  return lines.join("\n");
}
