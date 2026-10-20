/* =========================================================================
   DroneScroll — the opening flight on the front page.

   One continuous shot (Kling 3.0 Pro, from the BYO logo artwork) pinned
   full-screen and driven by scroll: scrolling down pulls back from the logo
   sign onto a working construction site, crew and machinery moving, the
   house goes up in time-lapse, and it ends on the finished home with a
   family living in it; scrolling up runs it back. The video is encoded all-intra
   (every frame a keyframe) so seeking to any scroll position is instant,
   and the playhead eases toward the scroll target each frame so it glides
   instead of stepping.

   Reduced motion: no pinning or scrubbing — the poster frame and the copy
   are shown as a plain section.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";

/* 1080p for desktops, a lighter 720p cut for phones and small screens. */
const SRC_HD = "/media/byo-flight-1080.mp4";
const SRC_SD = "/media/byo-flight-720.mp4";
/* The native app ships only the 720p cut (see vite.config.js), so it never asks for HD. */
const pickSrc = () => {
  if (typeof window === "undefined" || window.Capacitor?.isNativePlatform?.()) return SRC_SD;
  return window.innerWidth * Math.min(2, window.devicePixelRatio || 1) >= 1600 ? SRC_HD : SRC_SD;
};
const POSTER = "/media/byo-flight-poster.jpg";

/* Copy beats, as fractions of the flight. */
const BEATS = [
  { from: 0.03, to: 0.2, eyebrow: "BUILD YOUR OWN", line: "It starts with an idea." },
  { from: 0.3, to: 0.58, eyebrow: "WATCH IT TAKE SHAPE", line: "Every trade and every piece, priced before you break ground." },
  { from: 0.74, to: 1.01, eyebrow: "FROM PLAN TO HOME", line: "Know what it costs. Then move in." },
];

export default function DroneScroll({ onStart }) {
  const reduced = useReducedMotion();
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const target = useRef(0);
  const [p, setP] = useState(0);
  const [ready, setReady] = useState(false);
  const [src] = useState(pickSrc);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    target.current = v;
    setP(v);
  });

  // ease the playhead toward the scroll position
  useEffect(() => {
    if (reduced) return;
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!v.duration || v.readyState < 2) return;
      const want = target.current * (v.duration - 0.05);
      const diff = want - v.currentTime;
      if (Math.abs(diff) > 0.01) v.currentTime += diff * 0.18;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  if (reduced) {
    return (
      <section style={{ position: "relative", background: "#E9E8E5" }}>
        <img src={POSTER} alt="The Build Your Own logo sign on a concrete wall framed by a woven bamboo facade"
          style={{ width: "100%", display: "block", aspectRatio: "16 / 9", objectFit: "cover" }} />
      </section>
    );
  }

  const beatOpacity = (b) => {
    const fade = 0.05;
    if (p < b.from || p > b.to) return 0;
    return Math.min(1, (p - b.from) / fade, (b.to - p) / fade);
  };

  return (
    <section ref={sectionRef} style={{ height: "520vh", position: "relative", background: "#E9E8E5" }}>
      <style>{`
        .ds-pin { position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; }
        .ds-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .ds-copy { position: absolute; left: 50%; bottom: 12vh; transform: translateX(-50%); width: min(720px, calc(100vw - 32px));
          text-align: center; color: #fff; text-shadow: 0 2px 24px rgba(20,23,26,0.45); pointer-events: none; transition: opacity .25s linear; }
        .ds-eyebrow { font: 700 12px 'Plus Jakarta Sans', sans-serif; letter-spacing: .18em; opacity: .92; margin-bottom: 10px; }
        .ds-line { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: clamp(28px, 4.6vw, 60px); line-height: 1.06; letter-spacing: -0.03em; }
        .ds-hint { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); font: 600 12px 'Plus Jakarta Sans', sans-serif;
          letter-spacing: .14em; color: rgba(255,255,255,0.9); text-shadow: 0 1px 10px rgba(0,0,0,0.35); transition: opacity .3s; }
        .ds-cta { pointer-events: auto; margin-top: 22px; display: inline-flex; padding: 14px 24px; border-radius: 999px; border: none; cursor: pointer;
          background: #fff; color: #14171A; font: 600 15px 'Plus Jakarta Sans', sans-serif; box-shadow: 0 10px 30px rgba(20,23,26,0.25); text-shadow: none; }
        .ds-progress { position: absolute; left: 0; top: 0; height: 3px; background: linear-gradient(90deg, #E2483D, #F4B6B0, #D9D3EC); transform-origin: left; }
      `}</style>
      <div className="ds-pin">
        <video ref={videoRef} className="ds-video" src={src} poster={POSTER} muted playsInline preload="auto"
          onLoadedData={() => setReady(true)} aria-label="A camera pulling back from the Build Your Own logo onto a construction site, where a house is built and a family moves in" />
        <div className="ds-progress" style={{ width: "100%", transform: `scaleX(${p})` }} />
        {BEATS.map((b, i) => (
          <div key={i} className="ds-copy" style={{ opacity: beatOpacity(b) }}>
            <div className="ds-eyebrow">{b.eyebrow}</div>
            <div className="ds-line">{b.line}</div>
            {i === BEATS.length - 1 && onStart && <button className="ds-cta" onClick={onStart}>Price my build →</button>}
          </div>
        ))}
        <div className="ds-hint" style={{ opacity: ready && p < 0.03 ? 1 : 0 }}>SCROLL TO FLY ↓</div>
      </div>
    </section>
  );
}
