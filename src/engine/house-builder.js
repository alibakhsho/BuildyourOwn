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
import { layoutWallFrame, layoutFloorJoists } from "./framing.js";
import { layoutKitchen } from "./kitchen.js";
import { CATALOGUE } from "./parts.js";

const SIDE_NAME = { front: "front wall", back: "back wall", left: "left wall", right: "right wall" };
const storeyName = (f) => (f === 0 ? "ground floor" : f === 1 ? "first floor" : `level ${f + 1}`);

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
  // kitchen finishes start from the spec's choices, then are editable per piece
  const presetMat = (cat, id) => {
    const p = CATALOGUE[cat].presets.find((x) => x.id === id) || CATALOGUE[cat].presets[0];
    return new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness ?? 0.7, metalness: p.metalness ?? 0 });
  };
  const K = {
    cabinet: presetMat("cabinet", "2pac"),
    carcass: presetMat("carcass", "whiteboard"),
    benchtop: presetMat("benchtop", (spec.kitchens?.[0]?.benchtop) || "stone"),
    handle: presetMat("handle", "nickel"),
    splashback: presetMat("splashback", spec.kitchens?.[0]?.splashback === "glass" ? "glass" : "tile"),
  };

  /* Every mesh is a selectable part: ids count per kind in build order, so
     the same spec always yields the same ids and saved edits re-land. */
  const counters = {};
  const part = (kind, cat, label, more = {}) => ({ part: { id: `${kind}:${(counters[kind] = (counters[kind] || 0) + 1)}`, kind, cat, label, ...more } });

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
  box(w + 0.1, env.slabThk, l + 0.1, M.concrete, 0, ffl - env.slabThk / 2, 0, "foundation", part("slab", "concrete", "Concrete slab"));
  box(w + 0.1, 0.3, l + 0.1, M.concrete, 0, ffl - env.slabThk - 0.15, 0, "foundation", part("edge-beam", "concrete", "Slab edge beam")); // mostly buried

  /* ---------- Frame: every member its own piece, per wall, per storey ---------- */
  const openingsAll = openings;
  for (let f = 0; f < floors; f++) {
    const y0 = env.levelY(f);
    for (const wall of W) {
      const where = `${SIDE_NAME[wall.side] || wall.side}, ${storeyName(f)}`;
      const mine = openingsAll.filter((o) => o.side === wall.side && o.floor === f);
      for (const mbr of layoutWallFrame(wall.len, wallH, mine)) {
        wallBox(wall, mbr.u, y0 + mbr.y, mbr.along, mbr.height, 0.09, frameMat, "frame", 0.02,
          part(mbr.kind, "framing", `${mbr.label} · ${where}`, { group: `frame-${f}-${wall.side}`, groupLabel: `Wall frame · ${where}` }));
      }
    }
    // upper floor: real joists @ 450 under a particleboard sheet
    if (f > 0) {
      const p = layout.plate;
      const { joists, depth, spanAlongX } = layoutFloorJoists(p);
      const sheetT = 0.019;
      const jy = y0 - sheetT - depth / 2;
      const grp = { group: `floor-frame-${f}`, groupLabel: `Floor frame · ${storeyName(f)}` };
      for (const j of joists) {
        if (spanAlongX) box(p.w, depth, 0.045, frameMat, p.x + p.w / 2, jy, p.z + j.s, "frame", part("joist", "framing", j.label, grp));
        else box(0.045, depth, p.l, frameMat, p.x + j.s, jy, p.z + p.l / 2, "frame", part("joist", "framing", j.label, grp));
      }
      box(p.w, sheetT, p.l, M.timberFloor, p.x + p.w / 2, y0 - sheetT / 2, p.z + p.l / 2, "frame",
        { skin: true, ...part("floor-sheet", "flooring", `Flooring sheet · ${storeyName(f)}`) });
    }
  }

  /* ---------- Walls: cladding panels cut around the openings ---------- */
  for (let f = 0; f < floors; f++) {
    const y0 = env.levelY(f);
    for (const wall of W) {
      const where = `${SIDE_NAME[wall.side] || wall.side}, ${storeyName(f)}`;
      const cladGrp = { group: `clad-${f}-${wall.side}`, groupLabel: `Cladding · ${where}` };
      const mine = openings.filter((o) => o.side === wall.side && o.floor === f);
      for (const p of wallPanels(wall.len, wallH, mine)) {
        wallBox(wall, (p.u0 + p.u1) / 2, y0 + (p.y0 + p.y1) / 2, p.u1 - p.u0, p.y1 - p.y0, t, M.clad, "walls", 0, { skin: true, ...part("cladding", "cladding", `Cladding panel · ${where}`, cladGrp) });
      }
      // cladding runs continuously over the floor zone between storeys
      if (f > 0) wallBox(wall, wall.len / 2, y0 - STD.floorZoneM / 2, wall.len, STD.floorZoneM, t, M.clad, "walls", 0, { skin: true, ...part("cladding", "cladding", `Cladding band · ${where}`, cladGrp) });
      /* windows + doors — each opening is one group */
      mine.forEach((o, i) => {
        const g = { group: `${o.kind}-${f}-${wall.side}-${i}`, groupLabel: `${o.kind === "window" ? "Window" : "Door"} ${Math.round(o.w * 1000)}×${Math.round(o.h * 1000)} · ${where}` };
        if (o.kind === "window") {
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, o.w + 0.08, o.h + 0.08, t * 0.9, M.alu, "finishes", 0.01, part("window-frame", "frame", "Window frame", g));
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, o.w, o.h, 0.02, M.glass, "finishes", 0.02, { skin: true, ...part("glass", "frame", "Glazing", g) });
          // transom + mullion so it reads as a window, not a hole
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, o.w, 0.04, 0.03, M.alu, "finishes", 0.01, part("window-frame", "frame", "Transom", g));
          wallBox(wall, o.u, y0 + o.sill + o.h / 2, 0.04, o.h, 0.03, M.alu, "finishes", 0.01, part("window-frame", "frame", "Mullion", g));
          wallBox(wall, o.u, y0 + o.sill - 0.02, o.w + 0.12, 0.04, t * 0.4, M.fascia, "finishes", -0.015, part("sill", "trim", "Window sill", g));
        } else {
          wallBox(wall, o.u, y0 + o.h / 2, o.w + 0.08, o.h + 0.04, t * 0.9, M.alu, "finishes", 0.01, part("door-frame", "frame", "Door frame", g));
          wallBox(wall, o.u, y0 + o.h / 2, o.w, o.h, 0.045, M.door, "finishes", 0.02, part("door", "door", "Entry door", g));
          wallBox(wall, o.u + o.w * 0.36, y0 + 1.0, 0.03, 0.14, 0.05, M.steel, "finishes", -0.02, part("handle", "handle", "Door handle", g));
        }
      });
    }
  }

  /* ---------- Roof: gable, ridge along z, eaves, trusses, fascia ---------- */
  const { pitch, halfSpan, ridgeH, slopeLen, eaveDrop, lengthWithEaves, plateY } = roof;
  const nTruss = Math.max(2, Math.ceil(l / STD.trussSpacing) + 1);
  const tSpacing = l / (nTruss - 1);
  for (let j = 0; j < nTruss; j++) {
    const z = -l / 2 + j * tSpacing;
    const g = { group: `truss-${j}`, groupLabel: `Roof truss ${j + 1} of ${nTruss}` };
    for (const s of [-1, 1]) {
      const r = box(slopeLen, 0.09, 0.035, frameMat, s * halfSpan / 2, plateY + (ridgeH - eaveDrop) / 2, z, "roof", part("rafter", "framing", `Top chord (${s < 0 ? "left" : "right"})`, g));
      r.rotation.z = -s * pitch;
    }
    // bottom chord / ceiling joist: bears on the wall plates and stops there —
    // only the sloping top chords run out into the eave
    box(w, 0.09, 0.035, frameMat, 0, plateY + 0.05, z, "roof", part("ceiling-joist", "framing", "Bottom chord / ceiling joist", g));
  }
  box(0.045, 0.19, l + 0.2, frameMat, 0, plateY + ridgeH + 0.02, 0, "roof", part("ridge", "framing", "Ridge board"));
  for (const s of [-1, 1]) {
    const sheet = box(slopeLen + 0.05, 0.05, lengthWithEaves, M.roof, s * halfSpan / 2, plateY + (ridgeH - eaveDrop) / 2 + 0.11, 0, "roof", { skin: true, roofPlane: s, ...part("roof-sheet", "roofing", `Roof sheeting (${s < 0 ? "left" : "right"} slope)`, { group: "roof-cover", groupLabel: "Roof covering" }) });
    sheet.rotation.z = -s * pitch;
    // fascia + gutter along the eave
    box(0.04, 0.2, lengthWithEaves, M.fascia, s * (halfSpan + 0.02), plateY - eaveDrop + 0.02, 0, "roof", part("fascia", "trim", "Fascia"));
    box(0.12, 0.1, lengthWithEaves, M.alu, s * (halfSpan + 0.1), plateY - eaveDrop - 0.02, 0, "roof", part("gutter", "trim", "Gutter"));
  }
  // ridge capping
  const cap = box(0.4, 0.04, lengthWithEaves, M.roof, 0, plateY + ridgeH + 0.17, 0, "roof", { skin: true, ...part("ridge-cap", "roofing", "Ridge capping", { group: "roof-cover", groupLabel: "Roof covering" }) });
  cap.rotation.z = 0;
  // gable ends: cladding triangles at ±z
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, ridgeH); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    const g = add(new THREE.Mesh(geo, M.clad), "walls", { skin: true, ...part("cladding", "cladding", `Gable cladding (${s < 0 ? "back" : "front"})`) });
    g.position.set(0, plateY, s * l / 2 - (s > 0 ? t : 0));
    // barge board
    for (const side of [-1, 1]) {
      const b = box(slopeLen, 0.2, 0.035, M.fascia, side * halfSpan / 2, plateY + (ridgeH - eaveDrop) / 2 + 0.05, s * (l / 2 + STD.eave), "roof", part("barge", "trim", "Barge board"));
      b.rotation.z = -side * pitch;
    }
  }

  /* ---------- Kitchen: real cabinetry on the room's clear walls ----------
     Each of the room's four walls is checked for what's in the way: an
     internal wall gets a doorway in its middle (see partitions below), an
     external wall has its doors and low windows. Runs go on the longest
     clear stretches — one wall, then an L or a galley — until the spec's
     bench length is met. Where two runs meet, the second stops a bench depth
     short of the corner; a galley only goes in if the aisle is at least 1 m.
     The sink and any island belong to the first run; overhead cupboards skip
     windows above the bench. */
  function buildKitchen(c, y0, floor) {
    const inner = layout.inner, near = (a, b) => Math.abs(a - b) < 0.03;
    const DOOR_W = 0.87, CLEAR = STD.partThk / 2 + 0.06, BENCH = 0.62;
    const cfg = c.item.src || {};
    // [along-axis, line position, from, to, inward sign, outside wall side if external]
    const edges = [
      ["x", c.z, c.x, c.x + c.w, +1, near(c.z, inner.z) ? "back" : null],
      ["x", c.z + c.l, c.x, c.x + c.w, -1, near(c.z + c.l, inner.z + inner.l) ? "front" : null],
      ["z", c.x, c.z, c.z + c.l, +1, near(c.x, inner.x) ? "left" : null],
      ["z", c.x + c.w, c.z, c.z + c.l, -1, near(c.x + c.w, inner.x + inner.w) ? "right" : null],
    ].map(([axis, at, from, to, dir, side]) => {
      const blocked = [], overhead = [];
      if (!side) {
        if (to - from > DOOR_W + 0.5) { const m = (from + to) / 2; blocked.push([m - DOOR_W / 2 - 0.1, m + DOOR_W / 2 + 0.1]); }
      } else {
        const wall = W.find((x) => x.side === side);
        for (const o of openings.filter((o) => o.side === side && o.floor === floor)) {
          const [px, pz] = wall.at(o.u), cpos = axis === "x" ? px : pz;
          const iv = [cpos - o.w / 2 - 0.08, cpos + o.w / 2 + 0.08];
          if (o.kind === "door" || o.sill < 0.95) blocked.push(iv); else overhead.push(iv);
        }
      }
      return { axis, at, from, to, dir, blocked, overhead, depth: axis === "x" ? c.l : c.w };
    });

    const runs = [];
    let want = Math.max(1.2, +cfg.benchLengthM || 3.6);
    while (want >= 0.6 && runs.length < 4) {
      let best = null;
      for (const e of edges) {
        // a galley needs a usable aisle between the two benches
        if (runs.some((r) => r.edge !== e && r.edge.axis === e.axis) && e.depth - 2 * (BENCH + CLEAR) < 1.0) continue;
        // the other side of a doorway on a wall already used is fair game
        const blocked = [...e.blocked, ...runs.filter((r) => r.edge === e).map((r) => [r.f0, r.f0 + r.len])];
        for (const r of runs) {
          if (r.edge === e || r.edge.axis === e.axis) continue; // perpendicular run: keep its corner clear
          if (near(r.edge.at, e.from)) blocked.push([e.from, e.from + BENCH + CLEAR + 0.03]);
          if (near(r.edge.at, e.to)) blocked.push([e.to - BENCH - CLEAR - 0.03, e.to]);
        }
        let free = [[e.from + CLEAR, e.to - CLEAR]];
        for (const [b0, b1] of blocked) free = free.flatMap(([f0, f1]) => (b1 <= f0 || b0 >= f1) ? [[f0, f1]] : [[f0, b0], [b1, f1]].filter(([x0, x1]) => x1 - x0 > 0));
        for (const [f0, f1] of free) if (f1 - f0 >= 1.2 && (!best || f1 - f0 > best.len)) best = { edge: e, f0, len: f1 - f0 };
      }
      if (!best) break;
      best.take = Math.min(best.len, want);
      runs.push(best);
      want -= best.take;
    }

    const kid = c.item.id || "k";
    runs.forEach((r, i) => {
      const e = r.edge;
      const { parts, len } = layoutKitchen(r.take, { ...cfg, benchLengthM: r.take, island: runs.length === 1 && cfg.island },
        e.depth - 2 * CLEAR, { sink: i === 0, name: runs.length > 1 ? `Run ${i + 1}` : "" });
      // first run centred in its stretch; extra runs tuck into the corner they share
      const sharesStart = runs.slice(0, i).some((q) => q.edge.axis !== e.axis && near(q.edge.at, e.from));
      const u0 = i === 0 ? r.f0 + (r.len - len) / 2 : sharesStart ? r.f0 : r.f0 + r.len - len;
      const v0 = e.at + e.dir * (STD.partThk / 2 + 0.005);
      for (const p of parts) {
        if (p.y > 1.4 && e.overhead.some(([o0, o1]) => u0 + p.u + p.su / 2 > o0 && u0 + p.u - p.su / 2 < o1)) continue;
        const along = u0 + p.u, out = v0 + e.dir * p.v;
        const [x, z] = e.axis === "x" ? [along, out] : [out, along];
        const [sx, sz] = e.axis === "x" ? [p.su, p.sv] : [p.sv, p.su];
        box(sx, p.sy, sz, K[p.cat], x, y0 + p.y, z, "finishes",
          part(p.kind, p.cat, p.label, { group: `${kid}-r${i}-${p.group}`, run: i, groupLabel: p.groupLabel, assembly: `kitchen-${kid}`, assemblyLabel: c.item.name }));
      }
    });
  }

  /* ---------- Interior: rooms, partitions, stairs ---------- */
  const waypoints = [];
  for (const fl of layout.floors) {
    const y0 = fl.y;
    const edgeOwners = new Map();
    const key = (axis, at, a, b) => `${axis}:${at.toFixed(2)}:${Math.min(a, b).toFixed(2)}:${Math.max(a, b).toFixed(2)}`;
    for (const c of fl.cells) {
      const fm = c.item.finish === "tile" ? M.tileFloor : c.item.finish === "carpet" ? M.carpet : M.timberFloor;
      box(c.w - STD.partThk, 0.02, c.l - STD.partThk, fm, c.x + c.w / 2, y0 + 0.01, c.z + c.l / 2, "walls", part("floor", "flooring", `Floor · ${c.item.name}`));
      if (!c.item.circulation) waypoints.push({ x: c.x + c.w / 2, z: c.z + c.l / 2, y: y0 + 1.55, name: c.item.name });
      if (c.item.type === "Kitchen") buildKitchen(c, y0, fl.index ?? layout.floors.indexOf(fl));
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
    for (const [k, { e, cells }] of edgeOwners.entries()) {
      const [axis, at, from, to] = e;
      if (onBoundary(axis, at)) continue;
      if (cells.length === 2 && cells.every((c) => c.item.circulation)) continue; // hall ↔ stair stays open
      const len = Math.abs(to - from), mid = (from + to) / 2;
      const seg = (centre, length, y, h) => {
        const g = axis === "z" ? worldBox(STD.partThk, h, length) : worldBox(length, h, STD.partThk);
        const m = add(new THREE.Mesh(g, M.partition), "walls", part("internal-wall", "wall", "Internal wall", { group: `iw-${k}`, groupLabel: `Internal wall · ${cells.map((c) => c.item.name).join(" / ")}` }));
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
        box(st.width, h, st.going, M.stair, st.x, y0 + h / 2, st.z0 + (i + 0.5) * st.going, "finishes", part("tread", "stair", `Stair tread ${i + 1}`, { group: `stair-${f}`, groupLabel: "Staircase" }));
      }
      const run = st.risers * st.going;
      const rail = box(0.05, 1.0, run, M.alu, st.x - st.width / 2 + 0.03, y0 + st.f2f / 2 + 0.55, st.z0 + run / 2, "finishes", part("balustrade", "frame", "Balustrade", { group: `stair-${f}`, groupLabel: "Staircase" }));
      rail.rotation.x = -Math.atan2(st.f2f, run);
    }
  }

  /* ---------- Garage: attached, flush with the front ---------- */
  if (spec.hasGarage) {
    const G = STD.garage;
    const gx = -w / 2 - G.w / 2, gz = l / 2 - G.l / 2, gy = ffl;
    box(G.w + 0.1, env.slabThk, G.l + 0.1, M.concrete, gx, gy - env.slabThk / 2, gz, "foundation", part("slab", "concrete", "Garage slab"));
    // left + back walls, and the front wall around the door
    box(t, G.h, G.l, M.clad, gx - G.w / 2 + t / 2, gy + G.h / 2, gz, "walls", { skin: true, ...part("cladding", "cladding", "Garage cladding", { group: "garage-clad", groupLabel: "Garage cladding" }) });
    box(G.w, G.h, t, M.clad, gx, gy + G.h / 2, gz - G.l / 2 + t / 2, "walls", { skin: true, ...part("cladding", "cladding", "Garage cladding", { group: "garage-clad", groupLabel: "Garage cladding" }) });
    const pier = (G.w - G.doorW) / 2;
    box(pier, G.h, t, M.clad, gx - G.w / 2 + pier / 2, gy + G.h / 2, gz + G.l / 2 - t / 2, "walls", { skin: true, ...part("cladding", "cladding", "Garage cladding", { group: "garage-clad", groupLabel: "Garage cladding" }) });
    box(pier, G.h, t, M.clad, gx + G.w / 2 - pier / 2, gy + G.h / 2, gz + G.l / 2 - t / 2, "walls", { skin: true, ...part("cladding", "cladding", "Garage cladding", { group: "garage-clad", groupLabel: "Garage cladding" }) });
    box(G.doorW, G.h - G.doorH, t, M.clad, gx, gy + G.doorH + (G.h - G.doorH) / 2, gz + G.l / 2 - t / 2, "walls", { skin: true, ...part("cladding", "cladding", "Garage cladding", { group: "garage-clad", groupLabel: "Garage cladding" }) });
    const gd = box(G.doorW, G.doorH, 0.05, M.garageDoor, gx, gy + G.doorH / 2, gz + G.l / 2 - 0.03, "finishes", part("door", "door", "Garage door"));
    void gd;
    // low gable across the garage, ridge along z, same pitch & material
    const gHalf = G.w / 2 + STD.eave, gRidge = (G.w / 2) * Math.tan(pitch), gSlope = gHalf / Math.cos(pitch);
    const gPlate = gy + G.h, gDrop = STD.eave * Math.tan(pitch);
    for (const s of [-1, 1]) {
      const sh = box(gSlope + 0.05, 0.05, G.l + 2 * STD.eave, M.roof, gx + s * gHalf / 2, gPlate + (gRidge - gDrop) / 2 + 0.08, gz, "roof", { skin: true, ...part("roof-sheet", "roofing", "Garage roof sheeting", { group: "garage-roof", groupLabel: "Garage roof" }) });
      sh.rotation.z = -s * pitch;
      box(0.04, 0.2, G.l + 2 * STD.eave, M.fascia, gx + s * (gHalf + 0.02), gPlate - gDrop + 0.02, gz, "roof", part("fascia", "trim", "Garage fascia"));
    }
    const shape = new THREE.Shape();
    shape.moveTo(-G.w / 2, 0); shape.lineTo(G.w / 2, 0); shape.lineTo(0, gRidge); shape.closePath();
    const gable = add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), M.clad), "walls", { skin: true, ...part("cladding", "cladding", "Garage gable", { group: "garage-clad", groupLabel: "Garage cladding" }) });
    gable.position.set(gx, gPlate, gz + G.l / 2 - t);
  }

  /* ---------- Solar: real-size modules on the roof plane ---------- */
  for (const p of solar.panels) {
    const s = p.side;
    const x = s * (halfSpan - p.s * Math.cos(pitch));
    const y = plateY - eaveDrop + p.s * Math.sin(pitch) + 0.2;
    const m = box(p.up, 0.04, p.along, M.panel, x, y, p.t, "finishes", part("solar-panel", "solar", "Solar module 415 W", { group: "solar", groupLabel: "Solar array" }));
    m.rotation.z = -s * pitch;
    const fr = box(p.up + 0.04, 0.03, p.along + 0.04, M.alu, x, y - 0.012, p.t, "finishes", part("solar-frame", "solar", "Module frame", { group: "solar", groupLabel: "Solar array" }));
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
