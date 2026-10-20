/* =========================================================================
   Drawings — the A3 drawing set generated from the 3D model
   (logic/drawings.js): plans, elevations, section, wall frames, roof
   framing + truss detail, slab, schedules. View a sheet, download it as
   SVG (opens in any CAD / Illustrator / browser), or print the whole set
   to PDF.
   ========================================================================= */
import { useMemo, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { buildStructure } from "../logic/structure/index.js";
import { drawingSet } from "../logic/drawings.js";

const fileSafe = (s) => String(s || "build").replace(/[^\w-]+/g, "-");

export default function Drawings({ spec, projectName, projectNo }) {
  const sheets = useMemo(() => {
    const S = buildStructure(spec);
    const info = { project: projectName || "My build", projectNo: projectNo || "", date: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) };
    return drawingSet(S, info);
  }, [spec, projectName, projectNo]);
  const [active, setActive] = useState(0);
  const cur = sheets[Math.min(active, sheets.length - 1)];
  const svg = useMemo(() => {
    try { return cur.svg(); } catch (e) { console.error(e); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297"><text x="20" y="40" font-size="8">This sheet couldn't be drawn: ${String(e.message).replace(/</g, "&lt;")}</text></svg>`; }
  }, [cur]);

  const download = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileSafe(projectName)}-${cur.number}-${fileSafe(cur.title)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const openFull = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  // print every sheet, one per A3 landscape page, from a hidden frame
  const printAll = () => {
    const pages = sheets.map((s) => { try { return s.svg(); } catch { return ""; } })
      .map((x) => `<div class="page">${x.replace(/width="420mm" height="297mm"/, 'width="100%" height="100%"')}</div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${fileSafe(projectName)} drawings</title>
      <style>@page{size:A3 landscape;margin:0}html,body{margin:0}.page{width:420mm;height:297mm;page-break-after:always;overflow:hidden}.page svg{display:block}</style></head><body>${pages}</body></html>`;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 400);
  };

  return (
    <div className="ec-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div className="ec-eyebrow">Drawings</div>
          <div style={{ fontSize: 13, color: TOKENS.steel, marginTop: 4, maxWidth: "72ch" }}>
            {sheets.length} A3 sheets drawn straight from the 3D model, so they always match it and the cut list. Indicative — for pricing and discussion, not construction.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ec-btn ec-btn-ghost" onClick={openFull}>Open full size</button>
          <button className="ec-btn ec-btn-ghost" onClick={download}>Download SVG</button>
          <button className="ec-btn ec-btn-hivis" onClick={printAll}>Print / save set as PDF</button>
        </div>
      </div>
      <div role="tablist" aria-label="Sheets" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {sheets.map((s, i) => (
          <button key={s.id} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
            style={{ border: `1px solid ${i === active ? TOKENS.ink : TOKENS.rule}`, background: i === active ? TOKENS.ink : TOKENS.card, color: i === active ? TOKENS.paper : TOKENS.ink,
              borderRadius: 6, padding: "5px 9px", cursor: "pointer", font: "inherit", fontSize: 12 }}>
            <span className="ec-mono" style={{ fontWeight: 700, marginRight: 6 }}>{s.number}</span>{s.title}
          </button>
        ))}
      </div>
      <div style={{ border: `1px solid ${TOKENS.rule}`, background: "#5a6068", padding: 12, borderRadius: 8, overflow: "auto" }}>
        <div style={{ background: "#fff", boxShadow: "0 6px 24px rgba(0,0,0,0.35)", aspectRatio: "420 / 297", width: "100%", maxWidth: 1600, margin: "0 auto" }}
          dangerouslySetInnerHTML={{ __html: svg.replace(/width="420mm" height="297mm"/, 'width="100%" height="100%"') }} />
      </div>
    </div>
  );
}
