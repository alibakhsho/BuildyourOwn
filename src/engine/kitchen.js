/* =========================================================================
   MODULE: kitchen.js
   Lays out a kitchen as real cabinetry, module by module: each base
   cabinet is a carcass + kickboard + door(s) or a drawer bank + handles;
   one continuous benchtop and splashback over the run; overhead cupboards
   above; an island when the kitchen config asks for one and the room fits.

   Pure layout in kitchen coordinates — u along the run, v out from the wall
   into the room, y up from the floor. The house builder maps these into the
   room and makes each piece a mesh, so every door front, drawer, handle and
   carcass is its own selectable part, grouped by cabinet.
   ========================================================================= */

const KICK = 0.15, BASE_H = 0.72, DEPTH = 0.58, TOP_T = 0.04, TOP_D = 0.62;
const FRONT_T = 0.018, GAP = 0.003;
const WALL_Y0 = 1.5, WALL_H = 0.72, WALL_D = 0.33;

/* Split a run into 600-ish modules: a 900 sink cabinet in the middle, the
   rest 600 (a remainder of 300–600 becomes one narrow module). */
function modules(len, withSink = true) {
  const out = [];
  let left = len;
  const sink = withSink && len >= 2.4 ? 0.9 : 0;
  left -= sink;
  const n = Math.max(0, Math.floor(left / 0.6));
  let rem = left - n * 0.6;
  const widths = Array(n).fill(0.6);
  if (rem >= 0.3) widths.push(rem); else if (widths.length) widths[widths.length - 1] += rem;
  if (sink) widths.splice(Math.floor(widths.length / 2), 0, sink);
  let u = 0;
  widths.forEach((w, i) => { out.push({ u0: u, w, sink: sink && w === sink && i === Math.floor((widths.length - 1) / 2) }); u += w; });
  return out;
}

/**
 * @param runLen  usable wall length for the run (m)
 * @param config  the spec's kitchen entry ({ benchLengthM, island, ... })
 * @param roomDepth  room depth out from the run wall (m) — decides the island
 * @param opts    { sink = true, name = "" } — a second run of an L or galley
 *                kitchen has no sink; name prefixes its groups ("Run 2")
 * @returns [{ kind, cat, label, group, groupLabel, u, y, v, su, sy, sv }]
 *          centres + sizes in kitchen coordinates
 */
export function layoutKitchen(runLen, config = {}, roomDepth = 4, { sink = true, name = "" } = {}) {
  const len = Math.max(1.2, Math.min(runLen, +config.benchLengthM || runLen));
  const parts = [];
  const pre = name ? `${name} · ` : "";
  const P = (o) => parts.push(o.groupLabel ? { ...o, groupLabel: pre + o.groupLabel } : o);

  const cabinet = (id, label, u0, w, v0, depthDir = 1, opts = {}) => {
    const g = { group: id, groupLabel: label };
    const vC = v0 + depthDir * DEPTH / 2;
    const frontV = v0 + depthDir * (DEPTH + FRONT_T / 2);
    P({ kind: "kickboard", cat: "carcass", label: "Kickboard", ...g, u: u0 + w / 2, y: KICK / 2, v: v0 + depthDir * (DEPTH - 0.05), su: w, sy: KICK, sv: 0.016 });
    P({ kind: "carcass", cat: "carcass", label: "Carcass", ...g, u: u0 + w / 2, y: KICK + BASE_H / 2, v: vC, su: w - 0.002, sy: BASE_H, sv: DEPTH });
    const fy0 = KICK + GAP, fy1 = KICK + BASE_H - GAP;
    const handle = (u, y, vertical) => P({ kind: "handle", cat: "handle", label: "Handle", ...g, u, y, v: frontV + depthDir * 0.02, su: vertical ? 0.012 : 0.16, sy: vertical ? 0.16 : 0.012, sv: 0.025 });
    if (opts.drawers) {
      const hs = [0.18, 0.25, 0.29];                          // top drawer shallow, deep pot drawers below
      const total = hs.reduce((a, b) => a + b, 0), scale = (fy1 - fy0) / total;
      let y = fy1;
      hs.forEach((h, i) => {
        const hh = h * scale;
        P({ kind: "drawer-front", cat: "cabinet", label: `Drawer front ${i + 1}`, ...g, u: u0 + w / 2, y: y - hh / 2, v: frontV, su: w - 2 * GAP, sy: hh - 2 * GAP, sv: FRONT_T });
        handle(u0 + w / 2, y - 0.05, false);
        y -= hh;
      });
    } else {
      const doors = w > 0.65 ? 2 : 1;
      const dw = (w - (doors + 1) * GAP) / doors;
      for (let d = 0; d < doors; d++) {
        const u = u0 + GAP + dw / 2 + d * (dw + GAP);
        P({ kind: "door-front", cat: "cabinet", label: doors > 1 ? `Door ${d ? "right" : "left"}` : "Door", ...g, u, y: (fy0 + fy1) / 2, v: frontV, su: dw, sy: fy1 - fy0, sv: FRONT_T });
        const hu = doors > 1 ? (d ? u - dw / 2 + 0.05 : u + dw / 2 - 0.05) : u + dw / 2 - 0.05;
        handle(hu, fy1 - 0.12, true);
      }
    }
  };

  // ---- base run against the wall ----
  const mods = modules(len, sink);
  let drawerToggle = true;
  mods.forEach((md, i) => {
    const drawers = !md.sink && drawerToggle;
    if (!md.sink) drawerToggle = !drawerToggle;
    const name = md.sink ? "Sink cabinet" : drawers ? "Drawer bank" : "Base cupboard";
    cabinet(`base-${i}`, `${name} ${Math.round(md.w * 1000)}`, md.u0, md.w, 0, 1, { drawers });
  });
  P({ kind: "benchtop", cat: "benchtop", label: "Benchtop", group: "benchtop", groupLabel: "Benchtop", u: len / 2, y: KICK + BASE_H + TOP_T / 2, v: TOP_D / 2, su: len, sy: TOP_T, sv: TOP_D });
  P({ kind: "splashback", cat: "splashback", label: "Splashback", group: "splashback", groupLabel: "Splashback", u: len / 2, y: KICK + BASE_H + TOP_T + (WALL_Y0 - KICK - BASE_H - TOP_T) / 2, v: 0.006, su: len, sy: WALL_Y0 - KICK - BASE_H - TOP_T, sv: 0.012 });

  // ---- overhead cupboards (skip over the sink window zone) ----
  mods.forEach((md, i) => {
    if (md.sink) return;
    const g = { group: `wall-${i}`, groupLabel: `Overhead cupboard ${Math.round(md.w * 1000)}` };
    P({ kind: "carcass", cat: "carcass", label: "Overhead carcass", ...g, u: md.u0 + md.w / 2, y: WALL_Y0 + WALL_H / 2, v: WALL_D / 2, su: md.w - 0.002, sy: WALL_H, sv: WALL_D });
    P({ kind: "wall-cabinet-door", cat: "cabinet", label: "Overhead door", ...g, u: md.u0 + md.w / 2, y: WALL_Y0 + WALL_H / 2, v: WALL_D + FRONT_T / 2, su: md.w - 2 * GAP, sy: WALL_H - 2 * GAP, sv: FRONT_T });
    P({ kind: "handle", cat: "handle", label: "Handle", ...g, u: md.u0 + md.w / 2, y: WALL_Y0 + 0.05, v: WALL_D + FRONT_T + 0.02, su: 0.16, sy: 0.012, sv: 0.025 });
  });

  // ---- island: back-to-back cabinets facing the run, overhanging top ----
  const aisle = 1.1, islandDepth = DEPTH * 2 + 0.06;
  if (config.island && roomDepth >= TOP_D + aisle + islandDepth + 0.9) {
    const iLen = Math.min(len, 2.4);
    const iu0 = (len - iLen) / 2;
    const v0 = TOP_D + aisle + DEPTH; // working face of the island looks back at the run
    const n = Math.max(1, Math.round(iLen / 0.6)), w = iLen / n;
    for (let i = 0; i < n; i++) cabinet(`island-${i}`, `Island cupboard ${i + 1}`, iu0 + i * w, w, v0, -1, { drawers: i % 2 === 0 });
    P({ kind: "carcass", cat: "carcass", label: "Island back panel", group: "island-back", groupLabel: "Island back", u: iu0 + iLen / 2, y: KICK / 2 + (KICK + BASE_H) / 2 - KICK / 2, v: v0 + 0.009, su: iLen, sy: KICK + BASE_H, sv: 0.018 });
    P({ kind: "benchtop", cat: "benchtop", label: "Island benchtop", group: "island-top", groupLabel: "Island benchtop", u: iu0 + iLen / 2, y: KICK + BASE_H + TOP_T / 2, v: v0 - DEPTH / 2 + 0.15, su: iLen + 0.1, sy: TOP_T, sv: DEPTH + 0.36 });
  }
  return { parts, len };
}
