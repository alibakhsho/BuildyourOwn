/* =========================================================================
   ModelTools — the CAD-style controls around the 3D model.
     ModelToolbar  views (3D / plan / elevations), display style, quick
                   presets (finished, frame, structure, slab, x-ray) and
                   section cuts
     LayersPanel   every building system as a layer, with piece counts
     PieceCard     what you clicked: mark, product, size, where it is
     CutList       the full schedule / cut list, CSV download
   The engine does the drawing; these only call its API (engine3D.js).
   ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { buildStructure, schedule, scheduleCsv, unitLabel, SYSTEMS } from "../logic/structure/index.js";

const YARD_OFF = { fencing: false, decking: false, paving: false, garden: false, lawn: false, retaining: false, furniture: false };
const PRESETS = {
  finished:   { label: "Finished",  layers: {}, site: true, mode: "finished" },
  frame:      { label: "Frame",     layers: { reo: false, cladding: false, roofing: false, linings: false, interior: false, solar: false, electrical: false, plumbing: false, drainage: false, ...YARD_OFF }, site: true, mode: "finished" },
  structure:  { label: "Structure", layers: { cladding: false, roofing: false, linings: false, interior: false, solar: false, openings: false, electrical: false, plumbing: false, drainage: false, ...YARD_OFF }, site: true, mode: "finished" },
  services:   { label: "Services",  layers: Object.fromEntries(Object.keys(SYSTEMS).map((k) => [k, ["foundation", "wallFrame", "floorFrame", "electrical", "plumbing", "drainage"].includes(k)])), site: false, mode: "finished" },
  slab:       { label: "Slab",      layers: Object.fromEntries(Object.keys(SYSTEMS).map((k) => [k, k === "foundation" || k === "reo"])), site: false, mode: "finished" },
  xray:       { label: "X-ray",     layers: {}, site: true, mode: "structural" },
};
const VIEWS = [["persp", "3D"], ["top", "Plan"], ["front", "Front"], ["back", "Rear"], ["left", "Left"], ["right", "Right"]];
const STYLES = [["realistic", "Realistic"], ["lines", "Lines"], ["white", "White model"]];

const group = { display: "inline-flex", border: `1px solid ${TOKENS.rule}`, borderRadius: 8, overflow: "hidden", background: TOKENS.card };
const segBtn = (on) => ({
  border: "none", borderRight: `1px solid ${TOKENS.rule}`, padding: "6px 10px", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600,
  background: on ? TOKENS.ink : "transparent", color: on ? TOKENS.paper : TOKENS.ink, whiteSpace: "nowrap",
});
const label = { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: TOKENS.steel, fontFamily: "var(--font-mono, monospace)" };

export function ModelToolbar({ engine, onPreset }) {
  const [view, setView] = useState(engine?.view || "persp");
  const [style, setStyle] = useState(engine?.style || "realistic");
  const [preset, setPreset] = useState("finished");
  const [section, setSection] = useState("off");
  const [at, setAt] = useState(0);
  const env = engine?.structure?.env;

  // ranges for the section slider, from the building itself
  const range = useMemo(() => {
    if (!env) return [0, 1, 0];
    if (section === "plan") return [env.ffl + 0.3, env.plateY + 1.5, env.ffl + 1.2];
    if (section === "long") return [-env.w / 2, env.w / 2, 0];
    if (section === "cross") return [-env.l / 2, env.l / 2, 0];
    return [0, 1, 0];
  }, [env, section]);

  if (!engine) return null;
  const pick = (k) => {
    const P = PRESETS[k];
    setPreset(k);
    engine.setLayers(P.layers);
    engine.setSiteVisible(P.site);
    engine.setViewMode(P.mode);
    onPreset?.(k);
  };
  const doSection = (m) => {
    setSection(m);
    const r = m === "plan" ? [0, 0, (env?.ffl ?? 0.15) + 1.2] : [0, 0, 0];
    setAt(r[2]);
    engine.setSection(m, r[2]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 8 }}>
      <div role="group" aria-label="View" style={group}>
        {VIEWS.map(([id, l]) => (
          <button key={id} style={segBtn(view === id)} aria-pressed={view === id}
            onClick={() => { setView(id); engine.setView(id); }}>{l}</button>
        ))}
        <button style={{ ...segBtn(false), borderRight: "none" }} title="Back to the whole building" onClick={() => { setView("persp"); engine.home(); }}>⟲</button>
      </div>
      <div role="group" aria-label="Display style" style={group}>
        {STYLES.map(([id, l], i) => (
          <button key={id} style={{ ...segBtn(style === id), ...(i === STYLES.length - 1 ? { borderRight: "none" } : {}) }} aria-pressed={style === id}
            onClick={() => { setStyle(id); engine.setStyle(id); }}>{l}</button>
        ))}
      </div>
      <div role="group" aria-label="Show" style={group}>
        {Object.entries(PRESETS).map(([id, P], i, arr) => (
          <button key={id} style={{ ...segBtn(preset === id), ...(i === arr.length - 1 ? { borderRight: "none" } : {}) }} aria-pressed={preset === id}
            onClick={() => pick(id)}>{P.label}</button>
        ))}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...group, padding: "3px 8px" }}>
        <span style={label}>Section</span>
        <select value={section} onChange={(e) => doSection(e.target.value)}
          style={{ border: "none", background: "transparent", font: "inherit", fontSize: 12, fontWeight: 600, color: TOKENS.ink, cursor: "pointer" }}>
          <option value="off">Off</option>
          <option value="plan">Plan cut</option>
          <option value="long">Long section</option>
          <option value="cross">Cross section</option>
        </select>
        {section !== "off" && env && (
          <input type="range" min={range[0]} max={range[1]} step={0.01} value={at}
            onChange={(e) => { setAt(+e.target.value); engine.setSection(section, +e.target.value); }}
            style={{ width: 120, accentColor: TOKENS.ink }} aria-label="Section position" />
        )}
      </div>
    </div>
  );
}

export function LayersPanel({ engine, version }) {
  const [tick, force] = useState(0);
  const layers = useMemo(() => engine?.layers?.() || [], [engine, version, tick]);
  if (!engine) return null;
  const set = (sys, v) => { engine.setLayerVisible(sys, v); force((n) => n + 1); };
  const all = (v) => { engine.setLayers(Object.fromEntries(layers.map((l) => [l.sys, v]))); force((n) => n + 1); };
  const total = layers.reduce((a, l) => a + l.pieces, 0);
  return (
    <div className="ec-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div className="ec-eyebrow">Layers</div>
          <div style={{ fontSize: 13, color: TOKENS.steel, marginTop: 4 }}>{total.toLocaleString()} individual pieces in this model. Click any piece in the 3D view to see what it is.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }} onClick={() => all(true)}>All on</button>
          <button className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }} onClick={() => all(false)}>All off</button>
          <button className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }} onClick={() => engine.setSiteVisible(!(engine.siteVisible ?? true))}>Toggle ground</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
        {layers.map((l) => {
          const on = engine.layerVisible?.[l.sys] !== false;
          return (
            <label key={l.sys} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${on ? TOKENS.ink : TOKENS.rule}`, borderRadius: 8, cursor: "pointer", background: on ? TOKENS.accentWash : "transparent" }}>
              <input type="checkbox" checked={on} onChange={(e) => set(l.sys, e.target.checked)} style={{ accentColor: TOKENS.ink }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{l.label}</span>
              <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{l.pieces.toLocaleString()}</span>
            </label>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: TOKENS.steel, marginTop: 12, lineHeight: 1.5 }}>
        Navigate: drag to orbit · right-drag (or two fingers) to pan · scroll / pinch to zoom toward the cursor. Bolts, screws, nail plates and ties appear as you zoom in.
      </div>
    </div>
  );
}

const mm = (v) => `${Math.round(v * 1000).toLocaleString()} mm`;

export function PieceCard({ member, structure, onClose, onIsolate }) {
  if (!member) return null;
  const same = structure ? structure.members.filter((m) => m.profile === member.profile && m.name === member.name && !m.noSchedule).length : null;
  const size = member.unit === "ea" ? null
    : member.unit === "lm" ? `${mm(member.len)} long · section ${Math.round(member.d * 1000)} × ${Math.round(member.w * 1000)}`
    : `${(member.len).toFixed(2)} × ${Math.max(member.d, member.w).toFixed(2)} m`;
  return (
    <div role="dialog" aria-label="Selected piece" style={{ position: "absolute", left: 10, bottom: 10, maxWidth: "min(340px, calc(100% - 20px))", background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, borderLeft: `4px solid ${TOKENS.hivis}`, borderRadius: 8, boxShadow: TOKENS.shadowMd, padding: "8px 12px 10px", zIndex: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{member.name}</span>
        <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: TOKENS.inkSoft, marginTop: 2 }}>{member.profile}{size ? <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}> · {size}</span> : null}</div>
      <div style={{ fontSize: 11, color: TOKENS.steel, marginTop: 4 }}>
        <span className="ec-mono">{member.mark}</span> · {member.host}{same != null ? ` · ${same.toLocaleString()} in the build` : ""}
      </div>
      <button onClick={() => onIsolate?.(member.sys)} style={{ marginTop: 6, border: "none", background: "none", padding: 0, cursor: "pointer", color: TOKENS.hivis, font: "inherit", fontSize: 12, fontWeight: 600 }}>
        Show only {SYSTEMS[member.sys]?.label.toLowerCase()} →
      </button>
    </div>
  );
}

/* The schedule / cut list for the current building, grouped by system. */
export function CutList({ spec, projectName }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set(["wallFrame", "roofFrame"]));
  const structure = useMemo(() => buildStructure(spec), [spec]);
  const rows = useMemo(() => schedule(structure.members), [structure]);
  const filtered = q.trim() ? rows.filter((r) => `${r.system} ${r.item} ${r.profile}`.toLowerCase().includes(q.trim().toLowerCase())) : rows;
  const bySys = new Map();
  for (const r of filtered) (bySys.get(r.sys) || bySys.set(r.sys, []).get(r.sys)).push(r);
  const download = () => {
    const blob = new Blob([scheduleCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(projectName || "build").replace(/[^\w-]+/g, "-")}-cut-list.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const toggle = (sys) => setOpen((s) => { const n = new Set(s); n.has(sys) ? n.delete(sys) : n.add(sys); return n; });
  const fmtQty = (r) => (r.unit === "ea" ? r.qty.toLocaleString() : r.qty.toLocaleString(undefined, { maximumFractionDigits: r.unit === "m3" ? 2 : 1 }));
  return (
    <div className="ec-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div className="ec-eyebrow">Cut list & schedule</div>
          <div style={{ fontSize: 13, color: TOKENS.steel, marginTop: 4, maxWidth: "70ch" }}>
            Every piece in the 3D model, counted: {structure.members.length.toLocaleString()} pieces. Lengths are cut lengths in millimetres.
            Indicative — final member sizes come from the engineer and the frame &amp; truss supplier.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="ec-input" placeholder="Search — e.g. stud, M12, lintel" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          <button className="ec-btn ec-btn-hivis" onClick={download}>Download CSV</button>
        </div>
      </div>
      {[...bySys.entries()].map(([sys, list]) => {
        const isOpen = open.has(sys) || !!q.trim();
        const pieces = list.reduce((a, r) => a + r.pieces, 0);
        return (
          <div key={sys} style={{ borderTop: `1px solid ${TOKENS.rule}` }}>
            <button onClick={() => toggle(sys)} aria-expanded={isOpen}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 2px", border: "none", background: "none", cursor: "pointer", font: "inherit", color: TOKENS.ink }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{isOpen ? "▾" : "▸"} {SYSTEMS[sys]?.label || sys}</span>
              <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{list.length} items · {pieces.toLocaleString()} pieces</span>
            </button>
            {isOpen && (
              <div style={{ overflowX: "auto", paddingBottom: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: TOKENS.steel }}>
                      {["Item", "Profile / product", "Pieces", "Quantity", "Cut lengths (mm × qty)"].map((h) => <th key={h} style={{ padding: "4px 8px", fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${TOKENS.rule}` }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.item}</td>
                        <td style={{ padding: "6px 8px" }}>{r.profile}</td>
                        <td className="ec-mono" style={{ padding: "6px 8px", textAlign: "right" }}>{r.pieces.toLocaleString()}</td>
                        <td className="ec-mono" style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtQty(r)} {unitLabel(r.unit)}</td>
                        <td className="ec-mono" style={{ padding: "6px 8px", color: TOKENS.inkSoft, fontSize: 11.5 }}>
                          {r.cuts.length ? r.cuts.slice(0, 8).map((c) => `${c.mm.toLocaleString()}×${c.n}`).join("  ") + (r.cuts.length > 8 ? `  +${r.cuts.length - 8} more` : "") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Keep a component in sync with the engine rebuilding the model. */
export function useEngineVersion(engine, deps) {
  const [v, setV] = useState(0);
  useEffect(() => { setV((x) => x + 1); }, [engine, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
