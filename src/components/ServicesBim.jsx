/* =========================================================================
   ServicesBim — the trades tab beside the cut list and drawings:
     - electrical, plumbing and drainage take-off, point by point, priced
     - the compliance checklist each trade will be asked to sign off
     - BIM / CAD exports: IFC4 (coordination or full) and DXF plans per
       storey, layered by trade
   Everything is read from the same model as the 3D view (buildStructure),
   so the files, the 3D and the price always describe the same building.
   ========================================================================= */
import { useMemo, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { buildStructure, schedule, unitLabel, servicesCompliance, servicesTakeoff } from "../logic/structure/index.js";
import { exportIfc } from "../logic/bim/ifc.js";
import { planDxf } from "../logic/bim/dxf.js";

const fileSafe = (s) => String(s || "build").replace(/[^\w-]+/g, "-");
const money = (v) => `$${Math.round(v).toLocaleString("en-AU")}`;

function save(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function ServicesBim({ spec, projectName }) {
  const S = useMemo(() => buildStructure(spec), [spec]);
  const trades = useMemo(() => servicesTakeoff(schedule(S.members)), [S]);
  const checks = useMemo(() => servicesCompliance(S), [S]);
  const [open, setOpen] = useState(() => new Set(["electrical"]));
  const [busy, setBusy] = useState("");
  const total = trades.reduce((a, t) => a + t.total, 0);
  const sv = S.summary.services || {};
  const name = fileSafe(projectName);

  // exports run on the next tick so the button can show it is working
  const run = (key, fn) => { setBusy(key); setTimeout(() => { try { fn(); } finally { setBusy(""); } }, 30); };
  const ifc = (detail) => run(`ifc-${detail}`, () => save(exportIfc(S, { project: projectName || "My build", detail, date: new Date().toISOString() }), `${name}${detail === "full" ? "-full" : ""}.ifc`, "application/x-step"));
  const dxf = (f) => run(`dxf-${f}`, () => save(planDxf(S, f, { project: projectName || "My build" }), `${name}-${f === 0 ? "ground" : `level-${f}`}-plan.dxf`, "application/dxf"));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ec-card" style={{ padding: 18 }}>
        <div className="ec-eyebrow">Services — every trade in the model</div>
        <div style={{ fontSize: 13, color: TOKENS.steel, marginTop: 4, maxWidth: "75ch", lineHeight: 1.55 }}>
          Electrical, plumbing and drainage are laid out room by room in the 3D model ({(sv.gpo || 0)} power points, {(sv.light || 0)} lights,{" "}
          {(sv.smoke || 0)} smoke alarms, {(sv.circuits || 0)} circuits) and priced point by point. Turn on the <strong>Services</strong> view in 3D to see them.
          Indicative: the licensed electrician and plumber design, install and certify the final system.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {trades.map((t) => (
            <div key={t.sys} style={{ border: `1px solid ${TOKENS.rule}`, borderRadius: 8, padding: "10px 14px", minWidth: 150 }}>
              <div style={{ fontSize: 11, color: TOKENS.steel, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t.label}</div>
              <div className="ec-mono" style={{ fontSize: 18, fontWeight: 700 }}>{money(t.total)}</div>
            </div>
          ))}
          <div style={{ border: `1px solid ${TOKENS.ink}`, borderRadius: 8, padding: "10px 14px", minWidth: 150, background: TOKENS.accentWash }}>
            <div style={{ fontSize: 11, color: TOKENS.steel, textTransform: "uppercase", letterSpacing: "0.08em" }}>Services total (ex GST)</div>
            <div className="ec-mono" style={{ fontSize: 18, fontWeight: 700 }}>{money(total)}</div>
          </div>
        </div>

        {trades.map((t) => {
          const isOpen = open.has(t.sys);
          return (
            <div key={t.sys} style={{ borderTop: `1px solid ${TOKENS.rule}`, marginTop: 12 }}>
              <button aria-expanded={isOpen} onClick={() => setOpen((s) => { const n = new Set(s); n.has(t.sys) ? n.delete(t.sys) : n.add(t.sys); return n; })}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "10px 2px", border: "none", background: "none", cursor: "pointer", font: "inherit", color: TOKENS.ink }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{isOpen ? "▾" : "▸"} {t.label}</span>
                <span className="ec-mono" style={{ fontSize: 12 }}>{t.lines.length} items · {money(t.total)}</span>
              </button>
              {isOpen && (
                <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: TOKENS.steel }}>
                        {["Item", "Product", "Qty", "Rate", "Amount"].map((h, i) => <th key={h} style={{ padding: "4px 8px", fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${TOKENS.rule}`, textAlign: i > 1 ? "right" : "left" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {t.lines.map((r, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
                          <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.item}</td>
                          <td style={{ padding: "6px 8px" }}>{r.profile}</td>
                          <td className="ec-mono" style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{r.unit === "ea" ? r.qty : r.qty.toFixed(1)} {unitLabel(r.unit)}</td>
                          <td className="ec-mono" style={{ padding: "6px 8px", textAlign: "right" }}>{money(r.rate)}</td>
                          <td className="ec-mono" style={{ padding: "6px 8px", textAlign: "right" }}>{money(r.amount)}</td>
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

      <div className="ec-card" style={{ padding: 18 }}>
        <div className="ec-eyebrow">What each trade will certify</div>
        <div style={{ fontSize: 13, color: TOKENS.steel, margin: "4px 0 12px" }}>
          Checked against this model. The electrician issues the Certificate of Compliance (CCEW in NSW) and the plumber the Certificate of Compliance / Notice of Work on completion.
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {checks.map((c) => (
            <div key={c.key} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
              <span aria-label={c.ok ? "met" : "not met"} style={{ color: c.ok ? TOKENS.ok : TOKENS.alert, fontWeight: 700 }}>{c.ok ? "✓" : "✕"}</span>
              <span style={{ fontSize: 13 }}>{c.rule}<span style={{ display: "block", fontSize: 11, color: TOKENS.steel }}>{c.ref}</span></span>
              <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{c.who}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ec-card" style={{ padding: 18 }}>
        <div className="ec-eyebrow">Send it to the consultants — BIM & CAD</div>
        <div style={{ fontSize: 13, color: TOKENS.steel, margin: "4px 0 14px", maxWidth: "75ch", lineHeight: 1.55 }}>
          <strong>IFC4</strong> opens in Revit, ArchiCAD, Tekla, Vectorworks, Solibri, Navisworks and any IFC viewer, with every room as a space, every piece as its proper
          element type (outlets, light fittings, pipe segments, sanitary terminals, members, slabs …) and each trade as its own system for clash checks.{" "}
          <strong>DXF</strong> plans open in AutoCAD, BricsCAD, DraftSight and LibreCAD, one layer per trade (E-POWR, E-LITE, P-DOMW, D-SANR …).
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ec-btn ec-btn-hivis" disabled={!!busy} onClick={() => ifc("coordination")}>{busy === "ifc-coordination" ? "Building…" : "IFC — coordination model"}</button>
          <button className="ec-btn ec-btn-ghost" disabled={!!busy} onClick={() => ifc("full")} title="Every brick, bolt and screw — a much larger file">{busy === "ifc-full" ? "Building…" : "IFC — every piece"}</button>
          {Array.from({ length: S.env.floors }, (_, f) => (
            <button key={f} className="ec-btn ec-btn-ghost" disabled={!!busy} onClick={() => dxf(f)}>
              {busy === `dxf-${f}` ? "Building…" : `DXF — ${f === 0 ? "ground" : f === 1 ? "first" : `level ${f}`} floor plan`}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: TOKENS.steel, marginTop: 12, lineHeight: 1.5 }}>
          These are open-standard files for coordination, pricing and design development. They are not stamped construction documents: the certifier approves the
          building, the engineer certifies structure, and the licensed trades certify their own installations.
        </div>
      </div>
    </div>
  );
}
