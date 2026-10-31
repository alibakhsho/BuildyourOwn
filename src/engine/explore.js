/* =========================================================================
   MODULE: explore.js
   The simple way into the model — no CAD skills needed. Owned by the engine
   (engine.explore); the Explore panel (components/Explore3D.jsx) drives it.

     parts      the build as a dozen plain-English parts (slab, frame, roof
                frame, roof, walls, windows & doors, insulation, rooms' fit-
                out, furniture, electrical, plumbing, solar, yard)
     focus      show one part: everything else turns to glass and the camera
                flies to it
     peel       "see inside": take the house apart from the outside in —
                roof sheets, roof frame, brick & windows, insulation &
                plasterboard, fit-out — down to the slab
     explode    "pull apart": lift each layer above the one below it
     rooms      fly into any room, with the storey above cut away
     nav        turn, tilt, zoom and home, as buttons
   ========================================================================= */
import * as THREE from "three";

export const PARTS = [
  { id: "slab",       label: "Slab & footings",            sys: ["foundation", "reo"],           tint: "#9aa0a6" },
  { id: "frame",      label: "Wall & floor frame",         sys: ["wallFrame", "floorFrame", "fixings"], tint: "#e3cf9f" },
  { id: "roofFrame",  label: "Roof trusses & battens",     sys: ["roofFrame"],                   tint: "#c99d63" },
  { id: "roof",       label: "Roof sheets & gutters",      sys: ["roofing"],                     tint: "#4a4f56" },
  { id: "walls",      label: "Brickwork & cladding",       sys: ["cladding"],                    tint: "#a4553a" },
  { id: "openings",   label: "Windows & doors",            sys: ["openings"],                    tint: "#7fb3d5" },
  { id: "linings",    label: "Insulation & plasterboard",  sys: ["linings"],                     tint: "#f1d77a" },
  { id: "interior",   label: "Floors, kitchen & bathrooms", sys: ["interior"],                   tint: "#b98a55" },
  { id: "furniture",  label: "Furniture",                  sys: ["furniture"],                   tint: "#8d9096" },
  { id: "electrical", label: "Electrical",                 sys: ["electrical"],                  tint: "#3a7bd5" },
  { id: "plumbing",   label: "Plumbing & drainage",        sys: ["plumbing", "drainage"],        tint: "#c8332b" },
  { id: "solar",      label: "Solar panels",               sys: ["solar"],                       tint: "#1c3157" },
  { id: "yard",       label: "Yard & landscaping",         sys: ["fencing", "decking", "paving", "garden", "lawn", "retaining"], tint: "#7f9a5c" },
];
export const partOfSys = (sys) => PARTS.find((p) => p.sys.includes(sys)) || null;

/* The design object a piece belongs to, when that object has sizes you can
   change (the Studio's size panel, "Change size" on the piece card). */
const HOUSE_SYS = new Set(["wallFrame", "cladding", "roofFrame", "roofing", "foundation", "reo", "linings", "fixings", "floorFrame"]);
export function paramGroupOf(m) {
  if (!m) return null;
  if (m.sys === "decking") return "deck";
  if ((m.host || "").startsWith("Garage") || /^Garage door/.test(m.name || "")) return "garage";
  if (m.sys === "fencing") return "fence";
  if (HOUSE_SYS.has(m.sys)) return "house";
  return null;
}

/* "See inside": each step takes away one more layer, outside in. */
export const PEEL = [
  { label: "Finished house",            hide: [] },
  { label: "Roof sheets off",           hide: ["solar", "roofing"] },
  { label: "Roof frame off",            hide: ["roofFrame"] },
  { label: "Brick & windows off",       hide: ["cladding", "openings"] },
  { label: "Insulation & linings off",  hide: ["linings"] },
  { label: "Frame & services only",     hide: ["interior", "furniture"] },
  { label: "Slab & pipes only",         hide: ["wallFrame", "floorFrame", "fixings", "electrical", "plumbing"] },
];

/* "Pull apart": how many storeys each layer lifts at full explode. */
const LIFT = {
  floorFrame: 1, wallFrame: 1, fixings: 1, electrical: 1.45, plumbing: 1.45,
  linings: 2.2, openings: 3, cladding: 3, roofFrame: 4.1, roofing: 5.1, solar: 5.3,
};

export class Explore {
  constructor(engine) {
    this.e = engine;
    this.focusId = null;
    this.focusSys = null;
    this.peelLevel = 0;
    this.explodeT = 0;
    this.room = null;
    this.onChange = null;
    this._ghosts = new Map();
  }

  /* ---------- parts ---------- */
  parts() {
    const s = this.e.structure;
    if (!s) return [];
    const count = new Map();
    for (const m of s.members) if (!m.noRender) count.set(m.sys, (count.get(m.sys) || 0) + 1);
    const lv = this.e.layerVisible || {};
    return PARTS.map((p) => ({ ...p, count: p.sys.reduce((a, k) => a + (count.get(k) || 0), 0), visible: p.sys.some((k) => count.get(k) && lv[k] !== false) }))
      .filter((p) => p.count > 0);
  }
  /* Show one part on its own (the rest as glass), and fly to it. null = everything. */
  focus(id) {
    const part = PARTS.find((p) => p.id === id) || null;
    this.focusId = part ? part.id : null;
    this.focusSys = part ? new Set(part.sys) : null;
    if (part) {
      // a focused part is always drawn, whatever the peel step says
      const lv = { ...(this.e.layerVisible || {}) };
      for (const k of part.sys) lv[k] = true;
      this.e.setLayers(lv);
    }
    this.e._applyGhost();
    if (part) this.e.frameBox(this.boundsOf(part.sys), { pad: 1.25 });
    this._changed();
  }
  setPartVisible(id, visible) {
    const part = PARTS.find((p) => p.id === id);
    if (!part) return;
    for (const k of part.sys) this.e.setLayerVisible(k, visible);
    this._changed();
  }

  /* World bounds of some systems, from the member list (plus any lift). */
  boundsOf(sysList) {
    const s = this.e.structure, box = new THREE.Box3(), set = new Set(sysList), v = new THREE.Vector3();
    if (!s) return null;
    const gap = this._gap();
    for (const m of s.members) {
      if (!set.has(m.sys) || m.noRender) continue;
      const dy = (LIFT[m.sys] || 0) * gap * this.explodeT;
      box.expandByPoint(v.set(m.a[0], m.a[1] + dy, m.a[2]));
      box.expandByPoint(v.set(m.b[0], m.b[1] + dy, m.b[2]));
    }
    return box.isEmpty() ? null : box;
  }
  boundsAll() {
    const s = this.e.structure;
    if (!s) return null;
    return this.boundsOf([...new Set(s.members.map((m) => m.sys))].filter((k) => !["fencing", "decking", "paving", "garden", "lawn", "retaining"].includes(k)));
  }

  /* ---------- see inside ---------- */
  peel(level) {
    this.peelLevel = Math.max(0, Math.min(PEEL.length - 1, level | 0));
    const hide = new Set(PEEL.slice(1, this.peelLevel + 1).flatMap((p) => p.hide));
    const lv = { ...(this.e.layerVisible || {}) };
    for (const p of PEEL.flatMap((x) => x.hide)) lv[p] = !hide.has(p);
    if (this.focusSys) for (const k of this.focusSys) lv[k] = true;
    this.e.setLayers(lv);
    this._changed();
  }

  /* ---------- pull apart ---------- */
  _gap() { return Math.max(2.6, (this.e.structure?.env?.wallH || 2.7) * 1.15); }
  setExplode(t) {
    this.explodeT = Math.max(0, Math.min(1, t));
    const gap = this._gap();
    this.e.buildingGroup.traverse((o) => {
      if (!o.isMesh || !o.userData.sys) return;
      if (o.userData._baseY === undefined) o.userData._baseY = o.position.y;
      o.position.y = o.userData._baseY + (LIFT[o.userData.sys] || 0) * gap * this.explodeT;
    });
    this.e.requestRender();
    this._changed();
  }
  /* Fit the camera to the whole (possibly pulled-apart) building. */
  frameAll() { this.e.frameBox(this.boundsAll(), { pad: 1.1 }); }

  /* ---------- rooms ---------- */
  floors() {
    const s = this.e.structure;
    if (!s?.layout) return [];
    const name = (f) => (f === 0 ? "Ground floor" : f === 1 ? "First floor" : `Level ${f + 1}`);
    const out = s.layout.floors.map((fl, f) => ({
      index: f, name: name(f), y: fl.y,
      rooms: fl.cells.filter((c) => !c.item.circulation).map((c) => ({ name: c.item.name, type: c.item.type, floor: f, y: fl.y, x: c.x, z: c.z, w: c.w, l: c.l })),
    }));
    if (s.garage && out[0]) {
      const g = s.garage;
      out[0].rooms.push({ name: "Garage", type: "Garage", floor: 0, y: s.env.ffl, x: g.x0, z: g.z0, w: g.x1 - g.x0, l: g.z1 - g.z0 });
    }
    return out;
  }
  /* Fly into a room: the storey above (and the roof) cut away at eye height. */
  goRoom(r) {
    if (!r) return;
    this.room = r;
    this.e.setSection("plan", r.y + 1.5);
    const c = new THREE.Vector3(r.x + r.w / 2, r.y + 0.5, r.z + r.l / 2);
    const d = Math.max(4.5, Math.max(r.w, r.l) * 1.35 + 2.5);
    const dir = new THREE.Vector3(0.55, 1.05, 0.8).normalize();
    this.e.flyTo(c, c.clone().add(dir.multiplyScalar(d)));
    this._changed();
  }
  goFloor(f) {
    const fl = this.floors()[f];
    const env = this.e.structure?.env;
    if (!fl || !env) return;
    this.room = { name: fl.name, floor: f, whole: true };
    this.e.setSection("plan", fl.y + 1.5);
    const c = new THREE.Vector3(0, fl.y, 0);
    const d = Math.max(env.w, env.l) * 1.25 + 4;
    this.e.flyTo(c, c.clone().add(new THREE.Vector3(0.35, 1.15, 0.75).normalize().multiplyScalar(d)));
    this._changed();
  }
  leaveRoom() {
    if (!this.room) return;
    this.room = null;
    this.e.setSection("off", 0);
    this._changed();
  }

  /* ---------- navigation buttons ---------- */
  orbit(dAzimuthDeg, dPolarDeg = 0) {
    const e = this.e;
    if (e.view !== "persp") e.setView("persp", { keep: true });
    const t = e.controls.target.clone();
    const off = e.camera.position.clone().sub(t);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += THREE.MathUtils.degToRad(dAzimuthDeg);
    sph.phi = Math.max(0.12, Math.min(e.controls.maxPolarAngle - 0.02, sph.phi + THREE.MathUtils.degToRad(dPolarDeg)));
    e.flyTo(t, t.clone().add(new THREE.Vector3().setFromSpherical(sph)), 520);
  }
  zoom(factor) {
    const e = this.e;
    if (e.camera.isOrthographicCamera) { e.ortho.zoom = Math.max(0.2, Math.min(40, e.ortho.zoom / factor)); e.ortho.updateProjectionMatrix(); e.requestRender(); return; }
    const t = e.controls.target.clone();
    const off = e.camera.position.clone().sub(t);
    const len = Math.max(e.controls.minDistance + 0.2, Math.min(e.controls.maxDistance, off.length() * factor));
    e.flyTo(t, t.clone().add(off.setLength(len)), 420);
  }
  /* Straight overhead, still in perspective, so everything stays clickable. */
  topView() {
    const b = this.boundsAll();
    if (!b) return;
    const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.z) * 1.15 + 6;
    this.e.flyTo(new THREE.Vector3(c.x, 0, c.z), new THREE.Vector3(c.x, d, c.z + 0.01 * d));
  }
  /* Fly to one piece (from the info card). */
  flyToMember(id) {
    const m = this.e.structure?.members[id];
    if (!m) return;
    const dy = (LIFT[m.sys] || 0) * this._gap() * this.explodeT;
    const a = new THREE.Vector3(m.a[0], m.a[1] + dy, m.a[2]), b = new THREE.Vector3(m.b[0], m.b[1] + dy, m.b[2]);
    const box = new THREE.Box3().setFromPoints([a, b]).expandByScalar(Math.max(m.d, m.w) / 2 + 0.1);
    this.e.frameBox(box, { pad: 1.6, min: 2.2 });
  }

  /* Everything back to the finished house from the usual angle. */
  reset() {
    this.focusId = null; this.focusSys = null;
    this.room = null;
    this.e.setSection("off", 0);
    this.peelLevel = 0;
    this.e.setLayers({});
    this.e.setViewMode("finished");
    if (this.explodeT) this.setExplode(0);
    this.e._applyGhost();
    this.e.home();
    this._changed();
  }

  /* The engine rebuilt the model: keep the user's view choices that still make sense. */
  onRebuild() {
    if (this.explodeT) this.setExplode(this.explodeT);
    if (this.focusSys) this.e._applyGhost();
    if (this.room) { this.room = null; this.e.setSection("off", 0); }
    this._changed();
  }

  /* The see-through stand-in for a material while another part is focused. */
  ghostOf(mat) {
    let g = this._ghosts.get(mat.uuid);
    if (!g) {
      g = new THREE.MeshBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0.035, depthWrite: false, fog: false });
      g.userData.ghost = true;
      this._ghosts.set(mat.uuid, g);
    }
    return g;
  }

  _changed() { this.onChange?.(); }
}
