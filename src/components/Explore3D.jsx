/* =========================================================================
   Explore3D — the easy way round the 3D model, right on the 3D page.

     Parts   the build in plain English. Tap a part to see it on its own
             (everything else turns to glass and the camera flies to it);
             the eye hides or shows it.
     See inside   one slider that takes the house apart from the outside in
     Pull apart   one slider that lifts each layer off the one below
     Rooms   tap a room to fly into it with the storey above cut away
     Nav pad turn, tilt, zoom, top view and home, as big buttons — and a
             double-click on anything flies to it

   The engine does the work (engine/explore.js); this is only the UI.
   ========================================================================= */
import { useEffect, useState } from "react";
import { colors as T } from "../design/system.js";
import { PEEL } from "../engine/explore.js";

const HINT_KEY = "byo.3d.hint.v1";
const narrowNow = () => typeof window !== "undefined" && window.innerWidth < 560;

export default function Explore3D({ engine, version }) {
  const X = engine?.explore;
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(() => !narrowNow());
  const [tab, setTab] = useState("parts");
  const [narrow, setNarrow] = useState(narrowNow);
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(HINT_KEY) !== "off"; } catch { return true; } });

  useEffect(() => {
    if (!X) return;
    const bump = () => setTick((t) => (t + 1) % 1e9);
    X.onChange = bump;
    bump();
    return () => { if (X.onChange === bump) X.onChange = null; };
  }, [X, version]);
  // keep the building centred in the part of the view the panel does not cover
  useEffect(() => {
    if (!engine?.setViewInset) return;
    engine.setViewInset(open && !narrow ? 284 : 0);
    return () => engine.setViewInset(0);
  }, [engine, open, narrow]);
  useEffect(() => {
    const r = () => setNarrow(narrowNow());
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  if (!X || !engine.structure) return null;

  const parts = X.parts();
  const floors = X.floors();
  const closeHint = () => { setHint(false); try { localStorage.setItem(HINT_KEY, "off"); } catch { /* private mode */ } };

  const panelStyle = narrow
    ? { position: "absolute", left: 8, right: 8, bottom: 8, maxHeight: "58%", zIndex: 6 }
    : { position: "absolute", left: 12, top: 12, bottom: 12, width: 272, zIndex: 6 };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ ...pill, position: "absolute", left: narrow ? 8 : 12, top: narrow ? 8 : 12, zIndex: 6 }}>
          <Ic d="M4 6h16M4 12h16M4 18h10" /> Explore parts &amp; rooms
        </button>
      )}

      {open && (
        <section aria-label="Explore the build" style={{ ...panelStyle, display: "flex", flexDirection: "column", background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12, boxShadow: T.shadowLift, overflow: "hidden" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>Explore the build</div>
              <div style={{ fontSize: 11, color: T.steel, marginTop: 1 }}>Tap anything to go straight to it</div>
            </div>
            <button onClick={() => X.reset()} title="Back to the finished house" style={smallBtn}>Reset</button>
            <button onClick={() => setOpen(false)} aria-label="Hide panel" title="Hide panel" style={{ ...smallBtn, padding: "4px 7px" }}>
              <Ic d={narrow ? "M6 9l6 6 6-6" : "M15 6l-6 6 6 6"} />
            </button>
          </header>

          <div role="tablist" style={{ display: "flex", gap: 4, padding: "0 12px 8px" }}>
            {[["parts", "Parts"], ["rooms", "Rooms"]].map(([id, l]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${tab === id ? T.ink : T.rule}`, background: tab === id ? T.ink : "transparent", color: tab === id ? T.card : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer", font: "inherit" }}>{l}</button>
            ))}
          </div>

          <div style={{ overflowY: "auto", padding: "0 12px 12px", flex: 1 }}>
            {tab === "parts" ? (
              <>
                {X.focusId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: T.hivis, color: T.onHivis, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                    <span style={{ flex: 1 }}>Showing {parts.find((p) => p.id === X.focusId)?.label.toLowerCase()}</span>
                    <button onClick={() => { X.focus(null); X.frameAll(); }} style={{ border: "none", background: "rgba(0,0,0,0.12)", color: T.onHivis, borderRadius: 6, padding: "4px 8px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Show everything</button>
                  </div>
                )}

                <Slider label="See inside" value={X.peelLevel} min={0} max={PEEL.length - 1} step={1}
                  caption={PEEL[X.peelLevel].label} onChange={(v) => X.peel(v)}
                  minus={() => X.peel(X.peelLevel - 1)} plus={() => X.peel(X.peelLevel + 1)} />
                <Slider label="Pull apart" value={X.explodeT} min={0} max={1} step={0.01}
                  caption={X.explodeT < 0.02 ? "Together" : X.explodeT > 0.98 ? "Fully apart" : "Layers lifted"}
                  onChange={(v) => X.setExplode(v)} onRelease={() => X.frameAll()}
                  minus={() => { X.setExplode(Math.max(0, X.explodeT - 0.25)); X.frameAll(); }} plus={() => { X.setExplode(Math.min(1, X.explodeT + 0.25)); X.frameAll(); }} />

                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.steel, margin: "14px 0 6px", fontFamily: "var(--font-mono, monospace)" }}>Parts of the build</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {parts.map((p) => {
                    const on = X.focusId === p.id;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 8, border: `1px solid ${on ? T.hivis : T.rule}`, background: on ? "color-mix(in srgb, var(--hivis) 14%, transparent)" : "transparent", opacity: p.visible ? 1 : 0.55 }}>
                        <button onClick={() => (on ? (X.focus(null), X.frameAll()) : X.focus(p.id))} title={on ? "Show everything again" : `See ${p.label.toLowerCase()} on its own`}
                          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "8px 4px 8px 10px", border: "none", background: "none", cursor: "pointer", font: "inherit", color: T.ink, textAlign: "left" }}>
                          <span style={{ width: 12, height: 12, borderRadius: 3, background: p.tint, flexShrink: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: on ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                          <span style={{ fontSize: 10.5, color: T.steel, fontFamily: "var(--font-mono, monospace)" }}>{p.count.toLocaleString()}</span>
                        </button>
                        <button onClick={() => X.setPartVisible(p.id, !p.visible)} aria-label={p.visible ? `Hide ${p.label}` : `Show ${p.label}`} title={p.visible ? "Hide" : "Show"}
                          style={{ border: "none", background: "none", padding: "6px 9px", cursor: "pointer", color: p.visible ? T.ink : T.steel }}>
                          <Eye on={p.visible} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {X.room && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: T.hivis, color: T.onHivis, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                    <span style={{ flex: 1 }}>In {X.room.name.toLowerCase()}</span>
                    <button onClick={() => { X.leaveRoom(); X.frameAll(); }} style={{ border: "none", background: "rgba(0,0,0,0.12)", color: T.onHivis, borderRadius: 6, padding: "4px 8px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Back outside</button>
                  </div>
                )}
                {floors.map((f) => (
                  <div key={f.index} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 6px" }}>
                      <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.steel, fontFamily: "var(--font-mono, monospace)" }}>{f.name}</span>
                      <button onClick={() => X.goFloor(f.index)} style={{ ...smallBtn, fontSize: 11 }}>Whole floor</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {f.rooms.map((r, i) => {
                        const on = X.room && !X.room.whole && X.room.name === r.name && X.room.floor === r.floor;
                        return (
                          <button key={`${r.name}-${i}`} onClick={() => X.goRoom(r)}
                            style={{ padding: "9px 8px", borderRadius: 8, border: `1px solid ${on ? T.hivis : T.rule}`, background: on ? T.hivis : "transparent", color: on ? T.onHivis : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer", font: "inherit", textAlign: "left", lineHeight: 1.25 }}>
                            {r.name}
                            <span style={{ display: "block", fontSize: 10, color: on ? T.onHivis : T.steel, fontWeight: 500, marginTop: 2 }}>{r.w.toFixed(1)} × {r.l.toFixed(1)} m</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!floors.length && <div style={{ color: T.steel, fontSize: 12 }}>This model has no rooms laid out.</div>}
              </>
            )}
          </div>
        </section>
      )}

      <NavPad X={X} engine={engine} narrow={narrow} lifted={narrow && open} />

      {hint && !narrow && (
        <div style={{ position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)", zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "7px 8px 7px 12px", borderRadius: 999, background: T.cardVeil, border: `1px solid ${T.rule}`, color: T.ink, fontSize: 12, boxShadow: T.shadowMd, whiteSpace: "nowrap" }}>
          <span><b>Drag</b> to turn · <b>right-drag</b> to slide · <b>scroll</b> to zoom · <b>double-click</b> anything to fly to it</span>
          <button onClick={closeHint} aria-label="Dismiss" style={{ border: "none", background: "none", cursor: "pointer", color: T.steel, fontSize: 15, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
    </>
  );
}

/* Big, obvious camera buttons — no mouse gymnastics needed. */
function NavPad({ X, engine, narrow, lifted }) {
  const b = (title, d, onClick, extra = {}) => (
    <button title={title} aria-label={title} onClick={onClick} style={{ ...padBtn, ...extra }}><Ic d={d} size={16} /></button>
  );
  if (lifted) return null;    // on a phone the open panel takes the bottom of the view
  return (
    <div aria-label="Camera" style={{ position: "absolute", right: narrow ? 8 : 12, bottom: narrow ? 8 : 12, zIndex: 5, display: "flex", gap: 6, alignItems: "flex-end" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 34px)", gridTemplateRows: "repeat(3, 34px)", gap: 4, padding: 6, borderRadius: 12, background: T.cardVeil, border: `1px solid ${T.rule}`, boxShadow: T.shadowMd }}>
        <span />
        {b("Look from higher", "M12 19V5M6 11l6-6 6 6", () => X.orbit(0, -12))}
        <span />
        {b("Turn left", "M3 12a9 9 0 1 0 3-6.7M3 4v5h5", () => X.orbit(-45))}
        {b("Whole building", "M3 11l9-7 9 7v9h-6v-6H9v6H3z", () => { engine.explore.room ? (X.leaveRoom(), X.frameAll()) : X.frameAll(); })}
        {b("Turn right", "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5", () => X.orbit(45))}
        <span />
        {b("Look from lower", "M12 5v14M6 13l6 6 6-6", () => X.orbit(0, 12))}
        <span />
      </div>
      <div style={{ display: "grid", gridTemplateRows: "repeat(3, 34px)", gap: 4, padding: 6, borderRadius: 12, background: T.cardVeil, border: `1px solid ${T.rule}`, boxShadow: T.shadowMd }}>
        {b("Zoom in", "M12 5v14M5 12h14", () => X.zoom(0.7))}
        {b("Zoom out", "M5 12h14", () => X.zoom(1.4))}
        {b("Bird's-eye view", "M4 4h16v16H4zM4 12h16M12 4v16", () => X.topView())}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, caption, onChange, onRelease, minus, plus }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{label}</span>
        <span style={{ fontSize: 11, color: T.steel }}>{caption}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={minus} aria-label={`${label}: less`} style={stepBtn}>−</button>
        <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
          onChange={(e) => onChange(+e.target.value)} onPointerUp={onRelease} onKeyUp={onRelease}
          style={{ flex: 1, accentColor: "var(--hivis)" }} />
        <button onClick={plus} aria-label={`${label}: more`} style={stepBtn}>+</button>
      </div>
    </div>
  );
}

function Eye({ on }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {on ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> : <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />}
    </svg>
  );
}
function Ic({ d, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

const smallBtn = { border: `1px solid ${T.rule}`, background: "transparent", color: T.ink, borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 };
const stepBtn = { width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1px solid ${T.rule}`, background: "transparent", color: T.ink, fontSize: 15, fontWeight: 700, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" };
const padBtn = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.rule}`, background: T.card, color: T.ink, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 };
const pill = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 999, border: `1px solid ${T.rule}`, background: T.card, color: T.ink, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: T.shadowLift };
