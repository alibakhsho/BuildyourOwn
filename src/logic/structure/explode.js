/* =========================================================================
   MODULE: structure/explode.js
   The exploded assembly view, as pure numbers: where every member moves to
   when the building is pulled apart like a joinery drawing.

   Two motions, both from a member's own centre (no three.js here — the
   engine applies them to instance matrices, the tests check them):
     layers  each system lifts off as one layer (frame above slab, trusses
             above frame, sheeting above trusses) and each wall's pieces
             pull straight out from the core with that wall, so the front
             wall's frame, wrap, bricks and windows come away together
     pieces  every centre is scaled away from the middle of the building,
             opening a gap between every stud, brick, batten and screw
             while each piece keeps its true size
   Units: metres. `S` is the explode step, from the building's size.
   ========================================================================= */

/* Lift, in steps, per system. The ground systems stay down so nothing is
   pushed through the ground plane; everything else rises above them. */
const LIFT = {
  site: 0, foundation: 0, drainage: 0, reo: 0.45,
  floorFrame: 1.0, wallFrame: 1.25, electrical: 1.25, plumbing: 1.25, linings: 1.25, interior: 1.05, furniture: 1.05,
  cladding: 1.25, openings: 1.25,
  roofFrame: 2.7, roofing: 3.7, solar: 4.5,
  fencing: 0, decking: 0, paving: 0, garden: 0, lawn: 0, retaining: 0,
};
/* How far a wall's pieces move out from the core, in steps. Linings stay
   inside the frame, the frame next, then cladding, then the glazing. */
const OUT = {
  linings: 0.25, wallFrame: 0.6, electrical: 0.6, plumbing: 0.6, cladding: 1.35, openings: 2.0, roofing: 0.35,
};

export const EXPLODE_SPREAD = 0.22;   // "pieces": centre scale at full explode

/* The explode step for a building of plan size w × l. */
export function explodeStep(w, l) {
  return Math.max(w || 10, l || 10) * 0.12 + 0.6;
}

/* Fixings belong to whatever they hold: hold-downs and wall straps move
   with the frame, truss tie-downs and batten screws with the roof. */
function systemFor(m, c, env) {
  if (m.sys !== "fixings") return m.sys;
  return c[1] > (env.plateY ?? 2.7) - 0.05 ? "roofFrame" : "wallFrame";
}

/**
 * Layer offset of one member at full explode: [dx, dy, dz].
 * @param m   member ({ sys, a, b })
 * @param env { w, l, plateY }
 */
export function explodeOffset(m, env) {
  const c = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2];
  const S = explodeStep(env.w, env.l);
  const sys = systemFor(m, c, env);
  const lift = LIFT[sys] ?? 0;
  // upper storeys rise a little more than lower ones, so floors read apart
  const dy = lift > 0 ? lift * S + Math.max(0, c[1]) * 0.18 : 0;
  const out = OUT[sys] || 0;
  if (!out) return [0, dy, 0];
  // which wall: the side the centre sits nearest, as a share of the half
  // width / length. Outer walls move the full step, inner walls less.
  const nx = c[0] / Math.max(0.5, env.w / 2), nz = c[2] / Math.max(0.5, env.l / 2);
  const ax = Math.abs(nx), az = Math.abs(nz);
  const k = out * S * Math.min(1, Math.max(ax, az));
  return ax >= az ? [Math.sign(nx) * k, dy, 0] : [0, dy, Math.sign(nz) * k];
}

/* Where a member's centre sits at explode amount t (0..1). */
export function explodedCentre(m, env, t, { pieces = false } = {}) {
  const c = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2];
  const o = explodeOffset(m, env);
  const k = pieces ? EXPLODE_SPREAD * t : 0;
  return [c[0] + o[0] * t + c[0] * k, c[1] + o[1] * t + c[1] * k * 0.5, c[2] + o[2] * t + c[2] * k];
}

/* Assemble → hold → explode → hold, as one 0..1 value over a loop of
   `period` seconds (the joinery viewer's rhythm). */
export function explodeCycle(seconds, period = 9) {
  const p = ((seconds % period) + period) % period / period;
  const e = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  if (p < 0.15) return 0;
  if (p < 0.45) return e((p - 0.15) / 0.3);
  if (p < 0.7) return 1;
  return 1 - e((p - 0.7) / 0.3);
}
