/* =========================================================================
   MODULE: engine/export-glb.js — the 3D model as a .glb for Blender.

   Exports what the viewport shows: the building group (every visible layer,
   with its materials and colours) and, when "Your land" is set, the
   satellite ground and lot boundary at true scale. glTF is metres and Y-up;
   Blender's importer turns it Z-up on the way in, so the house arrives the
   right way up and the right size.

   Each piece is named after its building system (frame, roofing, cladding…)
   so Blender's outliner — and Claude driving Blender over MCP — can find
   "the roof" without guessing. The engine's userData (picking indexes,
   x-ray clones) is not exported: it is runtime state, not model data.

   Lazy-loaded: the exporter is only fetched when someone clicks export.
   ========================================================================= */
import * as THREE from "three";

const SYS_NAME = (o) => {
  const u = o.userData || {};
  return [u.sys, u.zone, u.kind || u.member || u.mark].filter((v) => typeof v === "string" && v).join(" · ");
};

/**
 * @param engine  the live Engine3D
 * @param opts    { includeSite = true, projectName }
 * @returns {Promise<Blob>} model/gltf-binary
 */
export async function exportGlb(engine, { includeSite = true, projectName = "BuildYourOwn model" } = {}) {
  if (!engine?.buildingGroup) throw new Error("The 3D model isn't ready yet.");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");

  const roots = [engine.buildingGroup];
  const site = engine._siteImg?.group;
  if (includeSite && site?.visible) roots.push(site);

  // name every piece by its system, and keep runtime userData out of the file
  const saved = [];
  for (const root of roots) {
    root.traverse((o) => {
      const prevName = o.name;
      if (!o.name) {
        const n = SYS_NAME(o);
        if (n) o.name = n;
      }
      saved.push([o, o.userData, prevName]);
      o.userData = {};
    });
  }
  const prevGroupName = engine.buildingGroup.name;
  engine.buildingGroup.name = projectName;
  // hold the render loop while the file is written: each frame would
  // otherwise run between the exporter's async steps and on a slow GPU
  // stretch a few-second export into most of a minute
  const wasPaused = !!engine.paused;
  engine.setPaused?.(true);
  try {
    const out = await new GLTFExporter().parseAsync(roots, {
      binary: true,
      onlyVisible: true,     // hidden layers stay out — export what you see
      maxTextureSize: 2048,
      includeCustomExtensions: false,
    });
    return new Blob([out], { type: "model/gltf-binary" });
  } finally {
    for (const [o, ud, name] of saved) { o.userData = ud; o.name = name; }
    engine.buildingGroup.name = prevGroupName;
    if (!wasPaused) engine.setPaused?.(false);
  }
}

/** A ready prompt for Claude with the Blender MCP server connected (docs/BLENDER.md). */
export function blenderPrompt({ fileName, spec = {}, land = null }) {
  const where = land?.address ? ` It sits on ${land.address}${land.lot ? ` (lot ${land.lot.areaM2} m²)` : ""}; the "Satellite ground" plane is the real block at true scale, and "Lot boundary" is its title boundary.` : "";
  const size = spec.widthM && spec.lengthM ? ` The house is about ${spec.widthM} × ${spec.lengthM} m, ${spec.floors || 1} storey${(spec.floors || 1) > 1 ? "s" : ""}.` : "";
  return `I exported my house from BuildYourOwn as ${fileName} (glTF binary, metres). Objects are named by building system (frame, roofing, cladding, openings, landscape…).${size}${where}

Using the Blender tools:
1. Start a clean scene and import ${fileName} from my Downloads folder. Check the scale is metres and the house sits on the ground.
2. Keep every material's colour, but make them read as real: brick/render/cladding rough, roof sheeting slightly metallic, glass transmissive.
3. Add a sun for a mid-afternoon summer sun in Australia and a sky texture for the background.
4. Put a 35 mm camera at eye height (1.6 m) on the street side, looking at the front of the house, plus a second camera high over the back corner.
5. Render both at 1920×1080 with Cycles and save them as PNGs next to the .glb.
Tell me what you changed, and ask before deleting anything that came in with the file.`;
}
