/* =========================================================================
   mobile/Viewer3D.jsx — the live 3D house on the phone
   ------------------------------------------------------------------------
   One engine for the whole phone app. Phones allow only a few WebGL
   contexts and the engine's dispose() doesn't free its own, so instead of
   a new engine per screen the same one moves its canvas into whichever
   viewer is on screen (Engine3D.remount) — the full app does the same.
   It pauses whenever its viewer is off-screen or the app is in the
   background, and rebuilds a beat after the last tap on a control, not on
   every tap.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Layers, Play } from "lucide-react";
import { Engine3D } from "../engine/engine3D.js";
import { useBackClose } from "../lib/back-stack.js";

let shared = null;
function attach(node) {
  if (!shared) {
    shared = new Engine3D(node, { quality: "auto" });
    shared.disableEditing(); // no select/move tools on a phone; drag turns, pinch zooms
  } else {
    shared.remount(node);
  }
  return shared;
}

export default function Viewer3D({ spec }) {
  const stage = useRef(null);
  const eng = useRef(null);
  const built = useRef(false);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  const [frame, setFrame] = useState(false);

  useEffect(() => {
    const node = stage.current;
    const e = attach(node);
    eng.current = e;
    built.current = false;
    setReady(true);
    const io = new IntersectionObserver(([en]) => e.setPaused(!en.isIntersecting || document.hidden), { threshold: 0.01 });
    io.observe(node);
    const onVis = () => e.setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      e.setPlaying(false);
      e.setPaused(true);
    };
  }, []);

  // first build at once; after that, wait for the taps to settle
  useEffect(() => {
    if (!ready || !spec) return;
    const run = () => {
      const e = eng.current;
      if (e.mode === "walk") e.stopWalk();
      if (e.mode === "film") e.stopFilm();
      e.isTower = false;
      e.buildFromSpec(spec);
      e.setViewMode(frame ? "structural" : "finished");
      if (!built.current) { e.setProgress(1); e.setAutoRotate(true); built.current = true; }
      else e.setProgress(e.playing ? e.progress : 1);
    };
    if (!built.current) { run(); return; }
    const t = setTimeout(run, 260);
    return () => clearTimeout(t);
  }, [spec, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) eng.current.setViewMode(frame ? "structural" : "finished"); }, [frame, ready]);

  // full screen: no page scroll underneath
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [full]);

  const watchBuild = () => {
    const e = eng.current;
    if (!e) return;
    e.setViewMode("finished"); setFrame(false);
    e.setProgress(0);
    e.setPlaying(true);
  };

  return (
    <div className={"m-viewer" + (full ? " is-full" : "")}>
      {full && <BackCloses onClose={() => setFull(false)} />}
      <div ref={stage} className="m-viewer-stage" aria-label="3D model of the house — drag to turn, pinch to zoom" role="img" />
      {!ready && <div className="m-viewer-loading">Loading 3D…</div>}
      <div className="m-viewer-tools">
        <button className="m-viewer-tool" onClick={() => setFull((f) => !f)} aria-label={full ? "Exit full screen" : "Full screen"}>
          {full ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
        <button className="m-viewer-tool" aria-pressed={frame} onClick={() => setFrame((f) => !f)} aria-label="Show the frame">
          <Layers size={20} />
        </button>
        <button className="m-viewer-tool" onClick={watchBuild} aria-label="Watch it being built">
          <Play size={19} />
        </button>
      </div>
      <div className="m-viewer-hint">{frame ? "Frame view" : "Drag to turn, pinch to zoom"}</div>
    </div>
  );
}

/* Android Back and Escape leave full screen before they leave the page. */
function BackCloses({ onClose }) {
  useBackClose(onClose);
  return null;
}
