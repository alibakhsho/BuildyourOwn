/* =========================================================================
   MODULE: engine3D.js
   Three.js scene. Builds a procedural building from a spec and animates
   the construction sequence.
   ========================================================================= */
import * as THREE from "three";
import { pickQuality, skyEnvironment, createComposer, frameGuard } from "./renderfx.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CadLines } from "./cad-lines.js";
import { easeOutCubic } from "../lib/format.js";
import { buildHouse } from "./house-builder.js";
import { highlightMember } from "./structure-render.js";
import { SYSTEMS } from "../logic/structure/model.js";
import { explodeOffset, explodeCycle, EXPLODE_SPREAD } from "../logic/structure/explode.js";
import { grassTexture, gravelTexture } from "./materials3d.js";
import { finishProps } from "../logic/finishes.js";

export class Engine3D {
  constructor(mountEl, { quality = "auto" } = {}) {
    this.mount = mountEl;
    this.quality = pickQuality(quality);
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
    this._sky = skyTex; this._fog = this.scene.fog;

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 500);
    this.camera.position.set(28, 22, 28);
    this.camera.lookAt(0, 4, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    // Cap pixel ratio at 1.5 — drawing at full 2x/3x device ratio costs 4-9x the
    // pixels for no visible benefit on this kind of model.
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    // soft-edged sun shadows where the GPU can afford them
    this.renderer.shadowMap.type = this.quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if ("outputColorSpace" in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountEl.appendChild(this.renderer.domElement);
    this.renderer.localClippingEnabled = true;    // section cuts
    // a perspective camera for 3D views and an orthographic one for true
    // plan / elevation views, like a CAD package
    this.persp = this.camera;
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
    this.view = "persp";
    this.style = "realistic";
    this.clipPlanes = [];

    // Lights — sky/ground hemisphere for natural fill, key light for form, soft fill to lift shadows
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0xb9a98a, 0.55);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff4d6, 1.05);
    dir.position.set(24, 34, 18);
    dir.castShadow = true;
    const sm = this.quality === "high" ? 4096 : 2048;
    dir.shadow.mapSize.set(sm, sm);
    dir.shadow.normalBias = 0.02;
    this.sun = dir;
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
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xffffff, roughness: 1.0 });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.04;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Cleared building pad — gravel/dirt the structure is built on (reads as a site)
    const padMat = new THREE.MeshStandardMaterial({ map: gravelTexture(), color: 0xffffff, roughness: 1.0 });
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
    this._pad = pad; this._grid = grid;
    // everything that is the site, not the building (hideable to see footings)
    this.siteObjects = this.scene.children.filter((o) => !o.isLight);

    // Building group
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    // Animation state
    this.progress = 0; // 0..1 across all stages
    this.cameraAngle = Math.PI * 0.25;
    this.autoRotate = true;
    this.playing = false;
    this.spec = null;
    this.viewMode = "finished"; // "finished" | "structural"

    // Image-based lighting from an outdoor sky (sun where the key light is),
    // so glass, Colorbond and glazing reflect daylight, not a studio box.
    try {
      this.scene.environment = skyEnvironment(this.renderer, dir.position);
    } catch (e) { /* no WebGL — plain lighting still works */ }

    // High tier: ambient occlusion + MSAA for the realistic perspective view
    // (CAD lines and the orthographic plan/elevation views render as before).
    // A frame-time guard drops a struggling machine back to the plain path.
    this.fx = null;
    if (this.quality === "high") {
      try {
        this.fx = createComposer(this.renderer, this.scene, this.persp, this.width || 1, this.height || 1);
        this._guard = frameGuard(() => this.setQuality("low"));
      } catch (e) { this.fx = null; }
    }

    // Walkthrough state
    this.mode = "orbit"; // "orbit" | "walk"
    this.walkWaypoints = []; // rooms (name, centre, extent) — where a walk can start or jump to
    this._walkRoof = false;  // roof + ceilings off while walking, so daylight reaches the rooms
    this._walkServices = false; // pipes + cables hidden in the walls while walking
    this.roofMeshes = [];    // hidden during walkthrough
    this.onWalkProgress = null;
    this.onModeChange = null;

    this.animate = this.animate.bind(this);
    this._animId = requestAnimationFrame(this.animate);

    this._resizeObs = new ResizeObserver(() => this.resize());
    this._resizeObs.observe(mountEl);

    // ---- Camera: orbit (left drag), pan (right drag / two fingers),
    //      zoom toward the cursor (wheel / pinch), like a CAD viewer ----
    this.zoomFactor = 1;
    this.tiltFactor = 1;
    this.cameraAngle = Math.PI * 0.25;
    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    this.controls = new OrbitControls(this.camera, el);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 0.05;   // right up to a single screw
    this.controls.maxDistance = 600;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    // "auto-rotate" is the drifting camera (_driftStep), not OrbitControls' fixed-point spin
    this.controls.autoRotate = false;
    this.controls.addEventListener("start", () => {
      this._drift = null;
      this._fly = null;
      if (this.autoRotate) { this.autoRotate = false; this.onAutoRotateChange?.(false); }
    });
    this.controls.addEventListener("change", () => { this._needsRender = true; });
    // a click (press + release without moving) picks the piece under the cursor;
    // a double-click flies up close to it
    let downX = 0, downY = 0;
    el.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
    el.addEventListener("pointerup", (e) => {
      if (e.button === 0 && Math.hypot(e.clientX - downX, e.clientY - downY) < 5) this.pickAt(e.clientX, e.clientY);
    });
    el.addEventListener("dblclick", (e) => this.focusAt(e.clientX, e.clientY));
    this._bindWalkInput(el);
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
    this.persp.aspect = this.width / this.height;
    this.persp.updateProjectionMatrix();
    this._fitOrtho();
    this.renderer.setSize(this.width, this.height);
    if (this.fx && this.width && this.height) this.fx.composer.setSize(this.width, this.height);
    // setSize clears the canvas — when idle nothing else would redraw it
    this._needsRender = true;
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

  /* Build / rebuild the building meshes from spec. All geometry comes from
     logic/house-geometry.js so the model and the estimate share one set of
     numbers (window count, glazed area, slab, rooms, solar). */
  buildFromSpec(spec) {
    this.spec = spec;
    this.isTower = false;
    this._clearGroup();
    const { waypoints, summary, structure, byId } = buildHouse(this.buildingGroup, spec);
    this.walkWaypoints = waypoints;
    this.buildSummary = summary;
    this.structure = structure;
    this.memberHits = byId;
    this._indexFinishes();
    this.setFinishes(spec.finishes);
    this._yardOn = !!structure?.landscape;
    if (this._pad) this._pad.visible = !this._yardOn && this.siteVisible !== false;
    if (this._grid) this._grid.visible = !this._yardOn && this.siteVisible !== false;
    this.selected = null;
    this._unhighlight = null;
    this.roofMeshes = [];
    this.buildingGroup.traverse((o) => { if (o.userData && (o.userData.zone === "roof" || o.userData.zone === "ceiling")) this.roofMeshes.push(o); });
    this.stageOrder = ["foundation", "frame", "roof", "walls", "finishes"];
    this._indexStages();
    if (this.style !== "realistic") this._applyStyle(); else this._applyClipping();
    if (this.layerVisible) this._applyVisibility();
    // with the yard modelled, frame the whole lot (a little tighter — the house is the subject)
    const lot = structure?.landscape?.lot;
    this._frameCamera(lot ? (lot.X1 - lot.X0) * 0.8 : spec.widthM, lot ? (lot.Z1 - lot.Z0) * 0.8 : spec.lengthM, (spec.wallHeightM || 2.7) * (spec.floors || 1));
    this.applyViewMode();
    if (this.explodeT) this.setExplode(this.explodeT);
    this._needsRender = true;
  }

  /* Multi-dwelling: lay each house type out on its own lots along a street,
     using the same house builder as a single home, so every dwelling is as
     accurate as the one-off model. Rendering is capped (MAX_DRAWN) — a
     60-lot estate would be ~23k meshes — and the summary says how many of
     the total are drawn. */
  buildEstate(types) {
    this.spec = { estate: true };
    this.isTower = false;
    this._clearGroup();
    const MAX_DRAWN = 24, PER_ROW = 6, SIDE_GAP = 3, STREET = 14;
    const lots = [];
    for (const t of types || []) for (let i = 0; i < Math.round(+t.count || 0); i++) lots.push(t.spec);
    const drawn = lots.slice(0, MAX_DRAWN);
    const lotW = (s) => s.widthM + (s.hasGarage ? 6.4 : 0) + SIDE_GAP;
    const rows = [];
    for (let i = 0; i < drawn.length; i += PER_ROW) rows.push(drawn.slice(i, i + PER_ROW));
    let z = 0, maxW = 0, maxH = 0;
    rows.forEach((row, r) => {
      const width = row.reduce((a, s) => a + lotW(s), 0);
      const depth = Math.max(...row.map((s) => s.lengthM));
      let x = -width / 2;
      // even rows face +z, odd rows face the same street from the other side
      const face = r % 2 === 0 ? 1 : -1;
      row.forEach((s) => {
        const g = new THREE.Group();
        buildHouse(g, s, { detail: "lite" });
        const lw = lotW(s);
        g.position.set(x + lw / 2 + (s.hasGarage ? 3.2 : 0), 0, z);
        if (face < 0) g.rotation.y = Math.PI;
        this.buildingGroup.add(g);
        x += lw;
        maxH = Math.max(maxH, (s.wallHeightM || 2.7) * (s.floors || 1));
      });
      maxW = Math.max(maxW, width);
      z -= depth + (r % 2 === 0 ? STREET : 8);
    });
    // centre the estate on the origin
    this.buildingGroup.children.forEach((g) => { g.position.z -= z / 2; });
    this.walkWaypoints = [];
    this.roofMeshes = [];
    this.buildingGroup.traverse((o) => { if (o.userData && o.userData.stage === "roof") this.roofMeshes.push(o); });
    this.stageOrder = ["foundation", "frame", "walls", "roof", "finishes"];
    this.buildSummary = { dwellings: lots.length, drawn: drawn.length };
    this.structure = null;
    this._indexStages();
    this._frameCamera(maxW, Math.abs(z), maxH);
    this.applyViewMode();
    this._needsRender = true;
  }

  /* "finished" shows the house as built; "structural" fades every skin
     surface (cladding, roof sheeting, glass) so the frame reads through. */
  setViewMode(mode) {
    this.viewMode = mode === "structural" ? "structural" : "finished";
    this.applyViewMode();
    this._needsRender = true;
  }

  /* Show or hide the ground, pad, grid and trees. */
  setSiteVisible(v) {
    this.siteVisible = !!v;
    if (this._studio) { this._studio.site = !!v; this._needsRender = true; return; }
    for (const o of this.siteObjects || []) o.visible = !!v;
    // a modelled yard has its own lawn and paving: no building pad or setout grid over it
    if (this._yardOn) { if (this._pad) this._pad.visible = false; if (this._grid) this._grid.visible = false; }
    this._needsRender = true;
  }

  /* ---- Layers (one per building system) ---- */
  layers() {
    const out = new Map();
    this.buildingGroup.traverse((o) => {
      const sys = o.userData && o.userData.sys;
      if (!sys) return;
      const r = out.get(sys) || { sys, label: SYSTEMS[sys]?.label || sys, order: SYSTEMS[sys]?.order ?? 99, pieces: 0, visible: this.layerVisible?.[sys] !== false };
      r.pieces += o.userData.total || 1;
      out.set(sys, r);
    });
    return [...out.values()].sort((a, b) => a.order - b.order);
  }
  setLayerVisible(sys, visible) {
    this.layerVisible = { ...(this.layerVisible || {}), [sys]: !!visible };
    this._applyVisibility();
    this._needsRender = true;
  }
  /* Show one system on its own (e.g. just the roof framing). */
  isolateLayer(sys) {
    this.setLayers(Object.fromEntries(Object.keys(SYSTEMS).map((k) => [k, k === sys])));
  }
  setLayers(map) {
    this.layerVisible = { ...map };
    this._applyVisibility();
    this._needsRender = true;
  }
  /* Layer visibility in effect: the user's choice, and while walking the pipes
     and cables stay inside the walls unless asked for. */
  _layers() {
    const lv = this.layerVisible || {};
    return this.mode === "walk" && !this._walkServices ? { ...lv, electrical: false, plumbing: false, drainage: false } : lv;
  }
  _applyVisibility() {
    const lv = this._layers();
    this.buildingGroup.traverse((o) => {
      const sys = o.userData && o.userData.sys;
      if (!sys) return;
      const stageOn = o.userData._stageOn !== false;
      const walkHidden = this._roofHidden() && (o.userData.zone === "roof" || o.userData.zone === "ceiling");
      const fineHidden = o.userData.fine && !this._showFine;
      o.visible = lv[sys] !== false && stageOn && !walkHidden && !fineHidden;
    });
  }

  /* ---- Picking: click a piece, get its record ---- */
  pickAt(clientX, clientY) {
    const h = this._hitAt(clientX, clientY);
    const id = h ? h.id : null;
    this.select(id);
    return id;
  }
  /* The first solid piece under a screen point: { id, point, distance }. */
  _hitAt(clientX, clientY) {
    if (!this.structure) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets = [];
    this.buildingGroup.traverse((o) => { if (o.isMesh && o.visible && o.userData.memberIds) targets.push(o); });
    // see-through things (glass, x-rayed skins) don't block the pick
    const hits = ray.intersectObjects(targets, false).filter((h) => !(h.object.material.transparent && h.object.material.opacity < 0.5));
    const h = hits[0];
    if (!h) return null;
    return { id: h.object.userData.memberIds[h.instanceId ?? 0], point: h.point, distance: h.distance };
  }

  /* Fly up close to the piece under a screen point (double-click / double-tap):
     the stand-off is from the piece's size, so a screw fills the view at a
     hand's width and a wall frame from a couple of metres. */
  focusAt(clientX, clientY) {
    const h = this._hitAt(clientX, clientY);
    if (!h) return null;
    const m = this.structure.members[h.id];
    this.select(h.id);
    const size = m ? Math.max(m.len || 0, m.d || 0, m.w || 0) : 1;
    const dist = Math.min(2.5, Math.max(0.16, size * 1.1));
    const cam = this.camera.position;
    const dir = cam.clone().sub(h.point).normalize();
    if (this.mode === "walk") {
      const W = this._walk;
      const to = h.point.clone().addScaledVector(dir, dist);
      const look = h.point.clone().sub(to);
      W.fly = { t0: performance.now(), dur: 650, from: W.pos.clone(), to, yaw0: W.yaw, pitch0: W.pitch,
        yaw1: W.yaw + wrapAngle(Math.atan2(-look.x, -look.z) - W.yaw), pitch1: Math.atan2(look.y, Math.hypot(look.x, look.z)) };
    } else {
      if (this.view !== "persp") this.setView("persp", { keep: true });
      this._drift = null;
      if (this.autoRotate) { this.autoRotate = false; this.onAutoRotateChange?.(false); }
      this._fly = { t0: performance.now(), dur: 650, cam0: cam.clone(), tgt0: this.controls.target.clone(),
        cam1: h.point.clone().addScaledVector(dir, dist), tgt1: h.point.clone() };
    }
    this._needsRender = true;
    return h.id;
  }

  /* ---- Finishes: tiles, mirror, glass, splashback, benchtop… ----
     Materials are shared by key, so one change recolours every piece of that
     material in the house, live, without a rebuild. The untouched look is
     kept on the material so "Standard" always returns to it. */
  setFinishes(map) {
    const next = { ...(map || {}) };
    const changed = JSON.stringify(next) !== JSON.stringify(this.finishes || {});
    this.finishes = next;
    // drop the yellow selection tint so the new finish shows on the picked piece too
    if (changed && this._unhighlight) { this._unhighlight(); this._unhighlight = null; }
    this._applyFinishes();
  }
  _indexFinishes() {
    const byKey = new Map();
    this.buildingGroup.traverse((o) => {
      const k = o.userData && o.userData.mat;
      const mat = o.userData && (o.userData._mat || o.material);   // the real material, not a style or highlight stand-in
      if (!k || !mat || Array.isArray(mat)) return;
      (byKey.get(k) || byKey.set(k, new Set()).get(k)).add(mat);
    });
    this._finishMats = byKey;
  }
  _applyFinishes() {
    if (!this._finishMats) return;
    const want = this.finishes || {};
    for (const [key, mats] of this._finishMats) {
      const props = finishProps(key, want[key]);
      for (const mat of mats) {
        const ud = mat.userData || (mat.userData = {});
        if (!props && !ud.finishBase) continue;
        if (!ud.finishBase) ud.finishBase = { color: mat.color.getHex(), opacity: mat.opacity, roughness: mat.roughness, metalness: mat.metalness, transparent: mat.transparent, depthWrite: mat.depthWrite };
        const b = ud.finishBase;
        mat.color.setHex(props && props.color != null ? props.color : b.color);
        mat.roughness = props && props.roughness != null ? props.roughness : b.roughness;
        mat.metalness = props && props.metalness != null ? props.metalness : b.metalness;
        const op = props && props.opacity != null ? props.opacity : b.opacity;
        mat.opacity = op;
        mat.transparent = op < 1 ? true : b.transparent;
        mat.depthWrite = op < 1 ? false : b.depthWrite;
        mat.needsUpdate = true;
      }
    }
    this._needsRender = true;
  }
  select(id) {
    if (this._unhighlight) { this._unhighlight(); this._unhighlight = null; }
    const m = id != null && this.structure ? this.structure.members[id] : null;
    this.selected = m || null;
    if (m) this._unhighlight = highlightMember(this.memberHits.get(m.id));
    if (this.onPick) this.onPick(this.selected);
    this._needsRender = true;
    return this.selected;
  }

  /* Each stage reveals its pieces in construction order: the member ids
     (assigned in build order) are the timeline. */
  _indexStages() {
    const range = {};
    this.buildingGroup.traverse((o) => {
      const st = o.userData && o.userData.stage, ids = o.userData && o.userData.memberIds;
      if (!st || !ids || !ids.length) return;
      const r = range[st] || (range[st] = [Infinity, -Infinity]);
      r[0] = Math.min(r[0], ids[0]); r[1] = Math.max(r[1], ids[ids.length - 1]);
    });
    this.stageRange = range;
  }
  applyViewMode() {
    const xray = this.viewMode === "structural";
    this.buildingGroup.traverse((o) => {
      if (!o.isMesh || !o.userData.skin) return;
      if (!o.userData._mat) o.userData._mat = o.material;
      if (xray) {
        if (!o.userData._xray) {
          o.userData._xray = o.userData._mat.clone();
          o.userData._xray.transparent = true; o.userData._xray.opacity = 0.18; o.userData._xray.depthWrite = false;
        }
        o.material = o.userData._xray; o.castShadow = false;
      } else { o.material = o.userData._mat; o.castShadow = true; }
    });
  }

  /* ---- Exploded assembly (logic/structure/explode.js says where each
     piece goes). Only translations change, so it is one pass over the
     instance matrices; picking, highlights, sections and CAD lines all
     follow the moved pieces. ---- */
  _explodeSetup() {
    const s = this.structure;
    if (!s) return null;
    const env = { w: s.env?.w ?? this.spec?.widthM ?? 10, l: s.env?.l ?? this.spec?.lengthM ?? 10, plateY: s.env?.plateY ?? 2.7 };
    const entries = [], bySys = new Map();
    this.buildingGroup.traverse((o) => {
      const ids = o.userData && o.userData.memberIds;
      if (!o.isMesh || !ids || !ids.length) return;
      const n = ids.length, off = new Float32Array(n * 3), ctr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const m = s.members[ids[i]];
        if (!m) continue;
        off.set(explodeOffset(m, env), i * 3);
        ctr.set([(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2], i * 3);
      }
      const E = { o, off, ctr, base: o.isInstancedMesh ? Float32Array.from(o.instanceMatrix.array) : o.position.toArray() };
      entries.push(E);
      // a spread sample of each system's pieces, for the callouts
      const sys = o.userData.sys, list = bySys.get(sys) || [];
      const step = Math.max(1, Math.floor(n / 60));
      for (let i = 0; i < n; i += step) list.push([E, i]);
      bySys.set(sys, list);
    });
    return { entries, bySys };
  }

  /* t 0..1 pulls the building apart. pieces: also open a gap between
     every individual piece (studs, bricks, battens, screws). */
  setExplode(t, opts = {}) {
    const prev = this.explodeT || 0;
    this.explodeT = Math.max(0, Math.min(1, +t || 0));
    this._followExplode(this.explodeT - prev);
    if ("pieces" in opts) this.explodePieces = !!opts.pieces;
    if (!this._explode) this._explode = this._explodeSetup();
    if (!this._explode) return;
    const e = this.explodeT, k = this.explodePieces ? EXPLODE_SPREAD * e : 0;
    for (const { o, off, ctr, base } of this._explode.entries) {
      if (o.isInstancedMesh) {
        const arr = o.instanceMatrix.array, n = off.length / 3;
        for (let i = 0; i < n; i++) {
          const j = i * 16 + 12, q = i * 3;
          arr[j] = base[j] + off[q] * e + ctr[q] * k;
          arr[j + 1] = base[j + 1] + off[q + 1] * e + ctr[q + 1] * k * 0.5;
          arr[j + 2] = base[j + 2] + off[q + 2] * e + ctr[q + 2] * k;
        }
        o.instanceMatrix.needsUpdate = true;
      } else {
        o.position.set(base[0] + off[0] * e + ctr[0] * k, base[1] + off[1] * e + ctr[1] * k * 0.5, base[2] + off[2] * e + ctr[2] * k);
      }
    }
    this._needsRender = true;
  }

  /* Keep the pulled-apart stack in frame: as the layers rise, the orbit
     target rises with them and the camera eases back a little. */
  _followExplode(dt) {
    if (!dt || !this.structure || this.mode !== "orbit" || this.camera !== this.persp) return;
    const env = this.structure.env || {};
    const S = Math.max(env.w || 10, env.l || 10) * 0.12 + 0.6;
    const t = this.controls.target, cam = this.camera.position;
    const off = cam.clone().sub(t).multiplyScalar(Math.exp(dt * 0.26));   // exact inverse on the way back
    t.y += dt * S * 1.6;
    cam.copy(t).add(off);
    if (this._drift) this._drift = null;
    this.controls.update();
  }

  /* Loop assemble → explode → assemble, like the joinery viewer. */
  playExplode(on) {
    this._explodePlay = on ? { t0: performance.now() - 0.15 * 9000 } : null;
    this._needsRender = true;
  }

  /* Numbered labels for the exploded layers: one per visible system, on
     the sampled piece nearest the camera, in screen pixels. */
  explodeCallouts() {
    if (!this._explode || !(this.explodeT > 0.05)) return [];
    const lv = this._layers(), e = this.explodeT, k = this.explodePieces ? EXPLODE_SPREAD * e : 0;
    const cam = this.camera, w = this.width || 1, h = this.height || 1, v = new THREE.Vector3();
    const out = [];
    for (const [sys, list] of this._explode.bySys) {
      if (lv[sys] === false || !SYSTEMS[sys]) continue;
      let best = null, bd = Infinity;
      for (const [E, i] of list) {
        if (!E.o.visible || (E.o.isInstancedMesh && i >= E.o.count)) continue;
        const q = i * 3;
        v.set(E.ctr[q] + E.off[q] * e + E.ctr[q] * k, E.ctr[q + 1] + E.off[q + 1] * e + E.ctr[q + 1] * k * 0.5, E.ctr[q + 2] + E.off[q + 2] * e + E.ctr[q + 2] * k);
        const d = v.distanceToSquared(cam.position);
        if (d < bd) { bd = d; best = v.clone(); }
      }
      if (!best) continue;
      best.project(cam);
      if (best.z > 1 || Math.abs(best.x) > 1.1 || Math.abs(best.y) > 1.1) continue;
      out.push({ sys, label: SYSTEMS[sys].label, order: SYSTEMS[sys].order, x: (best.x + 1) / 2 * w, y: (1 - best.y) / 2 * h });
    }
    return out.sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, n: i + 1 }));
  }

  /* Orbit radius + height that frame the whole building whatever its size. */
  _frameCamera(w, l, h) {
    const diag = Math.sqrt((w || 10) ** 2 + (l || 10) ** 2);
    // a single house needs room around it; a whole street fills the frame
    const k = diag > 60 ? 0.95 : 1.45;
    this.frameRadius = Math.max(16, diag * k + h * 0.8);
    this.frameHeight = Math.max(7, h * 1.6 + diag * (diag > 60 ? 0.4 : 0.28));
    this.frameLookY = Math.max(1.5, h * 0.45);
    // keep fog behind the subject: a big estate seen from far away must not
    // disappear into haze (fog used to end at a fixed 175 m)
    this.scene.fog.near = Math.max(62, this.frameRadius * 1.2);
    this.scene.fog.far = Math.max(175, this.frameRadius * 3);
    this.persp.far = Math.max(500, this.frameRadius * 5);
    this.persp.updateProjectionMatrix();
    this.frameSize = Math.max(w || 10, l || 10, h || 3);
    const key = [Math.round((w || 0) * 2), Math.round((l || 0) * 2), Math.round((h || 0) * 2)].join(":");
    if (key !== this._frameKey) {
      this._frameKey = key;
      this.home();
    }
  }

  /* Roof and ceilings lifted off while walking (unless the walker turns them back on). */
  _roofHidden() { return this.mode === "walk" && !this._walkRoof; }

  /* Back to the starting 3/4 view of the whole building. */
  home() {
    this._drift = null;
    if (this.view !== "persp") this.setView("persp", { keep: true });
    this.controls.target.set(0, this.frameLookY || 4, 0);
    this._updateOrbitCamera();
    this.controls.update();
    this._needsRender = true;
  }

  /* Standard views: "persp" (3D), "top" (plan), "front", "back", "left",
     "right" — the elevations and plan use a true orthographic camera. */
  setView(view, { keep = false } = {}) {
    const t = this.controls.target.clone();
    const R = Math.max(30, (this.frameRadius || 30) * 2);
    if (view === "persp") {
      this.camera = this.persp;
      this.view = "persp";
      this.controls.object = this.persp;
      this.controls.maxPolarAngle = Math.PI * 0.495;
      if (!keep) { this.controls.target.set(0, this.frameLookY || 4, 0); this._updateOrbitCamera(); }
    } else {
      this.camera = this.ortho;
      this.view = view;
      this.controls.object = this.ortho;
      this.controls.maxPolarAngle = Math.PI;
      const ty = view === "top" ? 0 : Math.max(1.5, (this.frameLookY || 3));
      t.set(0, ty, 0);
      this.controls.target.copy(t);
      const pos = {
        top: [0, R, 0.0005 * R], front: [0, 0, R], back: [0, 0, -R], left: [-R, 0, 0], right: [R, 0, 0],
      }[view] || [0, 0, R];
      this.ortho.position.set(t.x + pos[0], t.y + pos[1], t.z + pos[2]);
      this.ortho.zoom = 1;
      this._fitOrtho();
      this.ortho.lookAt(t);
    }
    if (this.autoRotate && view !== "persp") { this.autoRotate = false; this.onAutoRotateChange?.(false); }
    this._drift = null;
    this.cadLines?.setCamera(this.camera);
    this.controls.update();
    this._needsRender = true;
  }
  _fitOrtho() {
    if (!this.ortho) return;
    const aspect = (this.width || 1) / (this.height || 1);
    const s = Math.max(4, (this.frameSize || 15) * 0.62);
    this.ortho.left = -s * aspect; this.ortho.right = s * aspect;
    this.ortho.top = s; this.ortho.bottom = -s;
    this.ortho.near = 0.1; this.ortho.far = 4000;
    this.ortho.updateProjectionMatrix();
  }

  /* Section cut: "off", "plan" (cut at a height, look down into the
     rooms), "long" (along the ridge) or "cross" (across it). */
  setSection(mode, at) {
    let planes = [];
    if (mode === "plan") planes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), at)];
    else if (mode === "long") planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), at)];
    else if (mode === "cross") planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), at)];
    this.clipPlanes = planes;
    this.section = { mode, at };
    this.renderer.__byoClip = planes.length ? planes : null;
    this._applyClipping();
    this._needsRender = true;
  }
  _applyClipping() {
    const planes = this.clipPlanes && this.clipPlanes.length ? this.clipPlanes : null;
    const seen = new Set();
    this.buildingGroup.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [o.material, o.userData._mat, o.userData._xray, o.userData._clay].filter(Boolean)) {
        if (seen.has(m)) continue;
        seen.add(m);
        const had = !!(m.clippingPlanes && m.clippingPlanes.length);
        m.clippingPlanes = planes; m.clipShadows = true;
        if (had !== !!planes) m.needsUpdate = true;
      }
    });
  }

  /* Display style: "realistic", "lines" (shaded + CAD edges) or "white"
     (white architectural model with edges). */
  setStyle(style) {
    this.style = style;
    if (this._edgeStyle() && !this.cadLines) {
      this.cadLines = new CadLines(this.renderer, this.scene, this.camera, (o) => {
        for (let p = o; p; p = p.parent) if (p === this.buildingGroup) return true;
        return false;
      });
    }
    this._applyStudio(style === "studio");
    this._applyStyle();
    this._needsRender = true;
  }
  /* Styles drawn with CAD edges over the shading. */
  _edgeStyle() { return this.style === "lines" || this.style === "white" || this.style === "studio"; }
  /* "studio": the model on a plain seamless backdrop with a soft contact
     shadow and CAD edges — the look of an exploded joinery drawing. The
     sky, fog and site come back when you leave it. */
  _applyStudio(on) {
    if (on === !!this._studio) return;
    if (on) {
      if (!this._studioBg) {
        const c = document.createElement("canvas");
        c.width = 2; c.height = 256;
        const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#eceae5"); grad.addColorStop(0.6, "#e2dfd8"); grad.addColorStop(1, "#d6d3cb");
        g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
        this._studioBg = new THREE.CanvasTexture(c);
        if ("colorSpace" in this._studioBg) this._studioBg.colorSpace = THREE.SRGBColorSpace;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.ShadowMaterial({ opacity: 0.22 }));
        floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
        this._studioFloor = floor;
      }
      this._studio = { site: this.siteVisible !== false };
      this.scene.background = this._studioBg;
      this.scene.fog = null;
      this.scene.add(this._studioFloor);
      for (const o of this.siteObjects || []) o.visible = false;
    } else {
      const site = this._studio.site;
      this._studio = null;
      this.scene.background = this._sky;
      this.scene.fog = this._fog;
      this.scene.remove(this._studioFloor);
      this.setSiteVisible(site);
    }
  }
  _applyStyle() {
    const white = this.style === "white";
    if (white && !this._clayMat) this._clayMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.9 });
    this.buildingGroup.traverse((o) => {
      if (!o.isMesh || !o.userData.sys) return;
      if (!o.userData._mat) o.userData._mat = o.material;
      const base = o.userData._mat;
      if (white && !base.transparent) {
        o.userData._clay = this._clayMat;
        o.material = this._clayMat;
        // per-piece tints (brick colours) would show through: park them
        if (o.instanceColor) { o.userData._ic = o.instanceColor; o.instanceColor = null; }
      } else if (o.material === this._clayMat) {
        o.material = base;
        if (o.userData._ic) { o.instanceColor = o.userData._ic; o.userData._ic = null; }
      }
    });
    this._applyClipping();
  }

  /* One frame, in the current style. */
  renderFrame() {
    if (this._edgeStyle() && this.cadLines) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      if (size.x !== this._linesW || size.y !== this._linesH) { this._linesW = size.x; this._linesH = size.y; this.cadLines.setSize(size.x, size.y); }
      this.cadLines.setCamera(this.camera);
      this.cadLines.render();
    } else if (this.fx && this.camera === this.persp) {
      this._guard?.tick(performance.now());
      // a tripped guard has just dropped to "low" and freed the post chain
      if (!this.fx) { this.renderer.render(this.scene, this.camera); return; }
      this.fx.ao.enabled = this.viewMode !== "structural"; // AO darkens behind see-through skins
      this.fx.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* Drop to the plain renderer. Only "low" can be applied at runtime — the
     post chain is built once, in the constructor. */
  setQuality(q) {
    if (q !== "low" || !this.fx) return;
    this.fx.composer.dispose?.();
    this.fx.rt.dispose();
    this.fx = null;
    this._guard = null;
    this.quality = "low";
    this._needsRender = true;
  }

  _clearGroup() {
    const g = this.buildingGroup;
    this._finishMats = null;
    g.traverse((o) => {
      if (!o.isMesh) return;
      // instanced members share unit geometries — free only their instances
      if (o.isInstancedMesh) o.dispose();
      else o.geometry?.dispose();
      // textures are cached and shared — only dispose the x-ray clones
      if (o.userData._xray) o.userData._xray.dispose();
    });
    while (g.children.length) g.remove(g.children[0]);
    this._explode = null;
  }

  /* Empty the model entirely — materials-only mode shows just the site. */
  clearBuilding() {
    this.isTower = false;
    this._clearGroup();
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
    this.home();
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
    this.home();
    this._needsRender = true;
  }

  /* Build a high-rise tower: stacked floor plates, central core, façade. */
  buildTower(spec) {
    this.spec = spec;
    this.isTower = true;
    this._clearGroup();
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
    this._frameKey = null;
    this.home();
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
    const ranges = this.stageRange || {};
    this.buildingGroup.traverse((obj) => {
      if (!obj.isMesh && !(obj.isGroup && obj.userData.stage)) return;
      const stage = obj.userData.stage;
      if (!stage) return;
      // structure meshes: show the pieces built up to this point
      if (obj.userData.memberIds && ranges[stage]) {
        const reveal = stageProgress - this.stageOrder.indexOf(stage);
        const [lo, hi] = ranges[stage];
        const ids = obj.userData.memberIds;
        let n;
        if (reveal >= 1) n = ids.length;
        else if (reveal <= 0) n = 0;
        else {
          const limit = lo + (hi - lo) * reveal;
          let a = 0, b = ids.length;
          while (a < b) { const m = (a + b) >> 1; if (ids[m] <= limit) a = m + 1; else b = m; }
          n = a;
        }
        if (obj.isInstancedMesh) obj.count = n;
        obj.userData._stageOn = n > 0;
        const lv = this._layers();
        const walkHidden = this._roofHidden() && (obj.userData.zone === "roof" || obj.userData.zone === "ceiling");
        obj.visible = n > 0 && lv[obj.userData.sys] !== false && !walkHidden && !(obj.userData.fine && !this._showFine);
        return;
      }
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

  setAutoRotate(v) {
    this.autoRotate = !!v;
    this.controls.autoRotate = false;
    this._drift = null;
    this._needsRender = true;
  }

  /* The idle camera: not a spin about one point — the orbit drifts in and
     out, rises and falls, and the point it looks at wanders across the
     building, like a slow drone pass. Starts from wherever the camera is. */
  _driftStep() {
    const now = performance.now();
    if (!this._drift) {
      const tgt = this.controls.target.clone();
      const off = this.camera.position.clone().sub(tgt);
      this._drift = { t0: now, last: now, tgt, r: Math.max(2, Math.hypot(off.x, off.z)), h: off.y, a: Math.atan2(off.z, off.x),
        span: Math.max(2, (this.frameSize || 12) * 0.16) };
    }
    const D = this._drift;
    const dt = Math.min(0.1, (now - D.last) / 1000);
    D.last = now;
    const t = (now - D.t0) / 1000;
    D.a += dt * 0.09;                                            // about 70 s a lap
    const r = D.r * (1 + 0.18 * Math.sin(t * 0.13));
    const h = D.h * (1 + 0.25 * Math.sin(t * 0.087));
    const tx = D.tgt.x + D.span * Math.sin(t * 0.11);
    const tz = D.tgt.z + D.span * 0.75 * Math.sin(t * 0.071);
    const ty = D.tgt.y + 0.5 * Math.sin(t * 0.05);
    this.controls.target.set(tx, ty, tz);
    this.camera.position.set(tx + Math.cos(D.a) * r, ty + h, tz + Math.sin(D.a) * r);
    this._needsRender = true;
  }

  setPlaying(v) { this.playing = v; }

  /* ----- Walkthrough: a free first-person camera -----
     Drag to look around, W A S D to walk, ← → to turn, Q / E (or C / Space)
     to sink and rise, wheel or pinch to step forward and back, Shift to hurry,
     Alt to creep up on a screw. Click a piece to read it, double-click to fly
     up close. Touch screens drag to look, pinch to step and use the on-screen
     pad (walkInput). Walls don't stop you: this is a viewer, so you can step
     through a wall to see the frame, wrap and fixings inside it. */
  startWalk() {
    const rooms = this.walkWaypoints || [];
    if (!rooms.length) return false;
    this.playExplode(false);
    if (this.explodeT) this.setExplode(0);
    this.playing = false;
    this.progress = 1;
    this.setProgress(1);
    if (this.view !== "persp") this.setView("persp", { keep: true });
    this._fly = null;
    this.mode = "walk";
    this.autoRotate = false;
    this._drift = null;
    this.controls.enabled = false;
    const P = this.persp;
    this._walk = {
      pos: new THREE.Vector3(), yaw: 0, pitch: -0.06, keys: new Set(), pad: { f: 0, s: 0, u: 0 },
      fly: null, last: 0, room: null, roomAt: 0,
      saved: { near: P.near, far: P.far, fov: P.fov, fog: [this.scene.fog.near, this.scene.fog.far] },
    };
    P.rotation.order = "YXZ";
    P.near = 0.02; P.far = 400; P.updateProjectionMatrix();
    this.scene.fog.near = 60; this.scene.fog.far = 220;
    this._showFine = true;                       // every screw, plate and tie, all the time
    this._placeInRoom(0, false);
    this.roofMeshes.forEach((m) => (m.visible = this._walkRoof));
    if (this.structure) this._applyVisibility();
    this._needsRender = true;
    this.onModeChange?.("walk");
    return true;
  }
  stopWalk() {
    const W = this._walk;
    this.mode = "orbit";
    this._walk = null;
    const P = this.persp;
    if (W) {
      P.near = W.saved.near; P.far = W.saved.far; P.fov = W.saved.fov;
      this.scene.fog.near = W.saved.fog[0]; this.scene.fog.far = W.saved.fog[1];
    }
    P.rotation.order = "XYZ";
    P.updateProjectionMatrix();
    this.roofMeshes.forEach((m) => (m.visible = true));
    if (this.structure) this._applyVisibility();
    this.controls.enabled = true;
    this.home();
    this.onModeChange?.("orbit");
  }

  /* The rooms a walk can jump to, in plan order. */
  walkRooms() { return (this.walkWaypoints || []).map((r, i) => ({ i, name: r.name })); }
  /* Jump (fly) to the middle of room i, facing across it. */
  walkToRoom(i) { if (this.mode === "walk") this._placeInRoom(i, true); }
  /* Roof and ceilings on or off while walking. */
  setWalkRoof(on) {
    this._walkRoof = !!on;
    if (this.mode !== "walk") return;
    this.roofMeshes.forEach((m) => (m.visible = this._walkRoof));
    if (this.structure) this._applyVisibility();
    this._needsRender = true;
  }
  /* Pipes and cables shown or hidden while walking. */
  setWalkServices(on) {
    this._walkServices = !!on;
    if (this.mode === "walk" && this.structure) this._applyVisibility();
    this._needsRender = true;
  }
  /* Lens: narrower field of view = zoom in without moving (20–75°). */
  setWalkLens(fov) {
    this.persp.fov = Math.max(12, Math.min(80, +fov || 60));
    this.persp.updateProjectionMatrix();
    this._needsRender = true;
  }
  /* On-screen pad: f forward/back, s right/left, u up/down, each -1..1. */
  walkInput(f = 0, s = 0, u = 0) {
    if (!this._walk) return;
    this._walk.pad = { f: +f || 0, s: +s || 0, u: +u || 0 };
    if (f || s || u) this._walk.fly = null;
  }

  _placeInRoom(i, fly) {
    const W = this._walk, r = (this.walkWaypoints || [])[i];
    if (!W || !r) return;
    // stand near one end of the room, looking down its long side
    const alongX = (r.w || 0) >= (r.l || 0);
    const back = Math.max(0, ((alongX ? r.w : r.l) || 0) * 0.5 - 0.6);
    const to = new THREE.Vector3(r.x - (alongX ? back : 0), r.y, r.z + (alongX ? 0 : back));
    const yaw = alongX ? -Math.PI / 2 : 0;          // facing +x, or -z
    if (fly) {
      W.fly = { t0: performance.now(), dur: 900, from: W.pos.clone(), to, yaw0: W.yaw, pitch0: W.pitch,
        yaw1: W.yaw + wrapAngle(yaw - W.yaw), pitch1: -0.06 };
    } else {
      W.pos.copy(to); W.yaw = yaw; W.pitch = -0.06; W.fly = null;
    }
    this._needsRender = true;
  }

  _bindWalkInput(el) {
    const ptrs = new Map();
    let pinch = 0;
    const W = () => (this.mode === "walk" ? this._walk : null);
    const down = (e) => {
      if (!W()) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const move = (e) => {
      const w = W(), p = ptrs.get(e.pointerId);
      if (!w || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) {
        // look: slower when zoomed in, so a close-up doesn't swing away
        const k = 0.0042 * (this.persp.fov / 60);
        w.yaw -= dx * k;
        w.pitch = Math.max(-1.5, Math.min(1.5, w.pitch - dy * k));
        w.fly = null;
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this._walkStepForward((d - pinch) * 0.012);
        pinch = d;
      }
      this._needsRender = true;
    };
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
    const wheel = (e) => {
      if (!W()) return;
      e.preventDefault();
      const fast = e.shiftKey ? 3 : 1, slow = e.altKey ? 0.2 : 1;
      this._walkStepForward(-Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.35 * fast * slow);
    };
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
    const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyC", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"]);
    const kdown = (e) => {
      const w = W();
      if (!w || typing(e) || e.metaKey || e.ctrlKey) return;
      if (MOVE_KEYS.has(e.code)) {
        w.keys.add(e.code); w.fly = null;
        if (e.code.startsWith("Arrow") || e.code === "Space" || e.code.startsWith("Alt")) e.preventDefault();
      } else if (e.code === "Equal" || e.code === "NumpadAdd") this.setWalkLens(this.persp.fov - 5);
      else if (e.code === "Minus" || e.code === "NumpadSubtract") this.setWalkLens(this.persp.fov + 5);
      else if (e.code === "Escape") this.stopWalk();
    };
    const kup = (e) => { this._walk?.keys.delete(e.code); };
    const blur = () => { this._walk?.keys.clear(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", kdown);
    window.addEventListener("keyup", kup);
    window.addEventListener("blur", blur);
    this._unbindWalkInput = () => {
      window.removeEventListener("keydown", kdown);
      window.removeEventListener("keyup", kup);
      window.removeEventListener("blur", blur);
    };
  }

  /* Step along the view direction (pitch included), so you can lean in to a joint. */
  _walkStepForward(d) {
    const W = this._walk;
    if (!W || !d) return;
    const cp = Math.cos(W.pitch);
    W.pos.x -= Math.sin(W.yaw) * cp * d;
    W.pos.z -= Math.cos(W.yaw) * cp * d;
    W.pos.y = Math.max(0.12, W.pos.y + Math.sin(W.pitch) * d);
    W.fly = null;
    this._needsRender = true;
  }

  _walkStep() {
    const W = this._walk;
    if (!W) return;
    const now = performance.now();
    const dt = W.last ? Math.min(0.1, Math.max(0, (now - W.last) / 1000)) : 0;
    W.last = now;
    const k = W.keys, has = (...c) => c.some((x) => k.has(x));
    const f = (has("KeyW", "ArrowUp") ? 1 : 0) - (has("KeyS", "ArrowDown") ? 1 : 0) + W.pad.f;
    const s = (has("KeyD") ? 1 : 0) - (has("KeyA") ? 1 : 0) + W.pad.s;
    const u = (has("KeyE", "Space") ? 1 : 0) - (has("KeyQ", "KeyC") ? 1 : 0) + W.pad.u;
    const turn = (has("ArrowLeft") ? 1 : 0) - (has("ArrowRight") ? 1 : 0);
    let moved = false;
    if (W.fly) {
      const F = W.fly;
      const p = Math.min(1, (now - F.t0) / F.dur), e = easeOutCubic(p);
      W.pos.lerpVectors(F.from, F.to, e);
      W.yaw = F.yaw0 + (F.yaw1 - F.yaw0) * e;
      W.pitch = F.pitch0 + (F.pitch1 - F.pitch0) * e;
      if (p >= 1) W.fly = null;
      moved = true;
    } else if (f || s || u || turn) {
      const speed = 1.5 * (has("ShiftLeft", "ShiftRight") ? 3 : 1) * (has("AltLeft", "AltRight") ? 0.15 : 1);
      const sy = Math.sin(W.yaw), cy = Math.cos(W.yaw);
      W.pos.x += (-sy * f + cy * s) * speed * dt;
      W.pos.z += (-cy * f - sy * s) * speed * dt;
      W.pos.y = Math.max(0.12, W.pos.y + u * speed * dt);
      W.yaw += turn * 1.6 * dt;
      moved = true;
    }
    const P = this.persp;
    P.position.copy(W.pos);
    P.rotation.set(W.pitch, W.yaw, 0, "YXZ");
    // which room am I in? (four times a second is plenty)
    if (now - W.roomAt > 250) {
      W.roomAt = now;
      const name = this._roomAt(W.pos);
      if (name !== W.room) { W.room = name; this.onWalkProgress?.(null, name); }
    }
    if (moved || this._needsRender) {
      this.renderFrame();
      this._needsRender = false;
    }
  }
  _roomAt(p) {
    for (const r of this.walkWaypoints || []) {
      if (r.w == null) continue;
      const fy = r.floorY ?? r.y - 1.55;
      if (Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.l / 2 && p.y >= fy - 0.2 && p.y < fy + 3.2) return r.name;
    }
    const env = this.structure?.env;
    if (env && (Math.abs(p.x) > env.w / 2 || Math.abs(p.z) > env.l / 2)) return "Outside";
    return p.y < 0.4 ? "Under the floor" : "";
  }

  /* Orbit-mode fly-to (double-click): ease camera and target together. */
  _flyStep() {
    const F = this._fly;
    const p = Math.min(1, (performance.now() - F.t0) / F.dur), e = easeOutCubic(p);
    this.controls.target.lerpVectors(F.tgt0, F.tgt1, e);
    this.camera.position.lerpVectors(F.cam0, F.cam1, e);
    if (p >= 1) this._fly = null;
    this._needsRender = true;
  }

  animate() {
    this._animId = requestAnimationFrame(this.animate);
    // nothing to do while the canvas is off-screen or the tab is hidden
    if (this.paused) return;

    if (this.mode === "walk") { this._walkStep(); return; }
    if (this._fly) this._flyStep();
    if (this.playing) {
      this.progress += 0.0035;
      if (this.progress >= 1) {
        this.progress = 1;
        this.playing = false;
        if (this.onComplete) this.onComplete();
      }
      this.setProgress(this.progress);
    }
    if (this._explodePlay && this.mode === "orbit") {
      const t = explodeCycle((performance.now() - this._explodePlay.t0) / 1000);
      this.setExplode(t);
      this.onExplode?.(t);
    }
    if (this.autoRotate && this.mode === "orbit" && this.view === "persp" && this.controls.enabled) this._driftStep();
    // damping and the drift keep the camera moving after input stops
    const moved = this.controls.enabled ? this.controls.update() : false;
    // close up, show the small hardware (screws, nail plates, ties…)
    const span = this.camera.isOrthographicCamera
      ? (this.ortho.top - this.ortho.bottom) / this.ortho.zoom
      : this.camera.position.distanceTo(this.controls.target);
    const fine = span < 16;
    if (fine !== this._showFine && this.structure) { this._showFine = fine; this._applyVisibility(); this._needsRender = true; }
    // close-ups need a near clip plane in millimetres, not 10 cm
    const near = this.camera === this.persp && span < 3 ? 0.02 : 0.1;
    if (this.persp.near !== near && this.camera === this.persp) { this.persp.near = near; this.persp.updateProjectionMatrix(); }
    if (moved || this._needsRender || this.playing) {
      this.renderFrame();
      this._needsRender = false;
    }
  }

  /* Place the orbit camera from cameraAngle / tiltFactor / zoomFactor. */
  _updateOrbitCamera() {
    const zoom = this.zoomFactor || 1;
    const tilt = this.tiltFactor != null ? this.tiltFactor : 1;
    if (this.isTower && this.towerHeight) {
      const h = this.towerHeight;
      const r = Math.max(30, h * 1.1) * zoom;
      this.camera.position.x = Math.cos(this.cameraAngle) * r;
      this.camera.position.z = Math.sin(this.cameraAngle) * r;
      this.camera.position.y = (h * 0.6 + 6) * tilt;
      this.controls?.target.set(0, h * 0.45, 0);
      this.camera.lookAt(0, h * 0.45, 0);
    } else {
      /* Low structures (carport spec has H) get a lower orbit + focus so
         they fill the frame instead of sitting under a high camera. */
      const low = this.spec && this.spec.H != null;
      const r = (low ? 30 : (this.frameRadius || 30)) * zoom;
      this.camera.position.x = Math.cos(this.cameraAngle) * r;
      this.camera.position.z = Math.sin(this.cameraAngle) * r;
      this.camera.position.y = (low ? 9 : (this.frameHeight || 18)) * tilt;
      const ly = low ? Math.max(1.2, this.spec.H * 0.7) : (this.frameLookY || 4);
      this.controls?.target.set(0, ly, 0);
      this.camera.lookAt(0, ly, 0);
    }
  }

  setPaused(v) { this.paused = v; if (!v) { this._needsRender = true; this._guard?.reset(); } }
  requestRender() { this._needsRender = true; }

  dispose() {
    cancelAnimationFrame(this._animId);
    this._unbindWalkInput?.();
    this.controls?.dispose();
    this.cadLines?.dispose();
    this._resizeObs.disconnect();
    if (this.fx) { this.fx.composer.dispose?.(); this.fx.rt.dispose(); this.fx = null; }
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}

/* Shortest signed turn from one heading to another, in (-π, π]. */
function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
