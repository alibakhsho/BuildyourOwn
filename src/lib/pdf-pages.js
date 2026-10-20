/* =========================================================================
   MODULE: lib/pdf-pages.js
   Turn a plan PDF into sheet images the takeoff canvas can measure, plus
   each page's text layer (see logic/pdf-sheets.js for what we do with it).

   pdf.js is imported lazily — it's ~1 MB and only someone dropping a PDF
   needs it. The legacy build is used because the phone app runs in older
   Android WebViews that the modern build no longer supports.

   Pages render at up to 3600 px on the long edge (12 MP cap — iOS refuses
   bigger canvases). On an A3 sheet that's ~8.5 px per paper millimetre:
   at 1:100 one pixel is ~12 mm on the ground, finer than anyone can click.
   ========================================================================= */
import { ptToMm } from "../logic/pdf-sheets.js";

let libP = null;
function pdfjs() {
  if (!libP) {
    // The worker goes through Vite's ?worker bundling so it ships as a
    // minified .js file — Android WebViews (the phone app) don't reliably
    // serve .mjs with a JavaScript MIME type, and module workers need one.
    libP = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker"),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerPort = new worker.default();
      return lib;
    }).catch((e) => { libP = null; throw e; });
  }
  return libP;
}

/**
 * Render every page (up to maxPages). Calls onPage(page) as each one is
 * ready so the caller can store it and free memory before the next.
 * page = { pageNo, numPages, blob (PNG), width, height, pageMm: {w,h}, text: [{ s, x, y, w, size }] }
 */
export async function readPdf(file, { maxEdge = 3600, maxPixels = 12e6, maxPages = 60, onProgress, onPage } = {}) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data, isEvalSupported: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    task.destroy();
    if (e?.name === "PasswordException") throw new Error(`"${file.name}" is password-protected. Save an unlocked copy and upload that.`);
    throw new Error(`Couldn't open "${file.name}" as a PDF — it may be damaged. (${e?.message || e})`);
  }
  const numPages = doc.numPages;
  const n = Math.min(numPages, maxPages);
  try {
    for (let i = 1; i <= n; i++) {
      onProgress?.(i, numPages);
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });           // PDF points, page rotation applied
      let s = maxEdge / Math.max(base.width, base.height);
      if (base.width * base.height * s * s > maxPixels) s = Math.sqrt(maxPixels / (base.width * base.height));
      const vp = page.getViewport({ scale: s });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";                              // plans are line art: never a transparent page
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
      const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't draw that page."))), "image/png"));

      const tc = await page.getTextContent();
      const text = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const size = Math.hypot(it.transform[2], it.transform[3]) * s;
        text.push({ s: it.str, x: Math.round(x), y: Math.round(y), w: Math.round((it.width || 0) * s), size: Math.round(size * 10) / 10 });
      }
      const out = {
        pageNo: i, numPages, blob, width: canvas.width, height: canvas.height,
        pageMm: { w: ptToMm(base.width), h: ptToMm(base.height) }, text,
      };
      canvas.width = canvas.height = 0;                       // hand the pixels back before the next page
      page.cleanup();
      await onPage?.(out);
    }
  } finally {
    await task.destroy();   // pdf.js 6: the loading task owns the worker and the document
  }
  return { numPages, read: n };
}
