/* =========================================================================
   MODULE: modules/TakeoffCanvas.jsx
   Measure quantities directly off a PNG/JPG plan.

   The workflow this implements is the one every estimator already knows:
     1. Drop the plan in (photo of a printed plan is fine)
     2. Calibrate — draw along one dimension you know, type its real length
     3. Measure — walls as linear runs, slabs and roofs as areas, fittings as
        counts, concrete and excavation as volumes
     4. Assign each measurement to a cost item, add waste, set a rate
     5. Push the lot through to the estimate as priced quote lines

   Rendering is a single <canvas>: the plan bitmap and every overlay are
   drawn under one transform, so pan/zoom is a matrix change rather than a
   DOM reflow, and 200 measurements stay at 60fps. Stored geometry is always
   image-space (see logic/takeoff.js) — zoom never mutates data.
   ========================================================================= */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { useResolvedTokens } from "../design/theme.js";
import {
  MEASURE_TYPES, TAKEOFF_COLORS, calibrate, evaluateMeasurement, formatQuantity,
  hitTest, hitTestVertex, nextColor, polygonArea, polylineLength, rollUpByCostItem,
  snapOrtho, snapToVertex, toQuoteLines, distance, centroid,
} from "../logic/takeoff.js";
import { getBlobURL, putBlob, downscaleForVision, getBlob, isHeic } from "../state/blobstore.js";
import { createTakeoff, updateTakeoff, listTakeoffs, createDocument } from "../state/cm.js";
import { readPlan } from "../ai/vision.js";

const HANDLE_R = 4.5;      // vertex handle radius, screen px
const HIT_TOL = 7;         // click tolerance, screen px
const MIN_SCALE = 0.05;
const MAX_SCALE = 24;

export default function TakeoffCanvas({ jobId, takeoffId, onQuoteLines, onClose }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const rafRef = useRef(0);

  const [takeoff, setTakeoff] = useState(null);
  const [imgReady, setImgReady] = useState(false);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [tool, setTool] = useState("select");
  const [draft, setDraft] = useState(null);          // { type, points: [] }
  const [cursor, setCursor] = useState(null);         // live image-space cursor
  const [selectedId, setSelectedId] = useState(null);
  const [ortho, setOrtho] = useState(true);
  const [snap, setSnap] = useState(true);
  const [panning, setPanning] = useState(false);
  const [dragVertex, setDragVertex] = useState(null); // { measurementId, index }
  const [calibPrompt, setCalibPrompt] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Canvas needs real colour values — ctx.fillStyle cannot resolve var().
  // Re-samples automatically whenever the theme flips.
  const T = useResolvedTokens();

  const measurements = takeoff?.measurements || [];
  const pxPerMetre = takeoff?.pxPerMetre || null;

  /* ---- Load the takeoff record + its bitmap ---------------------------- */
  useEffect(() => {
    if (!takeoffId) return;
    const list = listTakeoffs(jobId);
    const t = list.find((x) => x.id === takeoffId);
    setTakeoff(t || null);
  }, [takeoffId, jobId]);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    setImgReady(false);
    if (!takeoff?.blobId) return undefined;
    getBlobURL(takeoff.blobId).then((u) => {
      if (cancelled || !u) return;
      url = u;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        imgRef.current = img;
        setImgReady(true);
        fitToWindow(img);
      };
      img.src = u;
    });
    return () => {
      cancelled = true;
      // Revoking is what keeps a 30-sheet session from eating a gigabyte.
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeoff?.blobId]);

  const fitToWindow = useCallback((img) => {
    const wrap = wrapRef.current;
    if (!wrap || !img) return;
    const pad = 32;
    const w = wrap.clientWidth - pad;
    const h = wrap.clientHeight - pad;
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    setView({
      scale,
      tx: (wrap.clientWidth - img.naturalWidth * scale) / 2,
      ty: (wrap.clientHeight - img.naturalHeight * scale) / 2,
    });
  }, []);

  /* ---- Persistence ----------------------------------------------------- */
  const persist = useCallback(
    (changes) => {
      if (!takeoff) return;
      const updated = updateTakeoff(takeoff.id, changes);
      if (updated) setTakeoff(updated);
    },
    [takeoff]
  );

  const setMeasurements = useCallback((next) => persist({ measurements: next }), [persist]);

  const patchMeasurement = useCallback(
    (id, changes) => setMeasurements(measurements.map((m) => (m.id === id ? { ...m, ...changes } : m))),
    [measurements, setMeasurements]
  );

  const removeMeasurement = useCallback(
    (id) => {
      setMeasurements(measurements.filter((m) => m.id !== id));
      setSelectedId((s) => (s === id ? null : s));
    },
    [measurements, setMeasurements]
  );

  /* ---- Coordinate transforms ------------------------------------------ */
  const toImage = useCallback(
    (clientX, clientY) => {
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.tx) / view.scale,
        y: (clientY - rect.top - view.ty) / view.scale,
      };
    },
    [view]
  );

  /* ---- Painting -------------------------------------------------------- */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = T.canvasMat;
    ctx.fillRect(0, 0, cw, ch);

    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);

    const img = imgRef.current;
    if (img) {
      ctx.imageSmoothingEnabled = view.scale < 3; // crisp pixels when zoomed right in
      ctx.drawImage(img, 0, 0);
    }

    // Everything below draws in image space but must keep constant screen
    // weight, so line widths and radii are divided by the zoom.
    const s = view.scale;
    const lw = (n) => n / s;

    // Calibration line — dashed, unmistakably different from measurements.
    if (takeoff?.calibration) {
      const { p1, p2 } = takeoff.calibration;
      ctx.setLineDash([lw(7), lw(5)]);
      ctx.strokeStyle = "#00A6FB";
      ctx.lineWidth = lw(1.75);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawTick(ctx, p1, p2, lw);
    }

    for (const m of measurements) drawMeasurement(ctx, m, m.id === selectedId, s, pxPerMetre, null, T);

    if (draft) {
      drawMeasurement(
        ctx,
        { ...draft, color: draft.color || T.hivisDeep },
        true,
        s,
        pxPerMetre,
        cursor,
        T
      );
    }

    ctx.restore();
  }, [view, measurements, draft, cursor, selectedId, takeoff?.calibration, pxPerMetre, T]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paint, imgReady]);

  useEffect(() => {
    const onResize = () => requestAnimationFrame(paint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  /* ---- Pointer handling ------------------------------------------------ */

  const resolvePoint = useCallback(
    (raw, prev) => {
      let p = { ...raw };
      if (snap) {
        const snapped = snapToVertex(p, measurements, HIT_TOL / view.scale);
        if (snapped.snapped) return { x: snapped.x, y: snapped.y };
      }
      if (prev) p = snapOrtho(prev, p, ortho);
      return p;
    },
    [snap, ortho, measurements, view.scale]
  );

  const onPointerDown = (e) => {
    if (!imgReady) return;
    const isPan = e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey) || tool === "pan";
    if (isPan) {
      setPanning({ x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const raw = toImage(e.clientX, e.clientY);

    if (tool === "select") {
      // Grab a vertex handle first — otherwise you can never adjust a point
      // that sits on top of its own edge.
      if (selectedId) {
        const sel = measurements.find((m) => m.id === selectedId);
        const vi = hitTestVertex(raw, sel, HIT_TOL / view.scale);
        if (vi >= 0) {
          setDragVertex({ measurementId: selectedId, index: vi });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      const hit = hitTest(raw, measurements, HIT_TOL / view.scale);
      setSelectedId(hit ? hit.id : null);
      return;
    }

    if (tool === "calibrate") {
      const pts = draft?.points || [];
      const p = resolvePoint(raw, pts[pts.length - 1]);
      if (pts.length === 0) {
        setDraft({ type: "calibrate", points: [p] });
      } else {
        setCalibPrompt({ p1: pts[0], p2: p });
        setDraft(null);
      }
      return;
    }

    if (tool === "count") {
      const p = raw;
      if (!draft) {
        setDraft({ type: "count", points: [p], color: nextColor(measurements) });
      } else {
        setDraft({ ...draft, points: [...draft.points, p] });
      }
      return;
    }

    // linear / area / volume — accumulate vertices
    const pts = draft?.points || [];
    const p = resolvePoint(raw, pts[pts.length - 1]);
    if (!draft) {
      setDraft({ type: tool, points: [p], color: nextColor(measurements) });
    } else {
      // Clicking the first vertex again closes an area, same as CAD.
      if ((tool === "area" || tool === "volume") && pts.length >= 3 && distance(p, pts[0]) < HIT_TOL / view.scale) {
        commitDraft({ ...draft, points: pts });
        return;
      }
      setDraft({ ...draft, points: [...pts, p] });
    }
  };

  const onPointerMove = (e) => {
    if (panning) {
      setView((v) => ({ ...v, tx: panning.tx + (e.clientX - panning.x), ty: panning.ty + (e.clientY - panning.y) }));
      return;
    }
    const raw = toImage(e.clientX, e.clientY);
    if (dragVertex) {
      const m = measurements.find((x) => x.id === dragVertex.measurementId);
      if (m) {
        const pts = [...m.points];
        pts[dragVertex.index] = resolvePoint(raw, pts[dragVertex.index - 1]);
        patchMeasurement(m.id, { points: pts });
      }
      return;
    }
    if (draft && draft.points.length) {
      setCursor(resolvePoint(raw, draft.points[draft.points.length - 1]));
    } else {
      setCursor(raw);
    }
  };

  const onPointerUp = (e) => {
    if (panning) setPanning(false);
    if (dragVertex) setDragVertex(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const onDoubleClick = () => {
    if (!draft) return;
    if (draft.type === "calibrate") return;
    commitDraft(draft);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0016);
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      // Zoom about the cursor: the image point under the pointer stays put.
      return { scale, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
    });
  };

  const commitDraft = (d) => {
    const minPts = d.type === "count" ? 1 : d.type === "linear" ? 2 : 3;
    if ((d.points || []).length < minPts) {
      setDraft(null);
      setCursor(null);
      return;
    }
    const type = MEASURE_TYPES[d.type];
    const id = `ms_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const m = {
      id,
      type: d.type,
      points: d.points,
      color: d.color || nextColor(measurements),
      name: `${type.label} ${measurements.filter((x) => x.type === d.type).length + 1}`,
      costItem: "",
      multiplier: 1,
      wastePct: 0,
      rate: 0,
      height: 0,
      depth: d.type === "volume" ? 0.1 : 0,
      createdAt: Date.now(),
    };
    setMeasurements([...measurements, m]);
    setSelectedId(id);
    setDraft(null);
    setCursor(null);
  };

  /* ---- Keyboard -------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") {
        setDraft(null);
        setCursor(null);
        setCalibPrompt(null);
        setTool("select");
      }
      if (e.key === "Enter" && draft) commitDraft(draft);
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeMeasurement(selectedId);
      }
      if (e.key === "Backspace" && draft && draft.points.length > 1) {
        setDraft({ ...draft, points: draft.points.slice(0, -1) });
      }
      const keyTool = { v: "select", l: "linear", a: "area", c: "count", d: "volume", k: "calibrate", h: "pan" }[e.key.toLowerCase()];
      if (keyTool && !e.metaKey && !e.ctrlKey) setTool(keyTool);
      if (e.key.toLowerCase() === "f" && imgRef.current) fitToWindow(imgRef.current);
      if (e.shiftKey) setOrtho(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, selectedId, removeMeasurement, fitToWindow]);

  /* ---- Calibration commit --------------------------------------------- */
  const applyCalibration = (knownMetres) => {
    try {
      const { pxPerMetre: ppm, calibration } = calibrate(calibPrompt.p1, calibPrompt.p2, Number(knownMetres));
      persist({ pxPerMetre: ppm, calibration });
      setCalibPrompt(null);
      setTool("select");
      setError("");
      setStatus(`Scale set — 1 m = ${ppm.toFixed(1)} px. Every measurement is now live.`);
    } catch (e) {
      setError(e.message);
    }
  };

  /* ---- AI plan read ---------------------------------------------------- */
  const runAI = async () => {
    if (!takeoff?.blobId) return;
    setAiBusy(true);
    setError("");
    setAiResult(null);
    try {
      const rec = await getBlob(takeoff.blobId);
      const small = await downscaleForVision(rec.blob);
      const result = await readPlan(small, {
        imageWidth: takeoff.imageWidth,
        imageHeight: takeoff.imageHeight,
        pxPerMetre,
      });
      setAiResult(result);
      setStatus(
        result.rooms?.length
          ? `Read ${result.rooms.length} room${result.rooms.length === 1 ? "" : "s"} off the plan — review below before applying.`
          : "The model could not resolve rooms from this image. Try a higher-resolution crop."
      );
    } catch (e) {
      setError(e.message || "The plan reader failed.");
    } finally {
      setAiBusy(false);
    }
  };

  /* Apply AI-detected rooms as real area measurements. Only runs when the
     drawing is calibrated — without scale the polygons would be decorative. */
  const applyAIRooms = () => {
    if (!aiResult?.rooms?.length) return;
    const added = aiResult.rooms
      .filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
      .map((r, i) => ({
        id: `ms_ai${Date.now().toString(36)}${i}`,
        type: "area",
        points: r.polygon.map((p) => ({ x: p[0], y: p[1] })),
        color: TAKEOFF_COLORS[i % TAKEOFF_COLORS.length],
        name: r.name || `Room ${i + 1}`,
        costItem: "Floor area",
        multiplier: 1,
        wastePct: 0,
        rate: 0,
        height: r.ceilingHeight || 0,
        depth: 0,
        source: "ai",
        aiConfidence: r.confidence ?? null,
        createdAt: Date.now(),
      }));
    if (!added.length) {
      setError("The reader returned room names but no usable outlines — measure those rooms by hand.");
      return;
    }
    setMeasurements([...measurements, ...added]);
    setStatus(`Added ${added.length} room outline${added.length === 1 ? "" : "s"}. Check each one against the plan — AI-read outlines are a starting point, not a certified takeoff.`);
  };

  /* ---- Roll-up --------------------------------------------------------- */
  const rollUp = useMemo(() => rollUpByCostItem(measurements, pxPerMetre), [measurements, pxPerMetre]);

  const pushToEstimate = () => {
    const lines = toQuoteLines(measurements, pxPerMetre);
    if (!lines.length) {
      setError("Nothing to push — assign your measurements to a cost item first.");
      return;
    }
    onQuoteLines?.(lines);
    setStatus(`Sent ${lines.length} line${lines.length === 1 ? "" : "s"} to the estimate.`);
  };

  const selected = measurements.find((m) => m.id === selectedId) || null;

  if (!takeoff) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: TOKENS.steel }} className="ec-mono">
        Takeoff not found.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", height: "calc(100vh - 150px)", border: `1px solid ${TOKENS.rule}`, background: TOKENS.card }}>
      {/* ---------------- Canvas column ---------------- */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Toolbar
          tool={tool} setTool={setTool} ortho={ortho} setOrtho={setOrtho} snap={snap} setSnap={setSnap}
          calibrated={!!pxPerMetre} pxPerMetre={pxPerMetre} view={view}
          onFit={() => imgRef.current && fitToWindow(imgRef.current)}
          onZoom={(f) => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * f)) }))}
          onAI={runAI} aiBusy={aiBusy}
        />

        {!pxPerMetre && (
          <Banner tone="warn">
            <strong>Set the scale first.</strong> Pick <em>Calibrate</em>, draw a line along a dimension you know
            (a 6000&nbsp;mm wall, a 820&nbsp;mm door), and type its real length. Measurements stay locked until you do.
          </Banner>
        )}
        {takeoff.converted && (
          <Banner tone="ok">
            This sheet came off a phone, so it was decoded and turned upright on import — you're measuring the
            converted image. If it was photographed at an angle, calibrate against the longest figured dimension
            on the sheet and treat long runs across the drawing as approximate.
          </Banner>
        )}
        {error && <Banner tone="error" onClose={() => setError("")}>{error}</Banner>}
        {status && !error && <Banner tone="ok" onClose={() => setStatus("")}>{status}</Banner>}

        <div
          ref={wrapRef}
          style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: TOKENS.canvasMat }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              display: "block",
              cursor: panning ? "grabbing" : tool === "select" ? "default" : tool === "pan" ? "grab" : "crosshair",
              touchAction: "none",
            }}
          />
          {!imgReady && (
            <div className="ec-mono" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 12 }}>
              Loading plan…
            </div>
          )}
          <LiveReadout draft={draft} cursor={cursor} pxPerMetre={pxPerMetre} />
        </div>
      </div>

      {/* ---------------- Side panel ---------------- */}
      <aside style={{ borderLeft: `1px solid ${TOKENS.rule}`, overflowY: "auto", background: TOKENS.paperLight }}>
        {selected ? (
          <MeasurementInspector
            m={selected}
            pxPerMetre={pxPerMetre}
            onChange={(changes) => patchMeasurement(selected.id, changes)}
            onDelete={() => removeMeasurement(selected.id)}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <>
            <MeasurementList
              measurements={measurements}
              pxPerMetre={pxPerMetre}
              onSelect={setSelectedId}
              onDelete={removeMeasurement}
            />
            <RollUp rows={rollUp} onPush={pushToEstimate} disabled={!pxPerMetre} />
          </>
        )}
        {aiResult && <AIResultPanel result={aiResult} onApply={applyAIRooms} onDismiss={() => setAiResult(null)} calibrated={!!pxPerMetre} />}
      </aside>

      {calibPrompt && (
        <CalibrationDialog
          pixels={distance(calibPrompt.p1, calibPrompt.p2)}
          onCancel={() => setCalibPrompt(null)}
          onApply={applyCalibration}
        />
      )}
    </div>
  );
}

/* ========================================================================
   Canvas drawing helpers
   ======================================================================== */

function drawMeasurement(ctx, m, selected, scale, pxPerMetre, liveCursor = null, T = {}) {
  const pts = liveCursor && m.points?.length ? [...m.points, liveCursor] : m.points || [];
  if (!pts.length) return;
  const lw = (n) => n / scale;
  const color = m.color || T.hivisDeep || "#D9AC00";
  const closed = m.type === "area" || m.type === "volume";

  if (m.type === "count") {
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw(7), 0, Math.PI * 2);
      ctx.fillStyle = hexA(color, 0.85);
      ctx.fill();
      ctx.lineWidth = lw(1.5);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
    if (pts.length) {
      const c = pts[0];
      drawLabel(ctx, `${m.name || "Count"} · ${pts.length}`, c.x, c.y - lw(14), color, scale, false, T);
    }
    return;
  }

  if (closed && pts.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = hexA(color, selected ? 0.3 : 0.18);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed && pts.length >= 3) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw(selected ? 3 : 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // Per-segment length labels while drawing — the number you need is the one
  // for the segment you are currently placing.
  if (pxPerMetre && (liveCursor || selected)) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = distance(a, b) / pxPerMetre;
      if (len < 0.05) continue;
      drawLabel(ctx, `${len.toFixed(2)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2, color, scale, true, T);
    }
  }

  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw(HANDLE_R), 0, Math.PI * 2);
    ctx.fillStyle = selected ? (T.labelWash || "#fff") : color;
    ctx.fill();
    ctx.lineWidth = lw(1.5);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  if (!liveCursor && pxPerMetre) {
    const ev = evaluateMeasurement(m, pxPerMetre);
    if (ev.valid) {
      const c = closed ? centroid(pts) : pts[Math.floor(pts.length / 2)];
      drawLabel(ctx, `${m.name} · ${formatQuantity(ev.value, ev.unit)} ${ev.unit}`, c.x, c.y, color, scale, false, T);
    }
  }
}

function drawLabel(ctx, text, x, y, color, scale, small = false, T = {}) {
  const size = (small ? 10 : 11) / scale;
  ctx.font = `${small ? 400 : 700} ${size}px 'JetBrains Mono', monospace`;
  const w = ctx.measureText(text).width;
  const padX = 4 / scale;
  const padY = 3 / scale;
  ctx.fillStyle = T.labelWash || "rgba(255,255,255,0.94)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / scale;
  const bx = x - w / 2 - padX;
  const by = y - size / 2 - padY;
  ctx.beginPath();
  ctx.rect(bx, by, w + padX * 2, size + padY * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = T.labelInk || "#14171A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + size * 0.06);
}

function drawTick(ctx, p1, p2, lw) {
  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2;
  const t = lw(7);
  for (const p of [p1, p2]) {
    ctx.beginPath();
    ctx.moveTo(p.x - Math.cos(ang) * t, p.y - Math.sin(ang) * t);
    ctx.lineTo(p.x + Math.cos(ang) * t, p.y + Math.sin(ang) * t);
    ctx.stroke();
  }
}

function hexA(hex, alpha) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ========================================================================
   UI pieces
   ======================================================================== */

function Toolbar({ tool, setTool, ortho, setOrtho, snap, setSnap, calibrated, pxPerMetre, view, onFit, onZoom, onAI, aiBusy }) {
  const tools = [
    { id: "select", label: "Select", key: "V" },
    { id: "calibrate", label: "Calibrate", key: "K", accent: !calibrated },
    { id: "linear", label: "Linear", key: "L" },
    { id: "area", label: "Area", key: "A" },
    { id: "volume", label: "Volume", key: "D" },
    { id: "count", label: "Count", key: "C" },
    { id: "pan", label: "Pan", key: "H" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${TOKENS.rule}`, background: TOKENS.card, flexWrap: "wrap" }}>
      {tools.map((t) => {
        const active = tool === t.id;
        const disabled = !calibrated && !["select", "calibrate", "pan"].includes(t.id);
        return (
          <button
            key={t.id}
            className="ec-mono"
            disabled={disabled}
            onClick={() => setTool(t.id)}
            title={`${MEASURE_TYPES[t.id]?.hint || t.label}  (${t.key})`}
            style={{
              padding: "6px 11px", fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
              border: `1px solid ${active ? TOKENS.emphasis : t.accent ? TOKENS.ember : TOKENS.rule}`,
              background: active ? TOKENS.emphasis : t.accent ? TOKENS.ember : TOKENS.paperLight,
              color: active ? TOKENS.onEmphasis : t.accent ? TOKENS.onEmber : TOKENS.ink,
              opacity: disabled ? 0.4 : 1,
            }}
          >
            {t.label}
          </button>
        );
      })}

      <span style={{ width: 1, height: 20, background: TOKENS.rule, margin: "0 4px" }} />

      <Chk label="Ortho" value={ortho} onChange={setOrtho} title="Lock runs to horizontal / vertical / 45°" />
      <Chk label="Snap" value={snap} onChange={setSnap} title="Snap to existing points so runs join cleanly" />

      <span style={{ flex: 1 }} />

      <button className="ec-mono" onClick={onAI} disabled={aiBusy}
        title="Send this plan to Claude and have it read off rooms and dimensions"
        style={{ padding: "6px 11px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", border: `1px solid ${TOKENS.emphasis}`, background: aiBusy ? TOKENS.rule : TOKENS.hivis, color: aiBusy ? TOKENS.steel : TOKENS.onHivis, cursor: aiBusy ? "wait" : "pointer" }}>
        {aiBusy ? "Reading plan…" : "AI read plan"}
      </button>

      <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, minWidth: 96, textAlign: "right" }}>
        {calibrated ? `1 m = ${pxPerMetre.toFixed(1)} px` : "no scale"}
      </span>
      <button className="ec-mono" onClick={() => onZoom(1 / 1.3)} style={zBtn}>−</button>
      <span className="ec-mono" style={{ fontSize: 10, width: 42, textAlign: "center" }}>{Math.round(view.scale * 100)}%</span>
      <button className="ec-mono" onClick={() => onZoom(1.3)} style={zBtn}>+</button>
      <button className="ec-mono" onClick={onFit} style={{ ...zBtn, width: "auto", padding: "0 8px" }} title="Fit to window (F)">Fit</button>
    </div>
  );
}

const zBtn = { width: 24, height: 24, border: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight, cursor: "pointer", fontSize: 12, lineHeight: 1 };

function Chk({ label, value, onChange, title }) {
  return (
    <label className="ec-mono" title={title} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, cursor: "pointer", color: TOKENS.inkSoft }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: TOKENS.hivisDeep }} />
      {label}
    </label>
  );
}

function Banner({ tone = "warn", children, onClose }) {
  const bg = { warn: TOKENS.warnWash, error: TOKENS.errorWash, ok: TOKENS.okWash }[tone];
  const bd = { warn: TOKENS.hivisDeep, error: TOKENS.alert, ok: TOKENS.ok }[tone];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: bg, borderBottom: `1px solid ${bd}`, fontSize: 12, color: TOKENS.ink }}>
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && (
        <button onClick={onClose} className="ec-mono" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, color: TOKENS.inkSoft }}>×</button>
      )}
    </div>
  );
}

/** Live length/area readout that follows the drawing hand. */
function LiveReadout({ draft, cursor, pxPerMetre }) {
  if (!draft || !cursor || !pxPerMetre) return null;
  const pts = [...draft.points, cursor];
  let text;
  if (draft.type === "count") text = `${draft.points.length} placed`;
  else if (draft.type === "area" || draft.type === "volume") {
    const a = pts.length >= 3 ? polygonArea(pts) / (pxPerMetre * pxPerMetre) : 0;
    text = `${a.toFixed(2)} m²  ·  ${(polylineLength(pts) / pxPerMetre).toFixed(2)} m run`;
  } else {
    text = `${(polylineLength(pts) / pxPerMetre).toFixed(2)} m`;
  }
  return (
    <div className="ec-mono" style={{ position: "absolute", left: 12, bottom: 12, padding: "6px 10px", background: "rgba(20,23,26,0.9)", color: TOKENS.hivis, fontSize: 12, fontWeight: 700, pointerEvents: "none" }}>
      {text}
      <span style={{ color: TOKENS.steel, fontWeight: 400, marginLeft: 10 }}>double-click to finish · esc to cancel</span>
    </div>
  );
}

function MeasurementList({ measurements, pxPerMetre, onSelect, onDelete }) {
  return (
    <div style={{ padding: 12, borderBottom: `1px solid ${TOKENS.rule}` }}>
      <div className="ec-label" style={{ marginBottom: 8 }}>Measurements ({measurements.length})</div>
      {!measurements.length && (
        <p style={{ fontSize: 12, color: TOKENS.steel, margin: 0, lineHeight: 1.5 }}>
          Nothing measured yet. Calibrate the drawing, then pick a tool and click along what you need.
        </p>
      )}
      <div style={{ display: "grid", gap: 4 }}>
        {measurements.map((m) => {
          const ev = evaluateMeasurement(m, pxPerMetre);
          return (
            <div key={m.id} onClick={() => onSelect(m.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, cursor: "pointer" }}>
              <span style={{ width: 10, height: 10, background: m.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div className="ec-mono" style={{ fontSize: 9, color: TOKENS.steel }}>
                  {m.costItem || "unassigned"}{m.source === "ai" ? " · AI" : ""}
                </div>
              </div>
              <div className="ec-mono" style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                {ev.valid ? `${formatQuantity(ev.value, ev.unit)} ${ev.unit}` : "—"}
              </div>
              <button onClick={(e) => { e.stopPropagation(); onDelete(m.id); }} title="Delete"
                style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeasurementInspector({ m, pxPerMetre, onChange, onDelete, onBack }) {
  const ev = evaluateMeasurement(m, pxPerMetre);
  const type = MEASURE_TYPES[m.type];
  return (
    <div style={{ padding: 12 }}>
      <button onClick={onBack} className="ec-mono" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: TOKENS.steel, padding: 0, marginBottom: 10 }}>
        ← all measurements
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 14, height: 14, background: m.color }} />
        <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: TOKENS.steel }}>{type.label.toUpperCase()}</span>
      </div>

      <div style={{ background: TOKENS.emphasis, color: TOKENS.onEmphasis, padding: "12px 14px", marginBottom: 14 }}>
        <div className="ec-mono" style={{ fontSize: 24, fontWeight: 700 }}>
          {ev.valid ? `${formatQuantity(ev.value, ev.unit)} ${ev.unit}` : "—"}
        </div>
        {ev.secondary && (
          <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.rule, marginTop: 2 }}>
            {formatQuantity(ev.secondary.value, ev.secondary.unit)} {ev.secondary.unit} {ev.secondary.label}
          </div>
        )}
      </div>

      <Fld label="Name"><input className="ec-input" value={m.name} onChange={(e) => onChange({ name: e.target.value })} /></Fld>
      <Fld label="Cost item" hint="Groups measurements together and becomes the quote line description">
        <input className="ec-input" value={m.costItem} placeholder="e.g. External wall framing" onChange={(e) => onChange({ costItem: e.target.value })} />
      </Fld>

      {m.type === "linear" && (
        <Fld label="Height (m)" hint="Optional — turns a wall run into an area">
          <input className="ec-input" type="number" step="0.1" min="0" value={m.height || 0} onChange={(e) => onChange({ height: Number(e.target.value) })} />
        </Fld>
      )}
      {m.type === "volume" && (
        <Fld label="Depth / thickness (m)">
          <input className="ec-input" type="number" step="0.01" min="0" value={m.depth || 0} onChange={(e) => onChange({ depth: Number(e.target.value) })} />
        </Fld>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Fld label="Multiplier" hint="e.g. 2 for a mirrored wing">
          <input className="ec-input" type="number" step="1" min="1" value={m.multiplier || 1} onChange={(e) => onChange({ multiplier: Number(e.target.value) })} />
        </Fld>
        <Fld label="Waste %">
          <input className="ec-input" type="number" step="1" min="0" value={m.wastePct || 0} onChange={(e) => onChange({ wastePct: Number(e.target.value) })} />
        </Fld>
      </div>

      <Fld label={`Rate ($ / ${ev.unit})`}>
        <input className="ec-input" type="number" step="0.01" min="0" value={m.rate || 0} onChange={(e) => onChange({ rate: Number(e.target.value) })} />
      </Fld>

      {m.rate > 0 && ev.valid && (
        <div className="ec-mono" style={{ fontSize: 12, padding: "8px 10px", background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, marginBottom: 12 }}>
          Line total{" "}
          <strong>${(ev.value * (1 + (m.wastePct || 0) / 100) * m.rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          {m.wastePct > 0 && <span style={{ color: TOKENS.steel }}> (incl. {m.wastePct}% waste)</span>}
        </div>
      )}

      <div className="ec-label" style={{ marginBottom: 6 }}>Colour</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 16, flexWrap: "wrap" }}>
        {TAKEOFF_COLORS.map((c) => (
          <button key={c} onClick={() => onChange({ color: c })}
            style={{ width: 22, height: 22, background: c, border: m.color === c ? `2px solid ${TOKENS.ink}` : `1px solid ${TOKENS.rule}`, cursor: "pointer" }} />
        ))}
      </div>

      {m.source === "ai" && (
        <Banner tone="warn">
          Read from the plan by AI{m.aiConfidence != null ? ` (confidence ${Math.round(m.aiConfidence * 100)}%)` : ""}. Check it against the drawing before you price it.
        </Banner>
      )}

      <button onClick={onDelete} className="ec-mono"
        style={{ marginTop: 12, width: "100%", padding: "8px", border: `1px solid ${TOKENS.alert}`, background: "transparent", color: TOKENS.alert, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
        Delete measurement
      </button>
    </div>
  );
}

function Fld({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="ec-label" style={{ marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: TOKENS.steel, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function RollUp({ rows, onPush, disabled }) {
  const total = rows.reduce((n, r) => n + r.quantity, 0);
  return (
    <div style={{ padding: 12 }}>
      <div className="ec-label" style={{ marginBottom: 8 }}>Roll-up by cost item</div>
      {!rows.length ? (
        <p style={{ fontSize: 12, color: TOKENS.steel, margin: 0 }}>Assign cost items to see quantities grouped here.</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 2, marginBottom: 12 }}>
            {rows.map((r) => (
              <div key={r.costItem} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 8px", background: TOKENS.card, border: `1px solid ${TOKENS.rule}` }}>
                <span style={{ fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.costItem}</span>
                <span className="ec-mono" style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatQuantity(r.quantity, r.unit)} {r.unit}
                  {r.unitClash && <span title="Mixed units under one cost item" style={{ color: TOKENS.alert, marginLeft: 4 }}>!</span>}
                </span>
              </div>
            ))}
          </div>
          <button onClick={onPush} disabled={disabled} className="ec-mono"
            style={{ width: "100%", padding: "10px", border: "none", background: disabled ? TOKENS.rule : TOKENS.emphasis, color: disabled ? TOKENS.steel : TOKENS.onEmphasis, cursor: disabled ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
            Push {rows.length} line{rows.length === 1 ? "" : "s"} to estimate →
          </button>
        </>
      )}
    </div>
  );
}

function AIResultPanel({ result, onApply, onDismiss, calibrated }) {
  return (
    <div style={{ padding: 12, borderTop: `2px solid ${TOKENS.ink}`, background: TOKENS.card }}>
      <div className="ec-label" style={{ marginBottom: 8 }}>AI plan read</div>

      {result.scaleNote && (
        <p style={{ fontSize: 11, color: TOKENS.inkSoft, margin: "0 0 8px", lineHeight: 1.5 }}>{result.scaleNote}</p>
      )}

      {!!result.rooms?.length && (
        <div style={{ display: "grid", gap: 2, marginBottom: 10 }}>
          {result.rooms.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 6px", background: TOKENS.paperLight }}>
              <span>{r.name}</span>
              <span className="ec-mono">{r.dimensions || (r.areaM2 ? `${r.areaM2} m²` : "—")}</span>
            </div>
          ))}
        </div>
      )}

      {!!result.schedule?.length && (
        <>
          <div className="ec-label" style={{ marginBottom: 4 }}>Counted items ({result.schedule.length})</div>
          <div style={{ display: "grid", gap: 2, marginBottom: 10 }}>
            {result.schedule.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 6px", background: TOKENS.paperLight }}>
                <span>{s.type} {s.code ? `(${s.code})` : ""}</span>
                <span className="ec-mono">{s.count} no. {s.size ? `· ${s.size}` : ""}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {result.notes && <p style={{ fontSize: 11, color: TOKENS.steel, lineHeight: 1.5, margin: "0 0 10px" }}>{result.notes}</p>}

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onApply} disabled={!calibrated || !result.rooms?.some((r) => r.polygon)} className="ec-mono"
          title={!calibrated ? "Calibrate the drawing first" : "Add the detected room outlines as area measurements"}
          style={{ flex: 1, padding: "8px", border: "none", background: !calibrated ? TOKENS.rule : TOKENS.emphasis, color: !calibrated ? TOKENS.steel : TOKENS.onEmphasis, cursor: !calibrated ? "not-allowed" : "pointer", fontSize: 10, fontWeight: 700 }}>
          Add room outlines
        </button>
        <button onClick={onDismiss} className="ec-mono"
          style={{ padding: "8px 12px", border: `1px solid ${TOKENS.rule}`, background: "transparent", cursor: "pointer", fontSize: 10 }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function CalibrationDialog({ pixels, onCancel, onApply }) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("mm");
  const metres = unit === "mm" ? Number(value) / 1000 : Number(value);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,23,26,0.55)", display: "grid", placeItems: "center", zIndex: 200 }}>
      <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.ink}`, padding: 24, width: 380 }}>
        <div className="ec-display" style={{ fontSize: 20, marginBottom: 6 }}>Set the scale</div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.55, marginTop: 0 }}>
          You drew a line <strong className="ec-mono">{pixels.toFixed(0)} px</strong> long. What is that distance in
          real life? Pick the longest dimension you are certain of — an overall wall length beats a door width,
          because any error is spread over a longer run.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input className="ec-input" autoFocus type="number" step="any" min="0" value={value} placeholder="6000"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && metres > 0 && onApply(metres)}
            style={{ flex: 1 }} />
          <select className="ec-select" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 80 }}>
            <option value="mm">mm</option>
            <option value="m">m</option>
          </select>
        </div>
        {metres > 0 && (
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 14 }}>
            → 1 m = {(pixels / metres).toFixed(1)} px
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onApply(metres)} disabled={!(metres > 0)} className="ec-btn ec-btn-hivis" style={{ flex: 1 }}>Set scale</button>
          <button onClick={onCancel} className="ec-btn ec-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================
   Sheet manager — upload PNG/JPG and pick which sheet to measure
   ======================================================================== */

export function TakeoffSheets({ jobId, activeId, onOpen }) {
  const [sheets, setSheets] = useState(() => listTakeoffs(jobId));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const refresh = () => setSheets(listTakeoffs(jobId));

  /** Accepted by MIME where the browser gives one, by extension where it doesn't. */
  const isSupported = (file) =>
    /^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.type || "") ||
    /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name || "");

  const onFiles = async (files) => {
    setErr("");
    setNote("");
    const convertedNames = [];
    try {
      for (const file of files) {
        if (!isSupported(file)) {
          setErr(
            `"${file.name}" is a ${file.type || "unrecognised"} file. Upload a PNG, JPG, WEBP or iPhone HEIC — export or screenshot a PDF page if that is what you have.`
          );
          continue;
        }
        // HEIC decoding runs a WASM build of libheif and takes a second or
        // two on a big photo, so say what is happening rather than freezing.
        setBusy(isHeic(file) ? `Converting ${file.name} from iPhone format…` : `Uploading ${file.name}…`);

        const meta = await putBlob(file, { name: file.name });
        if (meta.converted) convertedNames.push(file.name);

        const doc = createDocument(jobId, {
          name: file.name, kind: "plan", blobId: meta.id,
          width: meta.width, height: meta.height, size: meta.size, mimeType: meta.type,
        });
        const t = createTakeoff(jobId, {
          name: file.name.replace(/\.[^.]+$/, ""),
          documentId: doc.id, blobId: meta.id,
          imageWidth: meta.width, imageHeight: meta.height,
          converted: meta.converted,
        });
        refresh();
        onOpen?.(t.id);
      }
      if (convertedNames.length) {
        setNote(
          `Converted ${convertedNames.length} phone photo${convertedNames.length === 1 ? "" : "s"} to a standard upright image. Measurements are taken from the converted version.`
        );
      }
    } catch (e) {
      setErr(e.message || "Upload failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFiles([...e.dataTransfer.files]); }}
        style={{ display: "block", border: `2px dashed ${TOKENS.rule}`, background: TOKENS.paperLight, padding: "26px 20px", textAlign: "center", cursor: "pointer", marginBottom: 14 }}
      >
        <input type="file" multiple hidden
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={(e) => { onFiles([...e.target.files]); e.target.value = ""; }} />
        <div className="ec-display" style={{ fontSize: 17 }}>{busy || "Drop plan images here"}</div>
        <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 5 }}>
          PNG · JPG · WEBP · HEIC — straight off an iPhone is fine
        </div>
        <div style={{ fontSize: 10, color: TOKENS.steel, marginTop: 6, lineHeight: 1.5, maxWidth: 460, marginInline: "auto" }}>
          Shoot the sheet square-on and flat. A photo taken at an angle stretches one side of the
          drawing more than the other, and no single scale can correct for that.
        </div>
      </label>

      {err && <Banner tone="error" onClose={() => setErr("")}>{err}</Banner>}
      {note && !err && <Banner tone="ok" onClose={() => setNote("")}>{note}</Banner>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {sheets.map((s) => (
          <SheetCard key={s.id} sheet={s} active={s.id === activeId} onOpen={() => onOpen?.(s.id)} />
        ))}
      </div>
      {!sheets.length && !busy && (
        <p style={{ fontSize: 12, color: TOKENS.steel, textAlign: "center", marginTop: 16 }}>
          No plans uploaded for this job yet.
        </p>
      )}
    </div>
  );
}

function SheetCard({ sheet, active, onOpen }) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    let url = null;
    let cancelled = false;
    getBlobURL(sheet.blobId).then((u) => {
      if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
      url = u;
      setThumb(u);
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [sheet.blobId]);

  const count = (sheet.measurements || []).length;
  return (
    <button onClick={onOpen}
      style={{ padding: 0, textAlign: "left", cursor: "pointer", background: TOKENS.card, border: `1px solid ${active ? TOKENS.ink : TOKENS.rule}`, overflow: "hidden" }}>
      <div style={{ height: 96, background: TOKENS.paperLight, display: "grid", placeItems: "center", overflow: "hidden" }}>
        {thumb ? <img src={thumb} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null}
      </div>
      <div style={{ padding: "7px 9px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sheet.name}</div>
        <div className="ec-mono" style={{ fontSize: 9, color: sheet.pxPerMetre ? TOKENS.ok : TOKENS.ember, marginTop: 2 }}>
          {sheet.pxPerMetre ? `scaled · ${count} measurement${count === 1 ? "" : "s"}` : "needs calibration"}
        </div>
        {sheet.converted && (
          <div className="ec-mono" style={{ fontSize: 9, color: TOKENS.steel, marginTop: 1 }}>from phone photo</div>
        )}
      </div>
    </button>
  );
}
