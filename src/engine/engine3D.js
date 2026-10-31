/* =========================================================================
   MODULE: engine3D.js
   Three.js scene. Builds a procedural building from a spec and animates
   the construction sequence.
   ========================================================================= */
import * as THREE from "three";
import { pickQuality, createComposer, frameGuard } from "./renderfx.js";
import { Environment, Site } from "./environment.js";
import { loadTextureManifest, onPbrApplied } from "./materials3d.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CadLines } from "./cad-lines.js";
import { easeOutCubic } from "../lib/format.js";
import { buildHouse } from "./house-builder.js";
import { highlightMember } from "./structure-render.js";
import { SYSTEMS } from "../logic/structure/model.js";
import { CinemaPlayer } from "./cinema.js";
import { Explore } from "./explore.js";

export class Engine3D {
  constructor(mountEl, { quality = "auto" } = {}) {
    this.mount = mountEl;
    this.quality = pickQuality(quality);
    this.width = mountEl.clientWidth;
    this.height = mountEl.clientHeight;
    this.scene = new THREE.Scene();

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
    this.renderer.toneMappingExposure = 0.62;
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

    // Sky, sun, image-based light and fog (environment.js), and the lot around the
    // building (Site): paddock, pad, setout grid, trees and the horizon tree-line.
    this.env = new Environment(this.renderer, this.scene, { quality: this.quality });
    this.sun = this.env.sun;
    this.site = new Site(this.scene, { onReady: () => { this._needsRender = true; } });
    this.siteVisible = true;
    onPbrApplied(() => { this._needsRender = true; });
    loadTextureManifest();

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
    this.postFx = { ao: true, bloom: true };

    try { this.env.forceEnvironment(); } catch (e) { /* no WebGL — plain lighting still works */ }

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
    this.controls.minDistance = 0.4;
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
    // a click (press + release without moving) picks the piece under the cursor
    let downX = 0, downY = 0;
    el.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
    el.addEventListener("pointerup", (e) => {
      if (e.button !== 0 || Math.hypot(e.clientX - downX, e.clientY - downY) >= 5 || this.mode !== "orbit") return;
      if (this.studio && this.viewHelperClick(e)) { this._needsRender = true; return; }
      if (this.studio && this.editor?.gizmo.axis) return;      // a click on the gizmo is not a pick
      this.pickAt(e.clientX, e.clientY, e);
    });
    // hover highlight while editing (throttled: a raycast over 20k instances is not free)
    let hoverAt = 0;
    el.addEventListener("pointermove", (e) => {
      if (!this.studio || !this.editor || this.mode !== "orbit" || e.buttons) return;
      const now = performance.now();
      if (now - hoverAt < 40) return;
      hoverAt = now;
      const hit = this._raycastMember(e.clientX, e.clientY);
      this.editor.setHover(hit ? hit.id : null);
    });
    el.addEventListener("pointerleave", () => this.editor?.setHover(null));
    el.addEventListener("wheel", () => { this._fly = null; }, { passive: true });
    // double-click any part: fly to it and turn around it from there
    el.addEventListener("dblclick", (e) => {
      if (this.mode !== "orbit" || (this.studio && this.editor?.tool === "measure")) return;
      const hit = this.raycastPoint(e.clientX, e.clientY);
      if (!hit) return;
      if (this.view !== "persp") this.setView("persp", { keep: true });
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      const dist = Math.max(2.4, Math.min(9, this.camera.position.distanceTo(hit.point) * 0.45));
      this.flyTo(hit.point, hit.point.clone().add(dir.multiplyScalar(dist)));
    });
    this.explore = new Explore(this);
  }

  resize() {
    this.width = this.mount.clientWidth;
    this.height = this.mount.clientHeight;
    this.persp.aspect = this.width / this.height;
    this._applyViewInset();
    this.persp.updateProjectionMatrix();
    this._fitOrtho();
    this.renderer.setSize(this.width, this.height);
    if (this.fx && this.width && this.height) this.fx.setSize(this.width, this.height);
    // setSize clears the canvas — when idle nothing else would redraw it
    this._needsRender = true;
  }

  /* A panel covers `left` px of the view: centre the picture in what is left. */
  setViewInset(left = 0) {
    this.viewInset = Math.max(0, left | 0);
    this._applyViewInset();
    this.persp.updateProjectionMatrix();
    this._needsRender = true;
  }
  _applyViewInset() {
    if (this.viewInset == null) return;      // never set: leave any caller-owned offset (scroll film) alone
    const w = this.width || 1, h = this.height || 1, L = this.viewInset || 0;
    if (L > 0 && L < w * 0.7) this.persp.setViewOffset(w, h, -L / 2, 0, w, h);
    else this.persp.clearViewOffset();
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
    this._yardOn = !!structure?.landscape;
    this.site.setYard(this._yardOn);
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
    this.editor?.reapply();
    this.explore?.onRebuild();
    this.onModelChange?.();
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
    this.site.setVisible(!!v);
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
  /* Layer visibility in effect: the user's choice, plus what a film shot hides. */
  _layers() { return this._filmLayers ? { ...(this.layerVisible || {}), ...this._filmLayers } : this.layerVisible || {}; }
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
  _ray(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }
  /* The piece under a screen point: { id, point, object } or null. */
  _raycastMember(clientX, clientY) {
    if (!this.structure) return null;
    const ray = this._ray(clientX, clientY);
    const targets = [];
    this.buildingGroup.traverse((o) => { if (o.isMesh && o.visible && o.userData.memberIds) targets.push(o); });
    // see-through things (glass, x-rayed skins) don't block the pick; hidden instances are scaled to nothing
    const hits = ray.intersectObjects(targets, false).filter((h) => !(h.object.material.transparent && h.object.material.opacity < 0.5));
    const h = hits[0];
    if (!h) return null;
    const id = h.object.userData.memberIds[h.instanceId ?? 0];
    if (this.editor?.hidden?.has(id)) return null;
    return { id, point: h.point, object: h.object };
  }
  /* Any surface under a screen point (building, ground, trees) — for measuring. */
  raycastPoint(clientX, clientY) {
    const m = this._raycastMember(clientX, clientY);
    if (m) return m;
    const ray = this._ray(clientX, clientY);
    const hit = ray.intersectObjects([this.site.ground, this.site.pad], false)[0];
    return hit ? { id: null, point: hit.point, object: hit.object } : null;
  }
  pickAt(clientX, clientY, ev) {
    if (!this.structure) return null;
    if (this.studio && this.editor && this.editor.tool === "measure") { this.editor.measureClick(this.raycastPoint(clientX, clientY)); return null; }
    const hit = this._raycastMember(clientX, clientY);
    const id = hit ? hit.id : null;
    if (this.studio && this.editor) {
      if (this.editor.tool === "paint" && id != null) { this.editor.paint(this.editor.paintColor || "#f5c518", [id]); return id; }
      this.editor.select(id == null ? [] : [id], { add: !!ev?.shiftKey, toggle: !!(ev?.ctrlKey || ev?.metaKey) });
      this.selected = id != null ? this.structure.members[id] : null;
      this.onPick?.(this.selected);
      return id;
    }
    this.select(id);
    return id;
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
    this._clearGhost();
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
    this._applyGhost();
  }

  /* Explore → focus: every part but the focused one becomes glass. */
  _clearGhost() {
    this.buildingGroup.traverse((o) => {
      if (!o.isMesh || !o.userData._preGhost) return;
      o.material = o.userData._preGhost; o.castShadow = o.userData._ghostShadow;
      o.userData._preGhost = null;
    });
  }
  _applyGhost() {
    this._clearGhost();
    const F = this.explore?.focusSys;
    if (F) this.buildingGroup.traverse((o) => {
      if (!o.isMesh || !o.userData.sys || F.has(o.userData.sys)) return;
      o.userData._preGhost = o.material; o.userData._ghostShadow = o.castShadow;
      o.material = this.explore.ghostOf(o.material); o.castShadow = false;
    });
    this._applyClipping();
    this._needsRender = true;
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
    if (this.scene.fog) { this.scene.fog.near = Math.max(140, this.frameRadius * 3); this.scene.fog.far = Math.max(1100, this.frameRadius * 14); }
    this.env.fitShadows(Math.max(diag * 0.8, (h || 3) * 2.5));
    this.persp.far = Math.max(1200, this.frameRadius * 8);
    this.persp.updateProjectionMatrix();
    this.frameSize = Math.max(w || 10, l || 10, h || 3);
    const key = [Math.round((w || 0) * 2), Math.round((l || 0) * 2), Math.round((h || 0) * 2)].join(":");
    if (key !== this._frameKey) {
      this._frameKey = key;
      this.home();
    }
  }

  /* Roof and ceilings lifted off: the walkthrough, and the film's interior shots. */
  _roofHidden() { return this.mode === "walk" || (this.mode === "film" && !!this._filmRoofOff); }

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
    this.editor?.setCamera(this.camera);
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
    this.env.setPlainBackground(style === "white" ? 0xe9ecf0 : style === "lines" ? 0xf4f5f7 : null);
    if ((style === "lines" || style === "white") && !this.cadLines) {
      this.cadLines = new CadLines(this.renderer, this.scene, this.camera, (o) => {
        for (let p = o; p; p = p.parent) if (p === this.buildingGroup) return true;
        return false;
      });
    }
    this._applyStyle();
    this._needsRender = true;
  }
  _applyStyle() {
    this._clearGhost();
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
    if (this.env.tick()) this._needsRender = true;
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    const editorVisible = !!(this.studio && this.editor);
    if ((this.style === "lines" || this.style === "white") && this.cadLines) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      if (size.x !== this._linesW || size.y !== this._linesH) { this._linesW = size.x; this._linesH = size.y; this.cadLines.setSize(size.x, size.y); }
      this.cadLines.setCamera(this.camera);
      this.cadLines.render();
    } else if (this.fx && this.camera === this.persp) {
      this._guard?.tick(performance.now());
      // a tripped guard has just dropped to "low" and freed the post chain
      if (!this.fx) { this.renderer.render(this.scene, this.camera); return; }
      this.fx.ao.enabled = this.viewMode !== "structural" && this.postFx.ao; // AO darkens behind see-through skins
      this.fx.bloom.enabled = this.postFx.bloom;
      this.fx.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.viewHelper && editorVisible) { this.renderer.autoClear = false; this.viewHelper.render(this.renderer); this.renderer.autoClear = true; }
  }

  /* Post-processing switches the Studio exposes. */
  setPostFx(partial) {
    Object.assign(this.postFx, partial);
    if (this.fx) {
      if (partial.aoIntensity != null) this.fx.ao.blendIntensity = partial.aoIntensity;
      if (partial.bloomStrength != null) this.fx.bloom.strength = partial.bloomStrength;
    }
    this._needsRender = true;
  }

  /* ---- Studio: editing, framing, capture ---- */
  async enableEditing() {
    if (this.editor) return this.editor;
    const { Editor } = await import("./editor.js");
    this.editor = new Editor(this);
    this.editor.setCamera(this.camera);
    if (!this.viewHelper) {
      this.viewHelper = new ViewHelper(this.persp, this.renderer.domElement);
      this.viewHelper.center = this.controls.target;
    }
    this._needsRender = true;
    return this.editor;
  }
  /* The Studio owns the canvas while it is open: editing on, drift off, never paused. */
  async enterStudio(el) {
    if (this.explore && (this.explore.explodeT || this.explore.focusSys || this.explore.room)) this.explore.reset();
    await this.enableEditing();
    this._insetBeforeStudio = this.viewInset;
    if (this.viewInset) this.setViewInset(0);
    this.studio = true;
    this.keepAwake = true;
    this._studioPrev = { auto: this.autoRotate, mount: this.mount };
    this.setAutoRotate(false);
    if (el) this.remount(el);
    this.paused = false;
    this.select(null);
    this._needsRender = true;
  }
  exitStudio(el) {
    this.studio = false;
    this.keepAwake = false;
    this.editor?.clearSelection();
    this.editor?.setTool("select");
    this.editor?.setHover(null);
    if (this.editor?.isolated) this.editor.unisolate();
    if (el) this.remount(el);
    if (this._insetBeforeStudio) this.setViewInset(this._insetBeforeStudio);
    if (this._studioPrev?.auto) this.setAutoRotate(true);
    this._needsRender = true;
  }
  disableEditing() {
    this.editor?.dispose();
    this.editor = null;
    this._needsRender = true;
  }
  /* A click on the axes gizmo (bottom-right) snaps the view. */
  viewHelperClick(ev) {
    if (!this.viewHelper || this.camera !== this.persp) return false;
    this.viewHelper.center = this.controls.target;
    return this.viewHelper.handleClick(ev);
  }
  /* Fly the camera to see a box (selection, a room, a system). */
  frameBox(box, { pad = 1.15, min = 0.8 } = {}) {
    if (!box) return;
    if (this.view !== "persp") this.setView("persp", { keep: true });
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(min, size.length() * 0.5);
    const aspect = Math.min(1, (this.width || 1) / (this.height || 1));
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.persp.fov) / 2) * pad / Math.max(0.55, aspect);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!dir.lengthSq()) dir.set(1, 0.6, 1).normalize();
    // never end up underground or looking straight along the ground
    if (dir.y < 0.25) { dir.y = 0.25; dir.normalize(); }
    this.flyTo(c, c.clone().add(dir.multiplyScalar(dist)));
  }

  /* Glide the camera to look at `target` from `position` (ms long, eased). */
  flyTo(target, position, ms = 850) {
    this._drift = null;
    if (this.autoRotate) { this.autoRotate = false; this.onAutoRotateChange?.(false); }
    if (this.view !== "persp") this.setView("persp", { keep: true });
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this._fly = { t0: performance.now(), ms: reduce ? 1 : ms, fromT: this.controls.target.clone(), fromP: this.camera.position.clone(), toT: target.clone(), toP: position.clone() };
    this._needsRender = true;
  }
  _flyStep() {
    const F = this._fly;
    const k = Math.min(1, (performance.now() - F.t0) / F.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    this.controls.target.lerpVectors(F.fromT, F.toT, e);
    this.camera.position.lerpVectors(F.fromP, F.toP, e);
    if (k >= 1) this._fly = null;
    this._needsRender = true;
  }
  frameSelection() { this.frameBox(this.editor?.selectionBox()); }
  frameHost(host) {
    if (!this.structure) return;
    const ids = this.structure.members.filter((m) => m.host === host).map((m) => m.id);
    this.frameMembers(ids);
  }
  frameMembers(ids) {
    if (!this.editor || !ids.length) return;
    const keep = this.editor.selection;
    this.editor.selection = ids;
    const box = this.editor.selectionBox();
    this.editor.selection = keep;
    this.frameBox(box);
  }
  setFov(deg) { this.persp.fov = Math.max(15, Math.min(100, deg)); this.persp.updateProjectionMatrix(); this._needsRender = true; }
  /* Draw the small hardware regardless of distance. */
  setFineAlways(v) { this._fineAlways = !!v; this._showFine = this._fineAlways || this._showFine; if (this.structure) this._applyVisibility(); this._needsRender = true; }

  /* A still at scale× the viewport (2 = 2× width and height). Transparent
     drops the sky so the building sits on a clear PNG. */
  async captureImage(scale = 2, { transparent = false } = {}) {
    const w = this.width, h = this.height;
    const W = Math.round(w * scale), H = Math.round(h * scale);
    const helper = this.viewHelper; this.viewHelper = null;
    const bg = this.scene.background, skyVis = this.env.sky.visible;
    if (transparent) { this.scene.background = null; this.env.sky.visible = false; }
    this.renderer.setSize(W, H, false);
    this.persp.aspect = W / H; this.persp.updateProjectionMatrix();
    if (this.fx) this.fx.setSize(W, H);
    const prAlpha = this.renderer.getClearAlpha();
    if (transparent) this.renderer.setClearAlpha(0);
    try {
      this.renderFrame();
      const blob = await new Promise((res) => this.renderer.domElement.toBlob(res, "image/png"));
      return blob;
    } finally {
      this.renderer.setClearAlpha(prAlpha);
      this.scene.background = bg; this.env.sky.visible = skyVis;
      this.renderer.setSize(w, h, false);
      this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
      if (this.fx) this.fx.setSize(w, h);
      this.viewHelper = helper;
      this._needsRender = true;
    }
  }

  /* Stats for the status bar. */
  stats() {
    const info = this.renderer.info;
    let pieces = 0;
    this.buildingGroup.traverse((o) => { if (o.isMesh && o.visible && o.userData.memberIds) pieces += o.isInstancedMesh ? o.count : 1; });
    return { calls: info.render.calls, triangles: info.render.triangles, pieces, members: this.structure?.members.length || 0, quality: this.quality };
  }

  /* Drop to the plain renderer. Only "low" can be applied at runtime — the
     post chain is built once, in the constructor. */
  setQuality(q) {
    if (q === "high") {
      // photo quality on request (the Studio's switch): build the post chain now
      if (this.fx) return;
      try {
        this.fx = createComposer(this.renderer, this.scene, this.persp, this.width || 1, this.height || 1);
        this._guard = this._userHigh ? null : frameGuard(() => this.setQuality("low"));
        this.quality = "high";
        this.editor?._refresh();
      } catch (e) { this.fx = null; }
      this._needsRender = true;
      return;
    }
    if (!this.fx) return;
    this.fx.dispose();
    this.fx = null;
    this._guard = null;
    this.quality = "low";
    this.editor?._refresh();
    this._needsRender = true;
  }
  /* The user's own choice sticks (and is never undone by the frame guard). */
  setPhotoQuality(on) {
    this._userHigh = !!on;
    try { localStorage.setItem("byo.3d.quality", on ? "high" : "low"); } catch { /* private mode */ }
    this.setQuality(on ? "high" : "low");
  }

  _clearGroup() {
    const g = this.buildingGroup;
    g.traverse((o) => {
      if (!o.isMesh) return;
      // instanced members share unit geometries — free only their instances
      if (o.isInstancedMesh) o.dispose();
      else o.geometry?.dispose();
      // textures are cached and shared — only dispose the x-ray clones
      if (o.userData._xray) o.userData._xray.dispose();
    });
    while (g.children.length) g.remove(g.children[0]);
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

  /* ----- Cinematic film (logic/cinematic.js plans it, cinema.js plays it) ----- */
  playFilm(film, { onFrame, onEnd, recorder } = {}) {
    if (!film || !film.shots?.length) return false;
    if (this.mode === "walk") this.stopWalk();
    this._film = { player: new CinemaPlayer(film), t0: performance.now(), onFrame, onEnd, recorder,
      fov: this.persp.fov, fog: this.scene.fog ? [this.scene.fog.near, this.scene.fog.far] : null, wasAuto: this.autoRotate };
    if (this.view !== "persp") this.setView("persp", { keep: true });
    this.select?.(null);
    this.mode = "film";
    this._filmRoofOff = false;
    this._filmLayers = null;
    this.autoRotate = false;
    this.controls.enabled = false;
    if (this.scene.fog) { this.scene.fog.near = 140; this.scene.fog.far = 700; }
    this.progress = 1; this.setProgress(1);
    this._showFine = false;
    if (this.structure) this._applyVisibility();
    this.paused = false;
    this.onModeChange?.("film");
    return true;
  }
  stopFilm() {
    const F = this._film;
    if (!F) return;
    this._film = null;
    this.mode = "orbit";
    this._filmRoofOff = false;
    this._filmLayers = null;
    this.persp.fov = F.fov; this.persp.updateProjectionMatrix();
    if (this.scene.fog && F.fog) { this.scene.fog.near = F.fog[0]; this.scene.fog.far = F.fog[1]; }
    this.progress = 1; this.setProgress(1);
    if (this.structure) this._applyVisibility();
    this.controls.enabled = true;
    this.home();
    this.autoRotate = F.wasAuto;
    this.onModeChange?.("orbit");
    F.onEnd?.();
  }
  /* Jump the film to t seconds (scrubbing, and frame-exact captures). */
  /* Jump the film to t seconds; hold = freeze there (pause, and frame-exact captures). */
  seekFilm(t, { hold = false } = {}) {
    if (!this._film) return;
    this._film.t0 = performance.now() - Math.max(0, t) * 1000;
    this._film.hold = hold ? Math.max(0, t) : null;
  }
  pauseFilm(paused) {
    const F = this._film;
    if (!F) return;
    if (paused && F.hold == null) F.hold = (performance.now() - F.t0) / 1000;
    else if (!paused && F.hold != null) { F.t0 = performance.now() - F.hold * 1000; F.hold = null; }
  }
  _filmStep() {
    const F = this._film;
    const t = F.hold ?? (performance.now() - F.t0) / 1000;
    if (t >= F.player.duration) { this.stopFilm(); return; }
    const st = F.player.sample(t);
    if (st.roofOff !== this._filmRoofOff || !this._filmLayers) {
      // a finished house doesn't show its pipes and cables; roof off also drops the roof framing
      this._filmRoofOff = st.roofOff;
      this._filmLayers = { electrical: false, plumbing: false, drainage: false, ...(st.roofOff ? { roofFrame: false, roofing: false, solar: false } : {}) };
      if (this.structure) this._applyVisibility();
    }
    if (st.build != null) { this.progress = st.build; this.setProgress(st.build); }
    else if (this.progress !== 1) { this.progress = 1; this.setProgress(1); }
    if (this.persp.fov !== st.fov) { this.persp.fov = st.fov; this.persp.updateProjectionMatrix(); }
    this.camera.position.set(st.pos[0], st.pos[1], st.pos[2]);
    this.camera.lookAt(st.look[0], st.look[1], st.look[2]);
    this.renderFrame();
    F.recorder?.frame(st);          // same task as the render, so the drawing buffer is intact
    F.onFrame?.(st);
  }
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
    this.controls.autoRotate = false;
    this.controls.enabled = false;
    if (this.view !== "persp") this.setView("persp", { keep: true });
    this.walkT = 0;
    // hide roof so we can see inside; soften fog
    this.roofMeshes.forEach((m) => (m.visible = false));
    if (this.structure) this._applyVisibility();
    if (this.scene.fog) { this.scene.fog.near = 60; this.scene.fog.far = 200; }
    if (this.onModeChange) this.onModeChange("walk");
    return true;
  }
  stopWalk() {
    this.mode = "orbit";
    this.roofMeshes.forEach((m) => (m.visible = true));
    if (this.structure) this._applyVisibility();
    if (this.scene.fog) { this.scene.fog.near = Math.max(140, (this.frameRadius || 50) * 3); this.scene.fog.far = Math.max(1100, (this.frameRadius || 50) * 14); }
    this.controls.enabled = true;
    this.home();
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
    const ffl = Math.max(0.15, (this.spec && this.spec.slabThicknessM) || 0.1);
    return ffl + 1.55;
  }

  animate() {
    this._animId = requestAnimationFrame(this.animate);
    // nothing to do while the canvas is off-screen or the tab is hidden
    if (this.paused && !(this.mode === "film" && this._film?.recorder)) return;   // a recording keeps going off-screen

    if (this.mode === "film" && this._film) { this._filmStep(); return; }
    if (this.mode === "walk") {
      this.walkT += this.walkSpeed;
      if (this.walkT >= 1) this.walkT = 0; // loop the tour
      const s = this._sampleWalk(this.walkT);
      this.camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      this.camera.lookAt(s.look[0], s.look[1], s.look[2]);
      if (this.onWalkProgress) this.onWalkProgress(this.walkT, s.name);
      this.renderFrame();
      return;
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
    if (this.autoRotate && this.mode === "orbit" && this.view === "persp" && this.controls.enabled) this._driftStep();
    // damping and the drift keep the camera moving after input stops
    if (this._fly) this._flyStep();
    const moved = this.controls.enabled ? this.controls.update() : false;
    // close up, show the small hardware (screws, nail plates, ties…)
    const span = this.camera.isOrthographicCamera
      ? (this.ortho.top - this.ortho.bottom) / this.ortho.zoom
      : this.camera.position.distanceTo(this.controls.target);
    const fine = this._fineAlways || span < 16;
    if (fine !== this._showFine && this.structure) { this._showFine = fine; this._applyVisibility(); this._needsRender = true; }
    if (this.viewHelper?.animating) { this.viewHelper.update(1 / 60); this._needsRender = true; }
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

  setPaused(v) { if (this.keepAwake) v = false; this.paused = v; if (!v) { this._needsRender = true; this._guard?.reset(); } }
  requestRender() { this._needsRender = true; }

  dispose() {
    cancelAnimationFrame(this._animId);
    this.controls?.dispose();
    this.cadLines?.dispose();
    this._resizeObs.disconnect();
    if (this.fx) { this.fx.dispose(); this.fx = null; }
    this.editor?.dispose();
    this.env.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}
