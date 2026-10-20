/* =========================================================================
   ScrollBuild — "watch it go up" band on the front page.

   A tall section with a pinned 3D stage: scrolling drives the real engine
   through foundation → frame → walls → roof → finishes while the camera
   swings round and dollies in. Beside it, the stage list lights up and a
   running total climbs, built from that same house's estimate (materials +
   labour per stage, scaled so the last stage lands on the quoted total) —
   the number on screen is the number the estimator gives.

   Reduced motion: no pinning or scrubbing — the finished house and the full
   stage list are shown as a plain section.
   ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useSpring, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { Engine3D } from "../engine/engine3D.js";
import { fmt, currencySymbol } from "../lib/format.js";

const STAGES = [
  { key: "foundation", title: "Foundation & slab", body: "Set-out, footings and a reinforced slab poured on the cleared pad.",
    mat: ["foundation"], lab: ["siteworks", "concrete"] },
  { key: "frame", title: "Frame", body: "Wall frames, upper floor and staircase stood up and braced.",
    mat: ["frame", "stairs"], lab: ["frame"] },
  { key: "walls", title: "Walls & openings", body: "Brick veneer laid course by course, windows and doors set in.",
    mat: ["cladding", "openings"], lab: ["brick"] },
  { key: "roof", title: "Roof", body: "Trusses craned on, then Colorbond sheeting, gutters and flashings.",
    mat: ["roof"], lab: ["roof"] },
  { key: "finishes", title: "Fit-out & finishes", body: "Services, plaster, kitchen, bathrooms, paint — and solar on the roof.",
    mat: null, lab: null }, // everything not claimed above
];

/* Running total at each stage boundary: direct cost per stage, scaled so
   the last boundary equals the tax-inclusive quote. */
function stageTotals(est) {
  const claimedMat = new Set(STAGES.flatMap((s) => s.mat || []));
  const claimedLab = new Set(STAGES.flatMap((s) => s.lab || []));
  const direct = STAGES.map((s) => {
    const m = est.materialLines.filter((l) => (s.mat ? s.mat.includes(l.category) : !claimedMat.has(l.category)));
    const l = est.labourLines.filter((x) => (s.lab ? s.lab.includes(x.tradeKey) : !claimedLab.has(x.tradeKey)));
    return [...m, ...l].reduce((a, x) => a + (x.total || 0), 0);
  });
  const sum = direct.reduce((a, b) => a + b, 0) || 1;
  const gross = est.total * (1 + (est.taxRate || 0));
  let run = 0;
  return direct.map((d) => (run += d) / sum * gross);
}

export default function ScrollBuild({ spec, est, region }) {
  const reduced = useReducedMotion();
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const engRef = useRef(null);
  const totals = useMemo(() => stageTotals(est), [est]);
  const [p, setP] = useState(reduced ? 1 : 0);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let eng;
    try { eng = new Engine3D(el); } catch { return; }
    eng.buildFromSpec(spec);
    eng.autoRotate = false;
    eng._userOrbiting = true;          // idle loop follows our camera moves
    eng.renderer.domElement.style.pointerEvents = "none"; // never trap the scroll
    engRef.current = eng;
    let narrow = false, fit = 1.3;
    // Keep the house clear of the stage panel: shifted right of it on wide
    // screens, above it on phones (where the panel sits at the bottom).
    const frame = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      narrow = w <= 760;
      // portrait screens see less width — widen the lens (backing the camera off
      // would put it behind the trees) and step back only a little
      const aspect = w / h;
      fit = aspect < 1 ? 1.3 + (1 - aspect) * 0.7 : 1.3;
      eng.camera.fov = aspect < 1 ? 45 + (1 - aspect) * 34 : 45;
      eng.camera.updateProjectionMatrix();
      if (narrow) eng.camera.setViewOffset(w, h, 0, h * 0.2, w, h);
      else eng.camera.setViewOffset(w, h, -Math.min(260, w * 0.17), 0, w, h);
      eng.requestRender();
    };
    frame();
    const ro = new ResizeObserver(frame);
    ro.observe(el);
    const apply = (t) => {
      eng.setProgress(Math.min(1, t * 1.06));          // finish just before the end
      eng.cameraAngle = Math.PI * 0.12 + t * Math.PI * 0.9;
      eng.zoomFactor = fit - t * 0.2;                    // dolly in as it completes
      eng.tiltFactor = 1.15 - t * 0.35;                  // from site view down to street level
      eng.requestRender();
    };
    engRef.current.apply = apply;
    apply(reduced ? 1 : smooth.get());
    const io = new IntersectionObserver(([e]) => eng.setPaused(!e.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => { io.disconnect(); ro.disconnect(); eng.dispose(); engRef.current = null; };
  }, [spec, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  useMotionValueEvent(smooth, "change", (v) => {
    if (reduced) return;
    engRef.current?.apply?.(v);
    setP(v);
  });

  const t = Math.min(1, p * 1.06) * STAGES.length;  // engine's stage clock
  const active = Math.min(STAGES.length - 1, Math.floor(t));
  const within = Math.min(1, t - active);
  const running = t >= STAGES.length ? totals[totals.length - 1]
    : (active ? totals[active - 1] : 0) + (totals[active] - (active ? totals[active - 1] : 0)) * within;
  const sym = currencySymbol(region);

  return (
    <section ref={sectionRef} className="sb-section" style={{ height: reduced ? "auto" : "420vh", background: "#EEF1EE", position: "relative" }}>
      <style>{`
        .sb-pin { position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; }
        .sb-canvas { position: absolute; inset: 0; }
        .sb-panel { position: absolute; left: max(24px, calc((100vw - 1240px) / 2 + 24px)); top: 50%; transform: translateY(-50%);
          width: min(380px, calc(100vw - 48px)); background: rgba(255,255,255,0.86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(20,23,26,0.08); border-radius: 22px; padding: 24px 24px 20px; box-shadow: 0 24px 60px rgba(20,23,26,0.14); color: #14171A; }
        .sb-step { display: grid; grid-template-columns: 28px 1fr; gap: 12px; padding: 10px 0; }
        .sb-dot { width: 28px; height: 28px; border-radius: 99px; display: grid; place-items: center; font: 700 12px 'Plus Jakarta Sans', sans-serif; transition: background .3s, color .3s, box-shadow .3s; }
        .sb-static .sb-panel { position: relative; left: auto; top: auto; transform: none; margin: 0 auto; }
        @media (max-width: 760px) {
          .sb-panel { top: auto; bottom: 16px; transform: none; left: 16px; width: calc(100vw - 32px); padding: 16px 18px 12px; }
          .sb-body { display: none; }
          .sb-step { padding: 5px 0; }
          .sb-step.sb-on .sb-body { display: block; }
        }
      `}</style>
      <div className={reduced ? "sb-static" : "sb-pin"} style={reduced ? { padding: "64px 16px" } : undefined}>
        <div ref={stageRef} className="sb-canvas" aria-hidden="true" style={reduced ? { position: "relative", height: "60vh", borderRadius: 24, overflow: "hidden", marginBottom: 24 } : undefined} />
        <div className="sb-panel">
          <div style={{ font: "700 12px 'Plus Jakarta Sans', sans-serif", letterSpacing: "0.08em", color: "#C2570A", marginBottom: 6 }}>WATCH IT GO UP</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {sym}{fmt(Math.round(running))}
            </div>
            <div style={{ font: "500 12px 'Plus Jakarta Sans', sans-serif", color: "#6B7279" }}>running total</div>
          </div>
          <div style={{ height: 4, borderRadius: 4, background: "rgba(20,23,26,0.08)", overflow: "hidden", marginBottom: 10 }}>
            <motion.div style={{ height: "100%", background: "linear-gradient(90deg, #F5C518, #C2570A)", transformOrigin: "left", scaleX: reduced ? 1 : smooth }} />
          </div>
          {STAGES.map((s, i) => {
            const done = reduced || i < active || t >= STAGES.length;
            const on = !reduced && i === active && t < STAGES.length;
            return (
              <div key={s.key} className={`sb-step${on ? " sb-on" : ""}`} style={{ opacity: done || on ? 1 : 0.42, transition: "opacity .3s" }}>
                <div className="sb-dot" style={{
                  background: done ? "#14171A" : on ? "#F5C518" : "rgba(20,23,26,0.08)",
                  color: done ? "#fff" : "#14171A", boxShadow: on ? "0 0 0 5px rgba(245,197,24,0.25)" : "none" }}>
                  {done ? "✓" : i + 1}
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "700 15px 'Plus Jakarta Sans', sans-serif" }}>
                    <span>{s.title}</span>
                    <span style={{ fontWeight: 600, color: "#6B7279", fontVariantNumeric: "tabular-nums" }}>{sym}{fmt(Math.round(totals[i] - (i ? totals[i - 1] : 0)))}</span>
                  </div>
                  <div className="sb-body" style={{ fontSize: 13, lineHeight: 1.5, color: "#5A6067", marginTop: 3 }}>{s.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
