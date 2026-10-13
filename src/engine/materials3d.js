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
