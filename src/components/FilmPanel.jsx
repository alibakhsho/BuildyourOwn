/* =========================================================================
   FilmPanel — the cinematic film of this build, under the 3D view.
     For homeowners   arrival, façade, the furnished rooms, the garden
     Client cut       adds the build stage by stage with the programme's
                      weeks, the price and "Presented by" — for builders and
                      trades to show a client
   Play it in the viewport, or record it to a video file (1080p) to send.
   The film is planned from the model (logic/cinematic.js) and played by the
   engine (engine/cinema.js); the titles are painted on the overlay canvas.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { planFilm } from "../logic/cinematic.js";
import { drawOverlay, FilmRecorder, recordingSupported } from "../engine/cinema.js";

const LS = "byo.film.presentedBy";
const BRAND = "Build Your Own";
const fileSafe = (s) => String(s || "build").replace(/[^\w-]+/g, "-");

export default function FilmPanel({ engine, facts, overlayRef, projectName, onClose }) {
  const [audience, setAudience] = useState("homeowner");
  const [showPrice, setShowPrice] = useState(false);
  const [presentedBy, setPresentedBy] = useState(() => { try { return localStorage.getItem(LS) || ""; } catch { return ""; } });
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState({ title: "", p: 0 });
  const [note, setNote] = useState("");
  const last = useRef(0);
  const canRecord = recordingSupported();

  useEffect(() => { try { localStorage.setItem(LS, presentedBy); } catch { /* private window */ } }, [presentedBy]);
  useEffect(() => () => { if (engine?.mode === "film") engine.stopFilm(); }, [engine]);

  const paint = (st, rec) => {
    const c = overlayRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    drawOverlay(c.getContext("2d"), W, H, st, { brand: BRAND, rec });
  };
  const clear = () => { const c = overlayRef.current; c?.getContext("2d").clearRect(0, 0, c.width, c.height); };

  const start = (record) => {
    if (!engine?.structure) { setNote("Open the 3D model of a house first."); return; }
    const film = planFilm(engine.structure, { ...facts, presentedBy: presentedBy.trim() }, { audience, showPrice });
    let recorder = null;
    if (record) {
      try { recorder = new FilmRecorder(engine.renderer.domElement, { width: 1920, height: 1080, fps: 30, overlay: { brand: BRAND } }); recorder.start(); }
      catch (e) { setNote(`This browser can't record video (${e.message}). Playing instead.`); recorder = null; }
    }
    setNote("");
    setPlaying(true); setRecording(!!recorder);
    engine.playFilm(film, {
      recorder,
      onFrame: (st) => {
        paint(st, !!recorder);
        const t = performance.now();
        if (t - last.current > 200) { last.current = t; setNow({ title: st.caption?.title || "", p: st.progress }); }
      },
      onEnd: async () => {
        clear();
        setPlaying(false); setRecording(false); setPaused(false); setNow({ title: "", p: 0 });
        if (recorder) {
          const blob = await recorder.stop();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${fileSafe(projectName)}-${audience === "client" ? "client-presentation" : "home-film"}.${recorder.extension}`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          setNote(`Saved ${a.download} — ${(blob.size / 1e6).toFixed(1)} MB.`);
        }
      },
    });
  };

  const seg = (on) => ({ border: "none", padding: "6px 12px", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, background: on ? TOKENS.ink : "transparent", color: on ? TOKENS.paper : TOKENS.ink });

  if (playing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: "100%" }}>
        <button className="ec-btn ec-btn-hivis" onClick={() => engine.stopFilm()}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" /></svg>
          {recording ? "Stop & save video" : "Stop film"}
        </button>
        {!recording && (
          <button className="ec-btn ec-btn-ghost" onClick={() => { engine.pauseFilm(!paused); setPaused(!paused); }}>{paused ? "Resume" : "Pause"}</button>
        )}
        {recording && <span className="ec-mono" style={{ fontSize: 11, color: "#e5322d", fontWeight: 700 }}>● RECORDING — keep this tab open</span>}
        <div style={{ flex: 1, minWidth: 160, height: 6, background: TOKENS.rule, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${Math.round(now.p * 100)}%`, height: "100%", background: TOKENS.hivis }} />
        </div>
        <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink, minWidth: 140, textAlign: "right" }}>{now.title}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>CINEMATIC FILM</span>
        <div role="group" aria-label="Film for" style={{ display: "inline-flex", border: `1px solid ${TOKENS.rule}`, borderRadius: 8, overflow: "hidden", background: TOKENS.card }}>
          <button style={seg(audience === "homeowner")} aria-pressed={audience === "homeowner"} onClick={() => { setAudience("homeowner"); setShowPrice(false); }}>For homeowners</button>
          <button style={seg(audience === "client")} aria-pressed={audience === "client"} onClick={() => { setAudience("client"); setShowPrice(true); }}>Client presentation</button>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} style={{ accentColor: TOKENS.ink }} /> Show the price
        </label>
        <input className="ec-input" placeholder="Presented by — your business name" value={presentedBy} onChange={(e) => setPresentedBy(e.target.value)} style={{ minWidth: 220, flex: "1 1 220px", maxWidth: 320, padding: "6px 10px", fontSize: 12 }} />
        <span style={{ flex: 1 }} />
        <button className="ec-btn ec-btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>Close</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="ec-btn ec-btn-hivis" onClick={() => start(false)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Play film
        </button>
        <button className="ec-btn" disabled={!canRecord} onClick={() => start(true)} style={{ background: TOKENS.emberDeep, color: TOKENS.onEmber }}
          title={canRecord ? "Records the film to a 1080p video file" : "This browser can't record video"}>
          <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="currentColor" /></svg>
          Record video (1080p)
        </button>
        <span style={{ fontSize: 12, color: TOKENS.steel, lineHeight: 1.45 }}>
          {audience === "client"
            ? "Drone arrival, the façade, the build stage by stage with your programme, the furnished rooms, the garden and the price — about 80 seconds."
            : "Drone arrival up to the front door, the façade, a fly-over of the furnished plan, the main rooms and the garden — about 60 seconds."}
        </span>
      </div>
      {note && <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{note}</div>}
    </div>
  );
}
