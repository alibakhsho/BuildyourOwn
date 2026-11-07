#!/usr/bin/env node
/* =========================================================================
   gen-3d-assets.mjs — the 3D Studio's photo assets, generated once with the
   Higgsfield platform API (billed to the API wallet, see hf-env.mjs) and
   finished here with sharp:

     textures   seamless PBR tiles (albedo + derived normal map), real-scale
                in metres, for the ground, slabs, paving, decking, floors
     planks     one board / one stud per image, for the instanced timber
     sky        360° backdrops (equirectangular 2:1) for lighting + reflections
     foliage    trees and shrubs cut out of a magenta screen → PNG with alpha,
                drawn as crossed billboards around the site

   Output goes to public/textures/** plus a manifest.json the engine reads
   (engine/materials3d.js, engine/environment.js). Re-running skips anything
   whose raw render already exists in the scratch folder, so a crash or a
   prompt tweak only re-bills the assets that changed.

   Usage:  node scripts/gen-3d-assets.mjs [--only name,name] [--dry] [--post-only]
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { loadHfCredentials } from "./hf-env.mjs";

const BASE = "https://api.higgsfield.ai";
const MODEL = "alibaba/qwen-image-3/text-to-image";
const RAW = process.env.GEN_RAW_DIR || path.resolve("generated/3d-raw");
const OUT = path.resolve("public/textures");
const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);

const TILE = "Seamless tileable texture, perfectly flat orthographic top-down view, even diffuse overcast lighting, no shadows, no perspective, no horizon, no objects, no text, photorealistic PBR albedo, ultra sharp";
const PLANK = "Photorealistic product photo of exactly one straight timber board filling the whole frame edge to edge horizontally, flat front face, even diffuse lighting, no shadows, no background visible, no text, no stamps, no labels, no markings, ultra sharp wood grain";
const SKY = "Seamless 360 degree equirectangular panorama photo, horizon line exactly at the vertical centre of the image, Australian suburban outskirts, flat open land with a distant line of gum trees and low hills, no buildings in the foreground, no people, no text, no lens flare, photorealistic HDRI style, very wide dynamic range";
const CUTOUT = "isolated on a completely flat solid bright magenta background #FF00FF, the whole plant fully visible with nothing cropped, straight-on eye-level view, soft even daylight, photorealistic, sharp detail, no shadow on the ground, no text";

/* name, kind, metres (texture size in the world), prompt, aspect, folder */
export const ASSETS = [
  // ---- ground & site ----
  { name: "lawn",      kind: "tile", metres: 3,   prompt: `Healthy mown lawn, fine kikuyu and couch grass blades, uniform green. ${TILE}` },
  { name: "paddock",   kind: "tile", metres: 5,   prompt: `Dry Australian paddock grass, patchy pale straw and olive green tufts with bare sandy dirt showing through. ${TILE}` },
  { name: "gravel",    kind: "tile", metres: 1.5, prompt: `Crushed blue-grey basalt road base gravel, 20 mm aggregate, compacted. ${TILE}` },
  { name: "concrete",  kind: "tile", metres: 2,   prompt: `New broom-finished grey concrete slab, fine brush lines, subtle colour variation. ${TILE}` },
  { name: "exposedagg", kind: "tile", metres: 1.5, prompt: `Exposed aggregate concrete driveway, warm grey cement with small river pebbles in cream, brown and charcoal. ${TILE}` },
  { name: "pavers",    kind: "tile", metres: 1.2, prompt: `Large format 600 x 600 mm sandstone-look concrete pavers laid in a grid with 5 mm sand joints, warm cream and light grey. ${TILE}` },
  { name: "mulch",     kind: "tile", metres: 1,   prompt: `Garden bed of dark brown hardwood bark mulch chips. ${TILE}` },
  { name: "sitepad",   kind: "tile", metres: 4,   prompt: `Compacted bare earth building site pad, light tan clay soil with scattered fine crushed sandstone and faint tyre marks, dry. ${TILE}` },
  { name: "render",    kind: "tile", metres: 1.5, prompt: `Acrylic rendered wall, fine sand trowel finish, warm off-white. ${TILE}` },
  // ---- interiors ----
  { name: "oakfloor",  kind: "tile", metres: 1.2, prompt: `European oak engineered floorboards, 190 mm wide planks, matte natural finish, staggered end joints. ${TILE}` },
  { name: "porcelain", kind: "tile", metres: 1.2, prompt: `Large format 600 x 600 mm matte light grey porcelain floor tiles with thin dark grout lines. ${TILE}` },
  { name: "carpet",    kind: "tile", metres: 0.6, prompt: `Plush twist pile carpet, warm oatmeal grey, close up. ${TILE}` },
  // ---- one board per image: these map 0..1 onto each instanced member ----
  { name: "pine",      kind: "plank", prompt: `New dressed radiata pine framing stud lying horizontally, long straight grain lines running left to right along its full length, pale cream timber with soft pink-orange growth rings and a few small knots. ${PLANK}`, aspect: "21:9" },
  { name: "lvl",       kind: "plank", prompt: `Laminated veneer lumber (LVL) beam, honey-coloured with visible thin horizontal veneer laminations along its length. ${PLANK}`, aspect: "21:9" },
  { name: "merbau",    kind: "plank", prompt: `Oiled merbau hardwood decking board, deep red-brown with fine interlocking grain and the typical pale mineral flecks. ${PLANK}`, aspect: "21:9" },
  // ---- skies ----
  { name: "sky-clear",    kind: "sky", prompt: `Clear blue early afternoon sky with a few small white fair-weather cumulus clouds, sun high and outside the frame, crisp bright daylight. ${SKY}`, aspect: "21:9" },
  { name: "sky-golden",   kind: "sky", prompt: `Golden hour, low warm sun just above the horizon on the left glowing through thin cirrus, long orange and pink light, deep blue overhead. ${SKY}`, aspect: "21:9" },
  { name: "sky-overcast", kind: "sky", prompt: `Soft overcast sky, even light grey stratus cloud with gentle brighter patches, diffuse shadowless light. ${SKY}`, aspect: "21:9" },
  // ---- foliage cutouts ----
  { name: "gum-1",      kind: "cutout", height: 12, prompt: `A tall mature Australian eucalyptus gum tree, smooth pale cream and grey mottled trunk, open spreading canopy of dull olive green and blue-green leaves only, no red or pink new growth. ${CUTOUT}`, aspect: "3:4" },
  { name: "gum-2",      kind: "cutout", height: 9,  prompt: `A medium Australian spotted gum tree with a leaning trunk and a rounded airy canopy. ${CUTOUT}`, aspect: "3:4" },
  { name: "bottlebrush", kind: "cutout", height: 3, prompt: `A dense callistemon bottlebrush shrub in flower with red brush blooms, about 3 metres tall. ${CUTOUT}`, aspect: "3:4" },
  { name: "lillypilly", kind: "cutout", height: 2.2, prompt: `A clipped glossy lilly pilly hedge shrub, bright green with coppery new growth, about 2 metres tall. ${CUTOUT}`, aspect: "3:4" },
  { name: "grasstree",  kind: "cutout", height: 1.6, prompt: `An Australian grass tree (xanthorrhoea) with a black trunk and a spiky green grass crown with one tall flower spike. ${CUTOUT}`, aspect: "3:4" },
];

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const only = argv.includes("--only") ? (argv[argv.indexOf("--only") + 1] || "").split(",").filter(Boolean) : [];
const dry = flag("--dry"), postOnly = flag("--post-only");

const creds = postOnly ? null : loadHfCredentials();
async function api(method, url, body, headers = {}) {
  const res = await fetch(url.startsWith("http") ? url : BASE + url, {
    method, headers: { Authorization: `Key ${creds}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}
const urlsIn = (o, acc = new Set()) => {
  if (typeof o === "string" && /^https?:\/\//.test(o) && !/\/requests\//.test(o)) acc.add(o);
  else if (Array.isArray(o)) o.forEach((v) => urlsIn(v, acc));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => urlsIn(v, acc));
  return acc;
};

/* Submit, poll and download one asset's raw PNG. */
async function render(a) {
  const raw = path.join(RAW, `${a.name}.png`);
  if (fs.existsSync(raw)) return raw;
  const body = { prompt: a.prompt, aspect_ratio: a.aspect || "1:1", resolution: a.resolution || "2k" };
  if (dry) { const est = await api("POST", `/estimate/${MODEL}`, body); console.log(`  ${a.name}: ${est.credits} credits ($${est.usd})`); return null; }
  const q = await api("POST", `/${MODEL}`, body, { "Idempotency-Key": crypto.randomUUID() });
  let delay = 2500, json;
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, delay));
    json = await api("GET", `/requests/${q.request_id}/status`);
    if (TERMINAL.has(json.status)) break;
    delay = Math.min(8000, delay * 1.3);
  }
  if (json.status !== "completed") throw new Error(`${a.name}: ${json.status} ${JSON.stringify(json).slice(0, 200)}`);
  const url = [...urlsIn(json)][0];
  if (!url) throw new Error(`${a.name}: no output url`);
  const res = await fetch(url);
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  fs.writeFileSync(path.join(RAW, `${a.name}.json`), JSON.stringify({ model: MODEL, ...body, request: q.request_id }, null, 2));
  console.log(`  rendered ${a.name}`);
  return raw;
}

/* ---------- finishing (sharp) ---------- */

/* Make a tile wrap seamlessly: the last `band` of each axis cross-fades into a
   mirror of the first, so the wrap point is continuous (clouds, grass and
   aggregate hide the mirrored strip completely). */
function seamless(data, w, h, c, band = 0.14) {
  const bx = Math.round(w * band), by = Math.round(h * band);
  const out = Buffer.from(data);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) for (let x = w - bx; x < w; x++) {
    const t = sm((x - (w - bx)) / bx), mx = w - 1 - x;        // mirror of the left band
    for (let k = 0; k < c; k++) { const i = (y * w + x) * c + k, j = (y * w + mx) * c + k; out[i] = Math.round(data[i] * (1 - t) + data[j] * t); }
  }
  const mid = Buffer.from(out);
  for (let y = h - by; y < h; y++) for (let x = 0; x < w; x++) {
    const t = sm((y - (h - by)) / by), my = h - 1 - y;
    for (let k = 0; k < c; k++) { const i = (y * w + x) * c + k, j = (my * w + x) * c + k; out[i] = Math.round(mid[i] * (1 - t) + mid[j] * t); }
  }
  return out;
}

/* Tangent-space normal map from luminance (Sobel), wrapping at the edges. */
function normalMap(data, w, h, c, strength = 2.2) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (0.299 * data[i * c] + 0.587 * data[i * c + 1] + 0.114 * data[i * c + 2]) / 255;
  const out = Buffer.alloc(w * h * 3);
  const L = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;       // +y up (OpenGL convention, what three expects)
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 3;
    out[i] = Math.round((nx * 0.5 + 0.5) * 255); out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  }
  return out;
}

/* Backdrop → alpha. The model never gives an exact #FF00FF, so the screen
   colour is read off the image border; pixels are keyed by distance to it
   (in a hue-weighted space) and the magenta spill is pulled out of the
   semi-transparent fringe. */
function keyBackdrop(data, w, h) {
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const samples = [];
  for (let x = 0; x < w; x += 8) { samples.push(px(x, 2), px(x, h - 3)); }
  for (let y = 0; y < h; y += 8) { samples.push(px(2, y), px(w - 3, y)); }
  const med = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[samples.length >> 1];
  const bg = [med(0), med(1), med(2)];
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    // anything that leans magenta/purple like the screen is also background-ish
    const purple = Math.min(r, b) - g;
    let a = Math.max(0, Math.min(1, (dist - 28) / 60));
    if (purple > 25) a = Math.min(a, Math.max(0, 1 - (purple - 25) / 70));
    // strip the screen's magenta cast everywhere (leaf fringes pick it up most), then
    // pull a little extra out of the half-transparent edge
    if (purple > 0) { r -= purple; b -= purple; }
    // pink (red with blue ≈ green) is spill, not foliage; brown bark (blue well under green) is left alone
    if (r > g && b > g * 0.85) r = Math.round(g + (r - g) * 0.2);
    if (a < 1) { const k = Math.max(g, Math.round((r + g + b) / 3)); r = Math.min(r, k + 6); b = Math.min(b, k + 6); }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

async function finish(a, raw, manifest) {
  if (!raw || !fs.existsSync(raw)) return;
  fs.mkdirSync(OUT, { recursive: true });
  if (a.kind === "tile" || a.kind === "plank") {
    const size = a.kind === "tile" ? 1024 : { w: 2048, h: 512 };
    const img = sharp(raw).resize(a.kind === "tile" ? { width: size, height: size, fit: "cover" } : { width: size.w, height: size.h, fit: "cover" });
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tiled = a.kind === "tile" ? seamless(data, info.width, info.height, 3) : data;
    await sharp(tiled, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 82 }).toFile(path.join(OUT, `${a.name}.webp`));
    const nrm = normalMap(tiled, info.width, info.height, 3, a.kind === "tile" ? 2.2 : 1.4);
    await sharp(nrm, { raw: { width: info.width, height: info.height, channels: 3 } }).resize({ width: info.width / 2, height: info.height / 2 }).webp({ quality: 72 }).toFile(path.join(OUT, `${a.name}_n.webp`));
    manifest.textures[a.name] = { albedo: `${a.name}.webp`, normal: `${a.name}_n.webp`, metres: a.metres || null, kind: a.kind };
  } else if (a.kind === "sky") {
    fs.mkdirSync(path.join(OUT, "sky"), { recursive: true });
    const { data, info } = await sharp(raw).resize({ width: 2048, height: 1024, fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // wrap only in x: the panorama's two ends meet behind the camera
    const bx = Math.round(info.width * 0.12), out = Buffer.from(data), sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < info.height; y++) for (let x = info.width - bx; x < info.width; x++) {
      const t = sm((x - (info.width - bx)) / bx), mx = info.width - 1 - x;
      for (let k = 0; k < 3; k++) { const i = (y * info.width + x) * 3 + k, j = (y * info.width + mx) * 3 + k; out[i] = Math.round(data[i] * (1 - t) + data[j] * t); }
    }
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, "sky", `${a.name}.jpg`));
    manifest.skies[a.name] = { file: `sky/${a.name}.jpg`, label: { "sky-clear": "Clear afternoon", "sky-golden": "Golden hour", "sky-overcast": "Overcast" }[a.name] || a.name };
  } else if (a.kind === "cutout") {
    fs.mkdirSync(path.join(OUT, "foliage"), { recursive: true });
    const { data, info } = await sharp(raw).resize({ height: 900, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const keyed = keyBackdrop(data, info.width, info.height);
    const png = sharp(keyed, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 8 });
    const { info: ti } = await png.clone().raw().toBuffer({ resolveWithObject: true });
    await sharp(keyed, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 8 }).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, "foliage", `${a.name}.webp`));
    manifest.foliage[a.name] = { file: `foliage/${a.name}.webp`, height: a.height, aspect: ti.width / ti.height };
  }
  console.log(`  finished ${a.name}`);
}

const list = ASSETS.filter((a) => !only.length || only.includes(a.name));
const manifestPath = path.join(OUT, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { textures: {}, skies: {}, foliage: {} };
manifest.textures ||= {}; manifest.skies ||= {}; manifest.foliage ||= {};

if (postOnly) {
  for (const a of list) await finish(a, path.join(RAW, `${a.name}.png`), manifest);
} else {
  // four renders in flight at a time
  const queue = [...list]; const failed = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const a = queue.shift();
      try { const raw = await render(a); if (!dry) await finish(a, raw, manifest); }
      catch (e) { failed.push(a.name); console.error(`  FAILED ${a.name}: ${e.message}`); }
    }
  }));
  if (failed.length) console.error(`failed: ${failed.join(", ")}`);
}
if (!dry) { manifest.generated = new Date().toISOString(); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); console.log(`manifest → ${manifestPath}`); }
