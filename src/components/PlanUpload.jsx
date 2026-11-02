/* =========================================================================
   PlanUpload — the "Upload plans" tab on the Describe card.

   For people who have a plan but not a CAD file: a phone photo of a
   brochure or printed plan (JPG / PNG / HEIC / WEBP) or a PDF. A PDF shows
   its pages so the floor plan can be picked. The AI plan reader returns
   rooms and sizes (ai/vision.js readPlanBrief); the owner sees the list,
   drops anything misread, and only then is it applied to the estimate
   (onApply → App → logic/describe.js houseSpecFromPlan).

   Without AI on the plan, the tab says so and offers the upgrade — the
   typed Describe tab stays free.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { readPlanBrief } from "../ai/vision.js";
import { AiAccessError } from "../ai/client.js";
import { normaliseImage, downscaleForVision } from "../state/blobstore.js";
import { compactText } from "../logic/pdf-sheets.js";

const ACCEPT = "image/*,application/pdf,.pdf,.heic,.heif";
const isPdf = (f) => /pdf$/i.test(f.type || "") || /\.pdf$/i.test(f.name || "");

export default function PlanUpload({ useAi, onApply, onUpgrade }) {
  const inputRef = useRef(null);
  const [pages, setPages] = useState([]);          // [{ url, blob, text, label }]
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [brief, setBrief] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [done, setDone] = useState("");
  const [drag, setDrag] = useState(false);

  // hand the preview images back when they're replaced or the card goes
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  const load = async (file) => {
    if (!file) return;
    setErr(""); setBrief(null); setDone(""); setDropped(new Set());
    try {
      if (isPdf(file)) {
        setBusy("Opening the PDF…");
        const { readPdf } = await import("../lib/pdf-pages.js");
        const out = [];
        await readPdf(file, {
          maxEdge: 2400, maxPixels: 6e6, maxPages: 12,
          onProgress: (i, n) => setBusy(`Opening page ${i} of ${n}…`),
          onPage: (pg) => { out.push({ blob: pg.blob, url: URL.createObjectURL(pg.blob), text: pg.text, label: `Page ${pg.pageNo}` }); },
        });
        if (!out.length) throw new Error("That PDF has no pages.");
        // the floor plan is usually the page with the most dimension text; start there
        const best = out.reduce((bi, p, i) => ((p.text?.length || 0) > (out[bi].text?.length || 0) ? i : bi), 0);
        setPages(out); setPick(best);
      } else if (/^image\//i.test(file.type || "") || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name || "")) {
        setBusy("Preparing the photo…");
        const { blob } = await normaliseImage(file);
        setPages([{ blob, url: URL.createObjectURL(blob), text: null, label: file.name || "Photo" }]); setPick(0);
      } else {
        throw new Error("Use a photo (JPG, PNG, HEIC) or a PDF of the plan.");
      }
    } catch (e) { setErr(e.message || String(e)); setPages([]); }
    setBusy("");
  };

  const read = async () => {
    const page = pages[pick];
    if (!page || busy) return;
    setBusy("Reading the plan — about 20–60 seconds…"); setErr(""); setBrief(null); setDone("");
    try {
      const small = await downscaleForVision(page.blob);
      let pageText = "";
      if (page.text?.length) {
        // the text layer was laid out at the rendered size — scale it to the image the model sees
        const [a, b] = await Promise.all([createImageBitmap(small), createImageBitmap(page.blob)]);
        const k = a.width / b.width;
        a.close?.(); b.close?.();
        pageText = compactText(page.text.map((t) => ({ ...t, x: t.x * k, y: t.y * k })));
      }
      const b = await readPlanBrief(small, { pageText });
      if (!b.isPlan || !b.rooms.length) {
        setErr(b.notes || "That doesn't look like a floor plan. Try a closer, straighter photo of the plan itself.");
      } else setBrief(b);
    } catch (e) {
      if (e instanceof AiAccessError && (e.code === "upgrade" || e.code === "sign_in")) { setErr(e.message); onUpgrade?.(); }
      else setErr(e.message || "The plan reader failed.");
    }
    setBusy("");
  };

  const apply = () => {
    const b = { ...brief, rooms: brief.rooms.filter((_, i) => !dropped.has(i)) };
    const summary = onApply({ kind: "plan", brief: b, found: true });
    setDone(summary || "Applied.");
    setBrief(null);
  };

  if (!useAi) {
    return (
      <div style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.5 }}>
        <p style={{ margin: "0 0 8px" }}>
          Snap a photo of your plan (or upload the PDF) and the AI reads the rooms and sizes for you. Plan reading is part of the AI plans — the <strong>Describe it</strong> tab stays free: type what the plan shows, e.g. <em>"4 bed 2 bath, 16 × 12 m, double garage"</em>.
        </p>
        <button className="ec-btn ec-btn-hivis" style={{ width: "100%", justifyContent: "center" }} onClick={() => onUpgrade?.()}>See plans with AI plan reading</button>
      </div>
    );
  }

  const page = pages[pick];
  return (
    <div>
      <div role="button" tabIndex={0} aria-label="Upload a photo or PDF of your plan"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files?.[0]); }}
        style={{ border: `2px dashed ${drag ? TOKENS.hivis : TOKENS.rule}`, borderRadius: 12, padding: page ? 6 : "18px 12px", textAlign: "center", cursor: "pointer", background: drag ? TOKENS.accentWash : TOKENS.paperLight }}>
        {page ? (
          <img src={page.url} alt="Your plan" style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 8, background: "#fff" }} />
        ) : (
          <>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: TOKENS.steel }}>
              <path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="3.5" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Take a photo or upload your plan</div>
            <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 2 }}>JPG · PNG · HEIC · PDF — a brochure or printed plan is fine</div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />

      {pages.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 4 }}>Which page is the floor plan?</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {pages.map((p, i) => (
              <button key={i} onClick={() => { setPick(i); setBrief(null); }} aria-pressed={i === pick} title={p.label}
                style={{ flex: "0 0 auto", width: 62, padding: 2, borderRadius: 6, border: `2px solid ${i === pick ? TOKENS.hivis : TOKENS.rule}`, background: "#fff", cursor: "pointer" }}>
                <img src={p.url} alt={p.label} style={{ display: "block", width: "100%", height: 44, objectFit: "contain" }} />
                <span className="ec-mono" style={{ fontSize: 9, color: "#334155" }}>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {page && !brief && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="ec-btn ec-btn-hivis" style={{ flex: 1, justifyContent: "center" }} onClick={read} disabled={!!busy}>{busy ? "Reading…" : "Read this plan"}</button>
          <button className="ec-btn ec-btn-ghost" onClick={() => { setPages([]); setErr(""); setDone(""); }} disabled={!!busy}>Clear</button>
        </div>
      )}
      {busy && <div className="ec-mono" style={{ fontSize: 11, marginTop: 8, color: TOKENS.steel }}>{busy}</div>}
      {err && <div className="ec-mono" style={{ fontSize: 11, marginTop: 8, color: TOKENS.alert, lineHeight: 1.45 }}>{err}</div>}
      {done && <div className="ec-mono" style={{ fontSize: 11, marginTop: 8, color: TOKENS.ok, lineHeight: 1.45 }}>{done}</div>}

      {brief && (
        <div style={{ marginTop: 10 }}>
          <div className="ec-eyebrow" style={{ marginBottom: 4 }}>What I read — untick anything wrong</div>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, marginBottom: 6 }}>
            {[brief.storeys ? `${brief.storeys} storey${brief.storeys > 1 ? "s" : ""}` : null,
              brief.overallWidthM && brief.overallLengthM ? `${brief.overallWidthM} × ${brief.overallLengthM} m overall` : null,
              brief.totalAreaM2 ? `${brief.totalAreaM2} m² total` : null,
              brief.garageSpaces ? `${brief.garageSpaces}-car garage` : null,
              brief.windows ? `${brief.windows} windows` : null].filter(Boolean).join(" · ") || "No overall sizes printed — the footprint comes from the rooms."}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${TOKENS.rule}`, borderRadius: 8 }}>
            {brief.rooms.map((r, i) => (
              <label key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 6, alignItems: "center", padding: "5px 8px", borderTop: i ? `1px solid ${TOKENS.rule}` : "none", fontSize: 12, opacity: dropped.has(i) ? 0.45 : 1 }}>
                <input type="checkbox" checked={!dropped.has(i)} onChange={() => setDropped((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                <span><strong>{r.name}</strong> <span style={{ color: TOKENS.steel }}>{r.type}{r.level ? ` · level ${r.level + 1}` : ""}</span></span>
                <span className="ec-mono" style={{ color: r.widthM ? TOKENS.ink : TOKENS.steel }}>{r.widthM && r.lengthM ? `${r.widthM} × ${r.lengthM} m` : "size not printed"}</span>
              </label>
            ))}
          </div>
          {brief.notes && <div className="ec-mono" style={{ fontSize: 11, marginTop: 6, color: TOKENS.steel, lineHeight: 1.45 }}>{brief.notes}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="ec-btn ec-btn-hivis" style={{ flex: 1, justifyContent: "center" }} onClick={apply}>Use this plan for my estimate</button>
            <button className="ec-btn ec-btn-ghost" onClick={() => setBrief(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
