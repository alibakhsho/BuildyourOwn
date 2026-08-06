/* =========================================================================
   MODULE: state/blobstore.js
   Binary store for plan images, site photos and document scans.

   Why this exists: localStorage tops out around 5 MB and stores strings only.
   A single A1 plan scan as a base64 data URL is 2–8 MB on its own, so putting
   takeoff images in the same bucket as project JSON would blow the quota on
   the second upload. IndexedDB has no practical size ceiling and stores Blobs
   natively (no base64 inflation), so binaries live here and the structured
   records in state/cm.js hold only a `blobId` pointer.

   The API is intentionally promise-based and key/value shaped so a future
   backend can swap this for S3/R2 presigned uploads without the UI changing.
   ========================================================================= */

const DB_NAME = "byo.blobs";
const DB_VERSION = 1;
const STORE = "blobs";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open the blob store."));
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function newId() {
  return `blob_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/* ---- Public API -------------------------------------------------------- */

/**
 * Store a File/Blob. Returns { id, name, type, size, width, height, converted }.
 *
 * The file is normalised first (see normaliseImage): HEIC is decoded and EXIF
 * rotation is baked in, so everything downstream — canvas, measurement maths,
 * the vision endpoint — only ever sees a plain upright bitmap. Image
 * dimensions are probed up front because the takeoff canvas needs them to
 * compute scale before it paints a pixel.
 */
export async function putBlob(file, meta = {}) {
  const id = meta.id || newId();
  const norm = await normaliseImage(file);
  const record = {
    id,
    name: meta.name || file.name || "untitled",
    type: norm.blob.type || file.type || meta.type || "application/octet-stream",
    size: norm.blob.size ?? 0,
    width: norm.width,
    height: norm.height,
    originalType: file.type || "",
    converted: norm.converted,
    createdAt: Date.now(),
    blob: norm.blob,
  };
  await tx("readwrite", (store) => store.put(record));
  const { blob, ...rest } = record;
  return rest;
}

/* ---- Import normalisation --------------------------------------------- */

/**
 * iPhone photos arrive in two shapes the canvas cannot use directly:
 *
 *   1. HEIC/HEIF. Safari decodes it; Chrome, Edge and Firefox do not. On a
 *      Windows desktop — where a builder actually does their take-off — a
 *      .heic straight off a phone is simply undecodable, so we convert it.
 *
 *   2. EXIF orientation. Phones store the sensor's native landscape frame and
 *      attach a rotation flag rather than rotating the pixels. Decode paths
 *      disagree about whether to honour that flag, so a plan shot in portrait
 *      can end up drawn on its side with width and height transposed — which
 *      silently corrupts every measurement taken from it.
 *
 * Both are fixed once, at import, by baking the correct pixels into the
 * stored blob. Nothing downstream needs to know a phone was involved.
 *
 * An already-upright PNG/JPEG is stored byte-for-byte untouched. Re-encoding
 * it would cost detail for nothing, and detail here is figured dimensions —
 * the small printed text the whole take-off is calibrated against.
 */
export async function normaliseImage(file) {
  let blob = file;
  let converted = false;

  if (isHeic(file)) {
    // Lazily imported: the decoder carries a WASM build of libheif, and most
    // uploads are not HEIC. Keeping it out of the main bundle means only the
    // people who need it pay for it.
    const { heicTo } = await import("heic-to");
    try {
      blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    } catch (e) {
      throw new Error(
        `Couldn't read "${file.name || "that file"}" — it looks like an iPhone HEIC image but the decoder rejected it. Re-save it as JPEG and try again.`
      );
    }
    converted = true;
  }

  const orientation = await readExifOrientation(blob).catch(() => 1);

  if (orientation === 1) {
    const dims = await probeImageSize(blob).catch(() => ({ width: 0, height: 0 }));
    return { blob, ...dims, converted };
  }

  // Rotated: redraw upright. `imageOrientation: "from-image"` makes the
  // browser apply the EXIF flag during decode, so the drawn bitmap is already
  // the right way up and no transform matrix is needed here.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const upright = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b || blob), "image/jpeg", 0.95)
  );
  return { blob: upright, width: canvas.width, height: canvas.height, converted: true };
}

/** HEIC often arrives with an empty or wrong MIME type, so check the name too. */
export function isHeic(file) {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name || "");
}

/**
 * Read the EXIF orientation tag out of a JPEG. Returns 1 (upright) for
 * anything without one, including PNG and WEBP.
 *
 * Only the first 128 KB is read — EXIF lives in an APP1 segment near the
 * start of the file, and a plan scan can be 20 MB.
 */
export async function readExifOrientation(blob) {
  const head = await blob.slice(0, 131072).arrayBuffer();
  const view = new DataView(head);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1; // not JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    if ((marker & 0xff00) !== 0xff00) return 1; // desynchronised — give up
    const size = view.getUint16(offset + 2, false);

    if (marker === 0xffe1) {
      // APP1 — verify the "Exif\0\0" signature before trusting the contents.
      const exif = offset + 4;
      if (exif + 6 > view.byteLength || view.getUint32(exif, false) !== 0x45786966) return 1;

      const tiff = exif + 6;
      if (tiff + 8 > view.byteLength) return 1;
      const le = view.getUint16(tiff, false) === 0x4949; // "II" = little-endian
      const ifd = tiff + view.getUint32(tiff + 4, le);
      if (ifd + 2 > view.byteLength) return 1;

      const entries = view.getUint16(ifd, le);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, le) === 0x0112) {
          const value = view.getUint16(entry + 8, le);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }

    if (marker === 0xffda) return 1; // start of scan — no EXIF present
    offset += 2 + size;
  }
  return 1;
}

export async function getBlob(id) {
  if (!id) return null;
  const rec = await tx("readonly", (store) => store.get(id));
  return rec || null;
}

/**
 * Object URL for an <img>/<canvas> source. Callers MUST revokeObjectURL when
 * the image unmounts — otherwise a builder flipping through 30 plan sheets
 * leaks 30 decoded bitmaps.
 */
export async function getBlobURL(id) {
  const rec = await getBlob(id);
  if (!rec || !rec.blob) return null;
  return URL.createObjectURL(rec.blob);
}

/** Base64 data URL — used only when shipping an image to the AI vision endpoint. */
export async function getBlobDataURL(id) {
  const rec = await getBlob(id);
  if (!rec || !rec.blob) return null;
  return blobToDataURL(rec.blob);
}

export async function deleteBlob(id) {
  if (!id) return;
  await tx("readwrite", (store) => store.delete(id));
}

export async function listBlobs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const out = [];
    const t = db.transaction(STORE, "readonly");
    const cursorReq = t.objectStore(STORE).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      const { blob, ...rest } = cursor.value;
      out.push(rest);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/** Rough total bytes held, for the storage readout in Settings. */
export async function storageUsed() {
  const all = await listBlobs();
  return all.reduce((n, b) => n + (b.size || 0), 0);
}

/* ---- helpers ----------------------------------------------------------- */

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function probeImageSize(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not a readable image."));
    };
    img.src = url;
  });
}

/**
 * Downscale a large plan scan before sending it to the vision model. Plans
 * arrive at 4000–8000 px wide. Claude Opus 5 accepts up to 2576 px on the
 * long edge, so we cap just under that: on a line drawing the difference
 * between 1600 px and 2400 px is the difference between reading a figured
 * dimension and guessing at it, and plan text is exactly what we need.
 */
export async function downscaleForVision(blob, maxEdge = 2400, quality = 0.9) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && blob.size < 3_500_000) return blob;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  // White matte: plans are line art, and a transparent PNG flattened onto
  // black would invert the drawing and read as noise to the model.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), "image/jpeg", quality));
}
