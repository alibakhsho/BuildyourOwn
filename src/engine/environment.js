/* =========================================================================
   MODULE: environment.js
   The world around the building — what makes the model read as a photo
   rather than a diagram:

     Environment  a physically based sky (three's Preetham/Hosek sky) with a
                  movable sun that drives the key light, its colour, the
                  shadows, the fog and an image-based light (PMREM of the
                  sky) so every surface — glass, Colorbond, render — reflects
                  the sky it stands under. Can swap to a photographic 360°
                  backdrop (public/textures/sky/*.jpg) for lighting and
                  reflections.
     Site         the lot outside the yard: a paddock that runs to the
                  horizon, the cleared building pad, a faint setout grid, and
                  trees — photo cut-outs on crossed billboards when the asset
                  pack is present, soft low-poly canopies when it isn't — with
                  a tree-line on the horizon so the ground never ends in a
                  hard line.
   ========================================================================= */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { grassTexture, gravelTexture, loadTextureManifest, pbrMaps, textureUrl } from "./materials3d.js";

export const SKY_PRESETS = {
  noon:     { label: "Midday",      elevation: 52, azimuth: 35,  turbidity: 2.2, rayleigh: 1.3,  mie: 0.004, exposure: 0.6,  sun: 3.2, hemi: 0.55 },
  morning:  { label: "Morning",     elevation: 27, azimuth: 100, turbidity: 4,   rayleigh: 1.5,  mie: 0.006, exposure: 0.66, sun: 2.6, hemi: 0.5 },
  golden:   { label: "Golden hour", elevation: 7,  azimuth: -75, turbidity: 7,   rayleigh: 2.8,  mie: 0.02,  exposure: 0.74, sun: 1.9, hemi: 0.4 },
  overcast: { label: "Overcast",    elevation: 46, azimuth: 20,  turbidity: 14,  rayleigh: 0.5,  mie: 0.05,  exposure: 0.72, sun: 0.9, hemi: 0.75, soft: true },
};

const deg = (d) => (d * Math.PI) / 180;

export class Environment {
  constructor(renderer, scene, { quality = "low" } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.mode = "sky";                       // "sky" (procedural) | "hdri" (photo) | "plain" (white model)
    this.hdri = null;                        // name of the loaded photo sky
    this.state = { ...SKY_PRESETS.noon, preset: "noon", shadows: true, fog: true, envIntensity: 1 };

    // ---- sky dome ----
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);   // inside the perspective far plane (≥ 1200 m)
    this.sky.name = "sky";
    this.sky.userData.env = true;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    // a copy of just the dome for the environment map, so PMREM never sees the model
    this.skyScene = new THREE.Scene();
    const dome = new THREE.Mesh(this.sky.geometry, this.sky.material);
    dome.scale.setScalar(1000);
    this.skyScene.add(dome);

    // ---- lights ----
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sm = quality === "high" ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.radius = quality === "high" ? 2 : 1;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ec, 0x8c7f68, 0.55);
    scene.add(this.hemi);
    // a cool fill from the far side keeps shadowed faces alive
    this.fill = new THREE.DirectionalLight(0xcfe0ff, 0.3);
    scene.add(this.fill);

    scene.fog = new THREE.Fog(0xdde5ec, 160, 1100);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this._envDirty = true;
    this._envAt = 0;
    this.fitShadows(40);
    this.applyPreset("noon");
  }

  /* One of SKY_PRESETS, or a partial override of the current sky. */
  applyPreset(name) {
    const P = SKY_PRESETS[name] || SKY_PRESETS.noon;
    Object.assign(this.state, P, { preset: name });
    this._applySky();
    this.renderer.toneMappingExposure = this.state.exposure;
    this.onChange?.();
  }
  set(partial) {
    Object.assign(this.state, partial, { preset: "custom" });
    this._applySky();
    if (partial.exposure != null) this.renderer.toneMappingExposure = partial.exposure;
    if (partial.shadows != null) this.sun.castShadow = !!partial.shadows;
    if (partial.fog != null) this.scene.fog = partial.fog ? this._fog || (this._fog = new THREE.Fog(0xdde5ec, 160, 1100)) : null;
    this.onChange?.();
  }
  setExposure(v) { this.state.exposure = v; this.renderer.toneMappingExposure = v; }

  /* Sun by elevation/azimuth (degrees): the dome, the key light and its
     colour, the fill, the hemisphere and the fog colour all follow. */
  _applySky() {
    const S = this.state;
    const u = this.sky.material.uniforms;
    u.turbidity.value = S.turbidity;
    u.rayleigh.value = S.rayleigh;
    u.mieCoefficient.value = S.mie;
    u.mieDirectionalG.value = 0.8;
    const dir = new THREE.Vector3().setFromSphericalCoords(1, deg(90 - S.elevation), deg(S.azimuth));
    u.sunPosition.value.copy(dir);
    this.sunDir = dir;
    this.sun.position.copy(dir).multiplyScalar(90);
    this.sun.target.position.set(0, 0, 0);
    // colour temperature: white overhead, amber at the horizon
    const warm = new THREE.Color(0xffb36b), white = new THREE.Color(0xfff6e8);
    const k = Math.max(0, Math.min(1, (S.elevation - 2) / 28));
    this.sun.color.copy(warm).lerp(white, Math.pow(k, 0.7));
    this.sun.intensity = S.sun * (S.soft ? 1 : 0.55 + 0.45 * Math.sin(deg(Math.max(3, S.elevation))));
    this.sun.shadow.radius = S.soft ? 6 : this.quality === "high" ? 2 : 1;
    this.fill.position.copy(dir).multiply(new THREE.Vector3(-1, 0.6, -1)).normalize().multiplyScalar(60);
    this.fill.intensity = S.soft ? 0.15 : 0.3;
    this.hemi.intensity = S.hemi;
    this.hemi.color.set(S.soft ? 0xd9dde2 : 0xbfd6ec);
    const horizon = new THREE.Color(S.soft ? 0xcdd3d9 : 0xc9d8e6).lerp(new THREE.Color(0xe9c4a0), 1 - k);
    if (this.scene.fog) this.scene.fog.color.copy(horizon);
    this._envDirty = true;
  }

  /* Rebuild the image-based light from the dome (debounced: a slider drag
     doesn't run PMREM every frame). Returns true when it rebuilt. */
  tick(now = performance.now()) {
    if (!this._envDirty || this.mode === "hdri") return false;
    if (now - this._envAt < 120) return false;
    this._envAt = now;
    this._envDirty = false;
    const old = this.scene.environment;
    this.scene.environment = this.pmrem.fromScene(this.skyScene, 0, 1, 10000).texture;
    old?.dispose?.();
    return true;
  }
  forceEnvironment() { this._envDirty = true; this._envAt = 0; return this.tick(); }

  /* Photographic 360° backdrop from the asset pack (lighting + background). */
  async setHdri(name) {
    if (!name) { this.setSkyMode(); return true; }
    const manifest = await loadTextureManifest();
    const entry = manifest?.skies?.[name];
    if (!entry) return false;
    const tex = await new Promise((res, rej) => new THREE.TextureLoader().load(textureUrl(entry.file), res, undefined, rej));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._hdriTex?.dispose();
    this._hdriTex = tex;
    this.hdri = name;
    this.mode = "hdri";
    // the key light (and its shadows) match the photo: high sun for a clear day,
    // low warm sun for golden hour, soft light for overcast
    const match = name.includes("golden") ? "golden" : name.includes("overcast") ? "overcast" : "noon";
    Object.assign(this.state, SKY_PRESETS[match], { preset: match });
    this._applySky();
    this.renderer.toneMappingExposure = this.state.exposure;
    this.sky.visible = false;
    this.scene.background = tex;
    this.scene.backgroundIntensity = 1;
    const old = this.scene.environment;
    this.scene.environment = this.pmrem.fromEquirectangular(tex).texture;
    old?.dispose?.();
    // a photo sky brings its own light: keep the key light for shadows, trim the dome's role
    if (this.scene.fog) this.scene.fog.color.set(name.includes("golden") ? 0xe8c9a6 : name.includes("overcast") ? 0xd5dadf : 0xe1e9f0);
    this.onChange?.();
    return true;
  }
  setSkyMode() {
    this.mode = "sky";
    this.hdri = null;
    this.sky.visible = true;
    this.scene.background = null;
    this._envDirty = true;
    this._applySky();
    this.onChange?.();
  }
  /* White-model style: a plain studio backdrop, lighting unchanged. */
  setPlainBackground(colour) {
    if (colour == null) { if (this.mode === "plain") { this.mode = this._prevMode || "sky"; if (this.mode === "hdri" && this._hdriTex) { this.scene.background = this._hdriTex; } else this.setSkyMode(); } return; }
    if (this.mode !== "plain") this._prevMode = this.mode;
    this.mode = "plain";
    this.sky.visible = false;
    this.scene.background = new THREE.Color(colour);
  }

  /* Keep the shadow frustum tight around the subject so shadows stay crisp. */
  fitShadows(radius) {
    const c = this.sun.shadow.camera;
    const r = Math.max(14, radius * 1.15);
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.far = Math.max(160, r * 4);
    c.updateProjectionMatrix();
  }

  dispose() {
    this.pmrem.dispose();
    this.sky.material.dispose(); this.sky.geometry.dispose();
    this._hdriTex?.dispose();
    this.scene.environment?.dispose?.();
  }
}

/* -------------------------------------------------------------------------
   The lot: ground, pad, grid and trees.
   ------------------------------------------------------------------------- */
export class Site {
  constructor(scene, { onReady } = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "site";
    scene.add(this.group);
    this.visible = true;
    this.yard = false;
    this.onReady = onReady;

    // paddock to the horizon
    this.groundMat = new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xd9dccb, roughness: 1, vertexColors: true, envMapIntensity: 0.45 });
    this.ground = new THREE.Mesh(macroTint(metreUv(new THREE.PlaneGeometry(2200, 2200, 160, 160), 2200)), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.04;
    this.ground.receiveShadow = true;
    this.ground.name = "ground";
    this.group.add(this.ground);

    // cleared building pad
    this.padMat = new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1, alphaMap: radialFade(), transparent: true, depthWrite: false, envMapIntensity: 0.45 });
    this.pad = new THREE.Mesh(padGeometry(36), this.padMat);
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.position.y = -0.01;
    this.pad.receiveShadow = true;
    this.pad.name = "pad";
    this.group.add(this.pad);

    // faint setout grid on the pad
    this.grid = new THREE.GridHelper(64, 32, 0x8f9483, 0xb3b8a8);
    this.grid.position.y = 0.012;
    this.grid.material.opacity = 0.11;
    this.grid.material.transparent = true;
    this.grid.name = "grid";
    this.group.add(this.grid);

    this.trees = new THREE.Group();
    this.trees.name = "trees";
    this.group.add(this.trees);
    this.treeline = new THREE.Group();
    this.treeline.name = "treeline";
    this.group.add(this.treeline);
    this._lowPolyTrees();
    this._loadPhotoAssets();
  }

  /* The near trees, as soft canopies, until the photo cut-outs arrive. */
  _lowPolyTrees() {
    const spots = [[-32, -20], [30, -26], [-36, 16], [34, 22], [-24, 32], [24, 34], [-42, -2], [40, 8], [-18, -36], [16, -34]];
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 1 });
    const leafMats = [0x6f8f57, 0x5e8050, 0x7c9a63].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const h = 4 + ((x * z) % 5) * 0.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h * 0.55, 7), trunkMat);
      trunk.position.y = h * 0.27; trunk.castShadow = true; g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(h * (0.42 - i * 0.07), 1), leafMats[(Math.abs(x + z) + i) % 3]);
        c.position.set(((x + i * 7) % 3 - 1) * h * 0.18, h * (0.62 + i * 0.12), ((z + i * 5) % 3 - 1) * h * 0.18);
        c.castShadow = true; g.add(c);
      }
      g.position.set(x, 0, z);
      this.trees.add(g);
    }
  }

  /* Photo textures from the asset pack: paddock ground, gravel pad, foliage. */
  async _loadPhotoAssets() {
    const manifest = await loadTextureManifest();
    if (!manifest) return;
    const paddock = pbrMaps("paddock");
    if (paddock) { this.groundMat.map = paddock.map; this.groundMat.normalMap = paddock.normalMap; this.groundMat.normalScale.set(0.5, 0.5); this.groundMat.color.set(0xffffff); this.groundMat.needsUpdate = true; }
    const dirt = pbrMaps("sitepad") || pbrMaps("gravel");
    if (dirt) { this.padMat.map = dirt.map; this.padMat.normalMap = dirt.normalMap; this.padMat.normalScale.set(0.7, 0.7); if (!pbrMaps("sitepad")) this.padMat.color.set(0xe6d9c4); this.padMat.needsUpdate = true; }
    const foliage = manifest.foliage || {};
    const names = Object.keys(foliage);
    if (names.length) {
      const loader = new THREE.TextureLoader();
      const mats = {};
      await Promise.all(names.map((n) => new Promise((res) => loader.load(textureUrl(foliage[n].file), (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
        mats[n] = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: 0xf4f4f4 });
        res();
      }, undefined, () => res()))));
      const have = names.filter((n) => mats[n]);
      if (!have.length) return;
      // replace the low-poly trees with cut-outs at the same spots
      this.trees.clear();
      const spots = [[-32, -20], [30, -26], [-36, 16], [34, 22], [-24, 32], [24, 34], [-42, -2], [40, 8], [-18, -36], [16, -34]];
      const tall = have.filter((n) => foliage[n].height >= 6);
      const small = have.filter((n) => foliage[n].height < 6);
      spots.forEach(([x, z], i) => {
        const pool = i % 3 === 2 && small.length ? small : tall.length ? tall : have;
        const n = pool[(i * 7 + 3) % pool.length];
        const h = foliage[n].height * (0.85 + ((i * 37) % 10) / 30);
        this.trees.add(billboard(mats[n], h, foliage[n].aspect, x, z, (i * 1.7) % Math.PI));
      });
      // the tree-line: a loose ring of gums at the edge of the paddock
      if (tall.length) {
        for (let i = 0; i < 44; i++) {
          const a = (i / 44) * Math.PI * 2 + ((i * 13) % 7) * 0.03;
          const r = 120 + ((i * 29) % 11) * 5;
          const n = tall[i % tall.length];
          const h = foliage[n].height * (1.1 + ((i * 17) % 9) / 12);
          const b = billboard(mats[n], h, foliage[n].aspect, Math.cos(a) * r, Math.sin(a) * r, a);
          b.traverse((o) => { o.castShadow = false; });
          this.treeline.add(b);
        }
      }
      this.onReady?.();
    }
  }

  setVisible(v) {
    this.visible = !!v;
    this.ground.visible = v; this.trees.visible = v; this.treeline.visible = v;
    this.pad.visible = v && !this.yard;
    this.grid.visible = v && !this.yard;
  }
  /* A modelled yard brings its own lawn and paving: no pad or setout grid over it. */
  setYard(on) {
    this.yard = !!on;
    this.pad.visible = this.visible && !this.yard;
    this.grid.visible = this.visible && !this.yard;
  }
  setGridVisible(v) { this.grid.visible = !!v; this._gridForced = !!v; }
  setTreelineVisible(v) { this.treeline.visible = !!v; }
}

/* The pad: a disc with metre UVs in uv (for the texture) and 0..1 in uv1
   (for the radial fade). */
function padGeometry(r) {
  const g = new THREE.CircleGeometry(r, 72);
  const uv = g.attributes.uv;
  const fade = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) { fade[i * 2] = uv.getX(i); fade[i * 2 + 1] = uv.getY(i); uv.setXY(i, uv.getX(i) * r * 2, uv.getY(i) * r * 2); }
  g.setAttribute("uv1", new THREE.BufferAttribute(fade, 2));
  return g;
}
function radialFade() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "#fff"); grd.addColorStop(0.72, "#fff"); grd.addColorStop(1, "#000");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.channel = 1;
  return t;
}

/* Large-scale colour drift across the paddock — greener hollows, drier
   rises — so the 5 m texture tile never reads as a grid from the air. */
function macroTint(geo) {
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  const h = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
  const dry = new THREE.Color(1.06, 1.0, 0.86), green = new THREE.Color(0.82, 0.95, 0.74), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = noise(x / 38, y / 38) * 0.65 + noise(x / 11 + 7, y / 11 + 3) * 0.35;
    c.copy(dry).lerp(green, t);
    const b = 0.9 + noise(x / 23 + 11, y / 23 + 5) * 0.18;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/* Scale a plane's 0..1 UVs to metres (1 UV unit = 1 m), like worldBox(). */
function metreUv(geo, size) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size);
  uv.needsUpdate = true;
  return geo;
}

/* Two crossed quads, pinned to the ground, sized by real height. */
function billboard(mat, h, aspect, x, z, rot) {
  const w = h * (aspect || 0.7);
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = ry;
    m.castShadow = true;
    m.userData.foliage = true;
    g.add(m);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}
