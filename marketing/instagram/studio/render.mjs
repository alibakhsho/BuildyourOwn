/* Render a studio scene to an MP4.
     npm run dev            (in another terminal)
     node marketing/instagram/studio/render.mjs build [fps] [quality]
   Needs Playwright (Chromium) and ffmpeg on the PATH. Output: studio/out/<scene>.mp4 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const [scene = "build", fpsArg = "30", q = "high"] = process.argv.slice(2);
const fps = Number(fpsArg);
const base = process.env.STUDIO_URL || "http://localhost:5173";
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", `${scene}.mp4`);

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`${base}/marketing/instagram/studio/studio.html?scene=${scene}&q=${q}`);
await page.waitForFunction("window.studioReady === true", null, { timeout: 120000 });
const duration = await page.evaluate("window.sceneDuration");
const frames = Math.round(duration * fps);

const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const started = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.renderAt(t), i / fps);
  const shot = await page.screenshot({ type: "jpeg", quality: 95 });
  if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 60 === 0) console.log(`${scene}: frame ${i}/${frames} (${Math.round((Date.now() - started) / 1000)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log("wrote", out);
