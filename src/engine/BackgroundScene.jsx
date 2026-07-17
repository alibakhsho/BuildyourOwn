/* =========================================================================
   BackgroundScene — full-page ambient 3D: a steel structure that endlessly
   assembles from flying parts, holds, breaks apart, and rebuilds. Sits fixed
   behind the whole app at low opacity. Cheap by design: ~60 unshadowed
   meshes, capped pixel ratio, pauses when the tab is hidden, and renders a
   single static frame when the user prefers reduced motion.
   ========================================================================= */
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { easeOutCubic } from "../lib/format.js";

export default function BackgroundScene({ opacity = 0.5 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

    scene.add(new THREE.HemisphereLight(0xdfeeff, 0xb9a98a, 0.9));
    const key = new THREE.DirectionalLight(0xfff4d6, 0.8);
    key.position.set(8, 14, 6);
    scene.add(key);

    /* ---- target structure: a small braced steel tower ---- */
    const steel = [0x9aa4b0, 0x828c98, 0x77828f];
    const hivis = 0xd9a514;
    const parts = []; // { mesh, home:{p,r}, scatter:{p,r}, delay }
    const group = new THREE.Group();
    scene.add(group);

    const addPart = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.6 }));
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      const R = () => (Math.random() - 0.5) * 34;
      parts.push({
        mesh: m,
        home: { p: [x, y, z], r: [rx, ry, rz] },
        scatter: { p: [R(), y + Math.random() * 22 + 6, R() - 8], r: [Math.random() * 6, Math.random() * 6, Math.random() * 6] },
        delay: Math.random() * 0.35,
      });
      group.add(m);
    };

    const S = 5, LVLS = 4, FH = 2.6; // plan size, levels, floor height
    const colGeo = new THREE.BoxGeometry(0.22, FH, 0.22);
    const beamGeo = new THREE.BoxGeometry(S, 0.22, 0.16);
    const braceLen = Math.sqrt(S * S + FH * FH);
    const braceGeo = new THREE.BoxGeometry(braceLen, 0.1, 0.1);
    const plateGeo = new THREE.BoxGeometry(S + 0.6, 0.14, S + 0.6);
    for (let lv = 0; lv < LVLS; lv++) {
      const y0 = lv * FH, cy = y0 + FH / 2, c = steel[lv % 3];
      for (const [cx, cz] of [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]])
        addPart(colGeo, c, cx, cy, cz);
      addPart(beamGeo, c, 0, y0 + FH, -S / 2);
      addPart(beamGeo, c, 0, y0 + FH, S / 2);
      addPart(beamGeo, c, 0, y0 + FH, 0, 0, Math.PI / 2, 0);
      const bAng = Math.atan2(FH, S);
      addPart(braceGeo, lv % 2 ? hivis : steel[2], 0, cy, -S / 2, 0, 0, bAng);
      addPart(braceGeo, lv % 2 ? steel[2] : hivis, 0, cy, S / 2, 0, 0, -bAng);
      addPart(plateGeo, 0xbdb9b0, 0, y0 + FH + 0.12, 0);
    }
    /* crane jib accent above */
    addPart(new THREE.BoxGeometry(0.18, 6, 0.18), hivis, S / 2 + 1.6, LVLS * FH / 2 + 3, 0);
    addPart(new THREE.BoxGeometry(7, 0.16, 0.16), hivis, S / 2 + 1.6 - 2.2, LVLS * FH + 6, 0);

    camera.position.set(13, 9, 15);
    camera.lookAt(0, LVLS * FH * 0.45, 0);

    /* ---- animation: assemble → hold → break → hold → repeat ---- */
    const PHASES = [3.2, 3.6, 2.6, 1.4]; // build, hold, break, scattered-hold (s)
    const CYCLE = PHASES.reduce((a, b) => a + b, 0);
    const lerp = (a, b, t) => a + (b - a) * t;
    const pose = (part, t /* 0 scattered → 1 home */) => {
      const k = Math.max(0, Math.min(1, t));
      const { p, r } = part.home, s = part.scatter;
      part.mesh.position.set(lerp(s.p[0], p[0], k), lerp(s.p[1], p[1], k), lerp(s.p[2], p[2], k));
      part.mesh.rotation.set(lerp(s.r[0], r[0], k), lerp(s.r[1], r[1], k), lerp(s.r[2], r[2], k));
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, hidden = false;
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    const t0 = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (hidden) return;
      const el = ((performance.now() - t0) / 1000) % CYCLE;
      let t;
      if (el < PHASES[0]) t = easeOutCubic(el / PHASES[0]);                        // building
      else if (el < PHASES[0] + PHASES[1]) t = 1;                                   // built
      else if (el < PHASES[0] + PHASES[1] + PHASES[2])
        t = 1 - easeOutCubic((el - PHASES[0] - PHASES[1]) / PHASES[2]);             // breaking
      else t = 0;                                                                   // scattered
      for (const part of parts) {
        const d = part.delay;
        pose(part, t <= 0 ? 0 : t >= 1 ? 1 : (t - d) / (1 - d));
      }
      group.rotation.y += 0.0016;
      renderer.render(scene, camera);
    };

    if (reduced) { for (const p of parts) pose(p, 1); renderer.render(scene, camera); }
    else raf = requestAnimationFrame(frame);

    const onVis = () => { hidden = document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
      parts.forEach((p) => { p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
      renderer.dispose();
    };
  }, []);

  return (
    <canvas ref={ref} aria-hidden="true" style={{
      position: "fixed", inset: 0, width: "100%", height: "100%",
      zIndex: 0, pointerEvents: "none", opacity,
    }} />
  );
}
