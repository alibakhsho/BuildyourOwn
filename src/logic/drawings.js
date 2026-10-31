/* =========================================================================
   MODULE: drawings.js
   A drawing set (A3 sheets, SVG) generated from the same structure model as
   the 3D view and the cut list — so the plans, elevations, section, frame
   and truss drawings, slab plan and schedules always agree with the model:

     A01+  Floor plan(s)            A06  Wall frame elevations (fabrication)
     A02   Front & rear elevations   A07  Roof framing plan + truss detail
     A03   Side elevations           A08  Slab & footing plan
     A04   Section A–A               A09  Window & door schedule
                                     L01  Landscape plan (when the yard is modelled)
   Pure: returns SVG strings (no DOM), so it runs in tests and can be
   downloaded or printed as-is. Paper units are millimetres.
   ========================================================================= */
import { corners, schedule, SYSTEMS } from "./structure/model.js";
import { wallPt } from "./structure/walls.js";

const SH = { w: 420, h: 297 };
const AREA = { x: 14, y: 14, w: 392, h: 236 };            // drawing area above the title block
const SCALES = [10, 20, 25, 50, 100, 200, 250, 500];
const FONT = "Arial, Helvetica, sans-serif";
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mmTxt = (m) => Math.round(m * 1000).toLocaleString("en-AU");

/* ---------- geometry helpers ---------- */
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
/* A member's outline projected onto a plane: proj(c) → [u, v] in metres. */
const outline = (m, proj) => hull(corners(m).map(proj));
const extent = (m, axis) => { const c = corners(m).map((p) => p[axis]); return [Math.min(...c), Math.max(...c)]; };

/* ---------- view: metres → paper ---------- */
function pickScale(wM, hM, areaW, areaH) {
  for (const s of SCALES) if ((wM * 1000) / s <= areaW && (hM * 1000) / s <= areaH) return s;
  return SCALES[SCALES.length - 1];
}
function view(box, area, scale, flipV) {
  const k = 1000 / scale;
  const ox = area.x + (area.w - (box.u1 - box.u0) * k) / 2;
  const oy = area.y + (area.h - (box.v1 - box.v0) * k) / 2;
  return {
    k, scale,
    X: (u) => ox + (u - box.u0) * k,
    Y: flipV ? (v) => oy + (box.v1 - v) * k : (v) => oy + (v - box.v0) * k,
  };
}
const poly = (V, pts, attrs) => `<polygon points="${pts.map(([u, v]) => `${n2(V.X(u))},${n2(V.Y(v))}`).join(" ")}" ${attrs}/>`;
const line = (V, a, b, attrs) => `<line x1="${n2(V.X(a[0]))}" y1="${n2(V.Y(a[1]))}" x2="${n2(V.X(b[0]))}" y2="${n2(V.Y(b[1]))}" ${attrs}/>`;
const rectUV = (V, u0, v0, u1, v1, attrs) => {
  const x0 = Math.min(V.X(u0), V.X(u1)), x1 = Math.max(V.X(u0), V.X(u1));
  const y0 = Math.min(V.Y(v0), V.Y(v1)), y1 = Math.max(V.Y(v0), V.Y(v1));
  return `<rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(x1 - x0)}" height="${n2(y1 - y0)}" ${attrs}/>`;
};
const text = (x, y, s, { size = 2.5, anchor = "middle", weight = 400, rotate = 0, fill = "#111" } = {}) =>
  `<text x="${n2(x)}" y="${n2(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${rotate ? ` transform="rotate(${rotate} ${n2(x)} ${n2(y)})"` : ""}>${esc(s)}</text>`;

const ST = {
  cut: `fill="none" stroke="#111" stroke-width="0.5"`,
  heavy: `stroke="#111" stroke-width="0.5"`,
  medium: `stroke="#111" stroke-width="0.35"`,
  light: `stroke="#222" stroke-width="0.25"`,
  fine: `stroke="#333" stroke-width="0.18"`,
  hidden: `stroke="#333" stroke-width="0.25" stroke-dasharray="1.6 0.9"`,
  centre: `stroke="#333" stroke-width="0.18" stroke-dasharray="4 1 0.6 1"`,
};

/* Dimension between paper points a and b, offset `off` mm to the left of a→b. */
function dim(a, b, off, label, size = 2.2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const p1 = [a[0] + nx * off, a[1] + ny * off], p2 = [b[0] + nx * off, b[1] + ny * off];
  const s = Math.sign(off) || 1;
  const ext = (p, q) => `<line x1="${n2(p[0] + nx * s * 0.8)}" y1="${n2(p[1] + ny * s * 0.8)}" x2="${n2(q[0] + nx * s * 1.2)}" y2="${n2(q[1] + ny * s * 1.2)}" stroke="#333" stroke-width="0.13"/>`;
  const tick = (p) => `<line x1="${n2(p[0] - (dx / L + nx) * 0.9)}" y1="${n2(p[1] - (dy / L + ny) * 0.9)}" x2="${n2(p[0] + (dx / L + nx) * 0.9)}" y2="${n2(p[1] + (dy / L + ny) * 0.9)}" stroke="#111" stroke-width="0.3"/>`;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
  const mx = (p1[0] + p2[0]) / 2 + nx * s * 1.1, my = (p1[1] + p2[1]) / 2 + ny * s * 1.1;
  return [ext(a, p1), ext(b, p2),
    `<line x1="${n2(p1[0])}" y1="${n2(p1[1])}" x2="${n2(p2[0])}" y2="${n2(p2[1])}" stroke="#333" stroke-width="0.13"/>`,
    tick(p1), tick(p2),
    `<text x="${n2(mx)}" y="${n2(my)}" font-family="${FONT}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="#111" transform="rotate(${n2(ang)} ${n2(mx)} ${n2(my)})">${esc(label)}</text>`].join("");
}
/* A chain of dimensions along one paper line through sorted positions. */
function dimChain(points, off, horizontal, fmt = (d) => mmTxt(d.m)) {
  let s = "";
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) < 1.2) continue;
    s += dim(a.p, b.p, off, fmt({ m: Math.abs(b.m - a.m) }), horizontal ? 2 : 2);
  }
  return s;
}
/* Level marker: triangle + RL text at paper (x, y). */
const level = (x, y, label, rl) => `<path d="M${n2(x)} ${n2(y)} l-1.6 -2.2 h3.2 z" fill="#111"/><line x1="${n2(x - 12)}" y1="${n2(y)}" x2="${n2(x + 4)}" y2="${n2(y)}" stroke="#333" stroke-width="0.13"/>` +
  text(x + 5, y - 0.6, `${label} RL ${rl.toFixed(3)}`, { size: 2.2, anchor: "start" });

const DEFS = `<defs>
  <pattern id="h-brick" patternUnits="userSpaceOnUse" width="1.1" height="1.1" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.1" stroke="#222" stroke-width="0.12"/></pattern>
  <pattern id="h-conc" patternUnits="userSpaceOnUse" width="3" height="3"><circle cx="0.6" cy="0.7" r="0.18" fill="#333"/><circle cx="2.1" cy="1.9" r="0.14" fill="#333"/><path d="M1.6 0.4 l0.5 0.8 h-1 z" fill="none" stroke="#333" stroke-width="0.1"/></pattern>
  <pattern id="h-insul" patternUnits="userSpaceOnUse" width="2.4" height="2"><path d="M0 1 Q0.6 0 1.2 1 T2.4 1" fill="none" stroke="#555" stroke-width="0.12"/></pattern>
  <pattern id="h-ground" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#555" stroke-width="0.15"/></pattern>
  <pattern id="h-lawn" patternUnits="userSpaceOnUse" width="2.4" height="2.4"><path d="M0.6 1.2 l0.25 -0.6 l0.25 0.6 M1.7 2.1 l0.2 -0.5 l0.2 0.5" fill="none" stroke="#6a8a52" stroke-width="0.1"/></pattern>
  <pattern id="h-gravel" patternUnits="userSpaceOnUse" width="1.6" height="1.6"><circle cx="0.4" cy="0.4" r="0.16" fill="#777"/><circle cx="1.2" cy="1.1" r="0.12" fill="#777"/></pattern>
  <pattern id="h-mulch" patternUnits="userSpaceOnUse" width="2" height="2"><path d="M0.3 0.5 l0.5 0.2 M1.2 1.4 l0.4 -0.3" stroke="#8a6a4a" stroke-width="0.14"/></pattern>
  <pattern id="h-glass" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-35)"><line x1="0" y1="0" x2="0" y2="1" stroke="#7aa7c7" stroke-width="0.15"/></pattern>
</defs>`;

/* ---------- sheet + title block ---------- */
function sheet(info, { number, title, scale, notes = [] }, body) {
  const tb = { x: 236, y: 256, w: 170, h: 30 };
  const note = notes.length ? `<g>${text(14, 259, "NOTES", { size: 2.4, anchor: "start", weight: 700 })}${notes.slice(0, 6).map((n, i) => text(14, 263.5 + i * 3.6, `${i + 1}. ${n}`, { size: 2, anchor: "start" })).join("")}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SH.w} ${SH.h}" width="${SH.w}mm" height="${SH.h}mm" style="background:#fff">
${DEFS}
<rect x="0" y="0" width="${SH.w}" height="${SH.h}" fill="#fff"/>
<rect x="8" y="8" width="${SH.w - 16}" height="${SH.h - 16}" fill="none" stroke="#111" stroke-width="0.5"/>
${body}
${note}
<g>
  <rect x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" fill="#fff" stroke="#111" stroke-width="0.35"/>
  <line x1="${tb.x}" y1="${tb.y + 9}" x2="${tb.x + tb.w}" y2="${tb.y + 9}" stroke="#111" stroke-width="0.2"/>
  <line x1="${tb.x}" y1="${tb.y + 21}" x2="${tb.x + tb.w}" y2="${tb.y + 21}" stroke="#111" stroke-width="0.2"/>
  <line x1="${tb.x + 120}" y1="${tb.y + 9}" x2="${tb.x + 120}" y2="${tb.y + tb.h}" stroke="#111" stroke-width="0.2"/>
  ${text(tb.x + 3, tb.y + 4, "BUILD YOUR OWN", { size: 2.6, anchor: "start", weight: 700 })}
  ${text(tb.x + 3, tb.y + 7.5, esc(info.project || "Project"), { size: 2.2, anchor: "start" })}
  ${text(tb.x + tb.w - 3, tb.y + 4, `Project ${esc(info.projectNo || "")}`, { size: 2.2, anchor: "end" })}
  ${text(tb.x + tb.w - 3, tb.y + 7.5, esc(info.date || ""), { size: 2.2, anchor: "end" })}
  ${text(tb.x + 3, tb.y + 15.5, title, { size: 4, anchor: "start", weight: 700 })}
  ${text(tb.x + 123, tb.y + 13, "SHEET", { size: 1.8, anchor: "start" })}
  ${text(tb.x + 123, tb.y + 19, number, { size: 4.5, anchor: "start", weight: 700 })}
  ${text(tb.x + 3, tb.y + 25, `Scale ${scale} @ A3`, { size: 2.2, anchor: "start" })}
  ${text(tb.x + 3, tb.y + 28.4, "INDICATIVE ONLY — NOT FOR CONSTRUCTION. Engineer & truss supplier to certify.", { size: 1.8, anchor: "start", fill: "#a1300f" })}
  ${text(tb.x + 123, tb.y + 26.5, "Generated from the 3D model", { size: 1.7, anchor: "start" })}
</g>
</svg>`;
}

function scaleBar(x, y, scale) {
  const k = 1000 / scale, step = scale <= 50 ? 1 : scale <= 100 ? 2 : 5, n = 5;
  let s = "";
  for (let i = 0; i < n; i++) s += `<rect x="${n2(x + i * step * k)}" y="${n2(y)}" width="${n2(step * k)}" height="1.2" fill="${i % 2 ? "#fff" : "#111"}" stroke="#111" stroke-width="0.15"/>`;
  s += text(x, y + 4, "0", { size: 1.8 }) + text(x + n * step * k, y + 4, `${n * step} m`, { size: 1.8 });
  return s;
}
const northArrow = (x, y) => `<g><circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#111" stroke-width="0.25"/><path d="M${x} ${y - 4} l2 6 l-2 -1.4 l-2 1.4 z" fill="#111"/>${text(x, y - 5.2, "N", { size: 2.4, weight: 700 })}</g>`;

/* =====================================================================
   PLAN
   ===================================================================== */
const ENV4 = (w, l) => [
  { side: "front", start: [-w / 2, l / 2], dir: [1, 0], out: [0, 1], len: w },
  { side: "right", start: [w / 2, l / 2], dir: [0, -1], out: [1, 0], len: l },
  { side: "back", start: [w / 2, -l / 2], dir: [-1, 0], out: [0, -1], len: w },
  { side: "left", start: [-w / 2, -l / 2], dir: [0, 1], out: [-1, 0], len: l },
];

function subtract(iv, cuts) {
  let out = iv;
  for (const [c0, c1] of cuts) out = out.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [[a, c0], [c1, b]].filter(([p, q]) => q - p > 1e-3)));
  return out;
}

function planWalls(V, E, ops, bu, clad, from, to) {
  const P = (u, t) => { const q = wallPt(E, u, 0, t); return [q[0], q[2]]; };
  const T = bu.total, o = bu.frameOff, fd = bu.frameD;
  let s = "";
  const pieces = subtract([[from, to]], ops.map((op) => [op.u - op.w / 2, op.u + op.w / 2]));
  for (const [a, b] of pieces) {
    const quad = (t0, t1) => [P(a, t0), P(b, t0), P(b, t1), P(a, t1)];
    if (clad === "brick") s += poly(V, quad(0, bu.leaf), `fill="url(#h-brick)" stroke="none"`);
    else s += poly(V, quad(0, bu.leaf), `fill="#ddd" stroke="none"`);
    s += poly(V, quad(o, o + fd), `fill="#e9e3d6" stroke="#555" stroke-width="0.13"`);
    s += poly(V, quad(T - 0.01, T), `fill="#fff" stroke="none"`);
    s += line(V, P(a, 0), P(b, 0), ST.heavy) + line(V, P(a, T), P(b, T), ST.heavy);
    s += line(V, P(a, bu.leaf), P(b, bu.leaf), ST.fine);
  }
  // jamb returns and opening symbols
  for (const op of ops) {
    const u0 = op.u - op.w / 2, u1 = op.u + op.w / 2;
    for (const u of [u0, u1]) s += line(V, P(u, 0), P(u, T), ST.heavy);
    if (op.kind === "window") {
      for (const t of [0, o - 0.012, o + 0.088, T]) s += line(V, P(u0, t), P(u1, t), t === 0 || t === T ? ST.fine : ST.light);
      s += line(V, P(u0, o + 0.038), P(u1, o + 0.038), `stroke="#3a7fb0" stroke-width="0.2"`);
    } else {
      // leaf swings into the house, hinged on the u1 side
      const hinge = P(u1 - 0.03, T), lw = op.w - 0.06;
      const open = P(u1 - 0.03, T + lw), closed = P(u0 + 0.03, T);
      s += line(V, hinge, open, ST.medium);
      const r = lw * V.k;
      s += `<path d="M${n2(V.X(open[0]))} ${n2(V.Y(open[1]))} A ${n2(r)} ${n2(r)} 0 0 ${E.side === "front" || E.side === "left" ? 1 : 0} ${n2(V.X(closed[0]))} ${n2(V.Y(closed[1]))}" fill="none" ${ST.fine}/>`;
      s += line(V, P(u0, 0), P(u1, 0), ST.fine);
    }
    if (op.mark) {
      const q = P(op.u, -0.32);
      s += text(V.X(q[0]), V.Y(q[1]) + 0.8, op.mark, { size: 2, weight: 700 });
    }
  }
  return s;
}

function floorPlanSheet(S, f, info) {
  const { env, buildUp: bu, layout, partitions, garage, members } = S;
  const { w, l } = env;
  const clad = S.spec.claddingType === "weatherboard" || S.spec.claddingType === "render" ? S.spec.claddingType : "brick";
  const x0 = garage && f === 0 ? garage.x0 : -w / 2, x1 = w / 2, z0 = -l / 2, z1 = l / 2;
  const pad = 2.6;
  const box = { u0: x0 - pad, u1: x1 + pad, v0: z0 - pad, v1: z1 + pad };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, AREA.w, AREA.h);
  const V = view(box, AREA, scale, false);
  let body = "";

  // floor finishes as light tones per room + labels
  const fl = layout.floors[f];
  const tone = { tile: "#f2f2ef", carpet: "#f4efe8", timber: "#f7f1e3" };
  for (const c of fl.cells) body += rectUV(V, c.x, c.z, c.x + c.w, c.z + c.l, `fill="${tone[c.item.finish] || "#fff"}" stroke="none"`);
  // fit-out outlines (benches, vanities, WCs, stair treads…) on this storey
  const yLo = env.levelY(f) - 0.01, yHi = env.levelY(f) + env.wallH;
  for (const m of members) {
    if (m.sys !== "interior" || m.kind === "floor") continue;
    const [ya] = extent(m, 1);
    if (ya < yLo || ya > yHi) continue;
    body += poly(V, outline(m, (c) => [c[0], c[2]]), `fill="#fff" fill-opacity="0.6" ${ST.fine}`);
  }
  // partitions with their doors
  for (const run of partitions[f] || []) {
    const th = run.thickness || 0.09;
    const gaps = run.doors.map((c) => [c - 0.435, c + 0.435]);
    for (const [a, b] of subtract([[run.from, run.to]], gaps)) {
      body += run.axis === "z"
        ? rectUV(V, run.at - th / 2, a, run.at + th / 2, b, `fill="#d9d4ca" ${ST.medium}`)
        : rectUV(V, a, run.at - th / 2, b, run.at + th / 2, `fill="#d9d4ca" ${ST.medium}`);
    }
    run.doors.forEach((c, i) => {
      // leaf drawn open at 90° into the +side, hinged at the far end
      const h = run.axis === "z" ? [run.at + th / 2, c + 0.41] : [c + 0.41, run.at + th / 2];
      const o = run.axis === "z" ? [run.at + th / 2 + 0.82, c + 0.41] : [c + 0.41, run.at + th / 2 + 0.82];
      const cl = run.axis === "z" ? [run.at + th / 2, c - 0.41] : [c - 0.41, run.at + th / 2];
      body += line(V, h, o, ST.light);
      const r = 0.82 * V.k;
      body += `<path d="M${n2(V.X(o[0]))} ${n2(V.Y(o[1]))} A ${n2(r)} ${n2(r)} 0 0 ${run.axis === "z" ? 0 : 1} ${n2(V.X(cl[0]))} ${n2(V.Y(cl[1]))}" fill="none" ${ST.fine}/>`;
      if (run.doorMarks?.[i]) {
        const t = run.axis === "z" ? [run.at - 0.3, c] : [c, run.at - 0.3];
        body += text(V.X(t[0]), V.Y(t[1]), run.doorMarks[i], { size: 1.6 });
      }
    });
  }
  // external walls (front/back run through the corners)
  const ops = S.openings.filter((op) => op.floor === f);
  for (const E of ENV4(w, l)) {
    const mine = ops.filter((op) => op.side === E.side);
    const through = E.side === "front" || E.side === "back";
    body += planWalls(V, E, mine, bu, clad, through ? 0 : bu.total, through ? E.len : E.len - bu.total);
  }
  // garage
  if (garage && f === 0) {
    const G = garage, Gw = G.x1 - G.x0, Gl = G.z1 - G.z0;
    const gwalls = [
      { side: "front", start: [G.x0, G.z1], dir: [1, 0], out: [0, 1], len: Gw, from: 0, to: Gw, ops: [{ u: Gw / 2, w: G.doorW, kind: "garage" }] },
      { side: "back", start: [G.x1, G.z0], dir: [-1, 0], out: [0, -1], len: Gw, from: 0, to: Gw, ops: G.rearDoor ? [{ u: Gw / 2, w: G.doorW, kind: "garage" }] : [] },
      { side: "left", start: [G.x0, G.z0], dir: [0, 1], out: [-1, 0], len: Gl, from: bu.total, to: Gl - bu.total, ops: [] },
    ];
    for (const g of gwalls) {
      body += planWalls(V, g, g.ops.filter((op) => op.kind !== "garage"), bu, clad, g.from, g.to).replace(/<line[^>]*stroke="#3a7fb0"[^>]*\/>/g, "");
      for (const op of g.ops.filter((x) => x.kind === "garage")) {
        // cut the wall at the door and show the overhead door dashed
        const P = (u, t) => { const q = wallPt(g, u, 0, t); return [q[0], q[2]]; };
        body += poly(V, [P(op.u - op.w / 2, -0.01), P(op.u + op.w / 2, -0.01), P(op.u + op.w / 2, bu.total + 0.01), P(op.u - op.w / 2, bu.total + 0.01)], `fill="#fff" stroke="none"`);
        for (const u of [op.u - op.w / 2, op.u + op.w / 2]) body += line(V, P(u, 0), P(u, bu.total), ST.heavy);
        body += line(V, P(op.u - op.w / 2, bu.total + 0.15), P(op.u + op.w / 2, bu.total + 0.15), ST.hidden);
      }
    }
    body += text(V.X((G.x0 + G.x1) / 2), V.Y((G.z0 + G.z1) / 2), "GARAGE", { size: 2.8, weight: 700 });
    body += text(V.X((G.x0 + G.x1) / 2), V.Y((G.z0 + G.z1) / 2) + 3.6, `${(Gw * Gl).toFixed(1)} m²`, { size: 2.2 });
  }
  // room names + areas
  for (const c of fl.cells) {
    const cx = V.X(c.x + c.w / 2), cy = V.Y(c.z + c.l / 2);
    if (c.item.type === "Stair") { body += text(cx, cy, "STAIR", { size: 2, weight: 700 }); continue; }
    body += text(cx, cy - 0.8, c.item.name.toUpperCase(), { size: 2.4, weight: 700 });
    body += text(cx, cy + 2.6, `${(c.w * c.l).toFixed(1)} m²`, { size: 2.1 });
  }
  // dimensions: overall + opening chains on front and rear
  const front = l / 2, back = -l / 2;
  const chain = (side, zLine, sign) => {
    const list = ops.filter((op) => op.side === side).flatMap((op) => [op.u - op.w / 2, op.u + op.w / 2]);
    const xs = [-w / 2, ...list.map((u) => (side === "front" ? -w / 2 + u : w / 2 - u)), w / 2].sort((a, b) => a - b);
    return dimChain(xs.map((x) => ({ m: x, p: [V.X(x), V.Y(zLine)] })), sign * 7, true);
  };
  body += chain("front", front, 1) + chain("back", back, -1);
  body += dim([V.X(x0), V.Y(front)], [V.X(x1), V.Y(front)], 13, mmTxt(x1 - x0));
  body += dim([V.X(-w / 2), V.Y(back)], [V.X(w / 2), V.Y(back)], -13, mmTxt(w));
  body += dim([V.X(x1), V.Y(back)], [V.X(x1), V.Y(front)], -9, mmTxt(l));
  body += dim([V.X(x0), V.Y(back)], [V.X(x0), V.Y(front)], 9, mmTxt(l));
  body += northArrow(AREA.x + AREA.w - 8, AREA.y + 8) + scaleBar(AREA.x + 2, AREA.y + AREA.h - 6, scale);
  const area = fl.cells.reduce((a, c) => a + c.w * c.l, 0);
  body += text(AREA.x + 2, AREA.y + 4, `${f === 0 ? "GROUND" : f === 1 ? "FIRST" : `LEVEL ${f}`} FLOOR PLAN`, { size: 3.4, anchor: "start", weight: 700 });
  body += text(AREA.x + 2, AREA.y + 8.4, `Internal floor area ${area.toFixed(1)} m² · building ${(w * l).toFixed(1)} m²${garage && f === 0 ? ` + garage ${((garage.x1 - garage.x0) * (garage.z1 - garage.z0)).toFixed(1)} m²` : ""}`, { size: 2.2, anchor: "start" });
  const notes = [
    `External walls: ${clad === "brick" ? "110 face brick, 40 cavity, " : ""}${bu.frameD * 1000} frame, 10 plasterboard (${Math.round(bu.total * 1000)} overall).`,
    "Internal walls 70×35 MGP10 @ 600 crs, 10 plasterboard both sides.",
    "Dimensions in millimetres to the outside of the building line. Do not scale.",
    "Window and door marks refer to the schedule on sheet A09.",
  ];
  return sheet(info, { number: `A0${1 + f}`.replace("A010", "A10"), title: `${f === 0 ? "Ground" : f === 1 ? "First" : `Level ${f}`} floor plan`, scale: `1:${scale}`, notes }, body);
}

/* =====================================================================
   ELEVATIONS (drawn parametrically from the same geometry)
   ===================================================================== */
function elevation(S, side, area) {
  const { env, roof, buildUp: bu, garage } = S;
  const { w, l, ffl } = env;
  const E = ENV4(w, l).find((e) => e.side === side);
  const gable = side === "front" || side === "back";
  const toU = (x, z) => (side === "front" ? x + w / 2 : side === "back" ? w / 2 - x : side === "left" ? z + l / 2 : l / 2 - z);
  const eave = roof.xFs(1) - w / 2;
  const verge = roof.zV1 - l / 2;
  const uMin = gable ? -eave - (garage && side === "front" ? garage.x1 - garage.x0 + eave : 0) - (garage && side === "back" ? 0 : 0) : -verge;
  const uMax = gable ? w + eave + (garage && side === "back" ? garage.x1 - garage.x0 + eave : 0) : l + verge;
  const box = { u0: uMin - 1.5, u1: uMax + 1.5, v0: -0.4, v1: roof.ridgeY + 0.6 };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, area.w, area.h - 10);
  const V = view(box, { ...area, h: area.h - 8 }, scale, true);
  let s = "";
  const yBase = ffl - 0.05, soffit = roof.soffitY;
  // cladding as it reads in elevation, true to scale: brick coursing (86 mm
  // courses, 240 mm stretchers, half-bond) or weatherboard laps
  const k = 1000 / scale, cl = S.spec.claddingType || "brick", pid = `el-${cl}-${side}`;
  if (cl === "brick") {
    const c = 0.086 * k, b = 0.24 * k;
    s += `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" x="${n2(V.X(0))}" y="${n2(V.Y(yBase))}" width="${n2(b)}" height="${n2(2 * c)}"><rect width="${n2(b)}" height="${n2(2 * c)}" fill="#f1e7df"/>` +
      `<path d="M0 ${n2(c)} H${n2(b)} M0 ${n2(2 * c)} H${n2(b)} M0 0 V${n2(c)} M${n2(b / 2)} ${n2(c)} V${n2(2 * c)}" stroke="#8a6f62" stroke-width="0.06" fill="none"/></pattern></defs>`;
  } else if (cl === "weatherboard") {
    const e = 0.17 * k;
    s += `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" x="0" y="${n2(V.Y(yBase))}" width="10" height="${n2(e)}"><rect width="10" height="${n2(e)}" fill="#f3f1ea"/>` +
      `<path d="M0 ${n2(e - 0.05)} H10" stroke="#777" stroke-width="0.07"/><path d="M0 ${n2(e - 0.18)} H10" stroke="#bbb" stroke-width="0.05"/></pattern></defs>`;
  }
  const brickFill = cl === "brick" || cl === "weatherboard" ? `url(#${pid})` : "#efece6";
  // ground + slab edge
  s += rectUV(V, uMin - 1, -0.4, uMax + 1, 0, `fill="url(#h-ground)" stroke="none"`) + line(V, [uMin - 1.2, 0], [uMax + 1.2, 0], ST.heavy);
  s += rectUV(V, 0, 0, E.len, yBase, `fill="#e6e3dc" ${ST.light}`);
  // walls
  if (gable) {
    s += rectUV(V, 0, yBase, E.len, soffit, `fill="${brickFill}" ${ST.medium}`);
    s += poly(V, [[0, soffit], [0, roof.gableBaseY], [E.len / 2, roof.yU(0)], [E.len, roof.gableBaseY], [E.len, soffit]], `fill="#f6f4ef" ${ST.medium}`);
    // roof edge: barge boards both slopes
    const xF = roof.xFs(1) - w / 2;   // eave beyond the wall
    const yEave = roof.coverTop(w / 2 + xF) , yR = roof.ridgeY;
    for (const sgn of [-1, 1]) {
      const uE = sgn < 0 ? -xF : E.len + xF;
      s += poly(V, [[uE, yEave + 0.03], [E.len / 2, yR + 0.03], [E.len / 2, yR - 0.2], [uE, yEave - 0.2]], `fill="#fafafa" ${ST.medium}`);
      s += rectUV(V, uE, yEave - 0.32, uE + sgn * 0.13, yEave - 0.18, `fill="#fff" ${ST.light}`); // gutter end
    }
    s += line(V, [-xF, yEave + 0.03], [E.len / 2, yR + 0.03], ST.heavy) + line(V, [E.len / 2, yR + 0.03], [E.len + xF, yEave + 0.03], ST.heavy);
  } else {
    s += rectUV(V, 0, yBase, E.len, soffit, `fill="${brickFill}" ${ST.medium}`);
    const fT = roof.coverTop(roof.xFs(1)) ;
    // roof plane seen beyond the gutter, ribs every sheet
    s += rectUV(V, -verge, fT, E.len + verge, roof.ridgeY, `fill="#e4e6e8" ${ST.medium}`);
    if (S.spec.roofType !== "tile" && S.spec.roofType !== "shingle") for (let u = -verge; u < E.len + verge; u += 0.762) s += line(V, [u, fT], [u, roof.ridgeY], ST.fine);
    else for (let v = fT; v < roof.ridgeY; v += 0.33) s += line(V, [-verge, v], [E.len + verge, v], ST.fine);
    s += rectUV(V, -verge, fT - 0.2, E.len + verge, fT, `fill="#fff" ${ST.medium}`);       // fascia + gutter
    s += line(V, [-verge, roof.ridgeY], [E.len + verge, roof.ridgeY], ST.heavy);
    // downpipes on this face
    for (const z of [l / 2 - 0.35, -l / 2 + 0.35, ...(2 * verge + l > 12 ? [0] : [])]) {
      const u = toU(0, z);
      s += rectUV(V, u - 0.045, 0, u + 0.045, fT - 0.2, `fill="#fff" ${ST.light}`);
    }
  }
  // openings on this face, all storeys
  for (const op of S.openings.filter((o) => o.side === side)) {
    const y0 = env.levelY(op.floor) + op.sill, y1 = env.levelY(op.floor) + (op.kind === "door" ? op.h : op.sill + op.h);
    const u0 = op.u - op.w / 2, u1 = op.u + op.w / 2;
    s += rectUV(V, u0, y0, u1, y1, `fill="#fff" ${ST.medium}`);
    if (op.kind === "window") {
      s += rectUV(V, u0 + 0.04, y0 + 0.05, u1 - 0.04, y1 - 0.04, `fill="url(#h-glass)" ${ST.fine}`);
      if (op.w >= 0.9 && op.w >= op.h * 0.9) s += line(V, [op.u, y0 + 0.05], [op.u, y1 - 0.04], ST.light);
      else s += line(V, [u0 + 0.04, y0 + (y1 - y0) * 0.38], [u1 - 0.04, y0 + (y1 - y0) * 0.38], ST.light);
      if (bu.leaf > 0.1) s += rectUV(V, u0 - 0.05, y0 - 0.115, u1 + 0.05, y0 - 0.005, `fill="url(#h-brick)" ${ST.fine}`);
    } else {
      s += rectUV(V, u0 + 0.03, y0, u1 - 0.03, y1 - 0.03, `fill="#f4efe9" ${ST.light}`);
      s += rectUV(V, u0 + 0.18, y0 + 0.5, u0 + 0.29, y0 + 1.85, `fill="url(#h-glass)" ${ST.fine}`);
      s += `<circle cx="${n2(V.X(u1 - 0.1))}" cy="${n2(V.Y(y0 + 1.0))}" r="0.5" fill="#111"/>`;
    }
    if (op.mark) s += text(V.X(op.u), V.Y(y0) + 3.2, op.mark, { size: 1.8 });
  }
  // garage seen on this face
  if (garage) {
    const G = garage, Gw = G.x1 - G.x0;
    if (side === "front" || side === "back") {
      const a = side === "front" ? -Gw : E.len, b = side === "front" ? 0 : E.len + Gw;
      const gSoffit = soffit - (env.plateY - (ffl + G.h));
      s += rectUV(V, a, yBase, b, gSoffit, `fill="${brickFill}" ${ST.medium}`);
      const tanp = Math.tan((Math.max(5, Math.min(45, +S.spec.roofPitch || 22)) * Math.PI) / 180);
      const apex = ffl + G.h + (Gw / 2) * tanp;
      s += poly(V, [[a, gSoffit], [(a + b) / 2, apex], [b, gSoffit]], `fill="#f6f4ef" ${ST.medium}`);
      s += line(V, [a - (side === "front" ? 0.45 : 0), gSoffit - 0.05], [(a + b) / 2, apex + 0.15], ST.heavy) + line(V, [(a + b) / 2, apex + 0.15], [b + (side === "back" ? 0.45 : 0), gSoffit - 0.05], ST.heavy);
      if (side === "front" || G.rearDoor) {
        const du0 = a + Gw / 2 - G.doorW / 2, du1 = a + Gw / 2 + G.doorW / 2;
        s += rectUV(V, du0, ffl, du1, ffl + G.doorH, `fill="#f2f2f0" ${ST.medium}`);
        for (let k = 1; k < 4; k++) s += line(V, [du0, ffl + (G.doorH * k) / 4], [du1, ffl + (G.doorH * k) / 4], ST.fine);
      }
    } else if (side === "left") {
      // the garage stands in front of the house's left wall
      const u0 = l - (G.z1 - G.z0), u1 = l;
      const gT = roof.coverTop(roof.xFs(1)) - (env.plateY - (ffl + G.h));
      s += rectUV(V, u0 - 0.45, gT - 0.2, u1 + 0.45, gT + 1.2, `fill="#e4e6e8" ${ST.medium}`);
      s += rectUV(V, u0, yBase, u1, gT - 0.2, `fill="${brickFill}" ${ST.medium}`);
      s += rectUV(V, u0 - 0.45, gT - 0.2, u1 + 0.45, gT, `fill="#fff" ${ST.medium}`);
    }
  }
  // levels
  const lx = V.X(uMax) + 6;
  s += level(lx, V.Y(ffl), "FFL", ffl) + level(lx, V.Y(env.plateY), "Ceiling", env.plateY) + level(lx, V.Y(roof.ridgeY), "Ridge", roof.ridgeY);
  if (env.floors > 1) for (let f = 1; f < env.floors; f++) s += level(lx, V.Y(env.levelY(f)), `L${f} FFL`, env.levelY(f));
  s += dim([V.X(0), V.Y(0)], [V.X(E.len), V.Y(0)], 7, mmTxt(E.len));
  return { svg: s, scale };
}

function elevationsSheet(S, sides, info, number) {
  const half = { ...AREA, h: AREA.h / 2 - 2 };
  let body = "";
  let scale = 0;
  sides.forEach((side, i) => {
    const area = { ...half, y: AREA.y + i * (AREA.h / 2 + 2) };
    const e = elevation(S, side, area);
    scale = Math.max(scale, e.scale);
    body += e.svg + text(area.x + 2, area.y + 4, `${side.toUpperCase()} ELEVATION`, { size: 3.2, anchor: "start", weight: 700 });
  });
  const clad = S.spec.claddingType || "brick";
  return sheet(info, { number, title: sides.map((s) => s[0].toUpperCase() + s.slice(1)).join(" & ") + " elevations", scale: `1:${scale}`,
    notes: [
      clad === "brick" ? "Face brickwork, stretcher bond, 10 mm raked joints; FC gable infill." : clad === "weatherboard" ? "180 mm cover weatherboards, painted." : "Acrylic render on FC sheet.",
      `${S.spec.roofType === "tile" ? "Concrete roof tiles" : "Corrugated steel roof sheeting"} at ${S.spec.roofPitch || 22}°; steel fascia, square-line gutter, 90 mm downpipes.`,
      "Aluminium windows, double glazed. Levels RL relative to natural ground = 0.000.",
    ] }, body);
}

/* =====================================================================
   SECTION A–A (projected from the members at a cut plane)
   ===================================================================== */
const SECTION_FILL = {
  concrete: `fill="url(#h-conc)" stroke="#111" stroke-width="0.3"`,
  brick: `fill="url(#h-brick)" stroke="#111" stroke-width="0.18"`,
  mortar: null,
  pine: `fill="#efe3c4" stroke="#111" stroke-width="0.2"`,
  lvl: `fill="#e2c89b" stroke="#111" stroke-width="0.2"`,
  insulation: `fill="url(#h-insul)" stroke="#777" stroke-width="0.12"`,
  plasterboard: `fill="#fff" stroke="#111" stroke-width="0.18"`,
  colorbond: `fill="#111" stroke="#111" stroke-width="0.1"`,
  galv: `fill="#888" stroke="#111" stroke-width="0.1"`,
  steelFrame: `fill="#9aa" stroke="#111" stroke-width="0.15"`,
};
function sectionSheet(S, info) {
  const { env, roof, members } = S;
  const tz = [...roof.trussZ].sort((a, b) => a - b);
  const mid = Math.max(0, Math.floor(tz.length / 2) - 1);
  const c = tz.length > 1 ? (tz[mid] + tz[mid + 1]) / 2 : 0;
  const beyondZ = tz[mid];
  const w = env.w;
  const xMax = roof.xFs(1) + 0.25;
  const box = { u0: -xMax - 0.3, u1: xMax + 0.3, v0: -0.6, v1: roof.ridgeY + 0.4 };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, AREA.w - 70, AREA.h - 6);
  const V = view(box, { ...AREA, w: AREA.w - 70 }, scale, true);
  let s = rectUV(V, box.u0, -0.6, box.u1, 0, `fill="url(#h-ground)" stroke="none"`) + line(V, [box.u0, 0], [box.u1, 0], ST.heavy);
  const proj = (p) => [p[0], p[1]];
  const SKIP = new Set(["screw", "tie", "nailplate", "nut", "washer", "bar", "hinge", "rose", "lever"]);
  // beyond: the truss behind the cut, and anything else of the roof frame
  for (const m of members) {
    if (m.sys !== "roofFrame" || SKIP.has(m.kind)) continue;
    const [za, zb] = extent(m, 2);
    if (Math.abs((za + zb) / 2 - beyondZ) > 0.03) continue;
    s += poly(V, outline(m, proj), `fill="#fbf7ee" ${ST.fine}`);
  }
  // cut members
  const order = ["foundation", "reo", "interior", "wallFrame", "floorFrame", "linings", "cladding", "openings", "roofFrame", "roofing"];
  const cut = members.filter((m) => {
    if (SKIP.has(m.kind) || m.kind === "mortar" || m.sys === "solar" || m.sys === "fixings") return false;
    const [za, zb] = extent(m, 2);
    if (!(za <= c && zb >= c)) return false;
    const [xa, xb] = extent(m, 0);
    return xb > -xMax - 1 && xa < xMax + 1 && !(m.host || "").startsWith("Garage");
  }).sort((a, b) => order.indexOf(a.sys) - order.indexOf(b.sys));
  for (const m of cut) {
    const fill = SECTION_FILL[m.mat] || `fill="#fff" stroke="#111" stroke-width="0.2"`;
    if (!fill) continue;
    s += poly(V, outline(m, proj), fill);
  }
  // annotations
  const lx = V.X(xMax) + 5;
  s += level(lx, V.Y(env.ffl), "FFL", env.ffl) + level(lx, V.Y(env.plateY), "Ceiling / plate", env.plateY) + level(lx, V.Y(roof.ridgeY), "Ridge", roof.ridgeY);
  s += dim([V.X(-w / 2), V.Y(0)], [V.X(w / 2), V.Y(0)], 9, mmTxt(w));
  s += dim([V.X(w / 2), V.Y(env.plateY)], [V.X(roof.xFs(1)), V.Y(env.plateY)], 6, mmTxt(roof.xFs(1) - w / 2));
  const pitchDeg = Math.round((Math.atan(Math.tan(Math.atan2(roof.ridgeY - roof.coverTop(w / 2), w / 2))) * 180) / Math.PI);
  s += text(V.X(w / 4), V.Y(roof.coverTop(w / 4)) - 4, `${S.spec.roofPitch || pitchDeg}° pitch`, { size: 2.4 });
  // material callouts on the right
  const call = (pt, label, i) => {
    const tx = AREA.x + AREA.w - 66, ty = AREA.y + 14 + i * 9.5;
    return `<line x1="${n2(V.X(pt[0]))}" y1="${n2(V.Y(pt[1]))}" x2="${n2(tx - 1)}" y2="${n2(ty - 0.8)}" stroke="#333" stroke-width="0.13"/><circle cx="${n2(V.X(pt[0]))}" cy="${n2(V.Y(pt[1]))}" r="0.45" fill="#111"/>` +
      label.split("\n").map((ln, k) => text(tx, ty + k * 2.8, ln, { size: 2.1, anchor: "start" })).join("");
  };
  const bu = S.buildUp;
  const xr = w / 2;
  const cover = S.spec.roofType === "tile" ? "Concrete roof tiles on 50×25 battens" : "Corrugated steel roof sheet on\n40 mm top-hat battens, sarking";
  s += call([w / 4, roof.coverTop(w / 4)], cover, 0);
  s += call([w / 3, (env.plateY + roof.coverTop(w / 3)) / 2], `Prefabricated timber trusses @ ${S.spec.roofType === "tile" ? 600 : 900} crs\n(90×35 chords, 70×35 webs, nail plates)`, 1);
  s += call([w / 6, env.plateY + 0.1], "R4.0 ceiling batts", 2);
  s += call([w / 6, env.plateY - 0.03], "10 mm plasterboard on furring channels", 3);
  s += call([xr - bu.frameOff - bu.frameD / 2, env.ffl + 1.3], `${bu.frameD * 1000} timber frame, studs @ 450 crs,\nR2.5 wall batts, 10 mm plasterboard`, 4);
  if (bu.leaf > 0.1) s += call([xr - 0.05, env.ffl + 0.7], "110 face brick veneer, 40 cavity,\nbrick ties @ 600 × 600", 5);
  s += call([0, env.ffl - env.slabThk / 2], `${Math.round(env.slabThk * 1000)} N25 slab, SL82 mesh,\n200 µm membrane`, 6);
  s += call([xr - 0.15, env.ffl - env.slabThk - 0.15], "300 × 300 edge beam, 3-L11TM", 7);
  s += call([xr - bu.frameOff - 0.1, env.ffl + 0.02], "M12 tie-down rods @ 1200 max", 8);
  s += text(AREA.x + 2, AREA.y + 4, "SECTION A–A", { size: 3.4, anchor: "start", weight: 700 });
  s += text(AREA.x + 2, AREA.y + 8.4, "Cross-section between trusses, looking to the rear; the next truss is shown beyond.", { size: 2.1, anchor: "start" });
  return sheet(info, { number: "A04", title: "Section A–A", scale: `1:${scale}`, notes: ["Section cut through the model; every member drawn is in the cut list.", "Truss design by the supplier; tie-downs and bracing to AS 1684 / engineer."] }, s);
}

/* =====================================================================
   WALL FRAME ELEVATIONS (fabrication-style)
   ===================================================================== */
function wallFrameView(S, W, area) {
  const ms = S.members.filter((m) => m.host === W.host && (m.sys === "wallFrame" || (m.sys === "fixings" && (m.kind === "rod" || m.kind === "strap"))));
  const toS = (p) => (p[0] - W.start[0]) * W.dir[0] + (p[2] - W.start[1]) * W.dir[1];
  const box = { u0: -0.6, u1: W.len + 0.6, v0: W.y0 - 0.5, v1: W.y0 + W.h + 0.7 };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, area.w, area.h - 4);
  const V = view(box, area, scale, true);
  let s = "";
  for (const m of ms) {
    if (m.kind === "brace") { s += line(V, [toS(m.a), m.a[1]], [toS(m.b), m.b[1]], `stroke="#6b7a88" stroke-width="0.3"`); continue; }
    if (m.kind === "rod" || m.kind === "strap") { s += line(V, [toS(m.a), Math.max(W.y0 - 0.1, m.a[1])], [toS(m.b), m.b[1]], `stroke="#333" stroke-width="0.35"`); continue; }
    const fill = m.kind === "lintel" ? (m.mat === "lvl" ? "#e2c89b" : m.mat === "steelPaint" ? "#9aa1a8" : "#ecdcb3") : m.kind === "plate" ? "#efe3c4" : "#f6efdc";
    s += poly(V, outline(m, (p) => [toS(p), p[1]]), `fill="${fill}" stroke="#222" stroke-width="0.15"`);
  }
  // openings: label size + lintel profile
  for (const o of W.ops || []) {
    const mark = o.src?.mark || "";
    s += rectUV(V, o.s0, W.y0 + o.sill, o.s1, W.y0 + o.head, `fill="none" ${ST.hidden}`);
    s += text(V.X((o.s0 + o.s1) / 2), V.Y(W.y0 + (o.sill + o.head) / 2), `${mark} ${mmTxt(o.s1 - o.s0)}×${mmTxt(o.head - o.sill)}`, { size: 2 });
    if (o.lintel) s += text(V.X((o.s0 + o.s1) / 2), V.Y(o.lintel.top) - 1.2, o.lintel.profile, { size: 1.8 });
  }
  // running dimensions to every full-height stud, along the top
  const studs = [...new Set(ms.filter((m) => m.kind === "stud" && /Common|Jamb stud$|Corner/.test(m.name)).map((m) => Math.round(toS(m.a) * 1000) / 1000))].sort((a, b) => a - b);
  const yTop = V.Y(W.y0 + W.h) - 3;
  s += `<line x1="${n2(V.X(0))}" y1="${n2(yTop)}" x2="${n2(V.X(W.len))}" y2="${n2(yTop)}" stroke="#333" stroke-width="0.13"/>`;
  for (const st of studs) {
    s += `<line x1="${n2(V.X(st))}" y1="${n2(yTop - 0.8)}" x2="${n2(V.X(st))}" y2="${n2(yTop + 0.8)}" stroke="#111" stroke-width="0.2"/>`;
    s += text(V.X(st) + 0.6, yTop - 1.2, mmTxt(st), { size: 1.4, anchor: "start", rotate: -90 });
  }
  s += dim([V.X(0), V.Y(W.y0)], [V.X(W.len), V.Y(W.y0)], 6, mmTxt(W.len));
  s += dim([V.X(W.len), V.Y(W.y0)], [V.X(W.len), V.Y(W.y0 + W.h)], -5, mmTxt(W.h));
  s += text(area.x + 2, area.y + 3.5, `${W.code} — ${W.host.toUpperCase()}`, { size: 2.8, anchor: "start", weight: 700 });
  s += text(area.x + 2, area.y + 7, `${W.frame.profile} studs @ ${W.kind === "ext" ? 450 : 600} crs · ${ms.filter((m) => m.kind === "stud").length} studs · ${ms.filter((m) => m.kind === "nogging").length} noggings`, { size: 2, anchor: "start" });
  return { svg: s, scale };
}
function wallFramesSheet(S, walls, info, number) {
  let body = "", scale = 0;
  const h = AREA.h / walls.length - 3;
  walls.forEach((W, i) => {
    const r = wallFrameView(S, W, { ...AREA, y: AREA.y + i * (h + 3), h });
    body += r.svg; scale = Math.max(scale, r.scale);
  });
  return sheet(info, { number, title: "Wall frame elevations", scale: `1:${scale}`, notes: ["Running dimensions to stud centres from the left end.", "Lintels sized for span; tie-down rods shown at the bottom plate.", "Frame to AS 1684; prefabricated frames by the supplier."] }, body);
}

/* =====================================================================
   ROOF FRAMING PLAN + TRUSS DETAIL
   ===================================================================== */
function roofSheet(S, info) {
  const { env, roof, members } = S;
  const { w, l } = env;
  const g = S.garage;
  const x0 = (g ? g.x0 : -w / 2) - 0.8, x1 = w / 2 + 0.8;
  const planArea = { ...AREA, w: AREA.w * 0.6 };
  const box = { u0: x0 - 0.6, u1: x1 + 1.6, v0: roof.zV0 - 0.6, v1: roof.zV1 + 0.6 };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, planArea.w, planArea.h - 8);
  const V = view(box, { ...planArea, y: planArea.y + 8, h: planArea.h - 8 }, scale, false);
  let s = "";
  // building line (hidden) and roof edge
  s += rectUV(V, -w / 2, -l / 2, w / 2, l / 2, `fill="none" ${ST.hidden}`);
  s += rectUV(V, -roof.xFs(1), roof.zV0, roof.xFs(1), roof.zV1, `fill="none" ${ST.medium}`);
  s += line(V, [0, roof.zV0], [0, roof.zV1], ST.centre);
  // trusses: bottom chords as bars, top chords out to the tails
  let tn = 0;
  const bySpan = new Map();
  for (const m of members) {
    if (m.sys !== "roofFrame") continue;
    if (/bottom chord/.test(m.name)) {
      s += poly(V, outline(m, (p) => [p[0], p[2]]), `fill="#efe3c4" stroke="#111" stroke-width="0.18"`);
      const z = (m.a[2] + m.b[2]) / 2, gableT = /Gable/.test(m.name);
      const key = `${m.host}:${gableT}`;
      const lab = gableT ? "GT" : `T${String(++tn).padStart(2, "0")}`;
      bySpan.set(key, (bySpan.get(key) || 0) + 1);
      s += text(V.X(Math.max(m.a[0], m.b[0])) + 1.2, V.Y(z) + 0.7, lab, { size: 1.6, anchor: "start" });
    } else if (/top chord/.test(m.name)) {
      s += line(V, [m.a[0], m.a[2]], [m.b[0], m.b[2]], ST.fine);
    } else if (m.kind === "binder") {
      s += line(V, [m.a[0], m.a[2]], [m.b[0], m.b[2]], ST.hidden);
    } else if (m.kind === "brace") {
      s += line(V, [m.a[0], m.a[2]], [m.b[0], m.b[2]], `stroke="#6b7a88" stroke-width="0.25"`);
    }
  }
  // truss spacing chain along the right side
  const tz = [...roof.trussZ].sort((a, b) => a - b);
  s += dimChain(tz.map((z) => ({ m: z, p: [V.X(roof.xFs(1)), V.Y(z)] })), -6, false);
  s += text(planArea.x + 2, planArea.y + 4, "ROOF FRAMING PLAN", { size: 3.2, anchor: "start", weight: 700 });
  s += text(planArea.x + 2, planArea.y + 8, `${tz.length} trusses @ ${mmTxt(tz.length > 1 ? tz[1] - tz[0] : 0)} crs · binders dashed · speed bracing grey`, { size: 2, anchor: "start" });

  // truss detail: the first common truss
  const zT = tz[Math.min(1, tz.length - 1)];
  const tm = members.filter((m) => (m.sys === "roofFrame" && /truss/.test(m.name) && Math.abs((m.a[2] + m.b[2]) / 2 - zT) < 0.02) || (m.kind === "nailplate" && Math.abs((m.a[2] + m.b[2]) / 2 - zT) < 0.05 && (m.host || "") === "Main roof"));
  const dArea = { x: AREA.x + AREA.w * 0.61, y: AREA.y + 8, w: AREA.w * 0.39, h: AREA.h * 0.62 };
  const xs = tm.flatMap((m) => corners(m).map((p) => p[0])), ys = tm.flatMap((m) => corners(m).map((p) => p[1]));
  if (xs.length) {
    const dbox = { u0: Math.min(...xs) - 0.4, u1: Math.max(...xs) + 0.4, v0: Math.min(...ys) - 0.9, v1: Math.max(...ys) + 0.5 };
    const dsc = pickScale(dbox.u1 - dbox.u0, dbox.v1 - dbox.v0, dArea.w, dArea.h - 10);
    const D = view(dbox, { ...dArea, y: dArea.y + 6, h: dArea.h - 10 }, dsc, true);
    for (const m of tm.filter((x) => x.kind !== "nailplate")) s += poly(D, outline(m, (p) => [p[0], p[1]]), `fill="${m.kind === "web" ? "#f6efdc" : "#efe3c4"}" stroke="#111" stroke-width="0.18"`);
    for (const m of tm.filter((x) => x.kind === "nailplate")) s += poly(D, outline(m, (p) => [p[0], p[1]]), `fill="#9aa1a8" fill-opacity="0.75" stroke="#333" stroke-width="0.1"`);
    const heel = w / 2 - S.buildUp.frameOff;
    s += dim([D.X(-heel), D.Y(env.plateY)], [D.X(heel), D.Y(env.plateY)], 7, `SPAN ${mmTxt(2 * heel)}`);
    s += text(dArea.x + 2, dArea.y + 2, `TRUSS DETAIL — T01 (scale 1:${dsc})`, { size: 2.8, anchor: "start", weight: 700 });
    s += text(dArea.x + 2, dArea.y + 5.6, `${2 * heel <= 9.6 ? "Fink (W) truss" : "Multi-panel truss"}, ${S.spec.roofPitch || 22}° pitch, 90×35 chords, 70×35 webs, galv. nail plates both faces`, { size: 1.9, anchor: "start" });
  }
  return sheet(info, { number: "A07", title: "Roof framing", scale: `1:${scale}`, notes: ["Truss layout indicative; final design, girders and bracing by the truss supplier.", "Triple-grips at every truss-to-plate connection.", "Speed bracing and binders to the supplier's layout."] }, s);
}

/* =====================================================================
   SLAB & FOOTING PLAN
   ===================================================================== */
function slabSheet(S, info) {
  const { env, members } = S;
  const { w, l } = env;
  const g = S.garage;
  const x0 = g ? g.x0 : -w / 2;
  const box = { u0: x0 - 2.2, u1: w / 2 + 2.2, v0: -l / 2 - 2.2, v1: l / 2 + 2.2 };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, AREA.w, AREA.h - 8);
  const V = view(box, { ...AREA, y: AREA.y + 8, h: AREA.h - 8 }, scale, false);
  let s = "";
  for (const m of members.filter((x) => x.sys === "foundation")) {
    const ol = outline(m, (p) => [p[0], p[2]]);
    if (m.kind === "slab") s += poly(V, ol, `fill="#f1efea" stroke="#111" stroke-width="0.5"`);
    else if (m.kind === "beam") s += poly(V, ol, `fill="none" ${ST.hidden}`);
    else if (m.kind === "pad") s += poly(V, ol, `fill="none" stroke="#333" stroke-width="0.3" stroke-dasharray="1 0.6"`);
  }
  for (const m of members.filter((x) => x.kind === "rod")) s += `<circle cx="${n2(V.X(m.a[0]))}" cy="${n2(V.Y(m.a[2]))}" r="0.55" fill="#111"/>`;
  s += dim([V.X(-w / 2), V.Y(l / 2)], [V.X(w / 2), V.Y(l / 2)], 8, mmTxt(w));
  s += dim([V.X(w / 2), V.Y(-l / 2)], [V.X(w / 2), V.Y(l / 2)], -8, mmTxt(l));
  if (g) s += dim([V.X(g.x0), V.Y(g.z1)], [V.X(g.x1), V.Y(g.z1)], 8, mmTxt(g.x1 - g.x0));
  s += text(AREA.x + 2, AREA.y + 4, "SLAB & FOOTING PLAN", { size: 3.2, anchor: "start", weight: 700 });
  s += text(AREA.x + 2, AREA.y + 8, `Stiffened raft: ${Math.round(env.slabThk * 1000)} slab, 300 × 300 edge beams, internal beams dashed · ● M12 tie-down rods (${members.filter((x) => x.kind === "rod").length})`, { size: 2, anchor: "start" });
  return sheet(info, { number: "A08", title: "Slab & footings", scale: `1:${scale}`, notes: ["N25 concrete, SL82 mesh top, 3-L11TM trench mesh in beams, 200 µm membrane.", "Site classification and final design by the engineer (AS 2870).", "Termite management to AS 3660.1."] }, s);
}

/* =====================================================================
   LANDSCAPE PLAN
   ===================================================================== */
function landscapeSheet(S, info) {
  const Y = S.landscape;
  const { lot, L } = Y;
  const box = { u0: lot.X0 - 2.5, u1: lot.X1 + 2.5, v0: lot.Z0 - 2, v1: lot.Z1 + 3.5 };
  const scale = pickScale(box.u1 - box.u0, box.v1 - box.v0, AREA.w - 80, AREA.h - 6);
  const V = view(box, { x: AREA.x, y: AREA.y + 6, w: AREA.w - 80, h: AREA.h - 6 }, scale, false);
  const M = S.members;
  const fill = (r, attrs) => rectUV(V, r.x0, r.z0, r.x1, r.z1, attrs);
  const area = (rs) => rs.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  const mid = (r) => [V.X((r.x0 + r.x1) / 2), V.Y((r.z0 + r.z1) / 2)];
  let s = "";
  for (const r of Y.lawn) s += fill(r, `fill="#eef3e6" stroke="none"`) + fill(r, `fill="url(#h-lawn)" stroke="none"`);
  for (const r of Y.gravel) s += fill(r, `fill="#f3f1ec" stroke="none"`) + fill(r, `fill="url(#h-gravel)" ${ST.fine}`);
  for (const b of Y.beds) s += fill(b.r, `fill="#efe6d8" stroke="none"`) + fill(b.r, `fill="url(#h-mulch)" ${ST.light}`);
  const hard = [...Y.paths.map((p) => p.r), Y.driveway].filter(Boolean);
  for (const r of hard) s += fill(r, `fill="#f1efea" ${ST.medium}`) + (L.path === "gravel" || L.path === "stepping" ? fill(r, `fill="url(#h-gravel)" stroke="none"`) : fill(r, `fill="url(#h-conc)" stroke="none"`));
  for (const m of M.filter((x) => x.kind === "joint" || x.kind === "stone" || (x.kind === "paver" && x.host !== "Driveway"))) s += poly(V, outline(m, (p) => [p[0], p[2]]), `fill="none" ${ST.fine}`);
  // deck: every board
  for (const m of M.filter((x) => x.sys === "decking" && x.kind === "board")) s += poly(V, outline(m, (p) => [p[0], p[2]]), `fill="#e9d6c0" ${ST.fine}`);
  if (Y.deck) s += fill(Y.deck, `fill="none" ${ST.heavy}`);
  // the house and garage
  s += fill(Y.house, `fill="#dedbd4" ${ST.heavy}`) + fill(Y.house, `fill="url(#h-brick)" stroke="none"`);
  if (Y.garage) s += fill(Y.garage, `fill="#e8e5df" ${ST.heavy}`);
  // plants and trees
  for (const m of M.filter((x) => x.sys === "garden" && x.kind === "plant" && !x.noSchedule)) s += `<circle cx="${n2(V.X(m.a[0]))}" cy="${n2(V.Y(m.a[2]))}" r="${n2((m.d / 2) * V.k)}" fill="#fff" fill-opacity="0.6" ${ST.light}/>`;
  for (const m of M.filter((x) => x.kind === "plant" && x.noSchedule)) {
    const cx = V.X(m.a[0]), cy = V.Y(m.a[2]);
    s += `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2((m.d / 2) * V.k)}" fill="none" stroke="#333" stroke-width="0.25" stroke-dasharray="1.2 0.6"/><circle cx="${n2(cx)}" cy="${n2(cy)}" r="0.5" fill="#111"/>`;
  }
  // retaining wall
  for (const m of M.filter((x) => x.sys === "retaining" && x.kind === "sleeper" && x.a[1] < 0.2)) s += poly(V, outline(m, (p) => [p[0], p[2]]), `fill="#999" ${ST.medium}`);
  // fences: the line, every post, gates as a swing
  for (const m of M.filter((x) => x.sys === "fencing" && (x.kind === "sheet" || x.kind === "plinth" || (x.kind === "rail" && x.a[1] < 0.35)))) s += line(V, [m.a[0], m.a[2]], [m.b[0], m.b[2]], `stroke="#111" stroke-width="0.6"`);
  for (const m of M.filter((x) => x.sys === "fencing" && x.kind === "post")) s += `<rect x="${n2(V.X(m.a[0]) - 0.6)}" y="${n2(V.Y(m.a[2]) - 0.6)}" width="1.2" height="1.2" fill="#111"/>`;
  for (const m of M.filter((x) => x.kind === "gate")) {
    const a = [V.X(m.a[0]), V.Y(m.a[2])], b = [V.X(m.b[0]), V.Y(m.b[2])];
    const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L2, ny = (b[0] - a[0]) / L2;
    const tip = [a[0] + nx * L2, a[1] + ny * L2];
    s += `<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(tip[0])}" y2="${n2(tip[1])}" stroke="#111" stroke-width="0.3"/><path d="M${n2(tip[0])} ${n2(tip[1])} A${n2(L2)} ${n2(L2)} 0 0 1 ${n2(b[0])} ${n2(b[1])}" fill="none" ${ST.fine} stroke-dasharray="0.8 0.5"/>`;
  }
  // the lot boundary, street and labels
  s += `<rect x="${n2(V.X(lot.X0))}" y="${n2(V.Y(lot.Z0))}" width="${n2((lot.X1 - lot.X0) * V.k)}" height="${n2((lot.Z1 - lot.Z0) * V.k)}" fill="none" stroke="#111" stroke-width="0.5" stroke-dasharray="6 1.2 0.8 1.2"/>`;
  s += text(V.X((lot.X0 + lot.X1) / 2), V.Y(lot.Z1) + 9, "STREET — FRONT BOUNDARY", { size: 2.6, weight: 700 });
  const [hx, hy] = mid(Y.house);
  s += text(hx, hy - 1, "HOUSE", { size: 3, weight: 700 }) + text(hx, hy + 2.6, `FFL RL ${S.env.ffl.toFixed(3)} · ground RL 0.000`, { size: 2 });
  if (Y.garage) { const [gx, gy] = mid(Y.garage); s += text(gx, gy, "GARAGE", { size: 2.6, weight: 700 }); }
  const SURF = { concrete: "Concrete", exposed: "Exposed aggregate", pavers: "Pavers", gravel: "Decomposed granite", stepping: "Stepping stones" };
  if (Y.deck) { const [dx, dy] = mid(Y.deck); s += `<rect x="${n2(dx - 20)}" y="${n2(dy - 3.4)}" width="40" height="6" fill="#fff" fill-opacity="0.85"/>` + text(dx, dy - 0.6, `DECK ${area([Y.deck]).toFixed(1)} m²`, { size: 2.4, weight: 700 }) + text(dx, dy + 2.2, `${(L.deckBoard || "merbau")} boards · top RL ${Y.deck.top.toFixed(3)}`, { size: 1.9 }); }
  if (Y.driveway) { const [dx, dy] = mid(Y.driveway); s += text(dx, dy, `${SURF[L.driveway] || "Concrete"} driveway`, { size: 2.2, weight: 700 }) + text(dx, dy + 3, `${area([Y.driveway]).toFixed(1)} m²`, { size: 2 }); }
  for (const p of Y.paths) {
    const [px, py] = mid(p.r);
    const vert = p.r.z1 - p.r.z0 > p.r.x1 - p.r.x0;
    s += text(px, py, `${p.host} · ${SURF[L.path] || ""}`, { size: 1.9, rotate: vert ? -90 : 0 });
  }
  const big = [...Y.lawn].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
  for (const r of big.slice(0, 2)) { const [lx, ly] = mid(r); if (Math.min(r.x1 - r.x0, r.z1 - r.z0) * V.k > 8) s += text(lx, ly, L.lawn === "synthetic" ? "SYNTHETIC TURF" : L.lawn === "none" ? "OPEN GROUND" : "LAWN — TURF", { size: 2.2, fill: "#3d5a2a" }); }
  // dimensions: lot, setbacks
  // (offsets: positive is to the left of a→b, so every chain sits outside the lot)
  s += dim([V.X(lot.X0), V.Y(lot.Z0)], [V.X(lot.X1), V.Y(lot.Z0)], -6, mmTxt(lot.X1 - lot.X0));
  s += dim([V.X(lot.X1), V.Y(lot.Z0)], [V.X(lot.X1), V.Y(lot.Z1)], -8, mmTxt(lot.Z1 - lot.Z0));
  s += dim([V.X(lot.X0), V.Y(Y.house.z1)], [V.X(lot.X0), V.Y(lot.Z1)], 6, mmTxt(lot.Z1 - Y.house.z1));
  s += dim([V.X(lot.X0), V.Y(lot.Z0)], [V.X(lot.X0), V.Y(Y.house.z0)], 6, mmTxt(Y.house.z0 - lot.Z0));
  s += dim([V.X(lot.X0), V.Y(Y.house.z0 + 1)], [V.X(lot.hx0), V.Y(Y.house.z0 + 1)], 0, mmTxt(lot.hx0 - lot.X0), 1.8);
  s += dim([V.X(lot.hx1), V.Y(Y.house.z0 + 1)], [V.X(lot.X1), V.Y(Y.house.z0 + 1)], 0, mmTxt(lot.X1 - lot.hx1), 1.8);
  s += northArrow(V.X(lot.X1) + 14, V.Y(lot.Z0) + 4) + scaleBar(AREA.x + 4, AREA.y + AREA.h - 6, scale);
  s += text(AREA.x + 2, AREA.y + 4, "LANDSCAPE PLAN", { size: 3.2, anchor: "start", weight: 700 });

  // legend + quantities
  const q = Y.q, lx = AREA.x + AREA.w - 76;
  let ly = AREA.y + 12;
  const row = (sw, label, value) => {
    s += sw(lx, ly - 2.4) + text(lx + 9, ly, label, { size: 2.1, anchor: "start" }) + text(lx + 74, ly, value, { size: 2.1, anchor: "end" });
    ly += 5.2;
  };
  const sw = (fillAttr) => (x, y) => `<rect x="${n2(x)}" y="${n2(y)}" width="7" height="3.4" ${fillAttr} stroke="#333" stroke-width="0.18"/>`;
  s += text(lx, AREA.y + 5, "LEGEND & QUANTITIES", { size: 2.8, anchor: "start", weight: 700 });
  const fenceLm = Object.values(q.fence).reduce((a, b) => a + b, 0);
  if (fenceLm) row((x, y) => `<line x1="${n2(x)}" y1="${n2(y + 1.7)}" x2="${n2(x + 7)}" y2="${n2(y + 1.7)}" stroke="#111" stroke-width="0.6"/><rect x="${n2(x + 3)}" y="${n2(y + 1.1)}" width="1.2" height="1.2" fill="#111"/>`, `Fence ${L.fence === "none" ? "" : L.fence} · ${L.fenceHeightM} m · ${q.gates} gates`, `${fenceLm.toFixed(1)} m`);
  if (q.deck) row(sw(`fill="#e9d6c0"`), "Deck", `${q.deck.toFixed(1)} m²`);
  const paths = Object.values(q.path).reduce((a, b) => a + b, 0);
  if (paths) row(sw(`fill="url(#h-conc)"`), `Paths — ${SURF[L.path] || L.path}`, `${paths.toFixed(1)} m²`);
  if (q.drive) row(sw(`fill="url(#h-conc)"`), `Driveway — ${SURF[L.driveway] || "Concrete"}`, `${q.drive.toFixed(1)} m²`);
  if (q.gravel) row(sw(`fill="url(#h-gravel)"`), "Gravel strips", `${q.gravel.toFixed(1)} m²`);
  if (q.bed) row(sw(`fill="url(#h-mulch)"`), `Garden beds · ${q.plants} plants`, `${q.bed.toFixed(1)} m²`);
  if (q.trees) row((x, y) => `<circle cx="${n2(x + 3.5)}" cy="${n2(y + 1.7)}" r="1.7" fill="none" stroke="#333" stroke-width="0.25" stroke-dasharray="1.2 0.6"/>`, "Feature trees", `${q.trees}`);
  if (q.lawn && L.lawn !== "none") row(sw(`fill="url(#h-lawn)"`), L.lawn === "synthetic" ? "Synthetic turf" : "Turf", `${q.lawn.toFixed(1)} m²`);
  if (q.retaining) row(sw(`fill="#999"`), `Retaining wall ${L.retainingM} m`, `${q.retaining.toFixed(1)} m²`);
  row(sw(`fill="none"`), "Lot", `${((lot.X1 - lot.X0) * (lot.Z1 - lot.Z0)).toFixed(0)} m²`);
  return sheet(info, { number: "L01", title: "Landscape plan", scale: `1:${scale}`, notes: [
    "Set out from the house; confirm boundaries against the survey before fencing.",
    "Before You Dig Australia enquiry before any excavation.",
    "Finished ground 150 mm below the slab edge at soft areas, 50 mm at paving; fall away from the house.",
    "Deck: H4 stumps on concrete pads, H3 frame, stainless fixings; 150 mm clear under bearers.",
    "Fence posts in 20 MPa concrete footings; gates self-closing where required.",
    "Every plant and paver shown is in the cut list & schedule.",
  ] }, s);
}

/* =====================================================================
   SCHEDULES
   ===================================================================== */
function scheduleSheet(S, info) {
  const rows = S.openings.filter((o) => o.mark).sort((a, b) => a.mark.localeCompare(b.mark)).map((o) => [o.mark, o.kind === "window" ? (o.w >= 0.9 && o.w >= o.h * 0.9 ? "Aluminium sliding window" : "Aluminium awning window") : "Solid-core entrance door", `${mmTxt(o.w)} × ${mmTxt(o.h)}`, o.kind === "window" ? `${mmTxt(o.sill)}` : "—", `${o.side[0].toUpperCase()}${o.side.slice(1)} · ${o.floor === 0 ? "Ground" : `Level ${o.floor}`}`, o.kind === "window" ? "Double glazed 4/12/4" : "Laminated sidelight"]);
  const internal = (S.partitions || []).flat().reduce((a, r) => a + (r.doorMarks || []).length, 0);
  if (internal) rows.push(["ID01–", "Hollow-core internal door, pine jamb", "820 × 2040", "—", `${internal} doors`, "—"]);
  if (S.garage) rows.push(["GD1", "Sectional panel-lift garage door + motor", `${mmTxt(S.garage.doorW)} × ${mmTxt(S.garage.doorH)}`, "—", "Garage front", "—"]);
  const head = ["Mark", "Type", "Size (W × H)", "Sill (above FFL)", "Location", "Glazing"];
  const colW = [18, 70, 32, 28, 42, 40];
  let y = AREA.y + 14, s = text(AREA.x + 2, AREA.y + 4, "WINDOW & DOOR SCHEDULE", { size: 3.2, anchor: "start", weight: 700 });
  const drawRow = (cells, bold) => {
    let x = AREA.x + 2;
    cells.forEach((c, i) => { s += text(x + 1.2, y, c, { size: 2.1, anchor: "start", weight: bold ? 700 : 400 }); x += colW[i]; });
    s += `<line x1="${AREA.x + 2}" y1="${y + 1.4}" x2="${AREA.x + 2 + colW.reduce((a, b) => a + b, 0)}" y2="${y + 1.4}" stroke="#999" stroke-width="0.12"/>`;
    y += 4.6;
  };
  drawRow(head, true);
  for (const r of rows.slice(0, 26)) drawRow(r, false);
  // framing summary from the cut list
  const sch = schedule(S.members).filter((r) => r.sys === "wallFrame" || r.sys === "roofFrame" || r.sys === "floorFrame");
  const byProfile = new Map();
  for (const r of sch) if (r.unit === "lm") byProfile.set(r.profile, (byProfile.get(r.profile) || 0) + r.qty);
  let y2 = AREA.y + 14;
  const sx = AREA.x + 240;
  s += text(sx, AREA.y + 4, "FRAMING SUMMARY (lin. m)", { size: 3.2, anchor: "start", weight: 700 });
  for (const [p, q] of [...byProfile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
    s += text(sx + 1, y2, p, { size: 2.1, anchor: "start" }) + text(sx + 140, y2, q.toFixed(1), { size: 2.1, anchor: "end" });
    s += `<line x1="${sx}" y1="${y2 + 1.4}" x2="${sx + 142}" y2="${y2 + 1.4}" stroke="#ccc" stroke-width="0.1"/>`;
    y2 += 4.4;
  }
  return sheet(info, { number: "A09", title: "Schedules", scale: "NTS", notes: ["Full cut list (every piece, every length) in the app: 3D model → Cut list & schedule → Download CSV.", "Sizes are frame sizes; confirm on site before ordering."] }, s);
}

/* =====================================================================
   The set
   ===================================================================== */
export function drawingSet(S, info = {}) {
  const sheets = [];
  for (let f = 0; f < S.env.floors; f++) sheets.push({ id: `plan-${f}`, number: `A0${1 + f}`, title: `${f === 0 ? "Ground" : f === 1 ? "First" : `Level ${f}`} floor plan`, svg: () => floorPlanSheet(S, f, info) });
  const off = S.env.floors - 1;
  const num = (n) => `A${String(n + off).padStart(2, "0")}`;
  sheets.push({ id: "elev-fb", number: num(2), title: "Front & rear elevations", svg: () => elevationsSheet(S, ["front", "back"], info, num(2)) });
  sheets.push({ id: "elev-lr", number: num(3), title: "Side elevations", svg: () => elevationsSheet(S, ["left", "right"], info, num(3)) });
  sheets.push({ id: "section", number: num(4), title: "Section A–A", svg: () => sectionSheet(S, info).replace(">A04<", `>${num(4)}<`) });
  const walls = S.extWalls[0] || [];
  for (let i = 0; i < walls.length; i += 2) {
    const n = num(5 + i / 2);
    sheets.push({ id: `frames-${i}`, number: n, title: `Wall frames ${walls.slice(i, i + 2).map((W) => W.code).join(" & ")}`, svg: () => wallFramesSheet(S, walls.slice(i, i + 2), info, n) });
  }
  const after = 5 + Math.ceil(walls.length / 2);
  sheets.push({ id: "roof", number: num(after), title: "Roof framing & truss detail", svg: () => roofSheet(S, info).replace(">A07<", `>${num(after)}<`) });
  sheets.push({ id: "slab", number: num(after + 1), title: "Slab & footings", svg: () => slabSheet(S, info).replace(">A08<", `>${num(after + 1)}<`) });
  sheets.push({ id: "schedule", number: num(after + 2), title: "Window & door schedule", svg: () => scheduleSheet(S, info).replace(">A09<", `>${num(after + 2)}<`) });
  if (S.landscape) sheets.push({ id: "landscape", number: "L01", title: "Landscape plan", svg: () => landscapeSheet(S, info) });
  return sheets;
}

export { SYSTEMS };
