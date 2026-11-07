/* =========================================================================
   MODULE: materials3d.js
   Procedural, real-scale surface textures for the 3D model (no image
   downloads, no licensing). Every texture is authored in METRES — 1 UV unit
   = 1 m — and boxes get world-scaled UVs via boxWorld(), so a 230 mm brick
   is 230 mm on a 4 m wall and on a 15 m wall alike.
   ========================================================================= */
import * as THREE from "three";

const cache = new Map();

function canvasTex(key, px, metres, draw, { color = true } = {}) {
  const k = `${key}`;
  if (cache.has(k)) return cache.get(k);
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = px; c.height = px;
  const g = c.getContext("2d");
  draw(g, px, px / metres);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres);
  t.anisotropy = 8;
  if (color && "colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(k, t);
  return t;
}

// deterministic noise so textures don't shimmer between rebuilds
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function speckle(g, size, n, alpha, seed, light = false) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
}

/* Face brick, stretcher bond: 230 × 76 brick, 10 mm joints → 240 × 86 course.
   Tile = 4 bricks wide (0.96 m) × 10 courses (0.86 m). */
export function brickTexture() {
  const W = 0.96, H = 0.86;
  return canvasTex("brick", 512, W, (g, size, ppm) => {
    // canvas is square but covers W × H metres: x uses ppm, y uses size / H
    g.fillStyle = "#cfc6b8"; g.fillRect(0, 0, size, size); // mortar
    const r = rng(7);
    const bw = 0.23 * ppm, bh = 0.076 * size / H, jx = 0.01 * ppm, cy = 0.086 * size / H;
    const tones = ["#a4553a", "#9a4b33", "#b0623f", "#8f4630", "#a85a3c", "#b86b48"];
    for (let row = 0; row < 10; row++) {
      const off = row % 2 ? 0.12 * ppm : 0;
      for (let i = -1; i < 5; i++) {
        const x = i * 0.24 * ppm + off + jx / 2;
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(x, row * cy + jx / 2, bw, bh);
      }
    }
    speckle(g, size, 5000, 0.18, 11);
  }) && rescale("brick", W, H);
}

/* Weatherboard: 180 mm cover boards with a shadow line at each lap. */
export function weatherboardTexture() {
  return canvasTex("weatherboard", 256, 0.9, (g, size, ppm) => {
    g.fillStyle = "#e9e4da"; g.fillRect(0, 0, size, size);
    const board = 0.18 * ppm;
    for (let y = 0; y < size; y += board) {
      const grd = g.createLinearGradient(0, y, 0, y + board);
      grd.addColorStop(0, "rgba(0,0,0,0.22)"); grd.addColorStop(0.08, "rgba(0,0,0,0.02)");
      grd.addColorStop(0.9, "rgba(255,255,255,0.06)"); grd.addColorStop(1, "rgba(0,0,0,0.05)");
      g.fillStyle = grd; g.fillRect(0, y, size, board);
    }
    speckle(g, size, 1500, 0.05, 3);
  });
}

/* Acrylic render: near-flat with fine trowel noise. */
export function renderTexture() {
  return canvasTex("render", 256, 1.2, (g, size) => {
    g.fillStyle = "#e6e0d4"; g.fillRect(0, 0, size, size);
    speckle(g, size, 9000, 0.06, 5); speckle(g, size, 4000, 0.08, 6, true);
  });
}

/* Roof textures are mapped onto the TOP face of a box lying along the slope:
   texture u (x) runs up the slope, texture v (y) runs along the ridge. */

/* Colorbond corrugated sheet: 76 mm pitch ribs, running down the slope —
   so the rib shading varies across the ridge direction (y). */
export function corrugatedTexture(hex = "#4a4f56") {
  return canvasTex(`corr-${hex}`, 256, 0.76, (g, size, ppm) => {
    g.fillStyle = hex; g.fillRect(0, 0, size, size);
    const pitch = 0.076 * ppm;
    for (let y = 0; y < size; y += pitch) {
      const grd = g.createLinearGradient(0, y, 0, y + pitch);
      grd.addColorStop(0, "rgba(255,255,255,0.16)"); grd.addColorStop(0.5, "rgba(0,0,0,0.18)"); grd.addColorStop(1, "rgba(255,255,255,0.16)");
      g.fillStyle = grd; g.fillRect(0, y, size, pitch);
    }
  });
}

/* Concrete roof tile: 330 mm gauge up the slope (x), 330 mm cover along the ridge (y). */
export function roofTileTexture(hex = "#6a3a2e") {
  return canvasTex(`tile-${hex}`, 256, 0.99, (g, size, ppm) => {
    g.fillStyle = hex; g.fillRect(0, 0, size, size);
    const cw = 0.33 * ppm, gauge = 0.33 * ppm;
    for (let x = 0; x < size; x += gauge) {
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, 0, 3, size);        // course shadow line
      for (let y = 0; y < size; y += cw) {
        const grd = g.createLinearGradient(0, y, 0, y + cw);
        grd.addColorStop(0, "rgba(0,0,0,0.25)"); grd.addColorStop(0.35, "rgba(255,255,255,0.12)"); grd.addColorStop(1, "rgba(0,0,0,0.2)");
        g.fillStyle = grd; g.fillRect(x + 3, y, gauge - 3, cw);
      }
    }
    speckle(g, size, 2500, 0.12, 9);
  });
}

export function concreteTexture() {
  return canvasTex("concrete", 256, 2, (g, size) => {
    g.fillStyle = "#b9b6ae"; g.fillRect(0, 0, size, size);
    speckle(g, size, 12000, 0.07, 13); speckle(g, size, 5000, 0.07, 14, true);
  });
}

export function timberFloorTexture() {
  return canvasTex("timberfloor", 256, 1.2, (g, size, ppm) => {
    g.fillStyle = "#b98a55"; g.fillRect(0, 0, size, size);
    const r = rng(21), bw = 0.13 * ppm;
    for (let x = 0; x < size; x += bw) {
      g.fillStyle = `rgba(${r() > 0.5 ? "0,0,0" : "255,255,255"},${0.04 + r() * 0.08})`; g.fillRect(x, 0, bw, size);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x, 0, 1, size);
      g.fillRect(x, r() * size, bw, 1);
    }
  });
}

export function grassTexture() {
  return canvasTex("grass", 256, 4, (g, size) => {
    g.fillStyle = "#7f9a5c"; g.fillRect(0, 0, size, size);
    const r = rng(31);
    for (let i = 0; i < 9000; i++) {
      const v = r();
      g.fillStyle = v > 0.5 ? `rgba(60,90,40,${r() * 0.25})` : `rgba(170,190,110,${r() * 0.2})`;
      g.fillRect(r() * size, r() * size, 1, 2 + r() * 3);
    }
  });
}

export function gravelTexture() {
  return canvasTex("gravel", 256, 2, (g, size) => {
    g.fillStyle = "#c2b79c"; g.fillRect(0, 0, size, size);
    speckle(g, size, 14000, 0.22, 41); speckle(g, size, 6000, 0.2, 42, true);
  });
}

/* Brick is non-square (0.96 × 0.86); fix its repeat after creation. */
function rescale(key, W, H) {
  const t = cache.get(key);
  if (t) t.repeat.set(1 / W, 1 / H);
  return t;
}

/* Rewrite a BoxGeometry's UVs so 1 UV unit = 1 metre on every face. */
export function boxWorld(geo, w, h, d) {
  const uv = geo.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/* Box with metre-scale UVs. */
export function worldBox(w, h, d) { return boxWorld(new THREE.BoxGeometry(w, h, d), w, h, d); }

export function claddingMaterial(type) {
  const map = type === "weatherboard" ? weatherboardTexture() : type === "render" ? renderTexture() : brickTexture();
  return new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: type === "render" ? 0.92 : 0.88 });
}

export function roofMaterial(roofType) {
  if (roofType === "tile") return new THREE.MeshStandardMaterial({ map: roofTileTexture("#6a3a2e"), roughness: 0.8 });
  if (roofType === "shingle") return new THREE.MeshStandardMaterial({ map: roofTileTexture("#3a3a40"), roughness: 0.9 });
  return new THREE.MeshStandardMaterial({ map: corrugatedTexture("#4a4f56"), roughness: 0.42, metalness: 0.55 });
}

/* ---- Textures for individual members (structure-render.js) -------------
   These map 0..1 onto each face of an instanced unit box, then stretch with
   the member — so they're drawn as stripes ALONG u (the member's length),
   which stretch invisibly, with detail only across. */

export function pineTexture() {
  return canvasTex("pine", 256, 1, (g, size) => {
    g.fillStyle = "#e3cf9f"; g.fillRect(0, 0, size, size);
    const r = rng(77);
    for (let y = 0; y < size; y += 1 + Math.floor(r() * 3)) {
      const dark = r() > 0.55;
      g.fillStyle = dark ? `rgba(150,105,55,${0.08 + r() * 0.22})` : `rgba(255,240,205,${0.05 + r() * 0.15})`;
      g.fillRect(0, y, size, 1 + Math.floor(r() * 2));
    }
  });
}

export function lvlTexture() {
  return canvasTex("lvl", 256, 1, (g, size) => {
    g.fillStyle = "#c99d63"; g.fillRect(0, 0, size, size);
    const r = rng(81);
    // veneer laminations: thin parallel plies
    for (let y = 0; y < size; y += 9) {
      g.fillStyle = `rgba(110,70,30,${0.25 + r() * 0.2})`; g.fillRect(0, y, size, 1);
      g.fillStyle = `rgba(255,230,180,${0.08 + r() * 0.1})`; g.fillRect(0, y + 3, size, 2);
    }
  });
}

export function particleboardTexture() {
  return canvasTex("particleboard", 256, 1, (g, size) => {
    g.fillStyle = "#d9c27a"; g.fillRect(0, 0, size, size);
    speckle(g, size, 9000, 0.18, 91); speckle(g, size, 4000, 0.12, 92, true);
  });
}

export function insulationTexture() {
  return canvasTex("insulation", 128, 1, (g, size) => {
    g.fillStyle = "#f1d77a"; g.fillRect(0, 0, size, size);
    const r = rng(95);
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = `rgba(${r() > 0.5 ? "255,250,220" : "190,150,60"},${0.2 + r() * 0.3})`;
      g.beginPath(); const x = r() * size, y = r() * size; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 14); g.stroke();
    }
  });
}

export function wrapTexture() {
  return canvasTex("wrap", 256, 2, (g, size) => {
    g.fillStyle = "#e9eef3"; g.fillRect(0, 0, size, size);
    g.fillStyle = "rgba(40,90,170,0.55)"; g.font = "bold 14px sans-serif";
    for (let y = 20; y < size; y += 64) for (let x = (y / 64) % 2 ? 0 : 60; x < size; x += 130) g.fillText("WALL WRAP", x, y);
  });
}

export function pvTexture() {
  return canvasTex("pv", 512, 1, (g, size) => {
    g.fillStyle = "#0f1a2e"; g.fillRect(0, 0, size, size);
    const cols = 10, rows = 6, cw = size / cols, ch = size / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const grd = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      grd.addColorStop(0, "#1c3157"); grd.addColorStop(1, "#0d1a33");
      g.fillStyle = grd; g.fillRect(i * cw + 2, j * ch + 2, cw - 4, ch - 4);
      g.fillStyle = "rgba(200,210,230,0.35)";
      for (let k = 1; k < 4; k++) g.fillRect(i * cw + 2, j * ch + (ch * k) / 4, cw - 4, 1);
    }
    g.strokeStyle = "#b8bec7"; g.lineWidth = 6; g.strokeRect(0, 0, size, size);
  });
}

export function garageDoorTexture() {
  return canvasTex("garagedoor", 256, 1, (g, size) => {
    g.fillStyle = "#d9dbd6"; g.fillRect(0, 0, size, size);
    // horizontal ribs across the panel (u = along the door's height)
    for (let y = 0; y < size; y += size / 4) {
      g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, y + size / 8, size, 3);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(0, y + size / 8 + 3, size, 2);
    }
  });
}

export function brickFaceTexture() {
  return canvasTex("brickface", 128, 1, (g, size) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size);
    speckle(g, size, 2600, 0.28, 101); speckle(g, size, 900, 0.18, 102, true);
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 0, size, 3); g.fillRect(0, size - 3, size, 3);
  });
}

export function mortarTexture() {
  return canvasTex("mortar", 128, 0.5, (g, size) => {
    g.fillStyle = "#cbc3b4"; g.fillRect(0, 0, size, size);
    speckle(g, size, 3000, 0.15, 111); speckle(g, size, 1500, 0.12, 112, true);
  });
}

export function carpetTexture() {
  return canvasTex("carpet", 128, 0.5, (g, size) => {
    g.fillStyle = "#9d9189"; g.fillRect(0, 0, size, size);
    speckle(g, size, 7000, 0.2, 121); speckle(g, size, 4000, 0.15, 122, true);
  });
}

export function floorTileTexture() {
  return canvasTex("floortile", 256, 1.2, (g, size, ppm) => {
    g.fillStyle = "#d9d5cb"; g.fillRect(0, 0, size, size);
    const t = 0.6 * ppm;
    g.fillStyle = "rgba(120,110,95,0.45)";
    for (let x = 0; x < size; x += t) g.fillRect(x, 0, 2, size);
    for (let y = 0; y < size; y += t) g.fillRect(0, y, size, 2);
    speckle(g, size, 3000, 0.05, 131);
  });
}

/* Normal map for corrugated sheet: 10 sine corrugations across the sheet
   width (v), constant along its length (u). Mipmapped, so the ribs read up
   close and blend cleanly at a distance (no moiré). */
export function corrugatedNormalMap() {
  const key = "corr-normal";
  if (cache.has(key)) return cache.get(key);
  if (typeof document === "undefined") return null;
  const W = 4, H = 640, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const slope = Math.cos((y / H) * Math.PI * 2 * 10) * 1.1;
    const n = [0, -slope, 1];
    const L = Math.hypot(...n);
    const rgb = n.map((v) => Math.round((v / L * 0.5 + 0.5) * 255));
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/* =========================================================================
   Surface relief and photo textures.

   normalFromTexture(tex)   a tangent-space normal map derived from any of the
                            procedural canvases above (Sobel on luminance), so
                            brick joints, board laps and trowel marks catch the
                            light instead of being painted on.
   loadTextureManifest()    public/textures/manifest.json — the photo PBR tiles,
                            skies and foliage cut-outs made once by
                            scripts/gen-3d-assets.mjs. Missing pack → null, and
                            everything falls back to the procedural textures.
   pbrMaps(name)            albedo + normal textures for one pack entry, repeat
                            set from its real size in metres (1 UV = 1 m).
   usePbr(material, name)   swap a material onto the photo maps as soon as the
                            pack is known (now, or when the manifest arrives).
   ========================================================================= */
const NORMALS = new Map();
export function normalFromTexture(tex, strength = 1.6, { invert = false } = {}) {
  if (!tex || !tex.image) return null;
  const key = `${tex.uuid}|${strength}|${invert ? 1 : 0}`;
  if (NORMALS.has(key)) return NORMALS.get(key);
  const src = tex.image, w = src.width, h = src.height;
  const g = src.getContext ? src.getContext("2d") : null;
  if (!g) return null;
  const px = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  const L = (x, y) => { const v = lum[((y + h) % h) * w + ((x + w) % w)]; return invert ? 1 - v : v; };
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const out = c.getContext("2d").createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    out.data[i] = (nx * 0.5 + 0.5) * 255; out.data[i + 1] = (ny * 0.5 + 0.5) * 255; out.data[i + 2] = (nz * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  c.getContext("2d").putImageData(out, 0, 0);
  const n = new THREE.CanvasTexture(c);
  n.wrapS = n.wrapT = tex.wrapS;
  n.repeat.copy(tex.repeat);
  n.anisotropy = tex.anisotropy;
  NORMALS.set(key, n);
  return n;
}

const PACK = { base: "/textures/", manifest: undefined, promise: null, maps: new Map(), waiting: [] };
export const textureUrl = (file) => `${PACK.base}${file}${PACK.manifest?.generated ? `?v=${encodeURIComponent(PACK.manifest.generated)}` : ""}`;

export function loadTextureManifest() {
  if (PACK.promise) return PACK.promise;
  if (typeof fetch === "undefined") return Promise.resolve(null);
  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  PACK.base = `${base.replace(/\/$/, "")}/textures/`;
  PACK.promise = fetch(`${PACK.base}manifest.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((m) => {
      PACK.manifest = m || null;
      const w = PACK.waiting; PACK.waiting = [];
      for (const fn of w) { try { fn(PACK.manifest); } catch { /* one bad listener must not stop the rest */ } }
      return PACK.manifest;
    });
  return PACK.promise;
}
export const texturePack = () => PACK.manifest || null;

export function pbrMaps(name) {
  const entry = PACK.manifest?.textures?.[name];
  if (!entry) return null;
  if (PACK.maps.has(name)) return PACK.maps.get(name);
  const loader = new THREE.TextureLoader();
  const metres = entry.metres || 1;
  const prep = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (entry.kind === "tile") t.repeat.set(1 / metres, 1 / metres);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const map = prep(loader.load(textureUrl(entry.albedo)), true);
  const normalMap = entry.normal ? prep(loader.load(textureUrl(entry.normal)), false) : null;
  const r = { map, normalMap, metres, kind: entry.kind };
  PACK.maps.set(name, r);
  return r;
}

/* Put `material` onto the photo maps for `name` — immediately if the pack is
   known, otherwise as soon as it loads. `normal` scales the relief. */
export function usePbr(material, name, { normal = 0.6, tint } = {}) {
  const apply = () => {
    const maps = pbrMaps(name);
    if (!maps) return;
    material.map = maps.map;
    if (maps.normalMap) { material.normalMap = maps.normalMap; material.normalScale = new THREE.Vector2(normal, normal); }
    if (tint != null) material.color.set(tint);
    material.needsUpdate = true;
    PACK.onApplied?.();
  };
  if (PACK.manifest !== undefined) apply();
  else { PACK.waiting.push(apply); loadTextureManifest(); }
  return material;
}
/* The engine hooks this to redraw when photo maps land on a material. */
export function onPbrApplied(fn) { PACK.onApplied = fn; }
