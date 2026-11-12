/* =========================================================================
   Reel studio — scenes for Instagram reels, rendered from the real engine.

   Every scene is a pure function of time: render.mjs calls
   window.renderAt(seconds) for each frame and screenshots the page, so the
   output is smooth whatever the machine. The house, the stage split and the
   prices come from the same Engine3D and Estimator the app uses — nothing
   here is drawn by hand.
   ========================================================================= */
import { Engine3D } from "/src/engine/engine3D.js";
import { Estimator } from "/src/logic/estimator.js";
import * as THREE from "three";
import { fmt, currencySymbol } from "/src/lib/format.js";

/* Same house as the landing page hero. */
const SPEC = {
  widthM: 11, lengthM: 13, floors: 2, wallHeightM: 2.7, roofPitch: 24, slabThicknessM: 0.1,
  siteCondition: "flat", framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: true, solar: true, staircaseType: "timber",
  openings: { windowsCount: 12, windowsM2: 17, doors: 2 },
  rooms: [], kitchens: [], bathrooms: [], extras: [],
};
const REGION = "AU";
/* Same stage split as ScrollBuild. */
const STAGES = [
  { title: "Slab", mat: ["foundation"], lab: ["siteworks", "concrete"] },
  { title: "Frame", mat: ["frame", "stairs"], lab: ["frame"] },
  { title: "Roof", mat: ["roof"], lab: ["roof"] },
  { title: "Walls", mat: ["cladding", "openings"], lab: ["brick"] },
  { title: "Fit-out", mat: null, lab: null },
];

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const span = (t, a, b) => ease((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

const est = Estimator.buildEstimate(SPEC, REGION);
const sym = currencySymbol(REGION);
const gross = est.total * (1 + (est.taxRate || 0));
const totals = (() => {
  const cm = new Set(STAGES.flatMap((s) => s.mat || [])), cl = new Set(STAGES.flatMap((s) => s.lab || []));
  const direct = STAGES.map((s) => {
    const m = est.materialLines.filter((l) => (s.mat ? s.mat.includes(l.category) : !cm.has(l.category)));
    const l = est.labourLines.filter((x) => (s.lab ? s.lab.includes(x.tradeKey) : !cl.has(x.tradeKey)));
    return [...m, ...l].reduce((a, x) => a + (x.total || 0), 0);
  });
  const sum = direct.reduce((a, b) => a + b, 0) || 1;
  let run = 0;
  return direct.map((d) => (run += d) / sum * gross);
})();

const stage = $("stage");
const eng = new Engine3D(stage, { quality: new URLSearchParams(location.search).get("q") || "high" });
eng.buildFromSpec(SPEC);
eng.setAutoRotate(false);
eng.controls.enabled = false;
eng.setPaused(true);                     // we render each frame ourselves
eng._showFine = false;

/* The look: an architect's model on a clean studio floor. The busy site
   (grass, gravel, trees, grid) goes; one seamless warm-white ground takes
   the shadows and fades into a background of the same colour. A low, warm
   sun with soft-edged shadows gives the brick and timber their depth, and a
   long lens keeps the verticals calm. */
const PAPER = 0xedebe6;
eng.setSiteVisible(false);
eng.scene.background = new THREE.Color(PAPER);
// unlit floor, so it is exactly the background colour; a second plane only catches the shadow
const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 96), new THREE.MeshBasicMaterial({ color: PAPER, fog: false }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.03;
const catcher = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.ShadowMaterial({ color: 0x4a3f36, opacity: 0.3, fog: false }));
catcher.rotation.x = -Math.PI / 2; catcher.position.y = -0.02; catcher.receiveShadow = true;
eng.scene.add(floor, catcher);
eng.scene.fog = new THREE.Fog(PAPER, 70, 190);
const fogKeep = () => { eng.scene.fog.near = 70; eng.scene.fog.far = 190; };
eng.renderer.shadowMap.type = THREE.VSMShadowMap;      // the one type whose edge can be blurred wide
eng.renderer.toneMappingExposure = 0.98;
for (const l of eng.scene.children.filter((o) => o.isLight)) {
  if (l === eng.sun) continue;
  if (l.isHemisphereLight) { l.intensity = 0.5; l.groundColor.set(0xe6dccb); }
  else if (l.isAmbientLight) l.intensity = 0.12;
  else l.intensity = 0.18;                                   // cool fill
}
const sun = eng.sun;
sun.color.set(0xffe3bd); sun.intensity = 2.1;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 140 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.radius = 7; sun.shadow.blurSamples = 20; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
if (eng.fx) eng.fx.ao.blendIntensity = 1;
const maxAniso = eng.renderer.capabilities.getMaxAnisotropy();
/* Crisp textures at grazing angles (roof sheeting, brick courses), and recompile for the new shadow type. */
const refreshMaterials = () => eng.scene.traverse((o) => {
  for (const m of [].concat(o.material || [])) {
    for (const k of ["map", "normalMap", "roughnessMap", "bumpMap"]) if (m[k] && m[k].anisotropy !== maxAniso) { m[k].anisotropy = maxAniso; m[k].needsUpdate = true; }
    if (!m._studio) { m._studio = true; m.needsUpdate = true; }
  }
});
refreshMaterials();
/* The sun rides with the camera, like a model on a turntable: the faces we look at stay lit. */
const sunAt = (angle) => { sun.position.set(Math.cos(angle) * 34, 30, Math.sin(angle) * 34); sun.target.position.set(0, 2, 0); sun.target.updateMatrixWorld(); };

const LENS = 30;                                             // long lens; the orbit backs off to suit
eng.camera.fov = LENS; eng.camera.updateProjectionMatrix();
eng.camera.setViewOffset(1080, 1920, 0, 40, 1080, 1920);    // sit the house between headline and price
const BACK = 2.6;                                            // zoom multiplier that frames the house at this lens

const orbit = (angle, zoom, tilt) => { eng.cameraAngle = angle; eng.zoomFactor = zoom * BACK; eng.tiltFactor = tilt * BACK * 0.5; eng._updateOrbitCamera(); fogKeep(); sunAt(angle - 0.95); };
const text = (eyebrow, headline) => { $("eyebrow").textContent = eyebrow; $("headline").innerHTML = headline; };
const panel = ({ label = "", right = "", price = null, bar = null, chips = null, sub = "" }) => {
  $("pl").textContent = label; $("pr").textContent = right;
  $("price").style.display = price == null ? "none" : "";
  if (price != null) $("price").textContent = sym + fmt(Math.round(price));
  $("bar").style.display = bar == null ? "none" : "";
  if (bar != null) $("bar").firstElementChild.style.transform = `scaleX(${clamp(bar)})`;
  $("chips").innerHTML = (chips || []).map((c) => `<span class="chip ${c.state || ""}">${c.text}</span>`).join("");
  $("sub").textContent = sub;
};

/* ---- Scene 1: the build, stage by stage, with the price climbing ---- */
const build = {
  duration: 16,
  at(t) {
    const p = span(t, 1.2, 13);                       // build clock
    eng.setProgress(p);
    orbit(Math.PI * 0.12 + ease(t / 16) * Math.PI * 1.0, lerp(1.34, 1.14, ease(t / 16)), lerp(1.2, 0.74, ease(t / 16)));
    const sc = p * STAGES.length, active = Math.min(STAGES.length - 1, Math.floor(sc)), within = Math.min(1, sc - active);
    const running = p >= 1 ? gross : (active ? totals[active - 1] : 0) + (totals[active] - (active ? totals[active - 1] : 0)) * within;
    text(t < 13.4 ? "WATCH IT GO UP" : "BEFORE YOU CALL A BUILDER", t < 13.4 ? "Your whole build,<br>priced as it rises." : "Know what<br>it costs.");
    panel({
      label: p >= 1 ? "Total, inc. GST" : "Running total", right: `${SPEC.widthM} × ${SPEC.lengthM} m · 2 storey`, price: running, bar: p,
      chips: STAGES.map((s, i) => ({ text: s.title, state: p >= 1 || i < active ? "done" : i === active && t > 1.2 ? "on" : "" })),
    });
  },
};

/* ---- Scene 2: blank model to finished house to price ---- */
const plan3d = {
  duration: 12,
  setup() { eng.setProgress(1); },
  at(t) {
    const style = t < 4.4 ? "white" : "realistic";
    if (eng.style !== style) eng.setStyle(style);
    const k = ease(t / 12);
    orbit(Math.PI * 0.62 - k * Math.PI * 0.95, lerp(1.45, 1.04, k), lerp(1.7, 0.74, k));
    text(t < 4.4 ? "START WITH THE SIZE OF YOUR HOUSE" : "YOUR HOUSE, IN SECONDS",
      t < 4.4 ? "Type in<br>the size." : t < 8 ? "See your house<br>in 3D." : "Then see<br>what it costs.");
    const c = span(t, 8, 10.4);
    panel(t < 4.4 ? { label: "Type the size, or snap a photo of your plan", sub: "BuildYourOwn models it for you." }
      : t < 8 ? { label: "Every wall, window and roof sheet modelled", sub: "No architect. No software to learn." }
      : { label: "Estimated build cost, inc. GST", right: "itemised by trade", price: gross * c, bar: c });
  },
};

/* ---- Scene 3: what the model is made of, one layer at a time ---- */
const LAYER_STEPS = [
  { sys: ["foundation", "reo"], head: "Every bar<br>of steel." },
  { sys: ["foundation", "wallFrame", "floorFrame", "fixings"], head: "Every stud." },
  { sys: ["foundation", "wallFrame", "floorFrame", "fixings", "roofFrame"], head: "Every truss." },
  { sys: ["foundation", "wallFrame", "floorFrame", "roofFrame", "cladding", "openings"], head: "Every brick." },
  { sys: null, head: "Counted.<br>Priced." },
];
const layers = {
  duration: 15,
  setup() { eng.setProgress(1); this.rows = eng.layers(); this.all = Object.fromEntries(this.rows.map((r) => [r.sys, true])); },
  at(t) {
    const i = Math.min(LAYER_STEPS.length - 1, Math.floor(t / 3)), step = LAYER_STEPS[i];
    if (this.cur !== i) {
      this.cur = i;
      eng.setLayers(step.sys ? Object.fromEntries(this.rows.map((r) => [r.sys, step.sys.includes(r.sys) || r.sys === "site"])) : this.all);
    }
    orbit(Math.PI * 0.2 + (t / 15) * Math.PI * 1.1, 1.08, 0.92);
    text("NOT JUST A PRETTY MODEL", step.head);
    const shown = step.sys ? this.rows.filter((r) => step.sys.includes(r.sys)) : this.rows.filter((r) => r.sys !== "site");
    const pieces = shown.reduce((a, r) => a + r.pieces, 0);
    panel({
      label: step.sys ? "Shown so far" : "In the whole house", right: `${fmt(pieces)} pieces`,
      chips: (step.sys ? shown : shown.slice(0, 5)).map((r) => ({ text: r.label, state: "done" })),
      sub: step.sys ? "" : "A full materials list, ready to price and order.",
    });
  },
};

const SCENES = { build, plan3d, layers };
const scene = SCENES[new URLSearchParams(location.search).get("scene") || "build"];
scene.setup?.();
window.sceneDuration = scene.duration;
window.renderAt = (t) => { scene.at(t); refreshMaterials(); eng.renderFrame(); };
window.renderAt(0);
window.studioReady = true;
