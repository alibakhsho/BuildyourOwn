/* =========================================================================
   Studio3D — the full-screen 3D modelling workspace (SketchUp / Rhino /
   Blender style) over the same engine as the viewer.

     Toolbar      select · move · rotate · scale · measure · paint, snapping,
                  undo / redo, standard views, display style, section cuts,
                  capture (2× PNG) and export (GLB + edits JSON)
     Outliner     every system → every assembly (a wall, a roof plane, a
                  room) → every piece, with eye toggles, search, click to
                  select, double-click to fly to it
     Properties   what is selected — product, mark, where it is — with its
                  position, rotation and size typed in millimetres, colour,
                  select-same, isolate, hide, delete, reset
     Environment  sun position and sky (procedural or photographic), exposure,
                  shadows, fog, ambient occlusion, bloom, lens, hardware detail
     Status bar   pieces drawn, triangles, draw calls, selection, snapping

   The engine (engine3D.js) and the editor (editor.js) do the work; this
   file is only the UI. Keyboard: V G R S M P · F frame · H hide · Alt+H
   unhide all · I isolate · Del delete · Ctrl+Z / Ctrl+Y · Esc · 1 3 7 0
   for front / right / plan / 3D.
   ========================================================================= */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SYSTEMS } from "../logic/structure/model.js";
import { SKY_PRESETS } from "../engine/environment.js";
import { loadTextureManifest } from "../engine/materials3d.js";
import { download } from "../engine/editor.js";

/* The Studio is always dark, like every pro 3D package: the model is the
   brightest thing on screen. Brand accent stays safety yellow. */
const C = {
  bg: "#0f1115", panel: "#161a20", panel2: "#1c2129", line: "#262c36", lineSoft: "#20252e",
  text: "#e6e9ee", soft: "#a7b0bd", dim: "#6f7a89", accent: "#f5c518", accentInk: "#0f1115", danger: "#ef5b4c", ok: "#3fb27f",
};
const mono = "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)";
const sans = "var(--font-sans, Inter, system-ui, sans-serif)";

const TOOLS = [
  { id: "select", label: "Select", key: "V", icon: "M5 3l14 8-6 2-2 6z" },
  { id: "move", label: "Move", key: "G", icon: "M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" },
  { id: "rotate", label: "Rotate", key: "R", icon: "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" },
  { id: "scale", label: "Scale", key: "S", icon: "M4 20h7v-7H4zM13 11l7-7M14 4h6v6" },
  { id: "measure", label: "Measure", key: "M", icon: "M3 17l14-14 4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" },
  { id: "paint", label: "Paint", key: "P", icon: "M19 11l-8-8-8.5 8.5a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0zM19 11s2 2.6 2 4a2 2 0 0 1-4 0c0-1.4 2-4 2-4z" },
];
const VIEWS = [["persp", "3D", "0"], ["top", "Plan", "7"], ["front", "Front", "1"], ["back", "Rear", "Ctrl+1"], ["left", "Left", "Ctrl+3"], ["right", "Right", "3"]];
const STYLES = [["realistic", "Realistic"], ["lines", "Lines"], ["white", "White model"]];
const SWATCHES = ["#f5c518", "#ef5b4c", "#3f8efc", "#3fb27f", "#f2efe8", "#c8a27a", "#7a5534", "#4a4f56", "#323233", "#e4e2d5", "#5b6356", "#b1ada3"];
const TOOL_HINT = {
  select: "Click a piece to select it · Shift-click to add · Ctrl-click to toggle · double-click in the outliner to fly to it",
  move: "Drag an arrow to move along it, or a square to move in that plane · snaps to the grid set below",
  rotate: "Drag a ring to rotate about that axis",
  scale: "Drag a handle to stretch along that axis · type exact sizes in Properties",
  measure: "Click two points · snaps to the corners of the piece you click",
  paint: "Click pieces to paint them with the chosen colour",
};

const mm = (m) => Math.round(m * 1000);
const fmtInt = (n) => (n ?? 0).toLocaleString();

export default function Studio3D({ engine, returnTo, onClose, projectName = "model" }) {
  const hostRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => (t + 1) % 1e9), []);
  const [modelV, setModelV] = useState(0);
  const [right, setRight] = useState("properties");
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 980);
  const [showLeft, setShowLeft] = useState(() => typeof window === "undefined" || window.innerWidth >= 980);
  const [showRight, setShowRight] = useState(() => typeof window === "undefined" || window.innerWidth >= 980);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState("");

  /* take the canvas over, give it back on the way out */
  useEffect(() => {
    let alive = true;
    const el = hostRef.current;
    engine.enterStudio(el).then(() => {
      if (!alive) return;
      engine.editor.onChange = bump;
      setEditor(engine.editor);
    });
    const prevModel = engine.onModelChange;
    engine.onModelChange = () => { prevModel?.(); setModelV((v) => v + 1); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onResize = () => setNarrow(window.innerWidth < 980);
    window.addEventListener("resize", onResize);
    const iv = setInterval(() => setStats(engine.stats()), 1000);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prevOverflow;
      engine.onModelChange = prevModel;
      if (engine.editor) engine.editor.onChange = null;
      engine.exitStudio(typeof returnTo === "function" ? returnTo() : returnTo);
    };
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  /* keyboard */
  useEffect(() => {
    if (!editor) return;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); editor.undo(); return; }
      if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); editor.redo(); return; }
      if (ctrl && k === "a") { e.preventDefault(); editor.selectWhere(() => true); return; }
      if (ctrl && k === "1") { e.preventDefault(); engine.setView("back"); bump(); return; }
      if (ctrl && k === "3") { e.preventDefault(); engine.setView("left"); bump(); return; }
      if (ctrl) return;
      if (k === "escape") { if (editor.tool !== "select") editor.setTool("select"); else if (editor.selection.length) editor.clearSelection(); else onClose?.(); return; }
      const tool = TOOLS.find((x) => x.key.toLowerCase() === k || (k === "w" && x.id === "move") || (k === "q" && x.id === "select") || (k === "e" && x.id === "rotate"));
      if (tool && !e.altKey) { editor.setTool(tool.id); return; }
      if (k === "f") { engine.frameSelection(); return; }
      if (k === "h" && e.altKey) { e.preventDefault(); editor.unhideAll(); return; }
      if (k === "h") { editor.hide(); return; }
      if (k === "i") { editor.isolated ? editor.unisolate() : editor.isolate(); return; }
      if (k === "delete" || k === "backspace") { editor.deleteSelected(); return; }
      if (k === "1") { engine.setView("front"); bump(); return; }
      if (k === "3") { engine.setView("right"); bump(); return; }
      if (k === "7") { engine.setView("top"); bump(); return; }
      if (k === "0") { engine.setView("persp", { keep: true }); bump(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, engine, onClose, bump]);

  const sel = editor?.selection || [];
  const members = engine.structure?.members || [];
  const one = sel.length === 1 ? members[sel[0]] : null;

  const capture = async (transparent) => {
    setBusy("Rendering image…");
    try {
      const blob = await engine.captureImage(2, { transparent });
      if (blob) download(blob, `${fileSafe(projectName)}-render${transparent ? "-cutout" : ""}.png`);
    } finally { setBusy(""); }
  };
  const exportGlb = async () => {
    setBusy("Exporting GLB…");
    try { await editor.exportGlb(`${fileSafe(projectName)}.glb`); } catch (e) { alert(`Export failed: ${e.message}`); } finally { setBusy(""); }
  };

  // a column only for the panels actually on screen (phones use overlay drawers, out of the grid flow)
  const gridCols = narrow
    ? "minmax(0, 1fr)"
    : [showLeft && "280px", "minmax(0, 1fr)", showRight && "320px"].filter(Boolean).join(" ");

  return (
    <div role="dialog" aria-label="3D Studio" style={{ position: "fixed", inset: 0, zIndex: 1000, background: C.bg, color: C.text, fontFamily: sans, display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gridTemplateColumns: "minmax(0, 1fr)", fontSize: 12 }}>
      <Toolbar engine={engine} editor={editor} bump={bump} onClose={onClose} capture={capture} exportGlb={exportGlb} narrow={narrow}
        toggleLeft={() => setShowLeft((v) => !v)} toggleRight={() => setShowRight((v) => !v)} showLeft={showLeft} showRight={showRight} />

      <div style={{ display: "grid", gridTemplateColumns: gridCols, minHeight: 0, position: "relative" }}>
        {(showLeft || narrow) && (
          <aside style={narrow ? drawer("left", showLeft) : { borderRight: `1px solid ${C.line}`, background: C.panel, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {editor && <Outliner engine={engine} editor={editor} modelV={modelV} bump={bump} />}
          </aside>
        )}

        <main style={{ position: "relative", minWidth: 0, minHeight: 0, background: "#000" }}>
          <div ref={hostRef} style={{ position: "absolute", inset: 0, cursor: cursorFor(editor?.tool) }} />
          <div style={{ position: "absolute", top: 10, left: 12, right: 150, pointerEvents: "none", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ ...chip, background: C.accent, color: C.accentInk }}>{TOOLS.find((t) => t.id === (editor?.tool || "select"))?.label}</span>
            {!narrow && <span style={{ ...chip, background: "rgba(15,17,21,0.72)", color: C.soft, fontFamily: sans, fontWeight: 500, letterSpacing: 0, textTransform: "none" }}>{TOOL_HINT[editor?.tool || "select"]}</span>}
            {editor?.isolated && <span style={{ ...chip, background: C.danger, color: "#fff" }}>Isolated · press I to exit</span>}
          </div>
          {busy && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.35)", fontWeight: 600 }}>{busy}</div>}
          {!editor && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.soft }}>Opening the studio…</div>}
        </main>

        {(showRight || narrow) && (
          <aside style={narrow ? drawer("right", showRight) : { borderLeft: `1px solid ${C.line}`, background: C.panel, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${C.line}` }}>
              {[["properties", "Properties"], ["environment", "Environment"]].map(([id, l]) => (
                <button key={id} onClick={() => setRight(id)} style={{ ...tabBtn, color: right === id ? C.text : C.dim, borderBottom: `2px solid ${right === id ? C.accent : "transparent"}` }}>{l}</button>
              ))}
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "12px 14px 24px" }}>
              {editor && right === "properties" && <Properties engine={engine} editor={editor} one={one} sel={sel} members={members} bump={bump} />}
              {right === "environment" && <EnvironmentPanel engine={engine} bump={bump} />}
            </div>
          </aside>
        )}
      </div>

      <StatusBar engine={engine} editor={editor} stats={stats} sel={sel} bump={bump} />
    </div>
  );
}

/* ---------------------------------------------------------------- toolbar */
function Toolbar({ engine, editor, bump, onClose, capture, exportGlb, toggleLeft, toggleRight, showLeft, showRight, narrow }) {
  const [section, setSection] = useState(engine.section?.mode || "off");
  const [at, setAt] = useState(engine.section?.at || 0);
  const env = engine.structure?.env;
  const range = useMemo(() => {
    if (!env) return [0, 1];
    if (section === "plan") return [env.ffl + 0.3, env.plateY + 1.5];
    if (section === "long") return [-env.w / 2, env.w / 2];
    if (section === "cross") return [-env.l / 2, env.l / 2];
    return [0, 1];
  }, [env, section]);
  const doSection = (m) => {
    const v = m === "plan" ? (env?.ffl ?? 0.15) + 1.2 : 0;
    setSection(m); setAt(v); engine.setSection(m, v);
  };
  const tool = editor?.tool || "select";
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: `1px solid ${C.line}`, background: C.panel, flexWrap: narrow ? "nowrap" : "wrap", overflowX: narrow ? "auto" : "visible", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4, flexShrink: 0, position: narrow ? "sticky" : "static", left: 0, background: C.panel, zIndex: 1, paddingRight: narrow ? 6 : 0 }}>
        <span style={{ width: 22, height: 22, borderRadius: 5, background: C.accent, display: "grid", placeItems: "center", color: C.accentInk, fontWeight: 800, fontSize: 11 }}>3D</span>
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>Studio</span>
        {narrow && <button onClick={onClose} style={{ ...ghostBtn, background: C.accent, color: C.accentInk, borderColor: C.accent, fontWeight: 700, padding: "5px 9px" }}>Done</button>}
      </div>
      <IconBtn title={showLeft ? "Hide outliner" : "Show outliner"} on={showLeft} onClick={toggleLeft} path="M3 4h18v16H3zM9 4v16" />
      <Sep />
      <div role="group" aria-label="Tools" style={seg}>
        {TOOLS.map((t) => (
          <button key={t.id} title={`${t.label} (${t.key})`} aria-pressed={tool === t.id} onClick={() => editor?.setTool(t.id)}
            style={{ ...segItem, background: tool === t.id ? C.accent : "transparent", color: tool === t.id ? C.accentInk : C.soft }}>
            <Icon path={t.icon} />{!narrow && <span>{t.label}</span>}
          </button>
        ))}
      </div>
      <IconBtn title="Undo (Ctrl+Z)" disabled={!editor?.undoStack.length} onClick={() => editor?.undo()} path="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
      <IconBtn title="Redo (Ctrl+Y)" disabled={!editor?.redoStack.length} onClick={() => editor?.redo()} path="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
      <Sep />
      <div role="group" aria-label="View" style={seg}>
        {VIEWS.map(([id, l, key]) => (
          <button key={id} title={`${l} (${key})`} aria-pressed={engine.view === id}
            onClick={() => { id === "persp" ? engine.setView("persp", { keep: true }) : engine.setView(id); bump(); }}
            style={{ ...segItem, background: engine.view === id ? C.panel2 : "transparent", color: engine.view === id ? C.text : C.soft }}>{l}</button>
        ))}
        <button title="Whole building" onClick={() => { engine.home(); bump(); }} style={{ ...segItem, color: C.soft }}>⟲</button>
      </div>
      <div role="group" aria-label="Display style" style={seg}>
        {STYLES.map(([id, l]) => (
          <button key={id} aria-pressed={engine.style === id} onClick={() => { engine.setStyle(id); bump(); }}
            style={{ ...segItem, background: engine.style === id ? C.panel2 : "transparent", color: engine.style === id ? C.text : C.soft }}>{l}</button>
        ))}
        <button aria-pressed={engine.viewMode === "structural"} title="See the frame through the skin"
          onClick={() => { engine.setViewMode(engine.viewMode === "structural" ? "finished" : "structural"); bump(); }}
          style={{ ...segItem, background: engine.viewMode === "structural" ? C.panel2 : "transparent", color: engine.viewMode === "structural" ? C.text : C.soft }}>X-ray</button>
      </div>
      <div style={{ ...seg, alignItems: "center", padding: "0 6px", gap: 6 }}>
        <span style={{ color: C.dim, fontFamily: mono, fontSize: 10, letterSpacing: "0.1em" }}>SECTION</span>
        <select value={section} onChange={(e) => doSection(e.target.value)} style={selectSt}>
          <option value="off">Off</option><option value="plan">Plan cut</option><option value="long">Long</option><option value="cross">Cross</option>
        </select>
        {section !== "off" && (
          <input type="range" min={range[0]} max={range[1]} step={0.01} value={at} aria-label="Section position"
            onChange={(e) => { setAt(+e.target.value); engine.setSection(section, +e.target.value); }} style={{ width: 110, accentColor: C.accent }} />
        )}
      </div>
      {!narrow && <div style={{ flex: 1 }} />}
      <button onClick={() => capture(false)} title="Save a 2× resolution render of this view" style={ghostBtn}><Icon path="M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />{narrow ? "" : " Render PNG"}</button>
      <button onClick={exportGlb} disabled={!editor} title="The whole model as GLB — opens in Blender, SketchUp, Rhino" style={ghostBtn}><Icon path="M12 3v12M7 10l5 5 5-5M4 21h16" />{narrow ? "" : " Export GLB"}</button>
      <IconBtn title={showRight ? "Hide panel" : "Show panel"} on={showRight} onClick={toggleRight} path="M3 4h18v16H3zM15 4v16" />
      {!narrow && <button onClick={onClose} style={{ ...ghostBtn, background: C.accent, color: C.accentInk, borderColor: C.accent, fontWeight: 700 }} title="Back to the app (Esc)">Done</button>}
    </header>
  );
}

/* --------------------------------------------------------------- outliner */
function Outliner({ engine, editor, modelV, bump }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [more, setMore] = useState({});
  const members = engine.structure?.members || [];

  const tree = useMemo(() => {
    const bySys = new Map();
    for (const m of members) {
      if (!engine.memberHits?.get(m.id)) continue;           // quantities-only pieces aren't drawn
      let s = bySys.get(m.sys);
      if (!s) { s = { sys: m.sys, label: SYSTEMS[m.sys]?.label || m.sys, order: SYSTEMS[m.sys]?.order ?? 99, hosts: new Map(), n: 0 }; bySys.set(m.sys, s); }
      const host = m.host || "Other";
      let h = s.hosts.get(host);
      if (!h) { h = { host, ids: [] }; s.hosts.set(host, h); }
      h.ids.push(m.id); s.n++;
    }
    return [...bySys.values()].sort((a, b) => a.order - b.order);
  }, [members, modelV]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return null;
    const out = [];
    for (const m of members) {
      if (!engine.memberHits?.get(m.id)) continue;
      if (`${m.name} ${m.profile} ${m.mark} ${m.host}`.toLowerCase().includes(query)) { out.push(m.id); if (out.length >= 400) break; }
    }
    return out;
  }, [query, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key) => setOpen((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const lv = engine.layerVisible || {};
  const selSet = new Set(editor.selection);
  const pick = (ids, e) => editor.select(ids, { add: e.shiftKey, toggle: e.ctrlKey || e.metaKey });

  return (
    <>
      <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={panelTitle}>Outliner</span>
          <span style={{ color: C.dim, fontFamily: mono, fontSize: 10 }}>{fmtInt(members.length)} pieces</span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find — stud, M12, lintel, W03…" style={inputSt} aria-label="Search pieces" />
        {matches && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: C.dim }}>
            <span>{matches.length >= 400 ? "400+" : matches.length} found</span>
            {matches.length > 0 && <button onClick={() => editor.select(matches)} style={linkBtn}>Select all found</button>}
          </div>
        )}
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0 20px" }} role="tree" aria-label="Model">
        {matches ? matches.slice(0, 400).map((id) => (
          <PieceRow key={id} m={members[id]} selected={selSet.has(id)} hidden={editor.hidden.has(id)} depth={0}
            onClick={(e) => pick([id], e)} onDouble={() => { editor.select([id]); engine.frameSelection(); }} />
        )) : tree.map((s) => {
          const sk = `s:${s.sys}`, on = lv[s.sys] !== false;
          return (
            <div key={s.sys} role="treeitem" aria-expanded={open.has(sk)}>
              <Row depth={0} open={open.has(sk)} onToggle={() => toggle(sk)} label={s.label} count={s.n} strong
                eye={on} onEye={() => { engine.setLayerVisible(s.sys, !on); bump(); }}
                onClick={(e) => pick([...s.hosts.values()].flatMap((h) => h.ids), e)} />
              {open.has(sk) && [...s.hosts.values()].map((h) => {
                const hk = `h:${s.sys}:${h.host}`;
                const allHidden = h.ids.every((id) => editor.hidden.has(id));
                const allSel = h.ids.length && h.ids.every((id) => selSet.has(id));
                const shown = more[hk] || 120;
                return (
                  <div key={hk}>
                    <Row depth={1} open={open.has(hk)} onToggle={() => toggle(hk)} label={h.host} count={h.ids.length} selected={allSel}
                      eye={!allHidden} onEye={() => (allHidden ? editor.unhide(h.ids) : editor.hide(h.ids))}
                      onClick={(e) => pick(h.ids, e)} onDouble={() => engine.frameMembers(h.ids)} />
                    {open.has(hk) && h.ids.slice(0, shown).map((id) => (
                      <PieceRow key={id} m={members[id]} depth={2} selected={selSet.has(id)} hidden={editor.hidden.has(id)}
                        onClick={(e) => pick([id], e)} onDouble={() => { editor.select([id]); engine.frameSelection(); }}
                        onEye={() => (editor.hidden.has(id) ? editor.unhide([id]) : editor.hide([id]))} />
                    ))}
                    {open.has(hk) && h.ids.length > shown && (
                      <button onClick={() => setMore((o) => ({ ...o, [hk]: shown + 400 }))} style={{ ...linkBtn, paddingLeft: 56, margin: "4px 0" }}>
                        Show {Math.min(400, h.ids.length - shown)} more of {fmtInt(h.ids.length - shown)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Row({ depth, open, onToggle, label, count, eye, onEye, onClick, onDouble, selected, strong }) {
  return (
    <div onClick={onClick} onDoubleClick={onDouble}
      style={{ display: "flex", alignItems: "center", gap: 4, padding: `3px 8px 3px ${8 + depth * 14}px`, cursor: "pointer", background: selected ? "rgba(245,197,24,0.14)" : "transparent", color: eye === false ? C.dim : C.text, userSelect: "none" }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = C.panel2; }} onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} aria-label={open ? "Collapse" : "Expand"} style={{ ...bare, width: 14, color: C.dim }}>{open ? "▾" : "▸"}</button>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{fmtInt(count)}</span>
      {onEye && <EyeBtn on={eye} onClick={(e) => { e.stopPropagation(); onEye(); }} />}
    </div>
  );
}

function PieceRow({ m, depth, selected, hidden, onClick, onDouble, onEye }) {
  if (!m) return null;
  return (
    <div onClick={onClick} onDoubleClick={onDouble} title={`${m.name} · ${m.profile}`}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: `2px 8px 2px ${22 + depth * 14}px`, cursor: "pointer", background: selected ? "rgba(245,197,24,0.18)" : "transparent", color: hidden ? C.dim : C.soft, userSelect: "none" }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: selected ? C.accent : C.dim, minWidth: 54 }}>{m.mark}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
      {onEye && <EyeBtn on={!hidden} onClick={(e) => { e.stopPropagation(); onEye(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------- properties */
function Properties({ engine, editor, one, sel, members, bump }) {
  if (editor.tool === "measure") return <MeasurePanel editor={editor} />;
  if (!sel.length) {
    return (
      <div>
        <div style={panelTitle}>Nothing selected</div>
        <p style={{ color: C.soft, lineHeight: 1.55, marginTop: 8 }}>
          Click any piece in the model or the outliner. Every stud, bolt, brick, sheet, tile, pipe, plant and chair is its own object you can move, resize, recolour, hide or measure.
        </p>
        <Section title="Model">
          <KV k="Pieces" v={fmtInt(members.length)} />
          <KV k="Your edits" v={fmtInt(editor.editCount)} />
          <KV k="Hidden" v={fmtInt(editor.hidden.size)} />
        </Section>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <button style={ghostBtn} disabled={!editor.hidden.size} onClick={() => editor.unhideAll()}>Unhide all</button>
          <button style={ghostBtn} disabled={!editor.editCount} onClick={() => editor.exportEdits("model-edits.json")}>Save edits (JSON)</button>
        </div>
        <Shortcuts />
      </div>
    );
  }
  if (one) return <OnePiece key={one.id} engine={engine} editor={editor} m={one} bump={bump} />;
  // many
  const byName = new Map();
  let lm = 0;
  for (const id of sel) { const m = members[id]; if (!m) continue; byName.set(m.name, (byName.get(m.name) || 0) + 1); if (m.unit === "lm") lm += m.len; }
  return (
    <div>
      <div style={panelTitle}>{fmtInt(sel.length)} pieces selected</div>
      <Section title="What's in it">
        {[...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => <KV key={n} k={n} v={fmtInt(c)} />)}
        {byName.size > 10 && <div style={{ color: C.dim, marginTop: 4 }}>+ {byName.size - 10} more kinds</div>}
        {lm > 0 && <KV k="Total length" v={`${(lm).toFixed(1)} m`} />}
      </Section>
      <Actions engine={engine} editor={editor} />
      <PaintRow editor={editor} />
    </div>
  );
}

function OnePiece({ engine, editor, m, bump }) {
  const tr = editor.getTransform(m.id);
  const edited = editor.edits.get(m.mark);
  const set = (k, i, v) => {
    const cur = editor.getTransform(m.id);
    const next = [...cur[k]];
    next[i] = k === "rotation" ? v : v / 1000;
    editor.setTransform(m.id, { [k]: next });
    bump();
  };
  const same = (engine.structure?.members || []).filter((x) => x.profile === m.profile && x.name === m.name).length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{m.name}</div>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.accent }}>{m.mark}</span>
      </div>
      <div style={{ color: C.soft, marginTop: 3 }}>{m.profile}</div>
      <Section title="Where">
        <KV k="Assembly" v={m.host} />
        <KV k="System" v={SYSTEMS[m.sys]?.label || m.sys} />
        <KV k="Same product in build" v={fmtInt(same)} />
        {m.unit === "lm" && <KV k="Cut length" v={`${fmtInt(mm(m.len))} mm`} />}
        {edited && <KV k="Edited" v={Object.keys(edited).filter((x) => !x.startsWith("_")).join(", ") || "—"} accent />}
      </Section>
      {tr && (
        <Section title="Transform">
          <Vec label="Position (mm)" values={tr.position.map(mm)} onSet={(i, v) => set("position", i, v)} />
          <Vec label="Rotation (°)" values={tr.rotation.map((d) => Math.round(d * 10) / 10)} onSet={(i, v) => set("rotation", i, v)} step={1} />
          <Vec label="Size L · D · W (mm)" values={tr.size.map(mm)} onSet={(i, v) => set("size", i, Math.max(1, v))} axes={["L", "D", "W"]} />
        </Section>
      )}
      <Actions engine={engine} editor={editor} one={m} />
      <PaintRow editor={editor} />
    </div>
  );
}

function Actions({ engine, editor, one }) {
  return (
    <Section title="Actions">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button style={ghostBtn} onClick={() => engine.frameSelection()}>Fly to (F)</button>
        <button style={ghostBtn} onClick={() => (editor.isolated ? editor.unisolate() : editor.isolate())}>{editor.isolated ? "Exit isolate (I)" : "Isolate (I)"}</button>
        {one && <button style={ghostBtn} onClick={() => editor.selectSame(one.id)}>Select same product</button>}
        {one && <button style={ghostBtn} onClick={() => editor.selectHost(one.host)}>Select whole assembly</button>}
        <button style={ghostBtn} onClick={() => editor.hide()}>Hide (H)</button>
        <button style={{ ...ghostBtn, color: C.danger }} onClick={() => editor.deleteSelected()}>Delete (Del)</button>
        <button style={ghostBtn} onClick={() => editor.resetSelection()}>Reset placement</button>
        <button style={ghostBtn} onClick={() => editor.paint(null)}>Reset colour</button>
      </div>
    </Section>
  );
}

function PaintRow({ editor }) {
  const [c, setC] = useState(editor.paintColor || "#f5c518");
  const choose = (hex) => { setC(hex); editor.paintColor = hex; };
  return (
    <Section title="Colour">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {SWATCHES.map((s) => (
          <button key={s} title={s} onClick={() => { choose(s); editor.paint(s); }}
            style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${c === s ? C.text : C.line}`, background: s, cursor: "pointer" }} />
        ))}
        <input type="color" value={c} onChange={(e) => choose(e.target.value)} onBlur={() => editor.paint(c)} aria-label="Custom colour" style={{ width: 30, height: 24, border: "none", background: "none", padding: 0 }} />
      </div>
      <div style={{ color: C.dim, marginTop: 6 }}>Applies to the selection. The Paint tool (P) applies it to whatever you click.</div>
    </Section>
  );
}

function MeasurePanel({ editor }) {
  const list = editor.measurements;
  return (
    <div>
      <div style={panelTitle}>Measure</div>
      <p style={{ color: C.soft, lineHeight: 1.55, marginTop: 8 }}>Click two points in the model. Points snap to the corners of the piece you click, within 150 mm.</p>
      <Section title={`Measurements (${list.length})`}>
        {!list.length && <div style={{ color: C.dim }}>None yet.</div>}
        {list.map((m, i) => (
          <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
            <div style={{ fontFamily: mono, fontSize: 13, color: C.accent }}>{fmtInt(mm(m.d))} mm</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>Δx {fmtInt(mm(m.dx))} · Δy {fmtInt(mm(m.dy))} · Δz {fmtInt(mm(m.dz))}</div>
          </div>
        ))}
      </Section>
      {list.length > 0 && <button style={{ ...ghostBtn, marginTop: 10 }} onClick={() => editor.clearMeasurements()}>Clear measurements</button>}
    </div>
  );
}

/* ------------------------------------------------------------ environment */
function EnvironmentPanel({ engine, bump }) {
  const env = engine.env;
  const S = env.state;
  const [skies, setSkies] = useState({});
  useEffect(() => { loadTextureManifest().then((m) => setSkies(m?.skies || {})); }, []);
  const set = (p) => { env.set(p); engine.requestRender(); bump(); };
  return (
    <div>
      <div style={panelTitle}>Sky & light</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
        {Object.entries(SKY_PRESETS).map(([id, P]) => (
          <button key={id} onClick={() => { env.setSkyMode(); env.applyPreset(id); engine.requestRender(); bump(); }}
            style={{ ...ghostBtn, ...(env.mode === "sky" && S.preset === id ? { background: C.accent, color: C.accentInk, borderColor: C.accent } : {}) }}>{P.label}</button>
        ))}
      </div>
      {Object.keys(skies).length > 0 && (
        <Section title="Photo skies (360°)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {Object.entries(skies).map(([id, s]) => (
              <button key={id} onClick={async () => { await env.setHdri(id); engine.requestRender(); bump(); }} title={s.label}
                style={{ ...ghostBtn, padding: 0, height: 46, overflow: "hidden", position: "relative", borderColor: env.hdri === id ? C.accent : C.line, borderWidth: env.hdri === id ? 2 : 1 }}>
                <img src={`${import.meta.env.BASE_URL || "/"}textures/${s.file}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" }} />
                <span style={{ position: "absolute", left: 4, bottom: 2, fontSize: 9, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px #000" }}>{s.label}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Sun">
        <Slider label="Height" unit="°" min={1} max={89} step={1} value={S.elevation} onChange={(v) => set({ elevation: v })} />
        <Slider label="Direction" unit="°" min={-180} max={180} step={1} value={S.azimuth} onChange={(v) => set({ azimuth: v })} />
        <Slider label="Strength" min={0} max={6} step={0.1} value={S.sun} onChange={(v) => set({ sun: v })} />
        <Slider label="Haze" min={1} max={20} step={0.5} value={S.turbidity} onChange={(v) => set({ turbidity: v })} />
      </Section>
      <Section title="Camera">
        <Slider label="Exposure" min={0.2} max={1.6} step={0.01} value={engine.renderer.toneMappingExposure} onChange={(v) => { env.setExposure(v); engine.requestRender(); bump(); }} />
        <Slider label="Lens (field of view)" unit="°" min={20} max={90} step={1} value={engine.persp.fov} onChange={(v) => { engine.setFov(v); bump(); }} />
      </Section>
      <Section title="Rendering">
        <Toggle label="Photo quality (ambient occlusion, bloom, anti-aliasing)" on={!!engine.fx} onChange={(v) => { engine.setPhotoQuality(v); bump(); }} />
        <Toggle label="Sun shadows" on={engine.sun.castShadow} onChange={(v) => set({ shadows: v })} />
        <Toggle label="Atmospheric haze" on={!!engine.scene.fog} onChange={(v) => set({ fog: v })} />
        {engine.fx ? (
          <>
            <Toggle label="Ambient occlusion" on={engine.postFx.ao} onChange={(v) => { engine.setPostFx({ ao: v }); bump(); }} />
            <Toggle label="Bloom on highlights" on={engine.postFx.bloom} onChange={(v) => { engine.setPostFx({ bloom: v }); bump(); }} />
          </>
        ) : (
          <div style={{ color: C.dim, marginTop: 6, lineHeight: 1.5 }}>This device draws without post-processing (ambient occlusion, bloom) to stay smooth.</div>
        )}
        <Toggle label="Always show screws, bolts & plates" on={!!engine._fineAlways} onChange={(v) => { engine.setFineAlways(v); bump(); }} />
        <Toggle label="Ground & trees" on={engine.siteVisible !== false} onChange={(v) => { engine.setSiteVisible(v); bump(); }} />
        <Toggle label="Distant tree-line" on={engine.site.treeline.visible} onChange={(v) => { engine.site.setTreelineVisible(v); engine.requestRender(); bump(); }} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------- status bar */
function StatusBar({ engine, editor, stats, sel, bump }) {
  const snapOn = !!editor?.snap.move;
  return (
    <footer style={{ display: "flex", alignItems: "center", gap: 14, padding: "5px 12px", borderTop: `1px solid ${C.line}`, background: C.panel, color: C.dim, fontFamily: mono, fontSize: 10.5, flexWrap: "nowrap", overflowX: "auto", whiteSpace: "nowrap", minWidth: 0 }}>
      <span>{fmtInt(stats?.pieces)} / {fmtInt(stats?.members)} pieces drawn</span>
      <span>{fmtInt(stats?.triangles)} triangles</span>
      <span>{fmtInt(stats?.calls)} draw calls</span>
      <span>{engine.quality === "high" ? "Photo quality" : "Fast quality"}</span>
      <span style={{ color: sel.length ? C.accent : C.dim }}>{sel.length ? `${fmtInt(sel.length)} selected` : "No selection"}</span>
      <div style={{ flex: 1 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={snapOn} onChange={(e) => { editor?.setSnap(e.target.checked ? { move: 0.01, rotate: 1, scale: 0.05 } : { move: 0, rotate: 0, scale: 0 }); bump(); }} style={{ accentColor: C.accent }} />
        SNAP
      </label>
      {snapOn && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>move
            <select value={editor.snap.move} onChange={(e) => { editor.setSnap({ move: +e.target.value }); bump(); }} style={{ ...selectSt, fontSize: 10.5 }}>
              {[0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.6].map((v) => <option key={v} value={v}>{mm(v)} mm</option>)}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>rotate
            <select value={editor.snap.rotate} onChange={(e) => { editor.setSnap({ rotate: +e.target.value }); bump(); }} style={{ ...selectSt, fontSize: 10.5 }}>
              {[1, 5, 15, 22.5, 45, 90].map((v) => <option key={v} value={v}>{v}°</option>)}
            </select>
          </label>
        </>
      )}
    </footer>
  );
}

function Shortcuts() {
  const rows = [["V / G / R / S", "Select · move · rotate · scale"], ["M / P", "Measure · paint"], ["F", "Fly to selection"], ["H · Alt+H", "Hide · unhide all"], ["I", "Isolate / exit"], ["Del", "Delete"], ["Ctrl+Z · Ctrl+Y", "Undo · redo"], ["1 · 3 · 7 · 0", "Front · right · plan · 3D"], ["Esc", "Back to select, clear, close"]];
  return (
    <Section title="Shortcuts">
      {rows.map(([k, v]) => <KV key={k} k={v} v={k} />)}
      <div style={{ color: C.dim, marginTop: 8, lineHeight: 1.5 }}>Navigate: drag to orbit · right-drag to pan · scroll to zoom to the cursor · click the axes, bottom right, to snap the view.</div>
    </Section>
  );
}

/* ------------------------------------------------------------ primitives */
function Section({ title, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
function KV({ k, v, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
      <span style={{ color: C.soft }}>{k}</span>
      <span style={{ fontFamily: mono, color: accent ? C.accent : C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}
function Vec({ label, values, onSet, step = 1, axes = ["X", "Y", "Z"] }) {
  const tint = ["#ff5a6e", "#8adb00", "#2c8fff"];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: C.soft, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {values.map((v, i) => <NumField key={`${i}:${v}`} axis={axes[i]} color={tint[i]} value={v} step={step} onCommit={(n) => onSet(i, n)} />)}
      </div>
    </div>
  );
}
function NumField({ axis, color, value, step, onCommit }) {
  const [txt, setTxt] = useState(String(value));
  const commit = () => { const n = parseFloat(txt); if (Number.isFinite(n) && n !== value) onCommit(n); else setTxt(String(value)); };
  return (
    <label style={{ display: "flex", alignItems: "center", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, overflow: "hidden" }}>
      <span style={{ padding: "0 5px", color, fontWeight: 700, fontSize: 10 }}>{axis}</span>
      <input value={txt} inputMode="decimal" step={step} onChange={(e) => setTxt(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTxt(String(value)); e.currentTarget.blur(); } }}
        style={{ width: "100%", minWidth: 0, background: "transparent", border: "none", color: C.text, fontFamily: mono, fontSize: 11, padding: "5px 4px", outline: "none" }} />
    </label>
  );
}
function Slider({ label, unit = "", min, max, step, value, onChange }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.soft, marginBottom: 2 }}>
        <span>{label}</span><span style={{ fontFamily: mono, color: C.text }}>{Number(value).toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: "100%", accentColor: C.accent }} />
    </label>
  );
}
function Toggle({ label, on, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", cursor: "pointer", color: C.soft }}>
      <span>{label}</span>
      <input type="checkbox" checked={!!on} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: C.accent, width: 15, height: 15 }} />
    </label>
  );
}
function EyeBtn({ on, onClick }) {
  return (
    <button onClick={onClick} aria-label={on ? "Hide" : "Show"} title={on ? "Hide" : "Show"} style={{ ...bare, width: 20, color: on ? C.soft : C.dim, opacity: on ? 0.85 : 0.6 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {on ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> : <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /></>}
      </svg>
    </button>
  );
}
function Icon({ path }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}
function IconBtn({ title, onClick, path, disabled, on }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled}
      style={{ ...bare, width: 28, height: 28, borderRadius: 6, color: disabled ? C.dim : on ? C.text : C.soft, background: on ? C.panel2 : "transparent", opacity: disabled ? 0.45 : 1 }}>
      <Icon path={path} />
    </button>
  );
}
const Sep = () => <span style={{ width: 1, height: 20, background: C.line }} />;
const cursorFor = (tool) => (tool === "measure" ? "crosshair" : tool === "paint" ? "copy" : "default");
const fileSafe = (s) => String(s || "model").replace(/[^\w-]+/g, "-");
const drawer = (side, open) => ({
  position: "absolute", top: 0, bottom: 0, [side]: 0, width: "min(320px, 86vw)", zIndex: 5, background: C.panel,
  borderLeft: side === "right" ? `1px solid ${C.line}` : "none", borderRight: side === "left" ? `1px solid ${C.line}` : "none",
  transform: open ? "none" : `translateX(${side === "left" ? "-105%" : "105%"})`, transition: "transform .18s ease",
  display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: open ? "0 10px 40px rgba(0,0,0,0.5)" : "none",
});

const bare = { border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "inline-grid", placeItems: "center", font: "inherit" };
const seg = { display: "inline-flex", flexShrink: 0, border: `1px solid ${C.line}`, borderRadius: 7, overflow: "hidden", background: C.bg };
const segItem = { border: "none", borderRight: `1px solid ${C.line}`, padding: "5px 9px", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" };
const ghostBtn = { flexShrink: 0, border: `1px solid ${C.line}`, background: C.panel2, color: C.text, borderRadius: 6, padding: "6px 10px", font: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" };
const linkBtn = { border: "none", background: "none", color: C.accent, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 600, padding: 0 };
const tabBtn = { flex: 1, border: "none", background: "none", padding: "10px 0 8px", font: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" };
const panelTitle = { fontWeight: 700, fontSize: 13 };
const inputSt = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, padding: "6px 8px", font: "inherit", fontSize: 12, outline: "none" };
const selectSt = { background: C.bg, border: "none", color: C.text, font: "inherit", fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "3px 2px" };
const chip = { fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 4, fontWeight: 700 };
