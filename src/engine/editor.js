/* =========================================================================
   MODULE: editor.js
   The modelling tools over the engine — what makes the 3D view a studio
   rather than a viewer. Every one of the ~20 000 pieces is a thing you can
   point at, pick, move, resize, recolour, hide or measure, like SketchUp,
   Rhino or Blender:

     selection    click, shift-click to add, ctrl-click to toggle; a hover
                  highlight; outlines through the post chain (and a wire box
                  that works on every machine)
     gizmo        move / rotate / scale the selection with three's
                  TransformControls, snapped to 10 mm / 1° / 5 % by default
     numeric      position and size typed in millimetres (StudioPanels)
     paint        recolour a piece
     hide / isolate / delete, unhide all
     measure      two clicks → distance in mm with the x/y/z run; snaps to
                  the corners of whatever you clicked
     undo / redo
     edits        every change is kept by the piece's mark (stable across
                  rebuilds of the same spec) so a rebuild keeps your work;
                  exported as JSON with the model
     export       GLB of the whole model (instances preserved via
                  EXT_mesh_gpu_instancing — opens in Blender, SketchUp, Rhino)

   Pure engine-side: no React here. The Studio UI calls these and listens to
   `onChange`.
   ========================================================================= */
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { memberMatrix, unitGeometry } from "./structure-render.js";

const SEL = 0xf5c518, HOVER = 0xffe9a6, MEASURE = 0x0f172a;
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const unitEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const CORNERS = [];
for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) CORNERS.push(new THREE.Vector3(x, y, z));

export class Editor {
  constructor(engine) {
    this.e = engine;
    const scene = engine.scene;
    this.selection = [];
    this.hover = null;
    this.tool = "select";
    this.snap = { move: 0.01, rotate: 1, scale: 0.05 };
    this.edits = new Map();          // mark → { matrix?, color?, hidden?, deleted? }
    this.undoStack = []; this.redoStack = [];
    this.hidden = new Set();          // member ids hidden right now
    this.measurements = [];
    this._measurePts = [];
    this.paintColor = "#f5c518";
    this.onChange = null;

    this.helpers = new THREE.Group(); this.helpers.name = "editor-helpers"; this.helpers.userData.editor = true; scene.add(this.helpers);
    this.proxies = new THREE.Group(); this.proxies.name = "editor-proxies"; this.proxies.userData.editor = true; scene.add(this.proxies);
    this.measures = new THREE.Group(); this.measures.name = "editor-measures"; this.measures.userData.editor = true; scene.add(this.measures);
    this.hoverBox = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: HOVER, transparent: true, opacity: 0.9, depthTest: false }));
    this.hoverBox.matrixAutoUpdate = false; this.hoverBox.visible = false; this.hoverBox.renderOrder = 998; this.hoverBox.userData.editor = true;
    scene.add(this.hoverBox);
    this.selMat = new THREE.LineBasicMaterial({ color: SEL, depthTest: false, transparent: true, opacity: 0.95 });
    this.proxyMat = new THREE.MeshBasicMaterial({ color: SEL, colorWrite: false, depthWrite: false });

    this.pivot = new THREE.Object3D(); this.pivot.name = "editor-pivot"; this.pivot.userData.editor = true; scene.add(this.pivot);
    const gz = new TransformControls(engine.camera, engine.renderer.domElement);
    gz.setSize(0.85);
    gz.userData.editor = true;
    gz.visible = false; gz.enabled = false;
    gz.setTranslationSnap(this.snap.move); gz.setRotationSnap(THREE.MathUtils.degToRad(this.snap.rotate)); gz.setScaleSnap(this.snap.scale);
    gz.addEventListener("dragging-changed", (ev) => {
      engine.controls.enabled = !ev.value;
      if (ev.value) this._beginDrag(); else this._endDrag();
    });
    gz.addEventListener("objectChange", () => this._applyDrag());
    gz.addEventListener("change", () => engine.requestRender());
    scene.add(gz);
    this.gizmo = gz;
  }

  /* ---------- selection ---------- */
  members() { return this.e.structure?.members || []; }
  member(id) { return this.members()[id] || null; }
  hit(id) { return this.e.memberHits?.get(id) || null; }
  isSelected(id) { return this.selection.includes(id); }

  select(ids, { add = false, toggle = false } = {}) {
    const list = (ids || []).filter((id) => id != null && this.member(id));
    if (toggle) {
      const set = new Set(this.selection);
      for (const id of list) set.has(id) ? set.delete(id) : set.add(id);
      this.selection = [...set];
    } else if (add) {
      const set = new Set(this.selection);
      for (const id of list) set.add(id);
      this.selection = [...set];
    } else this.selection = list;
    this._refresh();
    this._changed("selection");
    return this.selection;
  }
  clearSelection() { if (this.selection.length) this.select([]); }
  selectWhere(pred) { this.select(this.members().filter((m) => !this.hidden.has(m.id) && pred(m)).map((m) => m.id)); }
  selectSame(id) { const m = this.member(id); if (m) this.selectWhere((x) => x.profile === m.profile && x.name === m.name); }
  selectHost(host) { this.selectWhere((m) => m.host === host); }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    if (id != null && !this.isSelected(id) && this.matrixOf(id, _m)) { this.hoverBox.matrix.copy(_m); this.hoverBox.visible = true; }
    else this.hoverBox.visible = false;
    this.e.requestRender();
    this._changed("hover");
  }

  /* ---------- transforms ---------- */
  /* The piece's current placement as a 4×4 (unit box → world). */
  matrixOf(id, out = new THREE.Matrix4()) {
    const h = this.hit(id);
    if (!h) return null;
    if (h.instance >= 0) { h.mesh.getMatrixAt(h.instance, out); return out; }
    const m = this.member(id);
    h.mesh.updateMatrix();
    // a sheet mesh carries its size in its geometry: express it as a unit-box matrix like the instances
    const size = new THREE.Vector3(m.len, m.d, m.w).multiply(h.mesh.scale);
    return out.compose(h.mesh.position, h.mesh.quaternion, size);
  }
  setMatrix(id, mat) {
    const h = this.hit(id);
    if (!h) return;
    if (h.instance >= 0) { h.mesh.setMatrixAt(h.instance, mat); h.mesh.instanceMatrix.needsUpdate = true; h.mesh.boundingSphere = null; h.mesh.boundingBox = null; }
    else {
      const m = this.member(id);
      mat.decompose(_v, _q, _s);
      h.mesh.position.copy(_v); h.mesh.quaternion.copy(_q);
      h.mesh.scale.set(_s.x / m.len, _s.y / m.d, _s.z / m.w);
    }
    this.e.requestRender();
  }
  /* The placement the model gave this piece (before any edit). */
  baseMatrix(id, out = new THREE.Matrix4()) { const m = this.member(id); return m ? memberMatrix(m, out) : null; }

  getTransform(id) {
    if (!this.matrixOf(id, _m)) return null;
    _m.decompose(_v, _q, _s);
    const e = new THREE.Euler().setFromQuaternion(_q, "XYZ");
    return { position: [_v.x, _v.y, _v.z], rotation: [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg), size: [_s.x, _s.y, _s.z] };
  }
  setTransform(id, { position, rotation, size }) {
    if (!this.matrixOf(id, _m)) return;
    _m.decompose(_v, _q, _s);
    const before = _m.clone();
    if (position) _v.set(...position);
    if (rotation) _q.setFromEuler(new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad), "XYZ"));
    if (size) _s.set(Math.max(0.001, size[0]), Math.max(0.001, size[1]), Math.max(0.001, size[2]));
    const after = new THREE.Matrix4().compose(_v, _q, _s);
    this.setMatrix(id, after);
    this._record([{ id, before, after }]);
    this._refresh();
  }
  resetSelection() {
    const entries = [];
    for (const id of this.selection) {
      const before = this.matrixOf(id, new THREE.Matrix4()), after = this.baseMatrix(id);
      if (!before || !after) continue;
      this.setMatrix(id, after);
      entries.push({ id, before, after });
      const mark = this.member(id).mark, ed = this.edits.get(mark);
      if (ed) { delete ed.matrix; if (!Object.keys(ed).length) this.edits.delete(mark); }
    }
    if (entries.length) this._pushUndo(entries);
    this._refresh(); this._changed("edits");
  }

  setTool(tool) {
    this.tool = tool;
    const modes = { move: "translate", rotate: "rotate", scale: "scale" };
    if (modes[tool]) this.gizmo.setMode(modes[tool]);
    this._measurePts = [];
    this._refresh();
    this._changed("tool");
  }
  setSnap(partial) {
    Object.assign(this.snap, partial);
    this.gizmo.setTranslationSnap(this.snap.move || null);
    this.gizmo.setRotationSnap(this.snap.rotate ? THREE.MathUtils.degToRad(this.snap.rotate) : null);
    this.gizmo.setScaleSnap(this.snap.scale || null);
    this._changed("snap");
  }
  setCamera(cam) { this.gizmo.camera = cam; }

  _beginDrag() {
    this.pivot.updateMatrix();
    this._drag = { pivot: this.pivot.matrix.clone(), start: this.selection.map((id) => ({ id, m: this.matrixOf(id, new THREE.Matrix4()) })) };
  }
  _applyDrag() {
    const D = this._drag;
    if (!D) return;
    this.pivot.updateMatrix();
    _inv.copy(D.pivot).invert();
    const delta = new THREE.Matrix4().multiplyMatrices(this.pivot.matrix, _inv);
    for (const { id, m } of D.start) this.setMatrix(id, new THREE.Matrix4().multiplyMatrices(delta, m));
    this._syncHelpers();
  }
  _endDrag() {
    const D = this._drag; this._drag = null;
    if (!D) return;
    const entries = D.start.map(({ id, m }) => ({ id, before: m, after: this.matrixOf(id, new THREE.Matrix4()) })).filter((x) => x.after && !x.after.equals(x.before));
    if (entries.length) this._record(entries);
    this._refresh();
  }
  _record(entries) {
    for (const { id, after } of entries) this._edit(id).matrix = after.toArray();
    this._pushUndo(entries);
    this._changed("edits");
  }
  _edit(id) { const mark = this.member(id).mark; let ed = this.edits.get(mark); if (!ed) { ed = {}; this.edits.set(mark, ed); } return ed; }
  _pushUndo(entries) { this.undoStack.push(entries); if (this.undoStack.length > 200) this.undoStack.shift(); this.redoStack = []; }

  undo() {
    const entries = this.undoStack.pop();
    if (!entries) return false;
    for (const en of entries) this._applyEntry(en, "before");
    this.redoStack.push(entries);
    this._refresh(); this._changed("edits");
    return true;
  }
  redo() {
    const entries = this.redoStack.pop();
    if (!entries) return false;
    for (const en of entries) this._applyEntry(en, "after");
    this.undoStack.push(entries);
    this._refresh(); this._changed("edits");
    return true;
  }
  _applyEntry(en, side) {
    const ed = this._edit(en.id);
    if (en.before && en.after) {
      this.setMatrix(en.id, en[side]);
      if (en[side].equals(this.baseMatrix(en.id))) delete ed.matrix; else ed.matrix = en[side].toArray();
    }
    if (en.hidden !== undefined) this._setHidden(en.id, side === "after" ? en.hidden : !en.hidden);
    if (en.color !== undefined) this._paint(en.id, side === "after" ? en.color : en.prevColor);
    const mark = this.member(en.id).mark, e2 = this.edits.get(mark);
    if (e2 && !Object.keys(e2).some((k) => !k.startsWith("_"))) this.edits.delete(mark);
  }

  /* ---------- hide / isolate / delete / paint ---------- */
  _setHidden(id, on) {
    const h = this.hit(id);
    if (!h) return;
    const ed = this._edit(id);
    if (on) {
      if (!this.hidden.has(id)) {
        if (h.instance >= 0) { h.mesh.getMatrixAt(h.instance, _m); ed._shown = _m.toArray(); h.mesh.setMatrixAt(h.instance, new THREE.Matrix4().makeScale(0, 0, 0)); h.mesh.instanceMatrix.needsUpdate = true; }
        else h.mesh.visible = false;
        this.hidden.add(id);
      }
      ed.hidden = true;
    } else {
      if (this.hidden.has(id)) {
        if (h.instance >= 0) { const back = ed._shown ? new THREE.Matrix4().fromArray(ed._shown) : (ed.matrix ? new THREE.Matrix4().fromArray(ed.matrix) : this.baseMatrix(id)); h.mesh.setMatrixAt(h.instance, back); h.mesh.instanceMatrix.needsUpdate = true; }
        else h.mesh.visible = true;
        this.hidden.delete(id);
      }
      delete ed.hidden; delete ed.deleted; delete ed._shown;
      if (!Object.keys(ed).length) this.edits.delete(this.member(id).mark);
    }
    this.e.requestRender();
  }
  hide(ids = this.selection) {
    const list = ids.filter((id) => !this.hidden.has(id));
    if (!list.length) return;
    for (const id of list) this._setHidden(id, true);
    this._pushUndo(list.map((id) => ({ id, hidden: true })));
    this.select([]);
    this._changed("edits");
  }
  deleteSelected() { const ids = [...this.selection]; this.hide(ids); for (const id of ids) this._edit(id).deleted = true; this._changed("edits"); }
  unhideAll() {
    const list = [...this.hidden];
    if (!list.length) return;
    for (const id of list) this._setHidden(id, false);
    this._pushUndo(list.map((id) => ({ id, hidden: false })));
    this._changed("edits");
  }
  unhide(ids) {
    const list = ids.filter((id) => this.hidden.has(id));
    if (!list.length) return;
    for (const id of list) this._setHidden(id, false);
    this._pushUndo(list.map((id) => ({ id, hidden: false })));
    this._changed("edits");
  }
  /* Isolate: everything except the selection goes away (one-shot, not an edit). */
  isolate(ids = this.selection) {
    if (!ids.length) return;
    const keep = new Set(ids);
    const toHide = this.members().filter((m) => !keep.has(m.id) && !this.hidden.has(m.id) && this.hit(m.id)).map((m) => m.id);
    this._isolated = toHide;
    for (const id of toHide) {
      const h = this.hit(id);
      if (h.instance >= 0) { h.mesh.setMatrixAt(h.instance, new THREE.Matrix4().makeScale(0, 0, 0)); h.mesh.instanceMatrix.needsUpdate = true; }
      else h.mesh.visible = false;
    }
    this.e.requestRender(); this._changed("isolate");
  }
  unisolate() {
    for (const id of this._isolated || []) {
      const h = this.hit(id);
      if (!h || this.hidden.has(id)) continue;
      if (h.instance >= 0) { const ed = this.edits.get(this.member(id).mark); h.mesh.setMatrixAt(h.instance, ed?.matrix ? new THREE.Matrix4().fromArray(ed.matrix) : this.baseMatrix(id)); h.mesh.instanceMatrix.needsUpdate = true; }
      else h.mesh.visible = true;
    }
    this._isolated = null;
    this.e.requestRender(); this._changed("isolate");
  }
  get isolated() { return !!this._isolated; }

  _paint(id, hex) {
    const h = this.hit(id);
    if (!h) return;
    const ed = this._edit(id);
    if (h.instance >= 0) {
      if (!h.mesh.instanceColor) return;
      if (hex == null) { const base = h.mesh.userData._baseColors?.[h.instance]; h.mesh.setColorAt(h.instance, base ? new THREE.Color().fromArray(base) : new THREE.Color(1, 1, 1)); }
      else {
        if (!h.mesh.userData._baseColors) h.mesh.userData._baseColors = {};
        if (!h.mesh.userData._baseColors[h.instance]) { const c = new THREE.Color(); h.mesh.getColorAt(h.instance, c); h.mesh.userData._baseColors[h.instance] = c.toArray(); }
        h.mesh.setColorAt(h.instance, new THREE.Color(hex));
      }
      h.mesh.instanceColor.needsUpdate = true;
    } else {
      if (hex == null) { if (h.mesh.userData._paintMat) { h.mesh.material = h.mesh.userData._paintBase; h.mesh.userData._paintMat.dispose(); h.mesh.userData._paintMat = null; } }
      else {
        if (!h.mesh.userData._paintMat) { h.mesh.userData._paintBase = h.mesh.material; h.mesh.userData._paintMat = h.mesh.material.clone(); h.mesh.material = h.mesh.userData._paintMat; }
        h.mesh.userData._paintMat.color.set(hex);
        if (h.mesh.userData._paintMat.map) h.mesh.userData._paintMat.map = null;
      }
    }
    if (hex == null) { delete ed.color; if (!Object.keys(ed).length) this.edits.delete(this.member(id).mark); } else ed.color = hex;
    this.e.requestRender();
  }
  paint(hex, ids = this.selection) {
    if (!ids.length) return;
    const entries = ids.map((id) => ({ id, color: hex, prevColor: this.edits.get(this.member(id).mark)?.color ?? null }));
    for (const id of ids) this._paint(id, hex);
    this._pushUndo(entries);
    this._changed("edits");
  }

  /* After the engine rebuilds the model (same spec → same marks): put the edits back. */
  reapply() {
    this.selection = []; this.hidden = new Set(); this._isolated = null; this._measurePts = [];
    if (this.edits.size) {
      const byMark = new Map(this.members().map((m) => [m.mark, m.id]));
      for (const [mark, ed] of this.edits) {
        const id = byMark.get(mark);
        if (id == null) continue;
        if (ed.matrix) this.setMatrix(id, new THREE.Matrix4().fromArray(ed.matrix));
        if (ed.color) this._paint(id, ed.color);
        if (ed.hidden) this._setHidden(id, true);
      }
    }
    this.clearMeasurements();
    this._refresh();
    this._changed("rebuild");
  }
  editsJson() {
    const out = [];
    for (const [mark, ed] of this.edits) { const { _shown, ...rest } = ed; if (Object.keys(rest).length) out.push({ mark, ...rest }); }
    return out;
  }
  get editCount() { return this.editsJson().length; }

  /* ---------- helpers: outlines, wire boxes, gizmo ---------- */
  _refresh() {
    this.helpers.clear(); this.proxies.clear();
    const ids = this.selection.filter((id) => this.hit(id));
    const centre = new THREE.Vector3();
    const outline = this.e.fx?.outline;
    // outlines (photo quality) trace up to 2 500 pieces; without the post chain each
    // piece gets a wire box, or one box round the lot when the selection is big
    const perPiece = !outline && ids.length <= 80;
    const all = new THREE.Box3();
    const byShape = new Map();                     // outline proxies, one instanced draw per shape
    ids.forEach((id, i) => {
      if (!this.matrixOf(id, _m)) return;
      if (perPiece) {
        const box = new THREE.LineSegments(unitEdges, this.selMat);
        box.matrixAutoUpdate = false; box.matrix.copy(_m); box.renderOrder = 999; box.userData.id = id;
        this.helpers.add(box);
      } else if (!outline) for (const c of CORNERS) all.expandByPoint(_v.copy(c).applyMatrix4(_m));
      if (outline && i < 5000) {
        const shape = this.member(id).shape || "box";
        (byShape.get(shape) || byShape.set(shape, []).get(shape)).push(id);
      }
      centre.add(_v.setFromMatrixPosition(_m));
    });
    for (const [shape, list] of byShape) {
      const im = new THREE.InstancedMesh(unitGeometry(shape), this.proxyMat, list.length);
      im.frustumCulled = false;
      im.userData.ids = list;
      list.forEach((id, k) => { this.matrixOf(id, _m); im.setMatrixAt(k, _m); });
      im.instanceMatrix.needsUpdate = true;
      this.proxies.add(im);
    }
    if (!perPiece && !outline && !all.isEmpty()) { const bh = new THREE.Box3Helper(all, SEL); bh.material.depthTest = false; bh.renderOrder = 999; bh.userData.group = true; this.helpers.add(bh); }
    if (outline) { outline.selectedObjects = [...this.proxies.children]; outline.enabled = ids.length > 0; }
    this.helpers.visible = true;
    if (ids.length && ["move", "rotate", "scale"].includes(this.tool)) {
      centre.divideScalar(ids.length);
      this.pivot.position.copy(centre);
      if (ids.length === 1) { this.matrixOf(ids[0], _m); _m.decompose(_v, _q, _s); this.pivot.quaternion.copy(_q); } else this.pivot.quaternion.identity();
      this.pivot.scale.set(1, 1, 1);
      this.pivot.updateMatrix();
      this.gizmo.attach(this.pivot);
      this.gizmo.visible = true; this.gizmo.enabled = true;
      this.gizmo.space = ids.length === 1 ? "local" : "world";
    } else { this.gizmo.detach(); this.gizmo.visible = false; this.gizmo.enabled = false; }
    if (this.hover != null && this.isSelected(this.hover)) this.hoverBox.visible = false;
    this.e.requestRender();
  }
  _syncHelpers() {
    for (const box of this.helpers.children) if (box.userData.id != null && this.matrixOf(box.userData.id, _m)) box.matrix.copy(_m);
    for (const im of this.proxies.children) { im.userData.ids.forEach((id, k) => { if (this.matrixOf(id, _m)) im.setMatrixAt(k, _m); }); im.instanceMatrix.needsUpdate = true; }
    const group = this.helpers.children.find((h) => h.userData.group);
    if (group) { const b = this.selectionBox(); if (b) group.box.copy(b); }
  }

  /* World-space bounds of the selection (for framing). */
  selectionBox() {
    const box = new THREE.Box3();
    for (const id of this.selection) if (this.matrixOf(id, _m)) for (const c of CORNERS) box.expandByPoint(_v.copy(c).applyMatrix4(_m));
    return box.isEmpty() ? null : box;
  }

  /* ---------- measuring ---------- */
  /* A click while measuring: `hit` = { point, id } from the engine's raycast. */
  measureClick(hit) {
    if (!hit) return;
    let p = hit.point.clone();
    // snap to the nearest corner of the piece under the cursor
    if (hit.id != null && this.matrixOf(hit.id, _m)) {
      let best = null, bd = 0.15;
      for (const c of CORNERS) { const w = _v.copy(c).applyMatrix4(_m); const d = w.distanceTo(hit.point); if (d < bd) { bd = d; best = w.clone(); } }
      if (best) p = best;
    }
    this._measurePts.push(p);
    this._drawMeasurePoint(p);
    if (this._measurePts.length === 2) {
      const [a, b] = this._measurePts;
      this._measurePts = [];
      this.addMeasurement(a, b);
    }
    this._changed("measure");
  }
  _drawMeasurePoint(p) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: MEASURE, depthTest: false }));
    dot.position.copy(p); dot.renderOrder = 1000; dot.userData.temp = true;
    this.measures.add(dot);
    this.e.requestRender();
  }
  addMeasurement(a, b) {
    for (const o of [...this.measures.children]) if (o.userData.temp) this.measures.remove(o);
    const g = new THREE.Group();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: MEASURE, depthTest: false }));
    line.renderOrder = 1000;
    g.add(line);
    for (const p of [a, b]) { const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: MEASURE, depthTest: false })); dot.position.copy(p); dot.renderOrder = 1000; g.add(dot); }
    const d = a.distanceTo(b);
    const label = makeLabel(`${Math.round(d * 1000).toLocaleString()} mm`);
    label.position.copy(a).add(b).multiplyScalar(0.5);
    g.add(label);
    g.userData.measure = { a: a.toArray(), b: b.toArray(), d, dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y), dz: Math.abs(b.z - a.z) };
    this.measures.add(g);
    this.measurements.push(g.userData.measure);
    this.e.requestRender();
  }
  clearMeasurements() { this.measures.clear(); this.measurements = []; this._measurePts = []; this.e.requestRender(); this._changed("measure"); }

  /* ---------- export ---------- */
  async exportGlb(filename = "model.glb") {
    const exporter = new GLTFExporter();
    // helpers and the site stay out; the building (and any imported props) go in
    const buf = await exporter.parseAsync(this.e.buildingGroup, { binary: true, onlyVisible: true });
    const blob = new Blob([buf], { type: "model/gltf-binary" });
    download(blob, filename);
  }
  exportEdits(filename = "model-edits.json") {
    download(new Blob([JSON.stringify({ version: 1, edits: this.editsJson(), measurements: this.measurements }, null, 2)], { type: "application/json" }), filename);
  }

  _changed(what) { this.onChange?.(what); }

  dispose() {
    this.gizmo.detach(); this.gizmo.dispose();
    for (const g of [this.helpers, this.proxies, this.measures, this.pivot, this.hoverBox, this.gizmo]) this.e.scene.remove(g);
    const outline = this.e.fx?.outline;
    if (outline) { outline.selectedObjects = []; outline.enabled = false; }
  }
}

/* A text label that keeps its pixel size at any distance. */
function makeLabel(text) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(15,23,42,0.92)";
  g.beginPath(); g.roundRect(4, 8, 248, 48, 10); g.fill();
  g.fillStyle = "#F5C518"; g.font = "700 28px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
  sp.scale.set(0.16, 0.04, 1);
  sp.renderOrder = 1001;
  return sp;
}

export function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
