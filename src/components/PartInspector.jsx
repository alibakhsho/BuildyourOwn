/* =========================================================================
   PartInspector — the "edit parts" panel over the 3D viewport.

   Click any piece in the model to select it. Then widen the selection —
   this piece → its assembly (the whole cabinet, the whole wall frame, the
   whole window) → the whole kitchen → every piece of that kind in the house
   — and swap its material or colour. Edits are saved on the spec
   (spec.partEdits) by part id, so they persist with the project and survive
   rebuilds of the same design.
   ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { CATALOGUE, KIND_PLURAL, hex } from "../engine/parts.js";

const SCOPES = ["piece", "group", "assembly", "kind"];

function sizeOf(mesh) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const s = g.boundingBox.max.clone().sub(g.boundingBox.min);
  const dims = [s.x, s.y, s.z].map((d) => Math.round(d * 1000)).filter((d) => d > 0).sort((a, b) => b - a);
  return dims.join(" × ") + " mm";
}

export default function PartInspector({ engine, edits = {}, onEdits, onClose }) {
  const [anchor, setAnchor] = useState(null);     // the mesh that was clicked
  const [scope, setScope] = useState("piece");
  const [tick, setTick] = useState(0);            // bump when the model rebuilds

  useEffect(() => {
    if (!engine) return;
    engine.setPickMode(true);
    engine.onPick = (mesh) => setAnchor(mesh || null);
    return () => { engine.onPick = null; engine.setPickMode(false); };
  }, [engine]);

  // a rebuild replaces every mesh — drop a selection that no longer exists
  useEffect(() => {
    if (anchor && !anchor.parent) { setAnchor(null); setTick((t) => t + 1); }
  });

  const part = anchor?.userData.part;
  const scopeOk = (s) => s === "piece" || s === "kind" || (s === "group" && !!part?.group) || (s === "assembly" && !!part?.assembly);

  const selected = useMemo(() => {
    if (!engine || !part) return [];
    const s = scopeOk(scope) ? scope : "piece";
    if (s === "piece") return [anchor];
    if (s === "group") return engine.partMeshes((p) => p.group === part.group);
    if (s === "assembly") return engine.partMeshes((p) => p.assembly === part.assembly);
    return engine.partMeshes((p) => p.kind === part.kind);
  }, [engine, anchor, part, scope, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { engine?.setSelection(selected); }, [engine, selected]);

  // edits apply per category: a mixed selection (a whole cabinet) is edited
  // one category at a time — fronts, carcass, handles, benchtop
  const cats = useMemo(() => {
    const m = new Map();
    for (const s of selected) { const c = s.userData.part.cat; m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].filter(([c]) => CATALOGUE[c] && (CATALOGUE[c].presets.length || CATALOGUE[c].swatches?.length));
  }, [selected]);
  const [catPick, setCatPick] = useState(null);
  const cat = cats.find(([c]) => c === catPick)?.[0] || (cats.find(([c]) => c === part?.cat) || cats[0])?.[0];
  const targets = selected.filter((s) => s.userData.part.cat === cat);
  const current = targets.length ? edits[targets[0].userData.part.id] || {} : {};

  const apply = (change) => {
    const next = { ...edits };
    for (const t of targets) {
      const id = t.userData.part.id;
      const merged = { ...(next[id] || {}), ...change };
      if (change.preset !== undefined) delete merged.color;     // a new finish starts from its own colour
      next[id] = merged;
    }
    onEdits(next);
  };
  const reset = () => {
    const next = { ...edits };
    for (const t of targets) delete next[t.userData.part.id];
    onEdits(next);
  };
  const editedCount = targets.filter((t) => edits[t.userData.part.id]).length;

  const label = (s) => s === "piece" ? "This piece"
    : s === "group" ? (part?.groupLabel || "Assembly")
    : s === "assembly" ? (part?.assemblyLabel || "Room")
    : `All ${KIND_PLURAL[part?.kind] || part?.kind + "s"}`;

  const C = CATALOGUE[cat];
  const baseColor = (() => {
    const t = targets[0];
    if (!t) return "#cccccc";
    const m = t.userData._mat || t.material;
    return m?.color ? `#${m.color.getHexString()}` : "#cccccc";
  })();

  return (
    <div className="pi-panel" onPointerDown={(e) => e.stopPropagation()}>
      <style>{`
        .pi-panel { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 300px; z-index: 5; overflow: auto;
          background: var(--card); color: var(--ink); border: 1px solid var(--rule); border-radius: 12px;
          box-shadow: 0 18px 40px rgba(0,0,0,0.28); padding: 14px; font-size: 13px; }
        .pi-h { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--steel); margin: 14px 0 6px; font-weight: 700; }
        .pi-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; margin: 0 6px 6px 0; border-radius: 999px; cursor: pointer;
          border: 1px solid var(--rule); background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; }
        .pi-chip[aria-pressed="true"] { background: var(--accent-wash); border-color: var(--hivis); font-weight: 600; }
        .pi-chip:disabled { opacity: .35; cursor: default; }
        .pi-sw { width: 26px; height: 26px; border-radius: 7px; border: 2px solid var(--rule); cursor: pointer; margin: 0 6px 6px 0; padding: 0; }
        .pi-sw[aria-pressed="true"] { border-color: var(--hivis); box-shadow: 0 0 0 2px var(--accent-wash); }
        @media (max-width: 640px) { .pi-panel { top: auto; left: 8px; right: 8px; bottom: 8px; width: auto; max-height: 42%; padding: 10px 12px; } .pi-h { margin: 10px 0 4px; } }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Edit parts</div>
        <button className="ec-btn ec-btn-ghost" onClick={onClose} style={{ padding: "4px 10px", fontSize: 12 }}>Done</button>
      </div>

      {!part ? (
        <p style={{ color: "var(--steel)", lineHeight: 1.55, marginTop: 10 }}>
          Click any piece of the house — a stud, a lintel, a cabinet door, the benchtop — to select it.
          Drag to orbit as usual. <b>Show skeleton</b> lets you click through the walls to the frame.
        </p>
      ) : (<>
        <div style={{ marginTop: 10, fontWeight: 700, lineHeight: 1.35 }}>{part.label}</div>
        <div style={{ color: "var(--steel)", fontSize: 12, marginTop: 3 }}>{sizeOf(anchor)}</div>

        <div className="pi-h">Select</div>
        <div>
          {SCOPES.map((s) => (
            <button key={s} className="pi-chip" aria-pressed={scope === s && scopeOk(s)} disabled={!scopeOk(s)} onClick={() => setScope(s)}>
              {label(s)}
            </button>
          ))}
        </div>
        <div style={{ color: "var(--steel)", fontSize: 12 }}>{selected.length} piece{selected.length === 1 ? "" : "s"} selected</div>

        {cats.length > 1 && (<>
          <div className="pi-h">Change</div>
          <div>
            {cats.map(([c, n]) => (
              <button key={c} className="pi-chip" aria-pressed={c === cat} onClick={() => setCatPick(c)}>
                {CATALOGUE[c].label} · {n}
              </button>
            ))}
          </div>
        </>)}

        {C && (<>
          {C.presets.length > 0 && (<>
            <div className="pi-h">{C.label} — material</div>
            <div>
              {C.presets.map((p) => (
                <button key={p.id} className="pi-chip" aria-pressed={current.preset === p.id} onClick={() => apply({ preset: p.id })}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: hex(p.color), border: "1px solid var(--rule)" }} />
                  {p.label}
                </button>
              ))}
            </div>
          </>)}
          <div className="pi-h">Colour</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
            {(C.swatches || C.presets.map((p) => p.color)).map((c) => (
              <button key={c} className="pi-sw" aria-label={hex(c)} aria-pressed={current.color === c} style={{ background: hex(c) }} onClick={() => apply({ color: c })} />
            ))}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--steel)", marginBottom: 6 }}>
              <input type="color" value={current.color != null ? hex(current.color) : baseColor}
                onChange={(e) => apply({ color: parseInt(e.target.value.slice(1), 16) })}
                style={{ width: 30, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
              Custom
            </label>
          </div>
          <button className="ec-btn ec-btn-ghost" disabled={!editedCount} onClick={reset} style={{ marginTop: 10, width: "100%", justifyContent: "center", opacity: editedCount ? 1 : 0.5 }}>
            Reset {editedCount ? `${editedCount} edited` : "to original"}
          </button>
        </>)}
        {!C && <p style={{ color: "var(--steel)", marginTop: 12 }}>This piece has no finish options yet.</p>}
      </>)}
    </div>
  );
}
