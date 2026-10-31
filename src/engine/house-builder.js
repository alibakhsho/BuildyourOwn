/* =========================================================================
   MODULE: house-builder.js
   Turns a residential spec into three.js meshes. Every piece — stud, truss,
   bolt, brick, sheet, hinge — comes from src/logic/structure (pure data,
   shared with the drawings and the schedule); this file only hands it to
   the renderer and passes the results back to the engine.
   ========================================================================= */
import { buildStructure } from "../logic/structure/index.js";
import { renderMembers, COLORBOND } from "./structure-render.js";

/**
 * @param {THREE.Group} group  meshes are added here
 * @param {object} spec        the residential estimate spec
 * @param {{detail?: "full"|"lite"}} opts
 */
export function buildHouse(group, spec, opts = {}) {
  const structure = buildStructure(spec, { detail: opts.detail || "full" });
  const { meshes, byId } = renderMembers(group, structure.members, {
    roofColour: COLORBOND[spec.roofColour] ?? COLORBOND.monument,
    trimColour: COLORBOND.surfmist,
    style: spec.interiorStyle || "modern",
  });
  return { waypoints: structure.waypoints, summary: structure.summary, structure, meshes, byId };
}
