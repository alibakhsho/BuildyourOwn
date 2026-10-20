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
  brickTexture, renderTexture, weatherboardTexture, corrugatedNormalMap,
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
    case "pine": return std({ map: pineTexture(), roughness: 0.75 });
    case "lvl": return std({ map: lvlTexture(), roughness: 0.7 });
    case "timberStair": return std({ map: lvlTexture(), color: 0xb98a55, roughness: 0.55 });
    case "timberDark": return std({ color: 0x6b4428, roughness: 0.6 });
    case "steelFrame": return std({ color: 0xb9c3cc, metalness: 0.65, roughness: 0.38 });
    case "steelPaint": return std({ color: 0x5d646c, metalness: 0.5, roughness: 0.5 });
    case "galv": return std({ color: 0xc8ced3, metalness: 0.8, roughness: 0.3 });
    case "darkSteel": return std({ color: 0x3b3f44, metalness: 0.7, roughness: 0.45 });
    case "rebar": return std({ color: 0x6b4a36, metalness: 0.5, roughness: 0.7 });
    case "chrome": return std({ color: 0xe6e9ec, metalness: 0.65, roughness: 0.28 });
    case "concrete": return std({ map: concreteTexture(), roughness: 0.95 });
    case "membrane": return std({ color: 0x1c1f22, roughness: 0.4 });
    case "brick": return std({ map: brickFaceTexture(), roughness: 0.9 });
    case "brickTex": return std({ map: brickTexture(), roughness: 0.88 });
    case "mortar": return std({ map: mortarTexture(), roughness: 1 });
    case "fcSheet": return std({ color: 0xece6d6, roughness: 0.85 });
    case "render": return std({ map: renderTexture(), roughness: 0.92 });
    case "weatherboard": return std({ map: weatherboardTexture(), color: 0xf2efe8, roughness: 0.7 });
    case "trim": return std({ color: opts.trim ?? 0xe4e2d5, metalness: 0.3, roughness: 0.45 });
    case "colorbond": return std({ color: opts.roof ?? COLORBOND.colorbond, metalness: 0.55, roughness: 0.4 });
    case "colorbondSheet": return std({ color: opts.roof ?? COLORBOND.colorbond, metalness: 0.55, roughness: 0.42, normalMap: corrugatedNormalMap(), normalScale: new THREE.Vector2(1, 1) });
    case "colorbondScrew": return std({ color: opts.roof ?? COLORBOND.colorbond, metalness: 0.6, roughness: 0.35 });
    case "tile": return std({ color: 0x8a4a35, roughness: 0.82 });
    case "foil": return std({ color: 0xd8dde2, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide });
    case "alu": return std({ color: 0x2b2f33, metalness: 0.6, roughness: 0.35 });
    case "glass": return new THREE.MeshPhysicalMaterial({ color: 0xa9cde0, transparent: true, opacity: 0.32, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.3, depthWrite: false });
    case "flyscreen": return std({ color: 0x222628, transparent: true, opacity: 0.35, depthWrite: false });
    case "doorExt": return std({ color: 0x5a3a24, roughness: 0.5 });
    case "doorInt": return std({ color: 0xf5f3ee, roughness: 0.6 });
    case "paintWhite": return std({ color: 0xf6f4ef, roughness: 0.6 });
    case "garageDoor": return std({ map: garageDoorTexture(), metalness: 0.3, roughness: 0.5 });
    case "plasterboard": return std({ color: 0xf3f1ec, roughness: 0.95 });
    case "insulation": return std({ map: insulationTexture(), roughness: 1, transparent: true, opacity: 0.92 });
    case "wrap": return std({ map: wrapTexture(), roughness: 0.8 });
    case "particleboard": return std({ map: particleboardTexture(), roughness: 0.85 });
    case "floorTimber": return std({ map: timberFloorTexture(), roughness: 0.55 });
    case "floorTile": return std({ map: floorTileTexture(), roughness: 0.3 });
    case "carpet": return std({ map: carpetTexture(), roughness: 1 });
    case "joinery": return std({ color: 0xf2efe9, roughness: 0.45 });
    case "stone": return std({ color: 0xe9e7e2, roughness: 0.25 });
    case "ceramic": return std({ color: 0xffffff, roughness: 0.15 });
    case "mirror": return std({ color: 0xd9e3ea, metalness: 0.7, roughness: 0.08, envMapIntensity: 1.4 });
    case "black": return std({ color: 0x151617, roughness: 0.3, metalness: 0.3 });
    case "plasticGrey": return std({ color: 0x9aa0a6, roughness: 0.6 });
    case "pvPanel": return std({ map: pvTexture(), metalness: 0.45, roughness: 0.22 });
    default: return std({ color: 0xcccccc });
  }
}
function material(key, opts) {
  const k = `${key}|${opts.roof ?? ""}|${opts.trim ?? ""}`;
  if (!MAT_CACHE.has(k)) MAT_CACHE.set(k, makeMaterial(key, opts));
  return MAT_CACHE.get(k);
}

/* Sheets whose textures must keep their real size: individual meshes. */
const WORLD_UV = new Set(["concrete", "wrap", "insulation", "mortar", "render", "brickTex", "floorTimber", "floorTile", "carpet", "particleboard", "weatherboard"]);
const NO_SHADOW = new Set(["screw", "tie", "nailplate", "nut", "washer", "hinge", "rose", "lever", "deadlock", "clamp", "bar"]);
/* Pieces too small to see from across the site: drawn only when the camera
   is close (engine3D toggles them), so a distant view isn't speckled. */
const FINE = new Set(["screw", "tie", "nailplate", "nut", "washer", "hinge", "rose", "lever", "deadlock", "clamp", "bracket", "hanger"]);

/* For the CAD-line pass: the member axis that is the surface normal of the
   wall / roof plane these pieces make up. */
const FLAT_AXIS = { brick: "z", board: "z", tile: "y", corrugated: "y", screw: "x" };

/* Brick tints: a blend of fired-clay tones per brick. */
const BRICK_TONES = [0xb1603f, 0xa4553a, 0x9a4b33, 0xb86b48, 0x8f4630, 0xa85a3c, 0xc0714d].map((c) => new THREE.Color(c));
const TILE_TONES = [0x8a4a35, 0x7f4231, 0x93513a, 0x844634, 0x8d4c36].map((c) => new THREE.Color(c));
const tintColor = (m) => {
  if (m.mat === "brick") return BRICK_TONES[Math.floor((m.tint ?? 0) * BRICK_TONES.length) % BRICK_TONES.length];
  if (m.mat === "tile") return TILE_TONES[Math.floor((m.tint ?? 0) * TILE_TONES.length) % TILE_TONES.length];
  return null;
};

const _m = new THREE.Matrix4();
function memberMatrix(m, out) {
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
  const matOpts = { roof: opts.roofColour, trim: opts.trimColour };
  const buckets = new Map();
  const meshes = [];
  const byId = new Map();
  const white = new THREE.Color(1, 1, 1);

  for (const m of members) {
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
      mesh.setColorAt(i, tintColor(m) || white);
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
