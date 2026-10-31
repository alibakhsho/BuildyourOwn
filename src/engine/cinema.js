/* =========================================================================
   MODULE: cinema.js
   Plays a film planned by logic/cinematic.js:
     CinemaPlayer  smooth camera moves (centripetal Catmull-Rom through each
                   shot's points, eased), dips to black between shots,
                   build progress and captions per frame
     drawOverlay   letterbox, titles, stage captions, credit and the fade —
                   one painter for the live view and the recorded video
     FilmRecorder  records the 3D canvas + overlay to a video file
                   (MediaRecorder: MP4 where the browser can, else WebM)
   ========================================================================= */
import * as THREE from "three";
import { captionAt } from "../logic/cinematic.js";

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));   // ease in-out (sine)
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const curve = (pts) => {
  const v = pts.map(V);
  if (v.length === 1) v.push(v[0].clone().add(new THREE.Vector3(0, 0, 1e-4)));
  return new THREE.CatmullRomCurve3(v, false, "centripetal");
};

export class CinemaPlayer {
  constructor(film) {
    this.film = film;
    this.curves = film.shots.map((s) => ({ pos: curve(s.pos), look: curve(s.look) }));
  }
  get duration() { return this.film.duration; }

  /* Everything the frame at time t (seconds) needs. */
  sample(t) {
    const shots = this.film.shots;
    let i = shots.findIndex((s) => t < s.start + s.dur);
    if (i < 0) i = shots.length - 1;
    const s = shots[i], c = this.curves[i];
    const lt = Math.max(0, Math.min(s.dur, t - s.start));
    const u = ease(lt / s.dur);
    const pos = c.pos.getPoint(u), look = c.look.getPoint(u);
    const build = s.build ? s.build[0] + (s.build[1] - s.build[0]) * Math.min(1, lt / (s.dur * 0.88)) : null;
    // dip to black between shots (longer at the very start and end)
    const fin = i === 0 ? 0.9 : 0.35, fout = i === shots.length - 1 ? 1.2 : 0.35;
    const fade = Math.max(0, 1 - lt / fin, 1 - (s.dur - lt) / fout);
    return {
      i, shot: s, lt, t, pos: [pos.x, pos.y, pos.z], look: [look.x, look.y, look.z], fov: s.fov, roofOff: !!s.roofOff, interior: !!s.interior,
      build, fade: Math.max(0, Math.min(1, fade)), caption: captionAt(s, lt, build), progress: t / this.film.duration,
    };
  }
}

/* ---------- the overlay ---------- */

const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, Segoe UI, sans-serif";

/**
 * Paint letterbox, captions and fade onto a 2D context of size W×H.
 * opts = { letterbox, brand, rec }
 */
export function drawOverlay(ctx, W, H, st, opts = {}) {
  if (opts.clear !== false) ctx.clearRect(0, 0, W, H);
  if (!st) return;
  const k = Math.min(W, H * 1.6) / 1000;             // type scale with the frame
  // letterbox to 2.39:1 when the frame is taller than that
  let bar = 0;
  if (opts.letterbox !== false) {
    bar = Math.max(0, (H - W / 2.39) / 2);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  }
  const c = st.caption;
  if (c && c.alpha > 0 && c.title) {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.textBaseline = "alphabetic";
    if (c.big) {
      ctx.textAlign = "center";
      // soft scrim behind centred titles
      const g = ctx.createLinearGradient(0, H * 0.5, 0, H - bar);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.5, W, H * 0.5 - bar);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 18 * k;
      ctx.font = `700 ${Math.round(58 * k)}px ${FONT}`;
      ctx.fillText(c.title, W / 2, H - bar - 120 * k);
      ctx.font = `500 ${Math.round(24 * k)}px ${FONT}`;
      if (c.sub) ctx.fillText(c.sub, W / 2, H - bar - 78 * k);
      if (c.credit) { ctx.font = `600 ${Math.round(17 * k)}px ${FONT}`; ctx.fillStyle = "#F5C518"; ctx.fillText(c.credit.toUpperCase(), W / 2, H - bar - 44 * k); }
    } else {
      ctx.textAlign = "left";
      const x = 56 * k, y = H - bar - 64 * k;
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.font = `700 ${Math.round(34 * k)}px ${FONT}`;
      const tw = ctx.measureText(c.title).width;
      ctx.font = `500 ${Math.round(18 * k)}px ${FONT}`;
      const sw = c.sub ? ctx.measureText(c.sub).width : 0;
      ctx.fillRect(x - 18 * k, y - 46 * k, Math.max(tw, sw) + 36 * k, (c.sub ? 82 : 58) * k);
      ctx.fillStyle = "#F5C518"; ctx.fillRect(x - 18 * k, y - 46 * k, 5 * k, (c.sub ? 82 : 58) * k);
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.round(34 * k)}px ${FONT}`;
      ctx.fillText(c.title, x, y);
      if (c.sub) { ctx.font = `500 ${Math.round(18 * k)}px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.fillText(c.sub, x, y + 26 * k); }
    }
    ctx.restore();
  }
  // brand mark, top right inside the frame
  if (opts.brand) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.textAlign = "right"; ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 8 * k;
    ctx.font = `700 ${Math.round(15 * k)}px ${FONT}`;
    ctx.fillText(opts.brand.toUpperCase(), W - 40 * k, bar + 40 * k);
    ctx.restore();
  }
  if (opts.rec) {
    ctx.save();
    ctx.fillStyle = "#e5322d"; ctx.beginPath(); ctx.arc(40 * k, bar + 34 * k, 7 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(14 * k)}px ${FONT}`; ctx.textAlign = "left";
    ctx.fillText("REC", 54 * k, bar + 39 * k);
    ctx.restore();
  }
  if (st.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${st.fade.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
}

/* ---------- recording ---------- */

export function recordingSupported() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;
}

function pickMime() {
  const list = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return list.find((m) => window.MediaRecorder.isTypeSupported?.(m)) || "";
}

/* Records the 3D canvas, cropped to 16:9, plus the overlay, at W×H. */
export class FilmRecorder {
  constructor(source, { width = 1920, height = 1080, fps = 30, overlay = {} } = {}) {
    this.source = source;
    this.canvas = document.createElement("canvas");
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
    this.overlay = overlay;
    this.mime = pickMime();
    this.chunks = [];
    const stream = this.canvas.captureStream(fps);
    this.rec = new MediaRecorder(stream, { mimeType: this.mime || undefined, videoBitsPerSecond: 12_000_000 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
  }
  get extension() { return /mp4/.test(this.rec.mimeType || this.mime) ? "mp4" : "webm"; }
  start() { this.rec.start(250); }

  /* Call right after the 3D frame is rendered (same task, so the drawing buffer is intact). */
  frame(st) {
    const { canvas: C, ctx, source: S } = this;
    const sw = S.width, sh = S.height, ta = C.width / C.height;
    let cw = sw, ch = sw / ta;
    if (ch > sh) { ch = sh; cw = sh * ta; }
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, C.width, C.height);
    ctx.drawImage(S, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, C.width, C.height);
    ctx.save();
    drawOverlay(ctx, C.width, C.height, st, { ...this.overlay, letterbox: false, clear: false });
    ctx.restore();
  }

  stop() {
    return new Promise((resolve) => {
      if (this.rec.state === "inactive") { resolve(this.blob()); return; }
      this.rec.onstop = () => resolve(this.blob());
      this.rec.stop();
    });
  }
  blob() { return new Blob(this.chunks, { type: (this.rec.mimeType || this.mime || "video/webm").split(";")[0] }); }
}
