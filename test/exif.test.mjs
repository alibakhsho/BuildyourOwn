/* EXIF orientation parsing. A wrong answer here silently rotates a plan and
   transposes its width and height, which corrupts every measurement taken
   from it — so the parser is tested against hand-built JPEG headers rather
   than trusted. blobstore.js touches IndexedDB only inside tx(), so importing
   it headlessly is safe as long as we don't call the storage functions. */

// Minimal DOM shims: the module references these at import time only.
globalThis.indexedDB = undefined;
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };

const { readExifOrientation } = await import("../src/state/blobstore.js");

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = got === want;
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `  (got ${got}, want ${want})`}`);
  good ? pass++ : fail++;
};

/** Build a JPEG whose APP1 segment declares the given orientation. */
function jpegWithOrientation(orientation, { littleEndian = true, extraTagsBefore = 0 } = {}) {
  const entries = extraTagsBefore + 1;
  const tiffLen = 8 + 2 + entries * 12 + 4;
  const tiff = Buffer.alloc(tiffLen);

  if (littleEndian) { tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(0x002a, 2); tiff.writeUInt32LE(8, 4); }
  else              { tiff.write("MM", 0, "ascii"); tiff.writeUInt16BE(0x002a, 2); tiff.writeUInt32BE(8, 4); }

  const w16 = (v, o) => (littleEndian ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
  const w32 = (v, o) => (littleEndian ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));

  w16(entries, 8);
  // Decoy tags ahead of the orientation tag, so we prove the scan walks the IFD.
  for (let i = 0; i < extraTagsBefore; i++) {
    const at = 10 + i * 12;
    w16(0x010f, at); w16(3, at + 2); w32(1, at + 4); w16(99, at + 8);
  }
  const at = 10 + extraTagsBefore * 12;
  w16(0x0112, at);      // Orientation
  w16(3, at + 2);       // type SHORT
  w32(1, at + 4);       // count
  w16(orientation, at + 8);
  w32(0, at + 12);      // no next IFD

  const app1Len = 2 + 6 + tiff.length;
  // 2 (SOI) + 2 (APP1 marker) + 2 (length) + 6 ("Exif\0\0") = 12 bytes.
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0xffd8, 0);      // SOI
  head.writeUInt16BE(0xffe1, 2);      // APP1
  head.writeUInt16BE(app1Len, 4);
  head.write("Exif\0\0", 6, "ascii");
  return new Blob([head, tiff]);
}

for (const o of [1, 3, 6, 8]) {
  ok(`little-endian orientation ${o}`, await readExifOrientation(jpegWithOrientation(o)), o);
}
ok("big-endian orientation 6", await readExifOrientation(jpegWithOrientation(6, { littleEndian: false })), 6);
ok("orientation found after other tags", await readExifOrientation(jpegWithOrientation(8, { extraTagsBefore: 3 })), 8);
ok("out-of-range orientation clamps to 1", await readExifOrientation(jpegWithOrientation(42)), 1);

// Files with no orientation to read must come back upright, never throw.
const png = new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])]);
ok("PNG has no EXIF", await readExifOrientation(png), 1);

const bareJpeg = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])]); // SOI then SOS
ok("JPEG with no APP1", await readExifOrientation(bareJpeg), 1);

ok("empty file", await readExifOrientation(new Blob([])), 1);
ok("garbage", await readExifOrientation(new Blob([Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])])), 1);

// A truncated APP1 must not read past the buffer.
const full = Buffer.from(await jpegWithOrientation(6).arrayBuffer());
ok("truncated EXIF degrades to upright", await readExifOrientation(new Blob([full.subarray(0, 14)])), 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
