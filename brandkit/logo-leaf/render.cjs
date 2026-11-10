// Renders the leaf-roof SVGs into every icon / splash / share-card slot.
// Run from the repo root: node brandkit/logo-leaf/render.cjs  (needs playwright)
const { chromium } = require("playwright");
const fs = require("fs");
const D = "brandkit/logo-leaf/";
const rd = (f) => fs.readFileSync(D + f, "utf8");
const CREAM = "#F4EFE6", INK = "#1F1C1A";
// lockup files carry their own 400x480 background rect
const lockup = (theme) => rd(`byo-logo-2-leaf-roof-${theme}.svg`).replace(/<rect[^>]*\/>/, "");
const sized = (svg, w, h) => svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`);
const jobs = [];
const icon = (src, out, size, transparent = false, jpeg = false) => jobs.push({ html: sized(rd(src), size, size), out, w: size, h: size, transparent, jpeg });
icon("mark-light.svg", "public/logo-mark.png", 256, true);
icon("favicon.svg", "public/favicon-32.png", 32, true);
icon("icon.svg", "public/icon-192.png", 192);
icon("icon.svg", "public/icon-512.png", 512);
icon("icon-maskable.svg", "public/icon-maskable-512.png", 512);
icon("icon.svg", "assets/icon-only.png", 1024);
icon("icon-foreground.svg", "assets/icon-foreground.png", 1024, true);
icon("icon-background.svg", "assets/icon-background.png", 1024);
icon("icon.svg", "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024);
for (const [d, s] of Object.entries({ ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const p = `android/app/src/main/res/mipmap-${d}/`;
  icon("icon.svg", p + "ic_launcher.png", s, true);
  icon("icon-round.svg", p + "ic_launcher_round.png", s, true);
  icon("icon-foreground.svg", p + "ic_launcher_foreground.png", s, true);
  icon("icon-background.svg", p + "ic_launcher_background.png", s);
}
const centred = (svg, w, h, lh, bg) => `<div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center">${sized(svg, lh * 400 / 480, lh)}</div>`;
jobs.push({ html: centred(lockup("light"), 1200, 630, 520, CREAM), out: "public/og-image.jpg", w: 1200, h: 630, jpeg: true });
jobs.push({ html: centred(lockup("light"), 2732, 2732, 900, CREAM), out: "assets/splash.png", w: 2732, h: 2732 });
jobs.push({ html: centred(lockup("dark"), 2732, 2732, 900, INK), out: "assets/splash-dark.png", w: 2732, h: 2732 });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const j of jobs) {
    await p.setViewportSize({ width: j.w, height: j.h });
    await p.setContent(`<html><body style="margin:0;background:transparent">${j.html}</body></html>`);
    await p.screenshot({ path: j.out, clip: { x: 0, y: 0, width: j.w, height: j.h }, omitBackground: j.transparent, type: j.jpeg ? "jpeg" : "png", quality: j.jpeg ? 90 : undefined });
  }
  await b.close();
  console.log(jobs.length, "images");
})();
