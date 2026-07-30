/* =========================================================================
   MODULE: logic/takeoff.js — measurement maths for plan takeoff
   ------------------------------------------------------------------------
   Pure geometry. No React, no canvas, no DOM — so it is testable in
   isolation and reusable by the AI-assist path, which produces the same
   measurement records as the mouse does.

   Coordinate convention: every point is stored in IMAGE pixel space
   (0,0 = top-left of the plan bitmap), never screen space. Pan and zoom
   therefore never touch stored data, and a measurement drawn at 40% zoom is
   identical to the same measurement drawn at 300%.

   Scale convention: `pxPerMetre` converts image pixels to real metres. It is
   established by calibration — the user draws a line along a dimension they
   know the true length of (a 6000 mm wall, a standard 820 door) and types
   that length in. Printed scale ratios (1:100) are deliberately NOT trusted:
   a scanned or photographed plan is almost never at its nominal scale.
   ========================================================================= */

export const MEASURE_TYPES = {
  linear: {
    id: "linear",
    label: "Linear",
    unit: "m",
    hint: "Walls, footings, skirting, gutter, fencing — click each corner, double-click to finish",
    closed: false,
  },
  area: {
    id: "area",
    label: "Area",
    unit: "m²",
    hint: "Slab, roof, tiling, painting, floor coverings — click the outline, double-click to close",
    closed: true,
  },
  count: {
    id: "count",
    label: "Count",
    unit: "no.",
    hint: "Doors, windows, downlights, piers — click each item",
    closed: false,
  },
  volume: {
    id: "volume",
    label: "Volume",
    unit: "m³",
    hint: "Concrete, excavation, fill — outline the area, then set a depth",
    closed: true,
  },
};

/* ---- Primitive geometry ------------------------------------------------ */

export function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total length of a polyline in pixels. */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/**
 * Signed area via the shoelace formula; we take the absolute value so
 * winding direction (clockwise vs anticlockwise tracing) doesn't matter —
 * users trace either way without thinking about it.
 */
export function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points) {
  if (points.length < 2) return 0;
  return polylineLength([...points, points[0]]);
}

export function centroid(points) {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Perpendicular distance from p to segment ab — used for hit-testing lines. */
export function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function pointInPolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/* ---- Scale ------------------------------------------------------------- */

/**
 * Establish scale from a drawn calibration line of known real-world length.
 * @param {{x,y}} p1 @param {{x,y}} p2  image-space endpoints
 * @param {number} knownMetres         the true length that line represents
 */
export function calibrate(p1, p2, knownMetres) {
  const px = distance(p1, p2);
  if (!(knownMetres > 0)) throw new Error("Enter the real-world length of the line you drew.");
  if (px < 8) throw new Error("That calibration line is too short to be accurate — draw along the longest dimension you know.");
  return { pxPerMetre: px / knownMetres, calibration: { p1, p2, knownMetres, pixels: px } };
}

/**
 * Derive scale from a stated drawing ratio and a known print size, for the
 * case where someone has a clean PDF-export at true scale. Kept separate
 * from calibrate() so the UI can label it as the less-reliable option.
 * @param {number} ratio      e.g. 100 for 1:100
 * @param {number} imagePx    pixel width of the image
 * @param {number} sheetMm    real sheet width in mm (A3 = 420, A1 = 841)
 */
export function scaleFromRatio(ratio, imagePx, sheetMm) {
  if (!(ratio > 0) || !(imagePx > 0) || !(sheetMm > 0)) throw new Error("Ratio, image width and sheet size are all required.");
  const pxPerMm = imagePx / sheetMm;      // pixels per mm of paper
  const mmPerMetreReal = 1000 / ratio;     // paper mm representing one real metre
  return { pxPerMetre: pxPerMm * mmPerMetreReal };
}

export const pxToM = (px, pxPerMetre) => (pxPerMetre > 0 ? px / pxPerMetre : 0);
export const pxAreaToM2 = (pxArea, pxPerMetre) => (pxPerMetre > 0 ? pxArea / (pxPerMetre * pxPerMetre) : 0);

/* ---- Measurement evaluation -------------------------------------------- */

/**
 * Turn a stored measurement into real-world quantities.
 * Returns { value, unit, label, secondary } where `value` is the number that
 * flows into the estimate and `secondary` is the supporting dimension
 * (perimeter for an area, run length for a volume) that builders expect to
 * see alongside it.
 */
export function evaluateMeasurement(m, pxPerMetre) {
  const pts = m.points || [];
  const type = MEASURE_TYPES[m.type] || MEASURE_TYPES.linear;

  if (m.type === "count") {
    const n = pts.length * (Number(m.multiplier) || 1);
    return { value: n, unit: "no.", secondary: null, valid: pts.length > 0 };
  }

  if (!pxPerMetre) return { value: 0, unit: type.unit, secondary: null, valid: false };

  if (m.type === "linear") {
    const lengthM = pxToM(polylineLength(pts), pxPerMetre) * (Number(m.multiplier) || 1);
    // A wall run measured on plan is a plan length; height turns it into an
    // area when the user wants m² of cladding off a linear run.
    const height = Number(m.height) || 0;
    return {
      value: lengthM,
      unit: "m",
      secondary: height > 0 ? { value: lengthM * height, unit: "m²", label: `× ${height} m high` } : null,
      valid: pts.length >= 2,
    };
  }

  if (m.type === "area" || m.type === "volume") {
    const areaM2 = pxAreaToM2(polygonArea(pts), pxPerMetre) * (Number(m.multiplier) || 1);
    const perimeterM = pxToM(polygonPerimeter(pts), pxPerMetre);
    if (m.type === "volume") {
      const depth = Number(m.depth) || 0;
      return {
        value: areaM2 * depth,
        unit: "m³",
        secondary: { value: areaM2, unit: "m²", label: `× ${depth} m deep` },
        valid: pts.length >= 3 && depth > 0,
      };
    }
    return {
      value: areaM2,
      unit: "m²",
      secondary: { value: perimeterM, unit: "m", label: "perimeter" },
      valid: pts.length >= 3,
    };
  }

  return { value: 0, unit: type.unit, secondary: null, valid: false };
}

/** Sum measurements by the cost item they are assigned to. */
export function rollUpByCostItem(measurements, pxPerMetre) {
  const groups = new Map();
  for (const m of measurements) {
    const ev = evaluateMeasurement(m, pxPerMetre);
    if (!ev.valid) continue;
    const key = m.costItem || m.name || "Unassigned";
    const g = groups.get(key) || { costItem: key, unit: ev.unit, quantity: 0, count: 0, measurements: [] };
    // Mixed units under one cost item is a user error, not something to
    // silently average — keep the first unit and flag the clash.
    if (g.unit !== ev.unit) g.unitClash = true;
    g.quantity += ev.value;
    g.count++;
    g.measurements.push(m.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.quantity - a.quantity);
}

/**
 * Convert a takeoff into estimate/quote lines, applying a waste allowance.
 * Waste is where takeoffs quietly under-order: 10% on tiles, 15% on timber
 * offcuts. Defaults to the per-measurement value, then the global default.
 */
export function toQuoteLines(measurements, pxPerMetre, { defaultWaste = 0, rates = {} } = {}) {
  return rollUpByCostItem(measurements, pxPerMetre).map((g) => {
    const source = measurements.find((m) => g.measurements.includes(m.id));
    const waste = Number(source?.wastePct ?? defaultWaste) || 0;
    const qty = g.quantity * (1 + waste / 100);
    const rate = Number(rates[g.costItem] ?? source?.rate) || 0;
    return {
      description: g.costItem,
      qty: round(qty, 2),
      unit: g.unit,
      rate,
      total: round(qty * rate, 2),
      wastePct: waste,
      measuredQty: round(g.quantity, 2),
      source: "takeoff",
    };
  });
}

export function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Human-facing quantity string with a sane number of decimals per unit. */
export function formatQuantity(value, unit) {
  if (unit === "no.") return `${Math.round(value)}`;
  if (unit === "m³") return value.toFixed(2);
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

/* ---- Snapping ---------------------------------------------------------- */

/**
 * Orthogonal snap: hold Shift (or leave "ortho" on) and the next point locks
 * to horizontal/vertical/45° from the previous one. Plans are overwhelmingly
 * rectilinear, and freehand-clicking a wall introduces 1–2% error per run.
 */
export function snapOrtho(from, to, enable = true) {
  if (!enable || !from) return to;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // Within ~22.5° of a diagonal, snap to exactly 45°.
  if (Math.abs(adx - ady) < Math.max(adx, ady) * 0.25) {
    const d = (adx + ady) / 2;
    return { x: from.x + Math.sign(dx) * d, y: from.y + Math.sign(dy) * d };
  }
  return adx > ady ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
}

/** Snap to an existing vertex within `radius` screen px, so runs join cleanly. */
export function snapToVertex(p, measurements, radius) {
  let best = null;
  let bestD = radius;
  for (const m of measurements) {
    for (const pt of m.points || []) {
      const d = distance(p, pt);
      if (d < bestD) {
        bestD = d;
        best = pt;
      }
    }
  }
  return best ? { x: best.x, y: best.y, snapped: true } : p;
}

/* ---- Hit testing ------------------------------------------------------- */

/** Topmost measurement under the cursor. `tolerance` is in image px. */
export function hitTest(p, measurements, tolerance = 6) {
  for (let i = measurements.length - 1; i >= 0; i--) {
    const m = measurements[i];
    const pts = m.points || [];
    if (m.type === "count") {
      if (pts.some((pt) => distance(p, pt) <= tolerance * 2)) return m;
      continue;
    }
    if ((m.type === "area" || m.type === "volume") && pts.length >= 3 && pointInPolygon(p, pts)) return m;
    for (let j = 1; j < pts.length; j++) {
      if (pointToSegmentDistance(p, pts[j - 1], pts[j]) <= tolerance) return m;
    }
    if ((m.type === "area" || m.type === "volume") && pts.length >= 3) {
      if (pointToSegmentDistance(p, pts[pts.length - 1], pts[0]) <= tolerance) return m;
    }
  }
  return null;
}

/** Vertex handle under the cursor, for dragging a point after the fact. */
export function hitTestVertex(p, measurement, tolerance = 8) {
  const pts = measurement?.points || [];
  for (let i = 0; i < pts.length; i++) {
    if (distance(p, pts[i]) <= tolerance) return i;
  }
  return -1;
}

/* ---- Palette ----------------------------------------------------------- */

/**
 * Distinct, colour-blind-safe hues for measurement layers. Ordered so the
 * first six — the ones most takeoffs actually use — stay maximally apart.
 */
export const TAKEOFF_COLORS = [
  "#D9AC00", // hi-vis yellow (house accent)
  "#0F7BC4", // blue
  "#C8480E", // alert red
  "#3A7D44", // green
  "#7B4FBF", // violet
  "#F58E1A", // ember
  "#00868B", // teal
  "#B5177E", // magenta
];

export function nextColor(existing = []) {
  const used = new Set(existing.map((m) => m.color));
  return TAKEOFF_COLORS.find((c) => !used.has(c)) || TAKEOFF_COLORS[existing.length % TAKEOFF_COLORS.length];
}
