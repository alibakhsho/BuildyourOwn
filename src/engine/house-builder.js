/* =========================================================================
   MODULE: house-builder.js
   Turns a residential spec into three.js meshes. All dimensions come from
   src/logic/house-geometry.js — this file only decides how things LOOK.

   Every mesh carries userData.stage (foundation|frame|walls|roof|finishes)
   for the build animation, and userData.skin = true on surfaces that hide
   the structure (cladding, roof sheeting, glass) so the "skeleton" view can
   fade them without a rebuild.
   ========================================================================= */
import * as THREE from "three";
import { STD, envelope, roofGeometry, walls, placeOpenings, wallPanels, layoutFloors,
         solarLayout } from "../logic/house-geometry.js";
import { worldBox, claddingMaterial, roofMaterial, concreteTexture, timberFloorTexture } from "./materials3d.js";

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });

export function buildHouse(group, spec) {
  const env = envelope(spec);
  const roof = roofGeometry(spec);
  const W = walls(spec);
  const openings = placeOpenings(spec);
  const layout = layoutFloors(spec);
  const solar = solarLayout(spec);
  const { w, l, floors, wallH, ffl } = env;
  const t = STD.wallThk;

  const M = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 }),
    frame: mat(0xd8c9a6, { roughness: 0.75 }),             // pine studs
    steel: mat(0x9aa4b0, { metalness: 0.4, roughness: 0.55 }),
    clad: claddingMaterial(spec.claddingType),
    roof: roofMaterial(spec.roofType),
    fascia: mat(0xf2f2ef, { roughness: 0.6 }),
    alu: mat(0x2b2f33, { metalness: 0.6, roughness: 0.35 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9cc5df, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1, transmission: 0.2, envMapIntensity: 1.2 }),
    door: mat(0x4a3424, { roughness: 0.55 }),
    garageDoor: mat(0xd9dbd6, { metalness: 0.3, roughness: 0.5 }),
    partition: mat(0xf1ede5, { roughness: 0.92 }),
    timberFloor: new THREE.MeshStandardMaterial({ map: timberFloorTexture(), roughness: 0.6 }),
    tileFloor: mat(0xd9d5cb, { roughness: 0.35 }),
    carpet: mat(0x9d9189, { roughness: 1 }),
    stair: mat(spec.staircaseType === "steel_glass" ? 0x8a9099 : spec.staircaseType === "concrete" ? 0xb8b4ad : 0x9c6b3f, { roughness: 0.65 }),
    panel: mat(0x0f1d33, { metalness: 0.5, roughness: 0.25 }),
  };
  const frameMat = spec.framingType === "steel" ? M.steel : M.frame;

  const add = (mesh, stage, extra = {}) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.stage = stage;
    Object.assign(mesh.userData, extra);
    group.add(mesh);
    return mesh;
  };
  const box = (sx, sy, sz, m, x, y, z, stage, extra) => {
    const mesh = add(new THREE.Mesh(worldBox(sx, sy, sz), m), stage, extra);
    mesh.position.set(x, y, z);
    return mesh;
  };

  /* A box lying along a wall: `u` is the centre along the wall, `depthIn`
     how far its outer face sits inside the wall's outer face. */
  const wallBox = (wall, u, y, along, height, thk, m, stage, depthIn = 0, extra) => {
    const [px, pz] = wall.at(u);
    const [nx, nz] = wall.normal;
    const inward = thk / 2 + depthIn;
    const geo = nx === 0 ? worldBox(along, height, thk) : worldBox(thk, height, along);
    const mesh = add(new THREE.Mesh(geo, m), stage, extra);
    mesh.position.set(px - nx * inward, y, pz - nz * inward);
    return mesh;
  };

  /* ---------- Foundation: slab on ground with a thickened edge beam ---------- */
  box(w + 0.1, env.slabThk, l + 0.1, M.concrete, 0, ffl - env.slabThk / 2, 0, "foundation");
  box(w + 0.1, 0.3, l + 0.1, M.concrete, 0, ffl - env.slabThk - 0.15, 0, "foundation"); // edge beam, mostly buried

  /* ---------- Frame: plates + studs at 600 centres, per wall, per storey ---------- */
  for (let f = 0; f < floors; f++) {
    const y0 = env.levelY(f);
    for (const wall of W) {
      wallBox(wall, wall.len / 2, y0 + 0.045, wall.len, 0.09, 0.09, frameMat, "frame", 0.02);          // bottom plate
      wallBox(wall, wall.len / 2, y0 + wallH - 0.045, wall.len, 0.09, 0.09, frameMat, "frame", 0.02);  // top plate
      const n = Math.floor(wall.len / STD.studSpacing);
      for (let i = 0; i <= n; i++) {
        const u = Math.min(wall.len - 0.045, Math.max(0.045, i * STD.studSpacing));
        wallBox(wall, u, y0 + wallH / 2, 0.045, wallH - 0.18, 0.09, frameMat, "frame", 0.02);
      }
    }
    // intermediate floor: joists zone drawn as a slab over the room plate (stair void left open)
    if (f > 0) {
      const p = layout.plate;
      box(p.w, STD.floorZoneM, p.l, M.frame, p.x + p.w / 2, y0 - STD.floorZoneM / 2, p.z + p.l / 2, "frame");
    }
  }

  /* ---------- Walls: cladding panels cut around the openings ---------- */
  for (let f = 0; f < floors; f++) {
    const y0 = env.levelY(f);
    for (const wall of W) {
      const mine = openings.filter((o) => o.side === wall.side && o.floor === f);
      for (const p of wallPanels(wall.len, wallH, mine)) {
        wallBox(wall, (p.u0 + p.u1) / 2, y0 + (p.y0 + p.y1) / 2, p.u1 - p.u0, p.y1 - p.y0, t, M.clad, "walls", 0, { skin: true });
      }
      // cladding runs continuously over the floor zone between storeys
      if (f > 0) wallBox(wall, wall.len / 2, y0 - STD.floorZoneM / 2, wall.len, STD.floorZoneM, t, M.clad, "walls", 0, { skin: true });
      /* windows + doors */
      for (const o of mine) {
        if (o.kind === "window") {
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, o.w + 0.08, o.h + 0.08, t * 0.9, M.alu, "finishes", 0.01);
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, o.w, o.h, 0.02, M.glass, "finishes", 0.02, { skin: true });
          // transom + mullion so it reads as a window, not a hole
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, o.w, 0.04, 0.03, M.alu, "finishes", 0.01);
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, 0.04, o.h, 0.03, M.alu, "finishes", 0.01);
          wallBox(wall, o.u, y0 + o.sill - 0.02, o.w + 0.12, 0.04, t * 0.4, M.fascia, "finishes", -0.015); // sill
        } else {
          wallBox(wall, o.u, y0 + o.h / 2, o.w + 0.08, o.h + 0.04, t * 0.9, M.alu, "finishes", 0.01);
          wallBox(wall, o.u, y0 + o.h / 2, o.w, o.h, 0.045, M.door, "finishes", 0.02);
          wallBox(wall, o.u + o.w * 0.36, y0 + 1.0, 0.03, 0.14, 0.05, M.steel, "finishes", -0.02); // handle
        }
      }
    }
  }

  /* ---------- Roof: gable, ridge along z, eaves, trusses, fascia ---------- */
  const { pitch, halfSpan, ridgeH, slopeLen, eaveDrop, lengthWithEaves, plateY } = roof;
  const nTruss = Math.max(2, Math.ceil(l / STD.trussSpacing) + 1);
  const tSpacing = l / (nTruss - 1);
  for (let j = 0; j < nTruss; j++) {
    const z = -l / 2 + j * tSpacing;
    for (const s of [-1, 1]) {
      const r = box(slopeLen, 0.09, 0.035, frameMat, s * halfSpan / 2, plateY + (ridgeH - eaveDrop) / 2, z, "roof");
      r.rotation.z = -s * pitch;
    }
    box(w + 2 * STD.eave, 0.09, 0.035, frameMat, 0, plateY + 0.05, z, "roof"); // bottom chord / ceiling joist
  }
  box(0.045, 0.19, l + 0.2, frameMat, 0, plateY + ridgeH + 0.02, 0, "roof");   // ridge board
  for (const s of [-1, 1]) {
    const sheet = box(slopeLen + 0.05, 0.05, lengthWithEaves, M.roof, s * halfSpan / 2, plateY + (ridgeH - eaveDrop) / 2 + 0.11, 0, "roof", { skin: true, roofPlane: s });
    sheet.rotation.z = -s * pitch;
    // fascia + gutter along the eave
    box(0.04, 0.2, lengthWithEaves, M.fascia, s * (halfSpan + 0.02), plateY - eaveDrop + 0.02, 0, "roof");
    box(0.12, 0.1, lengthWithEaves, M.alu, s * (halfSpan + 0.1), plateY - eaveDrop - 0.02, 0, "roof");
  }
  // ridge capping
  const cap = box(0.4, 0.04, lengthWithEaves, M.roof, 0, plateY + ridgeH + 0.17, 0, "roof", { skin: true });
  cap.rotation.z = 0;
  // gable ends: cladding triangles at ±z
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, ridgeH); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    const g = add(new THREE.Mesh(geo, M.clad), "walls", { skin: true });
    g.position.set(0, plateY, s * l / 2 - (s > 0 ? t : 0));
    // barge board
    for (const side of [-1, 1]) {
      const b = box(slopeLen, 0.2, 0.035, M.fascia, side * halfSpan / 2, plateY + (ridgeH - eaveDrop) / 2 + 0.05, s * (l / 2 + STD.eave), "roof");
      b.rotation.z = -side * pitch;
    }
  }

  /* ---------- Interior: rooms, partitions, stairs ---------- */
  const waypoints = [];
  for (const fl of layout.floors) {
    const y0 = fl.y;
    const edgeOwners = new Map();
    const key = (axis, at, a, b) => `${axis}:${at.toFixed(2)}:${Math.min(a, b).toFixed(2)}:${Math.max(a, b).toFixed(2)}`;
    for (const c of fl.cells) {
      const fm = c.item.finish === "tile" ? M.tileFloor : c.item.finish === "carpet" ? M.carpet : M.timberFloor;
      box(c.w - STD.partThk, 0.02, c.l - STD.partThk, fm, c.x + c.w / 2, y0 + 0.01, c.z + c.l / 2, "walls");
      if (!c.item.circulation) waypoints.push({ x: c.x + c.w / 2, z: c.z + c.l / 2, y: y0 + 1.55, name: c.item.name });
      // own four edges
      for (const e of [
        ["z", c.x, c.z, c.z + c.l], ["z", c.x + c.w, c.z, c.z + c.l],
        ["x", c.z, c.x, c.x + c.w], ["x", c.z + c.l, c.x, c.x + c.w],
      ]) {
        const k = key(...e);
        (edgeOwners.has(k) ? edgeOwners.get(k) : edgeOwners.set(k, { e, cells: [] }).get(k)).cells.push(c);
      }
    }
    const { inner } = layout;
    const onBoundary = (axis, at) => axis === "z"
      ? Math.abs(at - inner.x) < 0.03 || Math.abs(at - (inner.x + inner.w)) < 0.03
      : Math.abs(at - inner.z) < 0.03 || Math.abs(at - (inner.z + inner.l)) < 0.03;
    for (const { e, cells } of edgeOwners.values()) {
      const [axis, at, from, to] = e;
      if (onBoundary(axis, at)) continue;
      if (cells.length === 2 && cells.every((c) => c.item.circulation)) continue; // hall ↔ stair stays open
      const len = Math.abs(to - from), mid = (from + to) / 2;
      const seg = (centre, length, y, h) => {
        const g = axis === "z" ? worldBox(STD.partThk, h, length) : worldBox(length, h, STD.partThk);
        const m = add(new THREE.Mesh(g, M.partition), "walls");
        if (axis === "z") m.position.set(at, y, centre); else m.position.set(centre, y, at);
      };
      const doorW = 0.87;
      if (len > doorW + 0.5) {
        const side = (len - doorW) / 2;
        seg(from + side / 2, side, y0 + wallH / 2, wallH);
        seg(to - side / 2, side, y0 + wallH / 2, wallH);
        seg(mid, doorW, y0 + STD.doorH + (wallH - STD.doorH) / 2, wallH - STD.doorH);
      } else {
        seg(mid, len, y0 + wallH / 2, wallH);
      }
    }
  }
  if (layout.stair) {
    const st = layout.stair;
    for (let f = 0; f < floors - 1; f++) {
      const y0 = env.levelY(f);
      for (let i = 0; i < st.risers; i++) {
        const h = (i + 1) * st.riser;
        box(st.width, h, st.going, M.stair, st.x, y0 + h / 2, st.z0 + (i + 0.5) * st.going, "finishes");
      }
      const run = st.risers * st.going;
      const rail = box(0.05, 1.0, run, M.alu, st.x - st.width / 2 + 0.03, y0 + st.f2f / 2 + 0.55, st.z0 + run / 2, "finishes");
      rail.rotation.x = -Math.atan2(st.f2f, run);
    }
  }

  /* ---------- Garage: attached, flush with the front ---------- */
  if (spec.hasGarage) {
    const G = STD.garage;
    const gx = -w / 2 - G.w / 2, gz = l / 2 - G.l / 2, gy = ffl;
    box(G.w + 0.1, env.slabThk, G.l + 0.1, M.concrete, gx, gy - env.slabThk / 2, gz, "foundation");
    // left + back walls, and the front wall around the door
    box(t, G.h, G.l, M.clad, gx - G.w / 2 + t / 2, gy + G.h / 2, gz, "walls", { skin: true });
    box(G.w, G.h, t, M.clad, gx, gy + G.h / 2, gz - G.l / 2 + t / 2, "walls", { skin: true });
    const pier = (G.w - G.doorW) / 2;
    box(pier, G.h, t, M.clad, gx - G.w / 2 + pier / 2, gy + G.h / 2, gz + G.l / 2 - t / 2, "walls", { skin: true });
    box(pier, G.h, t, M.clad, gx + G.w / 2 - pier / 2, gy + G.h / 2, gz + G.l / 2 - t / 2, "walls", { skin: true });
    box(G.doorW, G.h - G.doorH, t, M.clad, gx, gy + G.doorH + (G.h - G.doorH) / 2, gz + G.l / 2 - t / 2, "walls", { skin: true });
    const gd = box(G.doorW, G.doorH, 0.05, M.garageDoor, gx, gy + G.doorH / 2, gz + G.l / 2 - 0.03, "finishes");
    void gd;
    // low gable across the garage, ridge along z, same pitch & material
    const gHalf = G.w / 2 + STD.eave, gRidge = (G.w / 2) * Math.tan(pitch), gSlope = gHalf / Math.cos(pitch);
    const gPlate = gy + G.h, gDrop = STD.eave * Math.tan(pitch);
    for (const s of [-1, 1]) {
      const sh = box(gSlope + 0.05, 0.05, G.l + 2 * STD.eave, M.roof, gx + s * gHalf / 2, gPlate + (gRidge - gDrop) / 2 + 0.08, gz, "roof", { skin: true });
      sh.rotation.z = -s * pitch;
      box(0.04, 0.2, G.l + 2 * STD.eave, M.fascia, gx + s * (gHalf + 0.02), gPlate - gDrop + 0.02, gz, "roof");
    }
    const shape = new THREE.Shape();
    shape.moveTo(-G.w / 2, 0); shape.lineTo(G.w / 2, 0); shape.lineTo(0, gRidge); shape.closePath();
    const gable = add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), M.clad), "walls", { skin: true });
    gable.position.set(gx, gPlate, gz + G.l / 2 - t);
  }

  /* ---------- Solar: real-size modules on the roof plane ---------- */
  for (const p of solar.panels) {
    const s = p.side;
    const x = s * (halfSpan - p.s * Math.cos(pitch));
    const y = plateY - eaveDrop + p.s * Math.sin(pitch) + 0.2;
    const m = box(p.up, 0.04, p.along, M.panel, x, y, p.t, "finishes");
    m.rotation.z = -s * pitch;
    const fr = box(p.up + 0.04, 0.03, p.along + 0.04, M.alu, x, y - 0.012, p.t, "finishes");
    fr.rotation.z = -s * pitch;
  }

  return {
    waypoints,
    summary: {
      windows: openings.filter((o) => o.kind === "window").length,
      doors: openings.filter((o) => o.kind === "door").length,
      solarPanels: solar.fitted, solarKw: solar.kw,
      fit: Math.min(...layout.floors.map((f) => f.fit)),
      footprint: w * l, roofRidgeM: roof.ridgeY,
    },
  };
}
