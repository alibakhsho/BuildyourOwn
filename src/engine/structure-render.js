/* =========================================================================
   MODULE: structure-render.js
   Draws the member list from logic/structure as three.js meshes.

   Repeated pieces (studs, bricks, bolts, screws, tiles…) are InstancedMesh
   — one draw call per system × shape × material — so 20 000+ real pieces
   render smoothly. Large sheets and volumes (plasterboard, slab, render,
   flooring) are individual meshes with metre-scale UVs so their textures
   keep true size.

   Every mesh carries userData:
     sys, stage  — layer + construction stage (for toggles and the build
                   animation, which reveals instances in construction order)
     skin        — hides the structure in the frame view
     memberIds   — instanceId → member id (picking)
   ========================================================================= */
import * as THREE from "three";
import { basis, STAGE_OF } from "../logic/structure/model.js";
import {
  worldBox, concreteTexture, timberFloorTexture, pineTexture, lvlTexture, particleboardTexture, insulationTexture,
  wrapTexture, pvTexture, garageDoorTexture, brickFaceTexture, mortarTexture, carpetTexture, floorTileTexture,
  brickTexture, renderTexture, weatherboardTexture, corrugatedNormalMap, grassTexture, gravelTexture, normalFromTexture, usePbr,
} from "./materials3d.js";

/* ---------- unit geometries: X = length, Y = d (along up), Z = w ---------- */
const GEO = {};
function extrudeAlongX(shape, steps = 1) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps });
  g.rotateY(Math.PI / 2);            // extrusion (+Z) → +X ; shape x → -Z
  g.translate(-0.5, 0, 0);
  g.computeVertexNormals();
  return g;
}
export function unitGeometry(shape) { return geometry(shape); }
function geometry(shape) {
  if (GEO[shape]) return GEO[shape];
  let g;
  switch (shape) {
    case "cyl": g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1); g.rotateZ(-Math.PI / 2); break;
    case "hex": g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1); g.rotateZ(-Math.PI / 2); break;
    case "channel": {
      // lipped C: web on -Z, flanges top/bottom, lips back in on +Z
      const s = new THREE.Shape(), tw = 0.07, tf = 0.05, lip = 0.22;
      s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, -0.5 + lip); s.lineTo(0.5 - tw, -0.5 + lip); s.lineTo(0.5 - tw, -0.5 + tf);
      s.lineTo(-0.5 + tw, -0.5 + tf); s.lineTo(-0.5 + tw, 0.5 - tf); s.lineTo(0.5 - tw, 0.5 - tf); s.lineTo(0.5 - tw, 0.5 - lip);
      s.lineTo(0.5, 0.5 - lip); s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5); s.closePath();
      g = extrudeAlongX(s); break;
    }
    case "tophat": {
      const s = new THREE.Shape(), t = 0.08;
      s.moveTo(-0.5, -0.5); s.lineTo(-0.3, -0.5); s.lineTo(-0.3, 0.5 - t); s.lineTo(0.3, 0.5 - t); s.lineTo(0.3, -0.5); s.lineTo(0.5, -0.5);
      s.lineTo(0.5, -0.5 + t); s.lineTo(0.3 + t, -0.5 + t); s.lineTo(0.3 + t, 0.5); s.lineTo(-0.3 - t, 0.5); s.lineTo(-0.3 - t, -0.5 + t); s.lineTo(-0.5, -0.5 + t); s.closePath();
      g = extrudeAlongX(s); break;
    }
    case "gutter": {
      const s = new THREE.Shape(), t = 0.06;
      s.moveTo(-0.5, 0.5); s.lineTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, 0.42); s.lineTo(0.42, 0.42); s.lineTo(0.42, 0.36);
      s.lineTo(0.5 - t, 0.36); s.lineTo(0.5 - t, -0.5 + t); s.lineTo(-0.5 + t, -0.5 + t); s.lineTo(-0.5 + t, 0.5); s.closePath();
      g = extrudeAlongX(s); break;
    }
    case "tile": {
      // a profiled concrete tile: two rolls across its width
      const s = new THREE.Shape(), n = 24;
      for (let i = 0; i <= n; i++) { const z = -0.5 + i / n; const y = -0.1 + 0.55 * Math.abs(Math.sin(Math.PI * 2 * (z + 0.5))); i ? s.lineTo(z, y) : s.moveTo(z, y); }
      for (let i = n; i >= 0; i--) { const z = -0.5 + i / n; const y = -0.5 + 0.55 * Math.abs(Math.sin(Math.PI * 2 * (z + 0.5))); s.lineTo(z, y); }
      s.closePath();
      g = extrudeAlongX(s); break;
    }
    case "corrugated": g = new THREE.BoxGeometry(1, 1, 1); break;   // ribs come from the normal map
    case "shrub": g = new THREE.IcosahedronGeometry(0.5, 1); break;   // plants: a soft lumpy ball, stretched to size
    case "tri": {
      const s = new THREE.Shape();
      s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0, 0.5); s.closePath();
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      break;
    }
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  GEO[shape] = g;
  return g;
}

/* ---------- materials ---------- */
const MAT_CACHE = new Map();
const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, ...o });
export const COLORBOND = {
  colorbond: 0x4a4f56, monument: 0x323233, surfmist: 0xe4e2d5, woodland: 0x5b6356, basalt: 0x6d6c6e, dune: 0xb1ada3, jasper: 0x6c6153,
};
function makeMaterial(key, opts) {
  switch (key) {
    case "pine": return usePbr(std({ map: pineTexture(), roughness: 0.72 }), "pine", { normal: 0.35 });
    case "lvl": return usePbr(std({ map: lvlTexture(), roughness: 0.68 }), "lvl", { normal: 0.35 });
    case "timberStair": return std({ map: lvlTexture(), color: 0xb98a55, roughness: 0.55 });
    case "timberDark": return std({ color: 0x6b4428, roughness: 0.6 });
    case "steelFrame": return std({ color: 0xb9c3cc, metalness: 0.65, roughness: 0.38 });
    case "steelPaint": return std({ color: 0x5d646c, metalness: 0.5, roughness: 0.5 });
    case "galv": return std({ color: 0xc8ced3, metalness: 0.8, roughness: 0.3 });
    case "darkSteel": return std({ color: 0x3b3f44, metalness: 0.7, roughness: 0.45 });
    case "rebar": return std({ color: 0x6b4a36, metalness: 0.5, roughness: 0.7 });
    case "chrome": return std({ color: 0xe6e9ec, metalness: 0.65, roughness: 0.28 });
    case "concrete": return usePbr(std({ map: concreteTexture(), normalMap: normalFromTexture(concreteTexture(), 0.8), roughness: 0.95 }), "concrete", { normal: 0.5 });
    case "membrane": return std({ color: 0x1c1f22, roughness: 0.4 });
    case "brick": return std({ map: brickFaceTexture(), roughness: 0.9 });
    case "brickTex": return std({ map: brickTexture(), normalMap: normalFromTexture(brickTexture(), 2.2, { invert: true }), roughness: 0.88 });
    case "mortar": return std({ map: mortarTexture(), roughness: 1 });
    case "fcSheet": return std({ color: 0xece6d6, roughness: 0.85 });
    case "render": return usePbr(std({ map: renderTexture(), normalMap: normalFromTexture(renderTexture(), 0.9), roughness: 0.92 }), "render", { normal: 0.35 });
    case "weatherboard": return std({ map: weatherboardTexture(), normalMap: normalFromTexture(weatherboardTexture(), 2.4), color: 0xf2efe8, roughness: 0.7 });
    case "trim": return std({ color: opts.trim ?? 0xe4e2d5, metalness: 0.3, roughness: 0.45 });
    case "colorbond": return std({ color: opts.roof ?? COLORBOND.colorbond, metalness: 0.55, roughness: 0.4 });
    case "colorbondSheet": return std({ color: opts.roof ?? COLORBOND.colorbond, metalness: 0.6, roughness: 0.38, envMapIntensity: 1.1, normalMap: corrugatedNormalMap(), normalScale: new THREE.Vector2(1, 1) });
    case "colorbondScrew": return std({ color: opts.roof ?? COLORBOND.colorbond, metalness: 0.6, roughness: 0.35 });
    case "tile": return std({ color: 0x8a4a35, roughness: 0.82 });
    case "foil": return std({ color: 0xd8dde2, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide });
    case "alu": return std({ color: 0x2b2f33, metalness: 0.6, roughness: 0.35 });
    case "glass": return new THREE.MeshPhysicalMaterial({ color: 0xbfd9e8, transparent: true, opacity: 0.28, roughness: 0.03, metalness: 0, reflectivity: 0.9, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, depthWrite: false });
    case "flyscreen": return std({ color: 0x222628, transparent: true, opacity: 0.35, depthWrite: false });
    case "doorExt": return std({ color: 0x5a3a24, roughness: 0.5 });
    case "doorInt": return std({ color: 0xf5f3ee, roughness: 0.6 });
    case "paintWhite": return std({ color: 0xf6f4ef, roughness: 0.6 });
    case "garageDoor": return std({ map: garageDoorTexture(), metalness: 0.3, roughness: 0.5 });
    case "plasterboard": return std({ color: 0xf3f1ec, roughness: 0.95 });
    case "insulation": return std({ map: insulationTexture(), roughness: 1, transparent: true, opacity: 0.92 });
    case "wrap": return std({ map: wrapTexture(), roughness: 0.8 });
    case "particleboard": return std({ map: particleboardTexture(), roughness: 0.85 });
    case "floorTimber": return usePbr(std({ map: timberFloorTexture(), normalMap: normalFromTexture(timberFloorTexture(), 1.2), roughness: 0.5 }), "oakfloor", { normal: 0.4 });
    case "floorTile": return usePbr(std({ map: floorTileTexture(), normalMap: normalFromTexture(floorTileTexture(), 1.5), roughness: 0.28 }), "porcelain", { normal: 0.35 });
    case "carpet": return usePbr(std({ map: carpetTexture(), roughness: 1 }), "carpet", { normal: 0.5 });
    case "joinery": return std({ color: 0xf2efe9, roughness: 0.45 });
    case "stone": return std({ color: 0xe9e7e2, roughness: 0.25 });
    case "ceramic": return std({ color: 0xffffff, roughness: 0.15 });
    case "mirror": return std({ color: 0xd9e3ea, metalness: 0.7, roughness: 0.08, envMapIntensity: 1.4 });
    case "black": return std({ color: 0x151617, roughness: 0.3, metalness: 0.3 });
    case "plasticGrey": return std({ color: 0x9aa0a6, roughness: 0.6 });
    case "pipeCold": return std({ color: 0x2f6fd0, roughness: 0.45 });
    case "pipeHot": return std({ color: 0xc8332b, roughness: 0.45 });
    case "pvcGrey": return std({ color: 0x8c9296, roughness: 0.55 });
    case "pvcWhite": return std({ color: 0xe8e8e2, roughness: 0.5 });
    case "cableGrey": return std({ color: 0xd7d7d2, roughness: 0.7 });
    case "cableBlue": return std({ color: 0x3a7bd5, roughness: 0.6 });
    case "lightLens": return std({ color: 0xfff7e0, emissive: 0xfff1c8, emissiveIntensity: 0.6, roughness: 0.3 });
    case "pvPanel": return std({ map: pvTexture(), metalness: 0.45, roughness: 0.22 });
    // the yard
    case "turf": return usePbr(std({ map: grassTexture(), color: 0xa9d27a, roughness: 1 }), "lawn", { normal: 0.45, tint: 0xffffff });   // a mown lawn, greener than the paddock around it
    case "gravel": return usePbr(std({ map: gravelTexture(), roughness: 1 }), "gravel", { normal: 0.7 });
    case "pebble": return std({ map: gravelTexture(), color: 0xb8b4ab, roughness: 0.95 });
    case "mulch": return usePbr(std({ map: gravelTexture(), color: 0x7a5534, roughness: 1 }), "mulch", { normal: 0.7, tint: 0xffffff });
    case "soil": return std({ map: gravelTexture(), color: 0x6b5442, roughness: 1 });
    case "exposedAgg": return usePbr(std({ map: gravelTexture(), color: 0xd6d2c8, roughness: 0.85 }), "exposedagg", { normal: 0.6, tint: 0xffffff });
    case "paver": return std({ color: 0xd2ccbf, roughness: 0.85 });
    case "sleeper": return std({ map: concreteTexture(), color: 0xc9c4ba, roughness: 0.9 });
    case "merbau": return usePbr(std({ color: 0x8a4b2d, roughness: 0.55 }), "merbau", { normal: 0.3, tint: 0xffffff });
    case "deckPine": return std({ map: pineTexture(), color: 0xc9d2a4, roughness: 0.7 });
    case "composite": return std({ color: 0x7d746a, roughness: 0.65 });
    case "fenceSheet": return std({ color: COLORBOND.woodland, metalness: 0.45, roughness: 0.45, normalMap: corrugatedNormalMap(), normalScale: new THREE.Vector2(0.8, 0.8) });
    case "fenceSteel": return std({ color: COLORBOND.woodland, metalness: 0.5, roughness: 0.42 });
    case "leaf": return std({ color: 0xffffff, roughness: 0.95, flatShading: true });
    case "leafGrass": return std({ color: 0xffffff, roughness: 0.95, flatShading: true });
    case "trunk": return std({ color: 0x6b5236, roughness: 1 });
    // furniture & styling, coloured by the interior style
    case "furnFabric": return std({ color: STYLE_TONES[opts.style]?.fabric ?? STYLE_TONES.modern.fabric, roughness: 0.95 });
    case "furnAccent": return std({ color: 0xffffff, roughness: 0.9 });
    case "furnWood": return std({ map: lvlTexture(), color: STYLE_TONES[opts.style]?.wood ?? STYLE_TONES.modern.wood, roughness: 0.6 });
    case "furnDark": return std({ color: STYLE_TONES[opts.style]?.dark ?? STYLE_TONES.modern.dark, roughness: 0.5, metalness: 0.2 });
    case "linen": return std({ color: STYLE_TONES[opts.style]?.linen ?? STYLE_TONES.modern.linen, roughness: 1 });
    case "rug": return std({ color: STYLE_TONES[opts.style]?.rug ?? STYLE_TONES.modern.rug, roughness: 1 });
    case "curtain": return std({ color: STYLE_TONES[opts.style]?.linen ?? 0xf2efe9, roughness: 1, transparent: true, opacity: 0.82 });
    case "artwork": return std({ color: 0xffffff, roughness: 0.7 });
    case "lampShade": return std({ color: 0xfff4dc, emissive: 0xffd9a0, emissiveIntensity: 0.45, roughness: 0.8 });
    case "carPaint": return new THREE.MeshPhysicalMaterial({ color: STYLE_TONES[opts.style]?.car ?? 0x2b3a4a, metalness: 0.7, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    default: return std({ color: 0xcccccc });
  }
}
function material(key, opts) {
  const k = `${key}|${opts.roof ?? ""}|${opts.trim ?? ""}|${opts.style ?? ""}`;
  if (!MAT_CACHE.has(k)) MAT_CACHE.set(k, makeMaterial(key, opts));
  return MAT_CACHE.get(k);
}

/* Sheets whose textures must keep their real size: individual meshes. */
const WORLD_UV = new Set(["concrete", "wrap", "insulation", "mortar", "render", "brickTex", "floorTimber", "floorTile", "carpet", "particleboard", "weatherboard",
  "turf", "gravel", "pebble", "mulch", "soil", "exposedAgg", "sleeper"]);
const NO_SHADOW = new Set(["screw", "tie", "nailplate", "nut", "washer", "hinge", "rose", "lever", "deadlock", "clamp", "bar", "rug", "book", "art"]);
/* Pieces too small to see from across the site: drawn only when the camera
   is close (engine3D toggles them), so a distant view isn't speckled. */
const FINE = new Set(["screw", "tie", "nailplate", "nut", "washer", "hinge", "rose", "lever", "deadlock", "clamp", "bracket", "hanger"]);

/* For the CAD-line pass: the member axis that is the surface normal of the
   wall / roof plane these pieces make up. */
const FLAT_AXIS = { brick: "z", board: "z", tile: "y", corrugated: "y", screw: "x" };

/* Brick tints: a blend of fired-clay tones per brick. */
const BRICK_TONES = [0xb1603f, 0xa4553a, 0x9a4b33, 0xb86b48, 0x8f4630, 0xa85a3c, 0xc0714d].map((c) => new THREE.Color(c));
const TILE_TONES = [0x8a4a35, 0x7f4231, 0x93513a, 0x844634, 0x8d4c36].map((c) => new THREE.Color(c));
/* Interior styles (logic/structure/furniture.js INTERIOR_STYLES). */
export const STYLE_TONES = {
  modern:  { fabric: 0x8d9096, wood: 0xc8a27a, dark: 0x2e2f33, linen: 0xf2efe9, rug: 0xd9d3c7, car: 0x2b3a4a, accent: [0x3b4a5c, 0xc9a227, 0x8d9096, 0x2e2f33] },
  coastal: { fabric: 0xe4e8ea, wood: 0xd8c3a0, dark: 0x5a6b75, linen: 0xffffff, rug: 0xe8e0cf, car: 0xe8ecef, accent: [0x3f6f8f, 0x9cc3d5, 0xe8dcc0, 0x2f4f6a] },
  warm:    { fabric: 0xa8715a, wood: 0x7a5232, dark: 0x3a2a20, linen: 0xf3eadc, rug: 0xc9b08f, car: 0x5a2f22, accent: [0x6b7f4e, 0xc0773f, 0xe2c69b, 0x8a4b2d] },
  scandi:  { fabric: 0xb9bcbe, wood: 0xe2c9a1, dark: 0x4a4d52, linen: 0xfafafa, rug: 0xeeeae2, car: 0xd9dcdf, accent: [0xe0b46a, 0x7d8b6a, 0xd9d3c7, 0x4a4d52] },
};
const ART_TONES = [0xc56a4a, 0x3f6f8f, 0xe0b46a, 0x7d8b6a, 0x2e2f33, 0xd9d3c7, 0x9b4f6a].map((c) => new THREE.Color(c));
const LEAF_TONES = [0x5e7f4a, 0x6f8f57, 0x4f6e43, 0x7c9a63, 0x6a8a5c, 0x86a06a].map((c) => new THREE.Color(c));
const GRASS_TONES = [0x7f9a5c, 0x8ea866, 0x6d8a52, 0x99ad6e].map((c) => new THREE.Color(c));
const PAVER_TONES = [0xffffff, 0xf2efe8, 0xe7e2d8, 0xfaf7f0].map((c) => new THREE.Color(c));
const WOOD_TONES = [0xffffff, 0xefe6dc, 0xf7efe6, 0xe5dacd].map((c) => new THREE.Color(c));
const pick = (tones, t) => tones[Math.floor((t ?? 0) * tones.length) % tones.length];
const tintColor = (m, style) => {
  if (m.mat === "furnAccent") return new THREE.Color((STYLE_TONES[style] || STYLE_TONES.modern).accent[Math.floor((m.tint ?? 0) * 4) % 4]);
  if (m.mat === "artwork") return pick(ART_TONES, m.tint);
  if (m.mat === "leaf") return pick(LEAF_TONES, m.tint);
  if (m.mat === "leafGrass") return pick(GRASS_TONES, m.tint);
  if (m.mat === "paver") return pick(PAVER_TONES, m.tint);
  if ((m.mat === "merbau" || m.mat === "composite" || m.mat === "deckPine") && m.tint != null) return pick(WOOD_TONES, m.tint);
  if (m.mat === "brick") return BRICK_TONES[Math.floor((m.tint ?? 0) * BRICK_TONES.length) % BRICK_TONES.length];
  if (m.mat === "tile") return TILE_TONES[Math.floor((m.tint ?? 0) * TILE_TONES.length) % TILE_TONES.length];
  return null;
};

const _m = new THREE.Matrix4();
export function memberMatrix(m, out = new THREE.Matrix4()) {
  const { X, Y, Z } = basis(m);
  const L = m.len;
  const cx = (m.a[0] + m.b[0]) / 2, cy = (m.a[1] + m.b[1]) / 2, cz = (m.a[2] + m.b[2]) / 2;
  out.set(
    X[0] * L, Y[0] * m.d, Z[0] * m.w, cx,
    X[1] * L, Y[1] * m.d, Z[1] * m.w, cy,
    X[2] * L, Y[2] * m.d, Z[2] * m.w, cz,
    0, 0, 0, 1,
  );
  return out;
}

/**
 * Add every member to `group`. opts = { roofColour, trimColour }.
 * Returns { meshes, byId } — byId: member id → { mesh, instance }.
 */
export function renderMembers(group, members, opts = {}) {
  const matOpts = { roof: opts.roofColour, trim: opts.trimColour, style: opts.style || "modern" };
  const buckets = new Map();
  const meshes = [];
  const byId = new Map();
  const white = new THREE.Color(1, 1, 1);

  for (const m of members) {
    if (m.noRender) continue;       // quantities only (dig-out, road base, mesh, oil …)
    if (WORLD_UV.has(m.mat) && (m.shape || "box") === "box") {
      const geo = worldBox(m.len, m.d, m.w);
      const mesh = new THREE.Mesh(geo, material(m.mat, matOpts));
      const { X, Y, Z } = basis(m);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z)));
      mesh.position.set((m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2);
      mesh.castShadow = m.sys !== "interior"; mesh.receiveShadow = true;
      mesh.userData = { sys: m.sys, stage: STAGE_OF[m.sys], skin: !!m.skin, zone: m.zone || null, memberIds: [m.id], single: true };
      group.add(mesh);
      meshes.push(mesh);
      byId.set(m.id, { mesh, instance: -1 });
      continue;
    }
    const key = `${m.sys}|${m.shape || "box"}|${m.mat}|${m.skin ? 1 : 0}|${m.zone || ""}|${FINE.has(m.kind) ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) { b = { sys: m.sys, shape: m.shape || "box", mat: m.mat, skin: !!m.skin, zone: m.zone || null, list: [] }; buckets.set(key, b); }
    b.list.push(m);
  }

  for (const b of buckets.values()) {
    const matKey = b.shape === "corrugated" ? "colorbondSheet" : b.mat;
    const mesh = new THREE.InstancedMesh(geometry(b.shape), material(matKey, matOpts), b.list.length);
    const ids = new Int32Array(b.list.length);
    b.list.forEach((m, i) => {
      mesh.setMatrixAt(i, memberMatrix(m, _m));
      mesh.setColorAt(i, tintColor(m, opts.style) || white);
      ids[i] = m.id;
      byId.set(m.id, { mesh, instance: i });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const small = NO_SHADOW.has(b.list[0].kind);
    mesh.castShadow = !small && b.mat !== "glass" && b.mat !== "flyscreen";
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;      // instances span the site; per-mesh culling would pop
    mesh.userData = { sys: b.sys, stage: STAGE_OF[b.sys], skin: b.skin, zone: b.zone, memberIds: ids, total: b.list.length, instanced: true,
      // CAD lines: repeated cladding pieces draw as one surface (no line per brick)
      flatAxis: FLAT_AXIS[b.shape] || FLAT_AXIS[b.list[0].kind] || null,
      fine: b.list.every((m) => FINE.has(m.kind)) };
    group.add(mesh);
    meshes.push(mesh);
  }
  return { meshes, byId };
}

/* Re-colour one member (selection highlight); returns a restore function. */
export function highlightMember(hit, color = 0xf5c518) {
  if (!hit) return () => {};
  const { mesh, instance } = hit;
  if (instance < 0) {
    const prev = mesh.material;
    const hl = prev.clone(); hl.color = new THREE.Color(color); hl.emissive = new THREE.Color(color); hl.emissiveIntensity = 0.25;
    mesh.material = hl;
    return () => { mesh.material = prev; hl.dispose(); };
  }
  if (!mesh.instanceColor) return () => {};
  const prev = new THREE.Color();
  mesh.getColorAt(instance, prev);
  mesh.setColorAt(instance, new THREE.Color(color));
  mesh.instanceColor.needsUpdate = true;
  return () => { mesh.setColorAt(instance, prev); mesh.instanceColor.needsUpdate = true; };
}
