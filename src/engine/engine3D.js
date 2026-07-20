/* =========================================================================
   MODULE: engine3D.js
   Three.js scene. Builds a procedural building from a spec and animates
   the construction sequence.
   ========================================================================= */
import * as THREE from "three";
import { easeOutCubic } from "../lib/format.js";

/* Slice-and-dice treemap: packs rooms into a rectangle with no gaps/overlaps,
   areas proportional to each room's footprint. Returns [{x,z,w,l,room}]. */
function sliceAndDice(rooms, x, z, w, l, horizontal) {
  const areaOf = (r) => Math.max(0.1, (r.widthM || 0) * (r.lengthM || 0));
  if (rooms.length === 1) {
    return [{ x, z, w, l, room: rooms[0] }];
  }
  const total = rooms.reduce((a, r) => a + areaOf(r), 0);
  // split into two groups near half the area
  let acc = 0, splitIdx = 0;
  for (let i = 0; i < rooms.length; i++) {
    acc += areaOf(rooms[i]);
    if (acc >= total / 2) { splitIdx = i + 1; break; }
  }
  splitIdx = Math.max(1, Math.min(rooms.length - 1, splitIdx));
  const groupA = rooms.slice(0, splitIdx);
  const groupB = rooms.slice(splitIdx);
  const areaA = groupA.reduce((a, r) => a + areaOf(r), 0);
  const ratio = areaA / total;
  if (horizontal) {
    const wA = w * ratio;
    return [
      ...sliceAndDice(groupA, x, z, wA, l, false),
      ...sliceAndDice(groupB, x + wA, z, w - wA, l, false),
    ];
  } else {
    const lA = l * ratio;
    return [
      ...sliceAndDice(groupA, x, z, w, lA, true),
      ...sliceAndDice(groupB, x, z + lA, w, l - lA, true),
    ];
  }
}

export class Engine3D {
  constructor(mountEl) {
    this.mount = mountEl;
    this.width = mountEl.clientWidth;
    this.height = mountEl.clientHeight;
    this.scene = new THREE.Scene();
    // Sky — soft vertical gradient (desaturated to sit under the blueprint UI),
    // not a flat fill. Horizon haze colour drives the fog so distant ground fades.
    const sky = document.createElement("canvas");
    sky.width = 2; sky.height = 256;
    const sctx = sky.getContext("2d");
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#b6cddf");    // upper sky
    grad.addColorStop(0.55, "#d7e1e8");
    grad.addColorStop(1, "#e9eee9");     // hazy horizon
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    if ("colorSpace" in skyTex) skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog(0xdfe6e2, 62, 175);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 500);
    this.camera.position.set(28, 22, 28);
    this.camera.lookAt(0, 4, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    // Cap pixel ratio at 1.5 — drawing at full 2x/3x device ratio costs 4-9x the
    // pixels for no visible benefit on this kind of model.
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // cheaper than PCFSoft
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if ("outputColorSpace" in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountEl.appendChild(this.renderer.domElement);

    // Lights — sky/ground hemisphere for natural fill, key light for form, soft fill to lift shadows
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0xb9a98a, 0.55);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff4d6, 1.05);
    dir.position.set(24, 34, 18);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -40;
    dir.shadow.camera.right = 40;
    dir.shadow.camera.top = 40;
    dir.shadow.camera.bottom = -40;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 120;
    dir.shadow.bias = -0.0004;
    this.scene.add(dir);
    // Cool fill from the opposite side to stop shadowed faces going dead black
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.25);
    fill.position.set(-18, 14, -12);
    this.scene.add(fill);

    // ---- Natural site: grass plot + cleared building pad, instead of a bare grid ----
    // Grass — the plot the building sits on
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x8ba368, roughness: 1.0 });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.04;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Cleared building pad — gravel/dirt the structure is built on (reads as a site)
    const padMat = new THREE.MeshStandardMaterial({ color: 0xc7bca0, roughness: 1.0 });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(36, 56), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.01;
    pad.receiveShadow = true;
    this.scene.add(pad);

    // Faded site-setout lines (a hint of survey grid on the pad, not a graph page)
    const grid = new THREE.GridHelper(64, 32, 0x8f9483, 0xb3b8a8);
    grid.position.y = 0.012;
    grid.material.opacity = 0.11;
    grid.material.transparent = true;
    this.scene.add(grid);

    this._addTrees();

    // Building group
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    // Animation state
    this.progress = 0; // 0..1 across all stages
    this.cameraAngle = Math.PI * 0.25;
    this.autoRotate = true;
    this.playing = false;
    this.spec = null;

    // Walkthrough state
    this.mode = "orbit"; // "orbit" | "walk"
    this.walkWaypoints = [];
    this.walkT = 0;          // 0..1 along the whole path
    this.walkSpeed = 0.0009; // per frame
    this.roofMeshes = [];    // hidden during walkthrough
    this.onWalkProgress = null;
    this.onModeChange = null;

    this.animate = this.animate.bind(this);
    this._animId = requestAnimationFrame(this.animate);

    this._resizeObs = new ResizeObserver(() => this.resize());
    this._resizeObs.observe(mountEl);

    // ---- User camera controls: drag to orbit, wheel/pinch to zoom ----
    this.zoomFactor = 1;      // 0.4 (close) .. 2.2 (far)
    this.tiltFactor = 1;      // vertical
    this._userOrbiting = false;
    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    let dragging = false, lastX = 0, lastY = 0, pinchDist = 0;
    const clampZoom = (z) => Math.max(0.4, Math.min(2.2, z));
    const clampTilt = (t) => Math.max(0.35, Math.min(1.8, t));

    el.addEventListener("pointerdown", (e) => {
      if (this.mode === "walk") return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      this.autoRotate = false; this._userOrbiting = true; this.requestRender && this.requestRender();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging || this.mode === "walk") return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.cameraAngle -= dx * 0.008;
      this.tiltFactor = clampTilt(this.tiltFactor + dy * 0.004);
      this._needsRender = true;
    });
    const endDrag = (e) => { dragging = false; try { el.releasePointerCapture && el.releasePointerCapture(e.pointerId); } catch (x) {} };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("wheel", (e) => {
      if (this.mode === "walk") return;
      e.preventDefault();
      this.autoRotate = false; this._userOrbiting = true;
      this.zoomFactor = clampZoom(this.zoomFactor + (e.deltaY > 0 ? 0.12 : -0.12));
      this._needsRender = true;
    }, { passive: false });
    // pinch zoom
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) { pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && this.mode !== "walk") {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist) { this.autoRotate = false; this._userOrbiting = true; this.zoomFactor = clampZoom(this.zoomFactor * (pinchDist / d)); this._needsRender = true; }
        pinchDist = d;
      }
    }, { passive: true });
  }

  /* Sparse low-poly trees around the site edge — scale + life, not a forest. */
  _addTrees() {
    const spots = [
      [-32, -20], [30, -26], [-36, 16], [34, 22], [-24, 32],
      [24, 34], [-42, -2], [40, 8], [-18, -36], [16, -34],
    ];
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1 });
    const leafMats = [0x6f8f57, 0x5e8050, 0x7c9a63].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })
    );
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const h = 3.2 + ((x * z) % 5) * 0.5;                  // deterministic-ish varied height
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h * 0.5, 6), trunkMat);
      trunk.position.y = h * 0.25; trunk.castShadow = true; g.add(trunk);
      const canopy = new THREE.Mesh(
        new THREE.IcosahedronGeometry(h * 0.5, 0),
        leafMats[Math.abs((x + z)) % leafMats.length]
      );
      canopy.position.y = h * 0.66; canopy.scale.y = 1.15; canopy.castShadow = true; g.add(canopy);
      g.position.set(x, 0, z);
      g.rotation.y = (x + z) % 3;
      this.scene.add(g);
    }
  }

  resize() {
    this.width = this.mount.clientWidth;
    this.height = this.mount.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  /* Move the renderer canvas into a new container. The viewport unmounts when
     the user visits the AI/Proposal stages, so on return the same engine
     re-attaches to whichever container is on screen instead of being rebuilt. */
  remount(el) {
    if (!el || this.mount === el) return;
    this.mount = el;
    el.appendChild(this.renderer.domElement);
    this._resizeObs.disconnect();
    this._resizeObs.observe(el);
    this.resize();
    this.setPaused(false);
    this._needsRender = true;
  }

  /* Build / rebuild the building meshes from spec */
  buildFromSpec(spec) {
    this.spec = spec;
    // Clear previous
    while (this.buildingGroup.children.length) {
      const c = this.buildingGroup.children[0];
      this.buildingGroup.remove(c);
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material?.dispose();
    }
    /* Scale down for viewport — divide real metres so very large buildings fit. */
    const scale = 1.0;
    const w = spec.widthM * scale;
    const l = spec.lengthM * scale;
    const floorH = spec.wallHeightM * scale;
    const floors = spec.floors;
    const totalH = floorH * floors;

    /* --- Foundation (slab) --- */
    const slabH = 0.4;
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, slabH, l + 0.6), slabMat);
    slab.position.y = slabH / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData.stage = "foundation";
    this.buildingGroup.add(slab);

    /* --- Frame posts (corners + intermediates) — carport-style steel members --- */
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.35, roughness: 0.6 });
    const pierMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a7, roughness: 0.9 });
    const postGeo = new THREE.BoxGeometry(0.12, totalH, 0.12);
    const pierGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 20);
    const cornerOffsets = [
      [-w / 2 + 0.1, l / 2 - 0.1], [w / 2 - 0.1, l / 2 - 0.1],
      [-w / 2 + 0.1, -l / 2 + 0.1], [w / 2 - 0.1, -l / 2 + 0.1],
    ];
    const allPosts = [...cornerOffsets];
    /* intermediate posts at ~2m spacing along each wall */
    const stepX = Math.max(2.0, w / Math.ceil(w / 2.0));
    const stepZ = Math.max(2.0, l / Math.ceil(l / 2.0));
    for (let x = -w / 2 + stepX; x < w / 2 - 0.5; x += stepX) {
      allPosts.push([x, l / 2 - 0.1]);
      allPosts.push([x, -l / 2 + 0.1]);
    }
    for (let z = -l / 2 + stepZ; z < l / 2 - 0.5; z += stepZ) {
      allPosts.push([-w / 2 + 0.1, z]);
      allPosts.push([w / 2 - 0.1, z]);
    }
    for (const [px, pz] of allPosts) {
      /* bored pier footing under every post (visible during foundation stage) */
      const pier = new THREE.Mesh(pierGeo, pierMat);
      pier.position.set(px, -0.40, pz);
      pier.userData.stage = "foundation";
      this.buildingGroup.add(pier);
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(px, slabH + totalH / 2, pz);
      post.castShadow = true;
      post.userData.stage = "frame";
      this.buildingGroup.add(post);
    }
    /* horizontal floor plates between each storey */
    for (let f = 0; f <= floors; f++) {
      const plateY = slabH + f * floorH;
      const plateGeoX = new THREE.BoxGeometry(w, 0.15, 0.15);
      const plateGeoZ = new THREE.BoxGeometry(0.15, 0.15, l);
      const p1 = new THREE.Mesh(plateGeoX, frameMat);
      const p2 = new THREE.Mesh(plateGeoX, frameMat);
      const p3 = new THREE.Mesh(plateGeoZ, frameMat);
      const p4 = new THREE.Mesh(plateGeoZ, frameMat);
      p1.position.set(0, plateY, l / 2 - 0.1);
      p2.position.set(0, plateY, -l / 2 + 0.1);
      p3.position.set(-w / 2 + 0.1, plateY, 0);
      p4.position.set(w / 2 - 0.1, plateY, 0);
      [p1, p2, p3, p4].forEach((m) => { m.castShadow = true; m.userData.stage = "frame"; this.buildingGroup.add(m); });
    }

    /* --- Walls (per floor, per side) — carport-style stud framing at 600
       centres instead of solid cladding panels, so the whole model reads as
       an exposed structural skeleton. Cladding type tints the studs. --- */
    const studTint = spec.claddingType === "weatherboard" ? 0x8f9aa6
                  : spec.claddingType === "render" ? 0x9aa4b0
                  : 0x828c98;
    const studMat = new THREE.MeshStandardMaterial({ color: studTint, metalness: 0.35, roughness: 0.6 });
    const wallThk = 0.2;
    const studGeoX = new THREE.BoxGeometry(0.045, floorH - 0.15, 0.09);
    const studGeoZ = new THREE.BoxGeometry(0.09, floorH - 0.15, 0.045);
    const STUD_SPACING = 0.6;
    for (let f = 0; f < floors; f++) {
      const cy = slabH + f * floorH + floorH / 2;
      for (let x = -w / 2 + STUD_SPACING; x < w / 2 - 0.1; x += STUD_SPACING) {
        const sF = new THREE.Mesh(studGeoX, studMat);
        sF.position.set(x, cy, l / 2 - 0.045);
        const sB = new THREE.Mesh(studGeoX, studMat);
        sB.position.set(x, cy, -l / 2 + 0.045);
        [sF, sB].forEach((m) => { m.castShadow = true; m.userData.stage = "walls"; this.buildingGroup.add(m); });
      }
      for (let z = -l / 2 + STUD_SPACING; z < l / 2 - 0.1; z += STUD_SPACING) {
        const sL = new THREE.Mesh(studGeoZ, studMat);
        sL.position.set(-w / 2 + 0.045, cy, z);
        const sR = new THREE.Mesh(studGeoZ, studMat);
        sR.position.set(w / 2 - 0.045, cy, z);
        [sL, sR].forEach((m) => { m.castShadow = true; m.userData.stage = "walls"; this.buildingGroup.add(m); });
      }
    }

    /* --- Windows (front + back, evenly spaced per floor) --- */
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x6fa8d1, roughness: 0.1, metalness: 0.5,
      emissive: 0x223a4e, emissiveIntensity: 0.3,
    });
    const winW = 1.0, winH = 1.2;
    const winsPerSide = Math.max(2, Math.floor(w / 2.5));
    for (let f = 0; f < floors; f++) {
      const cy = slabH + f * floorH + floorH * 0.55;
      for (let i = 0; i < winsPerSide; i++) {
        const x = -w / 2 + (w / (winsPerSide + 1)) * (i + 1);
        const winF = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.05), windowMat);
        winF.position.set(x, cy, l / 2 + wallThk / 2 + 0.01);
        winF.userData.stage = "finishes";
        const winB = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.05), windowMat);
        winB.position.set(x, cy, -l / 2 - wallThk / 2 - 0.01);
        winB.userData.stage = "finishes";
        this.buildingGroup.add(winF);
        this.buildingGroup.add(winB);
      }
      const winsPerEnd = Math.max(1, Math.floor(l / 3));
      for (let i = 0; i < winsPerEnd; i++) {
        const z = -l / 2 + (l / (winsPerEnd + 1)) * (i + 1);
        const winL = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), windowMat);
        winL.position.set(-w / 2 - wallThk / 2 - 0.01, cy, z);
        winL.userData.stage = "finishes";
        const winR = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), windowMat);
        winR.position.set(w / 2 + wallThk / 2 + 0.01, cy, z);
        winR.userData.stage = "finishes";
        this.buildingGroup.add(winL);
        this.buildingGroup.add(winR);
      }
    }

    /* --- Front door --- */
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.06), doorMat);
    door.position.set(0, slabH + 1.0, l / 2 + wallThk / 2 + 0.02);
    door.userData.stage = "finishes";
    this.buildingGroup.add(door);

    /* --- Roof (gable or hip approximated as a prism) --- */
    const roofColor = spec.roofType === "tile" ? 0x6a3a2e
                   : spec.roofType === "shingle" ? 0x3a3a40
                   : 0x4a4f56; // colorbond default
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7, metalness: 0.2 });
    const rafterMat = new THREE.MeshStandardMaterial({ color: 0x77828f, metalness: 0.35, roughness: 0.6 });
    /* Carport-style roof: individual rafters at 1.1m centres up each slope
       to a ridge, sheeted with per-slope panels — an exposed gable frame
       rather than a solid extruded prism. */
    const pitch = (spec.roofPitch * Math.PI) / 180;
    const halfSpan = w / 2 + 0.4;
    const ridgeH = halfSpan * Math.tan(pitch);
    const slopeLen = halfSpan / Math.cos(pitch);
    const roofBaseY = slabH + totalH;
    const RAFTER_SPACING = 1.1;
    const rafterCount = Math.max(2, Math.ceil(l / RAFTER_SPACING) + 1);
    const rSpacing = (l + 0.4) / (rafterCount - 1);
    const rafterGeo = new THREE.BoxGeometry(slopeLen, 0.14, 0.05);
    for (let j = 0; j < rafterCount; j++) {
      const z = -(l + 0.4) / 2 + j * rSpacing;
      const rL = new THREE.Mesh(rafterGeo, rafterMat);
      rL.position.set(-halfSpan / 2, roofBaseY + ridgeH / 2 + 0.08, z);
      rL.rotation.z = pitch;
      const rR = new THREE.Mesh(rafterGeo, rafterMat);
      rR.position.set(halfSpan / 2, roofBaseY + ridgeH / 2 + 0.08, z);
      rR.rotation.z = -pitch;
      [rL, rR].forEach((m) => { m.castShadow = true; m.userData.stage = "roof"; this.buildingGroup.add(m); });
    }
    /* ridge beam */
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, l + 0.4), rafterMat);
    ridge.position.set(0, roofBaseY + ridgeH + 0.08, 0);
    ridge.castShadow = true;
    ridge.userData.stage = "roof";
    this.buildingGroup.add(ridge);
    /* sheeting: one thin panel per slope, sitting just above the rafters */
    for (const side of [-1, 1]) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.04, l + 0.6), roofMat);
      sheet.position.set(side * halfSpan / 2, roofBaseY + ridgeH / 2 + 0.24, 0);
      sheet.rotation.z = -side * pitch;
      sheet.castShadow = true;
      sheet.userData.stage = "roof";
      this.buildingGroup.add(sheet);
    }

    /* --- Garage attached --- */
    if (spec.hasGarage) {
      const gw = 6, gl = 6.5, gh = 2.6;
      const garageMat = new THREE.MeshStandardMaterial({ color: studTint, metalness: 0.35, roughness: 0.6 });
      const garage = new THREE.Group();
      const gWallF = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, wallThk), garageMat);
      gWallF.position.set(0, gh / 2, gl / 2);
      const gWallB = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, wallThk), garageMat);
      gWallB.position.set(0, gh / 2, -gl / 2);
      const gWallR = new THREE.Mesh(new THREE.BoxGeometry(wallThk, gh, gl), garageMat);
      gWallR.position.set(gw / 2, gh / 2, 0);
      const gRoof = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.4, 0.2, gl + 0.4), roofMat);
      gRoof.position.set(0, gh + 0.1, 0);
      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw - 1, gh - 0.4, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xc8cdd1, roughness: 0.6 }));
      gDoor.position.set(0, (gh - 0.4) / 2 + 0.1, gl / 2 + wallThk / 2 + 0.01);
      [gWallF, gWallB, gWallR, gRoof, gDoor].forEach((m) => { m.castShadow = true; m.userData.stage = "finishes"; garage.add(m); });
      garage.position.set(-w / 2 - gw / 2 - 0.4, slabH, 0);
      garage.userData.stage = "finishes";
      this.buildingGroup.add(garage);
    }

    /* --- Solar PV array on roof --- */
    if (spec.solar) {
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x12233a, roughness: 0.3, metalness: 0.4, emissive: 0x0a1530, emissiveIntensity: 0.2 });
      const rows = 2, cols = 4;
      const panelW = 1.6, panelH = 1.0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.05, panelH), panelMat);
          panel.rotation.z = -(spec.roofPitch * Math.PI / 180);
          panel.position.set(-(cols - 1) * panelW / 2 + c * panelW * 1.05,
                             slabH + totalH + ridgeH * 0.55,
                             -(rows - 1) * panelH / 2 + r * panelH * 1.05 + 1);
          panel.userData.stage = "finishes";
          this.buildingGroup.add(panel);
        }
      }
    }

    /* --- Interior partitions + room floors (from room schedule) --- */
    this.roofMeshes = [];
    this.walkWaypoints = [];
    const rooms = (spec.rooms || []).filter((r) => (r.widthM || 0) * (r.lengthM || 0) > 0);
    const inset = 0.25;
    const interiorRect = { x: -w / 2 + inset, z: -l / 2 + inset, w: w - 2 * inset, l: l - 2 * inset };

    if (rooms.length > 0) {
      const layout = sliceAndDice(rooms, interiorRect.x, interiorRect.z, interiorRect.w, interiorRect.l, interiorRect.w >= interiorRect.l);
      const partWallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece3, roughness: 0.92 });
      const partThk = 0.1;
      const partH = floorH - 0.15;
      const doorW = 0.9, doorH = 2.05;
      const floorColors = { timber: 0xb98a55, tile: 0xd7d3c8, carpet: 0x9a8d86 };

      // collect interior edges, dedup so shared walls aren't doubled
      const edgeMap = new Map();
      const isBoundary = (a, b, axis) => {
        // axis 'x' => horizontal edge at constant z; 'z' => vertical edge at constant x
        if (axis === "z") return Math.abs(a - (-w / 2 + inset)) < 0.05 || Math.abs(a - (w / 2 - inset)) < 0.05;
        return Math.abs(a - (-l / 2 + inset)) < 0.05 || Math.abs(a - (l / 2 - inset)) < 0.05;
      };

      for (const cell of layout) {
        // per-room floor patch (subtle colour so rooms read in walkthrough)
        const fcol = floorColors[cell.room.floorFinish] || floorColors.timber;
        const floorPatch = new THREE.Mesh(
          new THREE.BoxGeometry(cell.w - partThk, 0.04, cell.l - partThk),
          new THREE.MeshStandardMaterial({ color: fcol, roughness: 0.85 })
        );
        floorPatch.position.set(cell.x + cell.w / 2, slabH + 0.03, cell.z + cell.l / 2);
        floorPatch.receiveShadow = true;
        floorPatch.userData.stage = "walls";
        this.buildingGroup.add(floorPatch);

        // store walkthrough waypoint at room centre, eye height
        this.walkWaypoints.push({
          x: cell.x + cell.w / 2, z: cell.z + cell.l / 2,
          name: cell.room.name || cell.room.type,
        });

        // four edges -> dedup
        const edges = [
          { axis: "z", at: cell.x, from: cell.z, to: cell.z + cell.l },                 // left (const x)
          { axis: "z", at: cell.x + cell.w, from: cell.z, to: cell.z + cell.l },          // right
          { axis: "x", at: cell.z, from: cell.x, to: cell.x + cell.w },                  // bottom (const z)
          { axis: "x", at: cell.z + cell.l, from: cell.x, to: cell.x + cell.w },          // top
        ];
        for (const e of edges) {
          const key = `${e.axis}:${e.at.toFixed(2)}:${e.from.toFixed(2)}:${e.to.toFixed(2)}`;
          if (edgeMap.has(key)) continue;
          edgeMap.set(key, true);
          if (isBoundary(e.at, null, e.axis)) continue; // skip walls on building boundary (handled by exterior)
          // build a partition wall along this edge with a centred doorway gap
          const len = Math.abs(e.to - e.from);
          const mid = (e.from + e.to) / 2;
          const segLen = Math.max(0.1, (len - doorW) / 2);
          const makeSeg = (segCenter, segLength) => {
            const geo = e.axis === "z"
              ? new THREE.BoxGeometry(partThk, partH, segLength)
              : new THREE.BoxGeometry(segLength, partH, partThk);
            const m = new THREE.Mesh(geo, partWallMat);
            const y = slabH + partH / 2;
            if (e.axis === "z") m.position.set(e.at, y, segCenter);
            else m.position.set(segCenter, y, e.at);
            m.castShadow = true; m.receiveShadow = true; m.userData.stage = "walls";
            this.buildingGroup.add(m);
          };
          if (len > doorW + 0.4) {
            makeSeg(e.from + segLen / 2, segLen);
            makeSeg(e.to - segLen / 2, segLen);
            // lintel above doorway
            const lintelGeo = e.axis === "z"
              ? new THREE.BoxGeometry(partThk, partH - doorH, doorW)
              : new THREE.BoxGeometry(doorW, partH - doorH, partThk);
            const lintel = new THREE.Mesh(lintelGeo, partWallMat);
            const ly = slabH + doorH + (partH - doorH) / 2;
            if (e.axis === "z") lintel.position.set(e.at, ly, mid);
            else lintel.position.set(mid, ly, e.at);
            lintel.userData.stage = "walls";
            this.buildingGroup.add(lintel);
          } else {
            makeSeg(mid, len); // too short for a door — solid
          }
        }
      }
    }

    /* --- Staircase (between each storey) --- */
    if (spec.staircaseType && spec.staircaseType !== "none" && floors > 1) {
      const stairColor = spec.staircaseType === "steel_glass" ? 0x8a9099
                       : spec.staircaseType === "concrete" ? 0xb8b4ad
                       : 0x9c6b3f;
      const stairMat = new THREE.MeshStandardMaterial({ color: stairColor, roughness: 0.7, metalness: spec.staircaseType === "steel_glass" ? 0.5 : 0.1 });
      const railMat = new THREE.MeshStandardMaterial({ color: spec.staircaseType === "steel_glass" ? 0x6fa8d1 : 0x3a2a1a, roughness: 0.4, metalness: 0.3, transparent: spec.staircaseType === "steel_glass", opacity: spec.staircaseType === "steel_glass" ? 0.45 : 1 });
      const stepWidth = 1.1;
      const stepRun = 0.27;
      const x0 = w / 2 - inset - 0.4; // place near right interior edge
      const z0 = -l / 2 + inset + 0.6;
      for (let f = 0; f < floors - 1; f++) {
        const baseY = slabH + f * floorH;
        const rise = floorH;
        const nSteps = Math.max(12, Math.round(rise / 0.18));
        const stepRise = rise / nSteps;
        const runScale = Math.min(1, (l - 2 * inset - 1) / (nSteps * stepRun)); // fit within length
        for (let i = 0; i < nSteps; i++) {
          const h = (i + 1) * stepRise;
          const step = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, h, stepRun * runScale), stairMat);
          step.position.set(x0 - stepWidth / 2, baseY + h / 2, z0 + (i + 0.5) * stepRun * runScale);
          step.castShadow = true; step.receiveShadow = true;
          step.userData.stage = "finishes";
          this.buildingGroup.add(step);
        }
        // handrail along the flight
        const runLen = nSteps * stepRun * runScale;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, runLen), railMat);
        rail.position.set(x0 - stepWidth + 0.05, baseY + rise / 2 + 0.5, z0 + runLen / 2);
        rail.rotation.x = -Math.atan2(rise, runLen);
        rail.userData.stage = "finishes";
        this.buildingGroup.add(rail);
      }
    }

    // tag roof meshes for walkthrough hide
    this.buildingGroup.traverse((o) => {
      if (o.userData && o.userData.stage === "roof") this.roofMeshes.push(o);
    });

    /* Stage indices for animation reveal */
    this.stageOrder = ["foundation", "frame", "walls", "roof", "finishes"];
  }

  /* Empty the model entirely — materials-only mode shows just the site. */
  clearBuilding() {
    this.isTower = false;
    while (this.buildingGroup.children.length) {
      const c = this.buildingGroup.children[0];
      this.buildingGroup.remove(c);
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose()); else c.material?.dispose();
    }
    this.roofMeshes = [];
    this.walkWaypoints = [];
  }

  /* Quote mode: lay out simple massing blocks so you can SEE what you're
     quoting. Not accurate geometry — a readable representation: walls as
     panels, decks/slabs as platforms, fences as picket lines, roofs as
     pitched caps, cabinetry as low boxes. Items are placed on a tidy grid. */
  buildMassing(lines) {
    this.clearBuilding();
    this.isTower = false;
    this.spec = null;
    const items = (lines || []).filter((l) => l.kind === "material" || l.kind === "element");
    if (!items.length) { this._needsRender = true; return; }

    const palette = {
      wall: 0xe8e2d6, deck: 0x9c6b3f, slab: 0xa9a9a9, fence: 0x8a6a44,
      roof: 0x6a7075, tile: 0xd9d2c4, cabinet: 0xb98a5e, generic: 0xc7cdd2,
    };
    const mat = (c, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
    const classify = (l) => {
      const s = (l.label || "").toLowerCase() + " " + (l.materialId || "");
      if (/deck|bearer|joist/.test(s)) return "deck";
      if (/wall|framing|plasterboard|brick|render|cladding|lining/.test(s)) return "wall";
      if (/slab|concrete|footing|driveway|paving/.test(s)) return "slab";
      if (/fence|paling|colorbond fence|picket/.test(s)) return "fence";
      if (/roof|sheet|flashing|sarking|truss/.test(s)) return "roof";
      if (/tile|tiling/.test(s)) return "tile";
      if (/cabinet|bench|joinery|vanity|cabinetry/.test(s)) return "cabinet";
      return "generic";
    };

    // group items by class so we draw one representative block per class
    const groups = {};
    for (const l of items) { const k = classify(l); (groups[k] = groups[k] || []).push(l); }
    const keys = Object.keys(groups);
    const spacing = 9;
    const cols = Math.ceil(Math.sqrt(keys.length));
    const startX = -((cols - 1) * spacing) / 2;

    keys.forEach((k, i) => {
      const gx = startX + (i % cols) * spacing;
      const gz = startX + Math.floor(i / cols) * spacing;
      const g = new THREE.Group();
      g.position.set(gx, 0, gz);
      const qty = groups[k].reduce((a, l) => a + (+l.qty || 0), 0);
      const size = Math.max(2, Math.min(6, Math.sqrt(qty || 4)));

      if (k === "wall") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(size * 1.6, 3, 0.25), mat(palette.wall));
        m.position.y = 1.5; m.castShadow = true; m.receiveShadow = true; g.add(m);
      } else if (k === "deck") {
        const board = new THREE.Mesh(new THREE.BoxGeometry(size * 1.4, 0.25, size * 1.4), mat(palette.deck, 0.7));
        board.position.y = 0.7; board.castShadow = true; board.receiveShadow = true; g.add(board);
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), mat(0x5a4530));
          post.position.set(dx * size * 0.6, 0.35, dz * size * 0.6); g.add(post);
        }
      } else if (k === "slab") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(size * 1.6, 0.18, size * 1.6), mat(palette.slab, 0.95));
        m.position.y = 0.09; m.receiveShadow = true; g.add(m);
      } else if (k === "fence") {
        for (let p = 0; p < 6; p++) {
          const pk = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 0.12), mat(palette.fence, 0.8));
          pk.position.set(-2.5 + p, 0.9, 0); pk.castShadow = true; g.add(pk);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.08), mat(palette.fence, 0.8));
        rail.position.y = 1.4; g.add(rail);
      } else if (k === "roof") {
        const geo = new THREE.ConeGeometry(size, size * 0.7, 4);
        const m = new THREE.Mesh(geo, mat(palette.roof, 0.5, 0.3));
        m.position.y = size * 0.35 + 0.5; m.rotation.y = Math.PI / 4; m.castShadow = true; g.add(m);
        const base = new THREE.Mesh(new THREE.BoxGeometry(size * 1.4, 0.5, size * 1.4), mat(palette.wall));
        base.position.y = 0.25; g.add(base);
      } else if (k === "tile") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(size * 1.4, 0.05, size * 1.4), mat(palette.tile, 0.4));
        m.position.y = 0.05; m.receiveShadow = true; g.add(m);
      } else if (k === "cabinet") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(size * 1.4, 0.9, 0.6), mat(palette.cabinet, 0.6));
        m.position.y = 0.45; m.castShadow = true; g.add(m);
        const top = new THREE.Mesh(new THREE.BoxGeometry(size * 1.5, 0.06, 0.7), mat(0x2a2a2a, 0.3));
        top.position.y = 0.93; g.add(top);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat(palette.generic));
        m.position.y = size / 2; m.castShadow = true; g.add(m);
      }
      this.buildingGroup.add(g);
    });

    // frame the camera on the layout
    this.zoomFactor = Math.max(0.8, Math.min(1.6, cols * 0.45));
    this._needsRender = true;
  }

  /* Parametric-component mode (carport & future structures): render a flat
     component array produced by a pure build function — each entry
     { kind:'box'|'cyl', args, pos:[x,y,z], rot?, col, stage } — so the 3D,
     the estimate, and the build animation all read the same array. */
  buildComponents(components, spec = {}) {
    this.clearBuilding();
    this.isTower = false;
    this.spec = spec; // non-null so setProgress() stage reveal works
    this.stageOrder = ["foundation", "frame", "walls", "roof", "finishes"];

    for (const c of components || []) {
      const geo = c.kind === "cyl"
        ? new THREE.CylinderGeometry(c.args[0], c.args[1], c.args[2], 20)
        : new THREE.BoxGeometry(...c.args);
      const mat = new THREE.MeshStandardMaterial({ color: c.col, metalness: 0.3, roughness: 0.65 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...c.pos);
      if (c.rot) m.rotation.set(...c.rot);
      m.castShadow = true;
      m.userData.stage = c.stage || "frame";
      this.buildingGroup.add(m);
    }

    // frame camera for a small structure
    const span = Math.max(spec.L || 6, spec.W || 6);
    this.zoomFactor = Math.max(0.35, Math.min(1.0, span / 14));
    this._needsRender = true;
  }

  /* Build a high-rise tower: stacked floor plates, central core, façade. */
  buildTower(spec) {
    this.spec = spec;
    this.isTower = true;
    while (this.buildingGroup.children.length) {
      const c = this.buildingGroup.children[0];
      this.buildingGroup.remove(c);
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose()); else c.material?.dispose();
    }
    this.roofMeshes = [];
    this.walkWaypoints = [];

    const plateSide = Math.sqrt(Math.max(1, spec.floorPlateM2));
    const sc = 0.5; // visual scale-down so tall towers fit the viewport
    const side = plateSide * sc;
    const fh = spec.floorHeightM * sc;
    const floors = spec.floors;
    const baseY = 0.4;

    // podium / basement indication
    const basement = spec.basementLevels || 0;
    if (basement > 0) {
      const podMat = new THREE.MeshStandardMaterial({ color: 0x7a7d80, roughness: 0.9 });
      const pod = new THREE.Mesh(new THREE.BoxGeometry(side * 1.3, basement * fh, side * 1.3), podMat);
      pod.position.y = baseY - (basement * fh) / 2;
      pod.userData.stage = "foundation";
      this.buildingGroup.add(pod);
    }

    // slab + core colours by structure type
    const slabColor = spec.structureType === "steel" ? 0x9aa0a6 : 0xbdb9b0;
    const slabMat = new THREE.MeshStandardMaterial({ color: slabColor, roughness: 0.85 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x6e7378, roughness: 0.9 });
    // façade material
    const facadeIsGlass = spec.facadeType !== "precast";
    const facadeMat = new THREE.MeshStandardMaterial({
      color: facadeIsGlass ? 0x6fa8d1 : 0xcfcabf,
      transparent: true, opacity: facadeIsGlass ? 0.38 : 0.72,
      roughness: facadeIsGlass ? 0.12 : 0.85,
      metalness: facadeIsGlass ? 0.5 : 0.05,
      transparent: facadeIsGlass, opacity: facadeIsGlass ? 0.55 : 1,
      emissive: facadeIsGlass ? 0x1a2c3a : 0x000000, emissiveIntensity: facadeIsGlass ? 0.25 : 0,
    });
    const mullionMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.4 });

    // central core (lift/stair shaft) — runs full height
    const coreSide = side * 0.28;
    const totalH = floors * fh;
    const core = new THREE.Mesh(new THREE.BoxGeometry(coreSide, totalH, coreSide), coreMat);
    core.position.set(0, baseY + totalH / 2, 0);
    core.castShadow = true; core.userData.stage = "frame";
    this.buildingGroup.add(core);

    // per-floor: slab plate + façade ring
    for (let f = 0; f < floors; f++) {
      const fy = baseY + f * fh;
      // slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(side, fh * 0.12, side), slabMat);
      slab.position.set(0, fy + fh * 0.06, 0);
      slab.castShadow = true; slab.receiveShadow = true; slab.userData.stage = "frame";
      this.buildingGroup.add(slab);
      // façade panels — 4 sides
      const panelH = fh * 0.86;
      const cy = fy + fh / 2;
      const mk = (w, d, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, panelH, d), facadeMat);
        m.position.set(x, cy, z); m.castShadow = true; m.userData.stage = "walls";
        this.buildingGroup.add(m);
      };
      mk(side, 0.06, 0, side / 2);
      mk(side, 0.06, 0, -side / 2);
      mk(0.06, side, side / 2, 0);
      mk(0.06, side, -side / 2, 0);
      /* carport-style exposed perimeter columns — corners + wall midpoints */
      const colGeo = new THREE.BoxGeometry(0.16, panelH, 0.16);
      const colMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.35, roughness: 0.6 });
      const inset = side / 2 - 0.35;
      for (const [cx, cz] of [[-inset, -inset], [inset, -inset], [-inset, inset], [inset, inset], [0, -inset], [0, inset], [-inset, 0], [inset, 0]]) {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(cx, cy, cz); col.castShadow = true; col.userData.stage = "frame";
        this.buildingGroup.add(col);
      }
      // floor-line mullion band
      const band = new THREE.Mesh(new THREE.BoxGeometry(side + 0.1, fh * 0.06, side + 0.1), mullionMat);
      band.position.set(0, fy + 0.02, 0); band.userData.stage = "walls";
      this.buildingGroup.add(band);

      // walkthrough waypoint at each floor's lobby (next to core), eye height
      this.walkWaypoints.push({ x: coreSide / 2 + 1.2, z: 0, y: fy + 1.55 * sc, name: `Level ${f + 1}` });
    }

    // crown / plant level
    const crown = new THREE.Mesh(new THREE.BoxGeometry(side * 0.9, fh * 0.6, side * 0.9), coreMat);
    crown.position.set(0, baseY + totalH + fh * 0.3, 0);
    crown.castShadow = true; crown.userData.stage = "roof";
    this.roofMeshes.push(crown);
    this.buildingGroup.add(crown);

    // ground plane reference already exists; frame camera for tower height
    this.towerHeight = totalH;
    this.stageOrder = ["foundation", "frame", "walls", "roof", "finishes"];
    this.progress = 1;
  }

  /* progress 0..1: reveal stages in order */
  setProgress(p) {
    this.progress = Math.max(0, Math.min(1, p));
    this._needsRender = true;
    if (!this.spec) return;
    const stageCount = this.stageOrder.length;
    const stageProgress = this.progress * stageCount;
    this.buildingGroup.traverse((obj) => {
      if (!obj.isMesh && !(obj.isGroup && obj.userData.stage)) return;
      const stage = obj.userData.stage;
      if (!stage) return;
      const stageIdx = this.stageOrder.indexOf(stage);
      const reveal = stageProgress - stageIdx; // 0..1+
      if (reveal <= 0) {
        obj.visible = false;
      } else if (reveal >= 1) {
        obj.visible = true;
        obj.scale.set(1, 1, 1);
        if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
        obj.position.y = obj.userData._origY;
      } else {
        obj.visible = true;
        const e = easeOutCubic(reveal);
        if (stage === "foundation") {
          obj.scale.set(e, 1, e);
        } else if (stage === "frame") {
          obj.scale.set(1, e, 1);
          if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
        } else if (stage === "walls") {
          obj.scale.set(1, e, 1);
          if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
          /* Wall grows from the floor — shift down. Each wall is centred so scale Y is enough but visually a slide-up looks nicer */
        } else if (stage === "roof") {
          if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
          obj.position.y = obj.userData._origY + (1 - e) * 8;
          obj.scale.set(1, 1, 1);
        } else if (stage === "finishes") {
          obj.scale.set(e, e, e);
        }
      }
    });
  }

  setAutoRotate(v) { this.autoRotate = v; }
  setPlaying(v) { this.playing = v; }

  /* ----- Walkthrough ----- */
  startWalk() {
    // For a house / custom build, use the cinematic dollhouse tour derived from
    // the current spec (towers keep their level-by-level waypoints).
    if (!this.isTower && this.spec && this.spec.widthM > 0) {
      const floorH = this.spec.wallHeightM || 2.7;
      const totalH = floorH * (this.spec.floors || 1);
      this.walkWaypoints = this._buildTour(this.spec.widthM, this.spec.lengthM, totalH);
    }
    if (this.walkWaypoints.length === 0) return false;
    // ensure fully built so interior exists
    this.progress = 1;
    this.setProgress(1);
    this.mode = "walk";
    this.autoRotate = false;
    this.walkT = 0;
    // hide roof so we can see inside; soften fog
    this.roofMeshes.forEach((m) => (m.visible = false));
    this.scene.fog.near = 60; this.scene.fog.far = 200;
    if (this.onModeChange) this.onModeChange("walk");
    return true;
  }
  stopWalk() {
    this.mode = "orbit";
    this.roofMeshes.forEach((m) => (m.visible = true));
    this.scene.fog.near = 50; this.scene.fog.far = 140;
    this.autoRotate = true;
    if (this.onModeChange) this.onModeChange("orbit");
  }
  setWalkT(t) { this.walkT = Math.max(0, Math.min(1, t)); }

  /* Sample camera position + look target along the waypoint path at param t (0..1).
     Waypoints may carry an explicit `look` target; otherwise the camera looks
     toward the next waypoint. Look targets are interpolated so the pan is smooth. */
  _sampleWalk(t) {
    const wp = this.walkWaypoints;
    const n = wp.length;
    const ey = (p) => (p.y != null ? p.y : this._eyeY());
    const lookOf = (p, fb) => (p.look ? p.look : fb);
    if (n === 1) {
      return { pos: [wp[0].x, ey(wp[0]), wp[0].z], look: lookOf(wp[0], [wp[0].x + 1, ey(wp[0]), wp[0].z]), name: wp[0].name };
    }
    const segs = n - 1;
    const scaled = t * segs;
    const i = Math.min(segs - 1, Math.floor(scaled));
    const local = scaled - i;
    const a = wp[i], b = wp[i + 1];
    const px = a.x + (b.x - a.x) * local;
    const pz = a.z + (b.z - a.z) * local;
    const py = ey(a) + (ey(b) - ey(a)) * local;
    const fb = [b.x, ey(b), b.z];
    const la = lookOf(a, fb), lb = lookOf(b, fb);
    return {
      pos: [px, py, pz],
      look: [la[0] + (lb[0] - la[0]) * local, la[1] + (lb[1] - la[1]) * local, la[2] + (lb[2] - la[2]) * local],
      name: local < 0.5 ? a.name : b.name,
    };
  }

  /* Cinematic tour path from the building envelope: approach the front, then
     rise into a roof-off dollhouse orbit that reveals the whole layout — no
     more staring into an interior partition wall. */
  _buildTour(w, l, totalH) {
    const diag = Math.sqrt(w * w + l * l);
    const R = diag * 0.72 + 6;                    // orbit radius, outside the walls
    const H = totalH + Math.max(6, diag * 0.3);   // dollhouse height above the roofline
    const front = l / 2;
    const c = [0, Math.min(2.2, totalH * 0.45), 0]; // look at the building, low
    return [
      { x: 0,          y: 1.9,      z: front + Math.max(9, l * 0.85), look: [0, 1.7, front - 1], name: "Approaching front" },
      { x: 0,          y: 1.9,      z: front + 1.6,                   look: [0, 1.6, 0],          name: "At the entry" },
      { x: w * 0.4,    y: H * 0.62, z: front + R * 0.4,               look: c,                    name: "Rising over the layout" },
      { x: R,          y: H,        z: R * 0.25,                      look: c,                    name: "Layout" },
      { x: R * 0.25,   y: H,        z: -R,                            look: c,                    name: "Rear" },
      { x: -R,         y: H,        z: -R * 0.25,                     look: c,                    name: "Side" },
      { x: -R * 0.25,  y: H,        z: R,                             look: c,                    name: "Layout" },
      { x: 0,          y: H * 0.8,  z: front + R * 0.55,              look: c,                    name: "Layout" },
    ];
  }
  _eyeY() {
    const slabH = 0.4;
    return slabH + 1.55;
  }

  animate() {
    this._animId = requestAnimationFrame(this.animate);

    // Skip all work when the canvas isn't visible (scrolled away / tab hidden).
    // This is the single biggest perf win — no GPU churn when you're reading
    // the cost breakdown instead of looking at the model.
    if (this.paused) return;

    // When idle (not rotating, not walking, not playing), there's nothing moving
    // — render once to settle, then stop until something changes.
    const moving = this.mode === "walk" || this.autoRotate || this.playing;
    if (!moving) {
      if (this._needsRender) { this.renderer.render(this.scene, this.camera); this._needsRender = false; }
      return;
    }

    if (this.mode === "walk") {
      this.walkT += this.walkSpeed;
      if (this.walkT >= 1) this.walkT = 0; // loop the tour
      const s = this._sampleWalk(this.walkT);
      this.camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      this.camera.lookAt(s.look[0], s.look[1], s.look[2]);
      if (this.onWalkProgress) this.onWalkProgress(this.walkT, s.name);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.autoRotate || this._userOrbiting) {
      if (this.autoRotate) this.cameraAngle += 0.0025;
      const zoom = this.zoomFactor || 1;
      const tilt = this.tiltFactor != null ? this.tiltFactor : 1;
      if (this.isTower && this.towerHeight) {
        const h = this.towerHeight;
        const r = Math.max(30, h * 1.1) * zoom;
        this.camera.position.x = Math.cos(this.cameraAngle) * r;
        this.camera.position.z = Math.sin(this.cameraAngle) * r;
        this.camera.position.y = (h * 0.6 + 6) * tilt;
        this.camera.lookAt(0, h * 0.45, 0);
      } else {
        /* Low structures (carport spec has H) get a lower orbit + focus so
           they fill the frame instead of sitting under a high camera. */
        const low = this.spec && this.spec.H != null;
        const r = 30 * zoom;
        this.camera.position.x = Math.cos(this.cameraAngle) * r;
        this.camera.position.z = Math.sin(this.cameraAngle) * r;
        this.camera.position.y = (low ? 9 : 18) * tilt;
        this.camera.lookAt(0, low ? Math.max(1.2, this.spec.H * 0.7) : 4, 0);
      }
    }
    if (this.playing) {
      this.progress += 0.0035;
      if (this.progress >= 1) {
        this.progress = 1;
        this.playing = false;
        if (this.onComplete) this.onComplete();
      }
      this.setProgress(this.progress);
    }
    this.renderer.render(this.scene, this.camera);
  }

  setPaused(v) { this.paused = v; if (!v) this._needsRender = true; }
  requestRender() { this._needsRender = true; }

  dispose() {
    cancelAnimationFrame(this._animId);
    this._resizeObs.disconnect();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}
