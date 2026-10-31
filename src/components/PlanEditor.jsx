/* =========================================================================
   PlanEditor — try different layouts for the house, on the 3D page.

     Layout ideas   one click each: balanced, living at the front, living to
                    the yard, side by side — and mirror left ↔ right
     By hand        drag a room to move it, drag its edges to resize it,
                    drop it on another room to swap the two; whatever is left
                    becomes hallway, so walls and doors still form
     Room panel     name, type, size, storey; add and remove rooms
     Saved layouts  keep the options you like with their price, compare,
                    switch between them

   Everything writes to the spec: spec.plan (positions) and the rooms',
   bathrooms' and kitchens' own sizes, so the 3D model, drawings, cut list
   and estimate all follow. Logic: house-geometry.js (layoutFloors).
   ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { colors as T } from "../design/system.js";
import { layoutFloors, PLAN_VARIANTS, planSpec, roomKey, freeRects } from "../logic/house-geometry.js";
import { nextId } from "../lib/ids.js";

const TYPE_TONE = {
  Bedroom: "#c9d6ea", Living: "#f1dfb8", Dining: "#efe2c3", Kitchen: "#f3d2b3", Bathroom: "#bfe0e4", Laundry: "#d3e6cf",
  Study: "#e1d6ef", Media: "#e8cfd8", Other: "#e4e4e4", Garage: "#d8d8d8",
};
const ROOM_TYPES = ["Bedroom", "Living", "Dining", "Study", "Media", "Laundry", "Other"];
const SNAP = 0.1, MAGNET = 0.25, MIN = 1.2;
const r1 = (v) => Math.round(v * 10) / 10;
const snapTo = (v) => Math.round(v / SNAP) * SNAP;

export default function PlanEditor({ spec, setSpec, currency = "$", total = null, onShow3D }) {
  const L = useMemo(() => layoutFloors(spec), [spec]);
  const P = planSpec(spec);
  const [floor, setFloor] = useState(0);
  const [sel, setSel] = useState(null);         // room key
  const [drag, setDrag] = useState(null);       // { key, mode, start:{x,z}, orig:{x,z,w,l}, cur:{…} }
  const [note, setNote] = useState("");
  const [hist, setHist] = useState({ undo: [], redo: [] });
  const svgRef = useRef(null);
  const plate = L.plate;
  const fl = L.floors[Math.min(floor, L.floors.length - 1)];
  const floors = L.floors.length;
  useEffect(() => { if (floor >= floors) setFloor(0); }, [floors, floor]);

  // rooms on this storey, in plate coordinates (0,0 = back-left corner of the floor)
  const rooms = fl.cells.filter((c) => !c.item.circulation).map((c) => ({ key: roomKey(c.item), item: c.item, x: c.x - plate.x, z: c.z - plate.z, w: c.w, l: c.l, unplaced: !!c.unplaced }));
  const halls = fl.cells.filter((c) => c.item.circulation && c.item.type !== "Stair");
  const stairs = fl.cells.filter((c) => c.item.type === "Stair");
  const shown = drag ? rooms.map((r) => (r.key === drag.key ? { ...r, ...drag.cur } : r)) : rooms;
  const selected = shown.find((r) => r.key === sel) || null;

  /* ---------- writing to the spec ---------- */
  const snapshot = (sp) => ({ plan: sp.plan, rooms: sp.rooms, bathrooms: sp.bathrooms, kitchens: sp.kitchens });
  // one user action = one spec change = one undo step
  const change = (fn, msg = "") => {
    let next = fn(spec);
    if (next === spec) return;
    // rooms that came in with fixed positions (a plan import) hand over to the editable plan
    if (next.plan?.mode === "custom" && (next.rooms || []).some((r) => r.x != null || r.z != null)) {
      next = { ...next, rooms: next.rooms.map(({ x, z, level, ...r }) => r) };   // eslint-disable-line no-unused-vars
    }
    setHist((h) => ({ undo: [...h.undo.slice(-40), snapshot(spec)], redo: [] }));
    setSpec(next);
    setNote(msg);
  };
  const undo = () => {
    if (!hist.undo.length) return;
    const prev = hist.undo[hist.undo.length - 1];
    setHist({ undo: hist.undo.slice(0, -1), redo: [...hist.redo, snapshot(spec)] });
    setSpec({ ...spec, ...prev });
    setNote("Undone.");
  };
  const redo = () => {
    if (!hist.redo.length) return;
    const nxt = hist.redo[hist.redo.length - 1];
    setHist({ undo: [...hist.undo, snapshot(spec)], redo: hist.redo.slice(0, -1) });
    setSpec({ ...spec, ...nxt });
    setNote("Redone.");
  };

  /* The whole current layout as hand-placed cells (switching to "by hand" keeps what you see). */
  const frozenCells = () => {
    const cells = {};
    L.floors.forEach((F, f) => F.cells.forEach((c) => {
      if (c.item.circulation) return;
      cells[roomKey(c.item)] = { x: r1(c.x - plate.x), z: r1(c.z - plate.z), w: +c.w.toFixed(2), l: +c.l.toFixed(2), level: f };
    }));
    return cells;
  };
  /* Put rooms' new rectangles into the plan and their sizes into the rooms themselves. */
  const placeRooms = (updates, msg) => change((sp) => {
    const base = planSpec(sp).mode === "custom" ? { ...(sp.plan?.cells || {}) } : frozenCells();
    let next = { ...sp };
    for (const u of updates) {
      base[u.key] = { ...(base[u.key] || {}), x: r1(u.x), z: r1(u.z), w: +u.w.toFixed(2), l: +u.l.toFixed(2), level: u.level ?? base[u.key]?.level ?? floor };
      next = withSize(next, u.item, u.w, u.l);
    }
    return { ...next, plan: { ...(sp.plan || {}), mode: "custom", cells: base } };
  }, msg);

  /* ---------- pointer: move / resize ---------- */
  const toPlan = (e) => {
    const svg = svgRef.current, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x - plate.x, z: p.y - plate.z };
  };
  const startDrag = (e, r, mode) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSel(r.key);
    setDrag({ key: r.key, mode, start: toPlan(e), orig: { x: r.x, z: r.z, w: r.w, l: r.l }, cur: { x: r.x, z: r.z, w: r.w, l: r.l }, item: r.item });
  };
  const magnet = (v, targets) => { for (const t of targets) if (Math.abs(v - t) <= MAGNET) return t; return snapTo(v); };
  const onMove = (e) => {
    if (!drag) return;
    const p = toPlan(e), dx = p.x - drag.start.x, dz = p.z - drag.start.z, o = drag.orig;
    const others = rooms.filter((r) => r.key !== drag.key);
    const ex = [0, plate.w, ...others.flatMap((r) => [r.x, r.x + r.w])], ez = [0, plate.l, ...others.flatMap((r) => [r.z, r.z + r.l])];
    let { x, z, w, l } = o;
    if (drag.mode === "move") {
      x = o.x + dx; z = o.z + dz;
      // the nearer edge snaps to walls and other rooms
      const sx = magnet(x, ex), sx2 = magnet(x + w, ex) - w; x = Math.abs(sx - x) <= Math.abs(sx2 - x) ? sx : sx2;
      const sz = magnet(z, ez), sz2 = magnet(z + l, ez) - l; z = Math.abs(sz - z) <= Math.abs(sz2 - z) ? sz : sz2;
      x = Math.max(0, Math.min(plate.w - w, x)); z = Math.max(0, Math.min(plate.l - l, z));
    } else {
      if (drag.mode.includes("e")) w = Math.max(MIN, Math.min(plate.w - o.x, magnet(o.x + o.w + dx, ex) - o.x));
      if (drag.mode.includes("w")) { const nx = Math.max(0, Math.min(o.x + o.w - MIN, magnet(o.x + dx, ex))); w = o.w + (o.x - nx); x = nx; }
      if (drag.mode.includes("s")) l = Math.max(MIN, Math.min(plate.l - o.z, magnet(o.z + o.l + dz, ez) - o.z));
      if (drag.mode.includes("n")) { const nz = Math.max(0, Math.min(o.z + o.l - MIN, magnet(o.z + dz, ez))); l = o.l + (o.z - nz); z = nz; }
    }
    setDrag({ ...drag, cur: { x, z, w, l }, over: drag.mode === "move" ? others.find((r) => p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.l) : null });
  };
  const onUp = () => {
    if (!drag) return;
    const d = drag; setDrag(null);
    const c = d.cur, o = d.orig;
    if (Math.abs(c.x - o.x) < 0.01 && Math.abs(c.z - o.z) < 0.01 && Math.abs(c.w - o.w) < 0.01 && Math.abs(c.l - o.l) < 0.01 && !d.over) return;
    const me = rooms.find((r) => r.key === d.key);
    if (d.mode === "move" && d.over) {
      // dropped on another room: the two swap places (each takes the other's spot and size)
      const B = d.over;
      placeRooms([{ key: me.key, item: me.item, x: B.x, z: B.z, w: B.w, l: B.l }, { key: B.key, item: B.item, x: o.x, z: o.z, w: o.w, l: o.l }],
        `Swapped ${me.item.name} and ${B.item.name}: each took the other's space, so ${me.item.name} is now ${B.w.toFixed(1)} × ${B.l.toFixed(1)} m and ${B.item.name} ${o.w.toFixed(1)} × ${o.l.toFixed(1)} m. Drag their edges to adjust.`);
      return;
    }
    const clash = rooms.find((r) => r.key !== d.key && c.x < r.x + r.w - 0.02 && c.x + c.w > r.x + 0.02 && c.z < r.z + r.l - 0.02 && c.z + c.l > r.z + 0.02);
    if (clash) { setNote(`${me.item.name} would overlap ${clash.item.name} — drop it on a room to swap, or make room first.`); return; }
    placeRooms([{ key: me.key, item: me.item, ...c }], d.mode === "move" ? `Moved ${me.item.name}.` : `${me.item.name} is now ${c.w.toFixed(1)} × ${c.l.toFixed(1)} m.`);
  };

  /* ---------- room panel actions ---------- */
  const setSize = (w, l) => {
    if (!selected) return;
    w = Math.max(MIN, Math.min(plate.w - selected.x, w)); l = Math.max(MIN, Math.min(plate.l - selected.z, l));
    const clash = rooms.find((r) => r.key !== selected.key && selected.x < r.x + r.w - 0.02 && selected.x + w > r.x + 0.02 && selected.z < r.z + r.l - 0.02 && selected.z + l > r.z + 0.02);
    if (clash) { setNote(`That would overlap ${clash.item.name}.`); return; }
    placeRooms([{ key: selected.key, item: selected.item, x: selected.x, z: selected.z, w, l }], `${selected.item.name} is now ${w.toFixed(1)} × ${l.toFixed(1)} m.`);
  };
  const rotate = () => selected && setSize(selected.l, selected.w);
  const moveToFloor = (f) => {
    if (!selected) return;
    const target = L.floors[f];
    const taken = target.cells.filter((c) => !c.item.circulation && c.item.type !== "Stair").map((c) => ({ ...c, x: c.x, z: c.z }));
    const spot = freeRects(plate, taken).filter((r) => r.w >= Math.min(selected.w, selected.l) && r.l >= Math.min(selected.w, selected.l)).sort((a, b) => b.w * b.l - a.w * a.l)[0];
    if (!spot) { setNote(`No free space for ${selected.item.name} on that floor — make room there first.`); return; }
    const fits = spot.w >= selected.w && spot.l >= selected.l;
    const [w, l] = fits ? [selected.w, selected.l] : [selected.l, selected.w];
    placeRooms([{ key: selected.key, item: selected.item, x: spot.x - plate.x, z: spot.z - plate.z, w: Math.min(w, spot.w), l: Math.min(l, spot.l), level: f }], `Moved ${selected.item.name} to the ${f === 0 ? "ground" : "first"} floor.`);
    setFloor(f);
  };
  const renameRoom = (name) => selected && change((sp) => editSource(sp, selected.item, { name, label: name }));
  const retype = (type) => selected && change((sp) => editSource(sp, selected.item, { type }));
  const removeRoom = () => {
    if (!selected) return;
    const it = selected.item;
    change((sp) => {
      const drop = (list) => (list || []).filter((x) => String(x.id ?? "") !== String(it.id ?? "\u0000"));
      const next = it.type === "Bathroom" ? { ...sp, bathrooms: drop(sp.bathrooms) } : it.type === "Kitchen" ? { ...sp, kitchens: drop(sp.kitchens) } : { ...sp, rooms: drop(sp.rooms) };
      if (next.plan?.cells) { const cells = { ...next.plan.cells }; delete cells[selected.key]; next.plan = { ...next.plan, cells }; }
      return next;
    }, `Removed ${it.name}.`);
    setSel(null);
  };
  const addRoom = (type) => {
    // into the biggest stretch of hallway on this floor
    const taken = fl.cells.filter((c) => !c.item.circulation && c.item.type !== "Stair");
    const spot = freeRects(plate, taken).sort((a, b) => b.w * b.l - a.w * a.l)[0];
    const want = type === "Bedroom" ? [3.4, 3.1] : type === "Study" ? [3, 2.8] : type === "Laundry" ? [2.2, 2] : type === "Bathroom" ? [2.6, 2.2] : [3.5, 3.2];
    if (!spot || spot.w < MIN || spot.l < MIN) { setNote("No hallway left to put a room in — shrink or move a room first."); return; }
    const w = Math.min(want[0], spot.w), l = Math.min(want[1], spot.l);
    // ids are a per-session counter: skip any a saved project already uses
    const used = new Set([...(spec.rooms || []), ...(spec.bathrooms || []), ...(spec.kitchens || [])].map((x) => String(x.id)));
    let id = nextId();
    while (used.has(String(id))) id = nextId();
    const count = (spec.rooms || []).filter((r) => r.type === type).length + (type === "Bathroom" ? (spec.bathrooms || []).length : 0);
    const name = type === "Bedroom" ? `Bedroom ${count + 1}` : type === "Bathroom" ? `Bathroom ${count + 1}` : type;
    change((sp) => {
      const base = planSpec(sp).mode === "custom" ? { ...(sp.plan?.cells || {}) } : frozenCells();
      base[String(id)] = { x: r1(spot.x - plate.x), z: r1(spot.z - plate.z), w, l, level: floor };
      const next = type === "Bathroom"
        ? { ...sp, bathrooms: [...(sp.bathrooms || []), { id, label: name, widthM: w, lengthM: l, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false }] }
        : { ...sp, rooms: [...(sp.rooms || []), { id, name, type, widthM: w, lengthM: l, floorFinish: type === "Laundry" ? "tile" : type === "Bedroom" ? "carpet" : "timber", robe: type === "Bedroom" ? "built_in" : "none", robeLengthM: type === "Bedroom" ? 1.8 : 0 }] };
      return { ...next, plan: { ...(sp.plan || {}), mode: "custom", cells: base } };
    }, `Added ${name} — drag it where you want it.`);
    setSel(String(id));
  };

  /* ---------- layout ideas & saved layouts ---------- */
  const useIdea = (id) => change((sp) => ({ ...sp, plan: { ...(sp.plan || {}), mode: "auto", variant: id } }), `Layout: ${PLAN_VARIANTS.find((v) => v.id === id)?.label}.`);
  const toggleMirror = () => change((sp) => {
    const p = planSpec(sp);
    if (p.mode === "custom") {
      const cells = {};
      for (const [k, c] of Object.entries(p.cells)) cells[k] = { ...c, x: r1(plate.w - (+c.x || 0) - (+c.w || 0)) };
      return { ...sp, plan: { ...(sp.plan || {}), cells } };
    }
    return { ...sp, plan: { ...(sp.plan || {}), mirror: !p.mirror } };
  }, "Mirrored the plan.");
  const options = spec.planOptions || [];
  const saveOption = () => {
    const name = `Layout ${String.fromCharCode(65 + options.length % 26)}`;
    change((sp) => ({ ...sp, planOptions: [...(sp.planOptions || []), { id: nextId(), name, ...snapshot(sp), total, savedAt: Date.now() }] }), `Saved as ${name}.`);
  };
  const loadOption = (o) => change((sp) => ({ ...sp, plan: o.plan, rooms: o.rooms, bathrooms: o.bathrooms, kitchens: o.kitchens }), `Switched to ${o.name}.`);
  const dropOption = (o) => change((sp) => ({ ...sp, planOptions: (sp.planOptions || []).filter((x) => x.id !== o.id) }));

  /* ---------- drawing ---------- */
  const pad = 1.6;
  const vb = `${plate.x - pad} ${plate.z - pad} ${plate.w + 2 * pad + (stairs.length ? stairs[0].w : 0)} ${plate.l + 2 * pad}`;
  const fs = Math.max(0.28, Math.min(0.42, plate.w / 34));
  const unplaced = rooms.filter((r) => r.unplaced);

  return (
    <div className="ec-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ maxWidth: 620 }}>
          <div className="ec-eyebrow">Floor plan</div>
          <div style={{ fontSize: 13, color: T.steel, marginTop: 4, lineHeight: 1.5 }}>
            Try a layout idea, or arrange it yourself: <b>drag</b> a room to move it, <b>drag its edges</b> to resize it, <b>drop it on another room</b> to swap them. Hallway fills whatever is left. The 3D model, drawings and price update as you go.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button className="ec-btn ec-btn-ghost" onClick={undo} disabled={!hist.undo.length} title="Undo">↶ Undo</button>
          <button className="ec-btn ec-btn-ghost" onClick={redo} disabled={!hist.redo.length} title="Redo">↷ Redo</button>
          {onShow3D && <button className="ec-btn ec-btn-ghost" onClick={onShow3D}>See it in 3D ↑</button>}
        </div>
      </div>

      {/* layout ideas */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch", marginBottom: 12 }}>
        {PLAN_VARIANTS.map((v, i) => {
          const on = P.mode === "auto" && P.variant === i;
          return (
            <button key={v.id} onClick={() => useIdea(v.id)} title={v.note}
              style={{ textAlign: "left", padding: "8px 12px", borderRadius: 10, cursor: "pointer", font: "inherit", border: `1px solid ${on ? T.hivis : T.rule}`, background: on ? T.hivis : "transparent", color: on ? T.onHivis : T.ink, minWidth: 140, flex: "1 1 140px" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{v.label}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2, lineHeight: 1.3 }}>{v.note}</div>
            </button>
          );
        })}
        <button onClick={toggleMirror} title="Flip the plan left ↔ right"
          style={{ padding: "8px 12px", borderRadius: 10, cursor: "pointer", font: "inherit", border: `1px solid ${P.mirror ? T.hivis : T.rule}`, background: "transparent", color: T.ink, fontWeight: 700, fontSize: 13 }}>⇋ Mirror</button>
      </div>
      {P.mode === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, background: T.accentWash, border: `1px solid ${T.rule}`, fontSize: 12.5, marginBottom: 12 }}>
          <b>Your own layout.</b><span style={{ color: T.steel }}>Pick a layout idea above to go back to an automatic one.</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 280px)", gap: 16 }} className="plan-grid">
        <div>
          {floors > 1 && (
            <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {L.floors.map((F, f) => (
                <button key={f} role="tab" aria-selected={floor === f} onClick={() => { setFloor(f); setSel(null); }} className={"ec-btn " + (floor === f ? "ec-btn-hivis" : "ec-btn-ghost")} style={{ fontSize: 12 }}>
                  {f === 0 ? "Ground floor" : f === 1 ? "First floor" : `Level ${f + 1}`}
                </button>
              ))}
            </div>
          )}
          <svg ref={svgRef} viewBox={vb} style={{ width: "100%", maxHeight: 560, background: T.paperLight, border: `1px solid ${T.rule}`, borderRadius: 10, touchAction: "none", userSelect: "none" }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerDown={() => setSel(null)} role="application" aria-label="Floor plan editor">
            <defs>
              <pattern id="hallHatch" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="0.3" stroke={T.rule} strokeWidth="0.04" />
              </pattern>
            </defs>
            <text x={plate.x + plate.w / 2} y={plate.z - 0.7} textAnchor="middle" fontSize={fs} fill={T.steel}>BACK YARD</text>
            <text x={plate.x + plate.w / 2} y={plate.z + plate.l + 1.1} textAnchor="middle" fontSize={fs} fill={T.steel}>FRONT · STREET</text>
            {/* external walls */}
            <rect x={plate.x - 0.25} y={plate.z - 0.25} width={plate.w + 0.5 + (stairs[0]?.w || 0)} height={plate.l + 0.5} fill="none" stroke={T.ink} strokeWidth="0.25" />
            {halls.map((c, i) => (
              <g key={`h${i}`}>
                <rect x={c.x} y={c.z} width={c.w} height={c.l} fill="url(#hallHatch)" />
                {c.w * c.l > 3 && <text x={c.x + c.w / 2} y={c.z + c.l / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 0.8} fill={T.steel}>Hall</text>}
              </g>
            ))}
            {stairs.map((c, i) => (
              <g key={`s${i}`}>
                <rect x={c.x} y={c.z} width={c.w} height={c.l} fill={T.card} stroke={T.rule} strokeWidth="0.04" />
                <text x={c.x + c.w / 2} y={c.z + c.l / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 0.8} fill={T.steel} transform={`rotate(-90 ${c.x + c.w / 2} ${c.z + c.l / 2})`}>STAIR</text>
              </g>
            ))}
            {shown.map((r) => {
              const isSel = r.key === sel, X = plate.x + r.x, Z = plate.z + r.z;
              const over = drag?.over?.key === r.key;
              const h = Math.min(0.45, r.w / 4, r.l / 4);   // edge grips: wide enough to hit, inside the room
              return (
                <g key={r.key}>
                  <rect x={X} y={Z} width={r.w} height={r.l} fill={TYPE_TONE[r.item.type] || "#e4e4e4"} fillOpacity={over ? 0.55 : 0.9}
                    stroke={isSel ? "#F5C518" : over ? "#D96E0A" : "#334155"} strokeWidth={isSel || over ? 0.12 : 0.05} strokeDasharray={r.unplaced ? "0.25 0.15" : undefined}
                    style={{ cursor: drag ? "grabbing" : "grab" }} onPointerDown={(e) => startDrag(e, r, "move")} />
                  <text x={X + r.w / 2} y={Z + r.l / 2 - fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight="700" fill="#0F172A" pointerEvents="none">{r.item.name}</text>
                  <text x={X + r.w / 2} y={Z + r.l / 2 + fs * 0.9} textAnchor="middle" fontSize={fs * 0.78} fill="#334155" pointerEvents="none">{r.w.toFixed(1)} × {r.l.toFixed(1)} m · {(r.w * r.l).toFixed(1)} m²</text>
                  {isSel && !drag?.over && [
                    ["e", X + r.w - h, Z + h, h, r.l - 2 * h, "ew-resize"], ["w", X, Z + h, h, r.l - 2 * h, "ew-resize"],
                    ["s", X + h, Z + r.l - h, r.w - 2 * h, h, "ns-resize"], ["n", X + h, Z, r.w - 2 * h, h, "ns-resize"],
                    ["se", X + r.w - h, Z + r.l - h, h, h, "nwse-resize"], ["nw", X, Z, h, h, "nwse-resize"],
                    ["ne", X + r.w - h, Z, h, h, "nesw-resize"], ["sw", X, Z + r.l - h, h, h, "nesw-resize"],
                  ].map(([m, x, z, w, l, cur]) => (
                    <rect key={m} x={x} y={z} width={Math.max(0.05, w)} height={Math.max(0.05, l)} fill={m.length === 2 ? "#F5C518" : "rgba(245,197,24,0.35)"} style={{ cursor: cur }}
                      onPointerDown={(e) => startDrag(e, r, m)} />
                  ))}
                </g>
              );
            })}
            {/* overall size */}
            <text x={plate.x - 0.9} y={plate.z + plate.l / 2} textAnchor="middle" fontSize={fs * 0.8} fill={T.steel} transform={`rotate(-90 ${plate.x - 0.9} ${plate.z + plate.l / 2})`}>{(+spec.lengthM || 0).toFixed(1)} m</text>
          </svg>
          {(note || unplaced.length > 0 || fl.fit < 0.99) && (
            <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, color: T.inkSoft }}>
              {note && <div>{note}</div>}
              {unplaced.length > 0 && <div style={{ color: T.alert }}>Dashed rooms haven't been placed yet ({unplaced.map((r) => r.item.name).join(", ")}): drag them where you want them.</div>}
              {fl.fit < 0.99 && <div style={{ color: T.alert }}>The rooms add up to more than this floor ({Math.round(fl.scheduledM2)} m² for {Math.round(fl.plateM2)} m²), so they've been squeezed. Make the house bigger or a room smaller.</div>}
            </div>
          )}
        </div>

        {/* room panel + saved layouts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ border: `1px solid ${T.rule}`, borderRadius: 10, padding: 12 }}>
            {selected ? (
              <>
                <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Selected room</div>
                <input className="ec-input" value={selected.item.name} onChange={(e) => renameRoom(e.target.value)} aria-label="Room name" style={{ width: "100%", fontWeight: 700, marginBottom: 8 }} />
                {!["Bathroom", "Kitchen"].includes(selected.item.type) && (
                  <select className="ec-select" value={selected.item.type} onChange={(e) => retype(e.target.value)} aria-label="Room type" style={{ width: "100%", marginBottom: 8 }}>
                    {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <SizeField label="Width (m)" value={selected.w} onCommit={(v) => setSize(v, selected.l)} />
                  <SizeField label="Depth (m)" value={selected.l} onCommit={(v) => setSize(selected.w, v)} />
                </div>
                <div style={{ fontSize: 12, color: T.steel, margin: "6px 0 10px" }}>{(selected.w * selected.l).toFixed(1)} m²</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} onClick={rotate}>⟳ Turn 90°</button>
                  {floors > 1 && <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} onClick={() => moveToFloor(floor === 0 ? 1 : 0)}>Move to {floor === 0 ? "first" : "ground"} floor</button>}
                  <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12, color: T.alert }} onClick={removeRoom}>Remove</button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: T.steel, lineHeight: 1.5 }}>Click a room to change its name, type or size, turn it, or move it to another floor.</div>
            )}
            <div style={{ borderTop: `1px solid ${T.rule}`, marginTop: 12, paddingTop: 10 }}>
              <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Add a room</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Bedroom", "Bathroom", "Study", "Laundry", "Media"].map((t) => (
                  <button key={t} className="ec-btn ec-btn-ghost" style={{ fontSize: 12, padding: "5px 9px" }} onClick={() => addRoom(t)}>+ {t}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ border: `1px solid ${T.rule}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div className="ec-eyebrow">Saved layouts</div>
              <button className="ec-btn ec-btn-hivis" style={{ fontSize: 12, padding: "5px 10px" }} onClick={saveOption}>Save this one</button>
            </div>
            {!options.length && <div style={{ fontSize: 12.5, color: T.steel, lineHeight: 1.5 }}>Save layouts you like to compare them side by side and switch back any time.</div>}
            {options.map((o) => {
              const diff = total != null && o.total != null ? total - o.total : null;
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${T.rule}` }}>
                  <MiniPlan option={o} spec={spec} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.name}</div>
                    <div className="ec-mono" style={{ fontSize: 11, color: T.steel }}>
                      {o.total != null ? `${currency}${Math.round(o.total).toLocaleString()}` : "—"}
                      {diff != null && Math.abs(diff) >= 1 ? ` · now ${diff > 0 ? "+" : "−"}${currency}${Math.abs(Math.round(diff)).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <button className="ec-btn ec-btn-ghost" style={{ fontSize: 11.5, padding: "4px 8px" }} onClick={() => loadOption(o)}>Use</button>
                  <button aria-label={`Delete ${o.name}`} onClick={() => dropOption(o)} style={{ border: "none", background: "none", cursor: "pointer", color: T.steel, fontSize: 16 }}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 760px) { .plan-grid { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
    </div>
  );
}

/* A thumbnail of a saved layout (ground floor). */
function MiniPlan({ option, spec }) {
  const L = useMemo(() => layoutFloors({ ...spec, plan: option.plan, rooms: option.rooms, bathrooms: option.bathrooms, kitchens: option.kitchens }), [option, spec.widthM, spec.lengthM, spec.floors]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = L.plate;
  return (
    <svg viewBox={`${p.x} ${p.z} ${p.w} ${p.l}`} width="44" height={Math.max(30, Math.min(60, 44 * p.l / p.w))} style={{ flexShrink: 0, border: `1px solid ${T.rule}`, borderRadius: 4, background: T.paperLight }}>
      {L.floors[0].cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.z} width={c.w} height={c.l} fill={c.item.circulation ? "transparent" : TYPE_TONE[c.item.type] || "#ddd"} stroke="#334155" strokeWidth={p.w / 60} />
      ))}
    </svg>
  );
}

function SizeField({ label, value, onCommit }) {
  const [t, setT] = useState(value.toFixed(1));
  useEffect(() => setT(value.toFixed(1)), [value]);
  const commit = () => { const v = parseFloat(t); if (Number.isFinite(v) && Math.abs(v - value) > 0.009) onCommit(v); else setT(value.toFixed(1)); };
  return (
    <label style={{ fontSize: 11, color: T.steel }}>
      {label}
      <input className="ec-input" value={t} inputMode="decimal" onChange={(e) => setT(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ width: "100%", marginTop: 3 }} />
    </label>
  );
}

/* ---------- the rooms' own sizes follow the plan ---------- */
function matches(x, it) { return x.id != null && it.id != null ? String(x.id) === String(it.id) : false; }
function editSource(sp, it, patch) {
  const apply = (list, map) => (list || []).map((x) => (matches(x, it) ? { ...x, ...map(x) } : x));
  if (it.type === "Bathroom") return { ...sp, bathrooms: apply(sp.bathrooms, () => (patch.label != null ? { label: patch.label } : {})) };
  if (it.type === "Kitchen") return sp;
  return { ...sp, rooms: apply(sp.rooms, () => ({ ...(patch.name != null ? { name: patch.name } : {}), ...(patch.type ? { type: patch.type } : {}) })) };
}
function withSize(sp, it, w, l) {
  const W = +w.toFixed(2), Lm = +l.toFixed(2);
  if (it.type === "Kitchen") {
    // a kitchen's footprint comes from its bench run (~1.8 m² per metre, + 3 m² for an island)
    return { ...sp, kitchens: (sp.kitchens || []).map((k) => (matches(k, it) ? { ...k, benchLengthM: +Math.max(2, (W * Lm - (k.island ? 3 : 0)) / 1.8).toFixed(2) } : k)) };
  }
  if (it.type === "Bathroom") return { ...sp, bathrooms: (sp.bathrooms || []).map((b) => (matches(b, it) ? { ...b, widthM: W, lengthM: Lm } : b)) };
  return { ...sp, rooms: (sp.rooms || []).map((r) => (matches(r, it) ? { ...r, widthM: W, lengthM: Lm } : r)) };
}
