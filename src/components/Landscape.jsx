/* =========================================================================
   Landscape — the yard tab beside the cut list, drawings and services:
     - fencing, deck, paths & driveway, garden, lawn and retaining, priced
       piece by piece (supply) plus labour days per trade
     - every rate and day rate editable, so a landscaper can put their own
       numbers in; they are saved with the project (spec.landscape)
     - a CSV of the whole take-off to send to the landscaper
     - what to check before and during the work
   Everything is read from the same model as the 3D view (buildStructure).
   ========================================================================= */
import { useMemo, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { buildStructure, unitLabel, landscapeTakeoff, landscapeCompliance, landscapeSpec, LANDSCAPE_RATES, DAY_RATES, LANDSCAPE_REGION } from "../logic/structure/index.js";

const fileSafe = (s) => String(s || "build").replace(/[^\w-]+/g, "-");

function save(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csv(T, currency) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = [["Section", "Item", "Product / trade", "Quantity", "Unit", `Rate (${currency})`, `Amount (${currency})`].map(esc).join(",")];
  for (const g of T.groups) {
    for (const r of g.lines) out.push([g.label, r.item, r.profile, r.unit === "ea" ? r.qty : r.qty.toFixed(2), unitLabel(r.unit), r.rate.toFixed(2), r.amount].map(esc).join(","));
    for (const r of g.labourLines) out.push([g.label, r.item, `${r.tradeLabel} (labour)`, r.days, "days", r.rate.toFixed(2), r.amount].map(esc).join(","));
  }
  out.push(["Total", "", "", "", "", "", T.total].map(esc).join(","));
  return out.join("\n");
}

export default function Landscape({ spec, setSpec, projectName, region = "AU", currency = "$" }) {
  const L = landscapeSpec(spec);
  const S = useMemo(() => (L.enabled ? buildStructure(spec) : null), [spec, L.enabled]);
  const T = useMemo(() => (S ? landscapeTakeoff(S, { factor: LANDSCAPE_REGION[region] ?? 1 }) : null), [S, region]);
  const checks = useMemo(() => (S ? landscapeCompliance(S) : []), [S]);
  const [open, setOpen] = useState(() => new Set(["fencing"]));
  const money = (v) => `${currency}${Math.round(v).toLocaleString("en-AU")}`;
  const set = (patch) => setSpec((s) => ({ ...s, landscape: { ...(s.landscape || {}), ...patch } }));
  const setRate = (profile, v) => {
    const rates = { ...(L.rates || {}) };
    if (v === "" || !Number.isFinite(+v)) delete rates[profile]; else rates[profile] = +v;
    set({ rates });
  };
  const setDay = (trade, v) => {
    const dayRates = { ...(L.dayRates || {}) };
    if (v === "" || !Number.isFinite(+v)) delete dayRates[trade]; else dayRates[trade] = +v;
    set({ dayRates });
  };
  const customCount = Object.keys(L.rates || {}).length + Object.keys(L.dayRates || {}).length;

  if (!L.enabled) {
    return (
      <div className="ec-card" style={{ padding: 18 }}>
        <div className="ec-eyebrow">Landscape</div>
        <div style={{ fontSize: 13, color: TOKENS.steel, marginTop: 6, maxWidth: "70ch", lineHeight: 1.55 }}>
          Fences and gates, a rear deck, paths and the driveway, garden beds with planting, and lawn: laid out on the lot around this house, built piece by piece in 3D,
          drawn on a landscape plan (sheet L01) and priced with labour.
        </div>
        <button className="ec-btn ec-btn-hivis" style={{ marginTop: 14 }} onClick={() => set({ enabled: true })}>Add landscaping</button>
      </div>
    );
  }

  const q = S.landscape.q;
  const fenceLm = Object.values(q.fence).reduce((a, b) => a + b, 0);
  const pathM2 = Object.values(q.path).reduce((a, b) => a + b, 0);
  const lot = S.landscape.lot;
  const th = { padding: "4px 8px", fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${TOKENS.rule}` };
  const td = { padding: "6px 8px" };
  const rateInput = (value, onChange, custom, title) => (
    // commits on blur / Enter, so a rate can be cleared and retyped
    <input key={value} className="ec-input ec-mono" type="number" min="0" step="0.1" defaultValue={Number(value.toFixed(2))} title={title}
      onBlur={(e) => { if (+e.target.value !== Number(value.toFixed(2))) onChange(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ width: 84, textAlign: "right", padding: "3px 6px", fontSize: 12, borderColor: custom ? TOKENS.hivisDeep : undefined, background: custom ? TOKENS.accentWash : undefined }} />
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ec-card" style={{ padding: 18 }}>
        <div className="ec-eyebrow">Landscape — the yard, piece by piece</div>
        <div style={{ fontSize: 13, color: TOKENS.steel, marginTop: 4, maxWidth: "78ch", lineHeight: 1.55 }}>
          {(lot.X1 - lot.X0).toFixed(1)} × {(lot.Z1 - lot.Z0).toFixed(1)} m lot: {fenceLm.toFixed(0)} m of fence with {q.gates} gate{q.gates === 1 ? "" : "s"}
          {q.deck ? `, a ${q.deck.toFixed(1)} m² deck` : ""}{pathM2 ? `, ${pathM2.toFixed(0)} m² of paths` : ""}{q.drive ? `, a ${q.drive.toFixed(0)} m² driveway` : ""}
          {q.bed ? `, ${q.bed.toFixed(0)} m² of garden with ${q.plants} plants and ${q.trees} tree${q.trees === 1 ? "" : "s"}` : ""}{q.lawn && L.lawn !== "none" ? `, ${q.lawn.toFixed(0)} m² of ${L.lawn === "synthetic" ? "synthetic turf" : "turf"}` : ""}.
          Supply prices per piece plus labour days per trade, ex GST. Edit any rate to use your landscaper's numbers; they're saved with the project.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {T.groups.map((g) => (
            <div key={g.sys} style={{ border: `1px solid ${TOKENS.rule}`, borderRadius: 8, padding: "10px 14px", minWidth: 150 }}>
              <div style={{ fontSize: 11, color: TOKENS.steel, textTransform: "uppercase", letterSpacing: "0.08em" }}>{g.label}</div>
              <div className="ec-mono" style={{ fontSize: 18, fontWeight: 700 }}>{money(g.total)}</div>
            </div>
          ))}
          <div style={{ border: `1px solid ${TOKENS.ink}`, borderRadius: 8, padding: "10px 14px", minWidth: 150, background: TOKENS.accentWash }}>
            <div style={{ fontSize: 11, color: TOKENS.steel, textTransform: "uppercase", letterSpacing: "0.08em" }}>Landscape total (ex GST)</div>
            <div className="ec-mono" style={{ fontSize: 18, fontWeight: 700 }}>{money(T.total)}</div>
            <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{money(T.materials)} supply · {money(T.labour)} labour</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button className="ec-btn ec-btn-hivis" onClick={() => save(csv(T, currency), `${fileSafe(projectName)}-landscape-takeoff.csv`, "text/csv;charset=utf-8")}>Download take-off (CSV) for your landscaper</button>
          {customCount > 0 && <button className="ec-btn ec-btn-ghost" onClick={() => set({ rates: {}, dayRates: {} })}>Reset {customCount} custom rate{customCount === 1 ? "" : "s"}</button>}
        </div>

        {T.groups.map((g) => {
          const isOpen = open.has(g.sys);
          return (
            <div key={g.sys} style={{ borderTop: `1px solid ${TOKENS.rule}`, marginTop: 12 }}>
              <button aria-expanded={isOpen} onClick={() => setOpen((s) => { const n = new Set(s); n.has(g.sys) ? n.delete(g.sys) : n.add(g.sys); return n; })}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "10px 2px", border: "none", background: "none", cursor: "pointer", font: "inherit", color: TOKENS.ink }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{isOpen ? "▾" : "▸"} {g.label}</span>
                <span className="ec-mono" style={{ fontSize: 12 }}>{money(g.materials)} supply · {money(g.labour)} labour · {money(g.total)}</span>
              </button>
              {isOpen && (
                <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: TOKENS.steel }}>
                        {["Item", "Product", "Qty", "Rate", "Amount"].map((h, i) => <th key={h} style={{ ...th, textAlign: i > 1 ? "right" : "left" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((r, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${TOKENS.rule}` }}>
                          <td style={{ ...td, fontWeight: 600 }}>{r.item}</td>
                          <td style={td}>{r.profile}</td>
                          <td className="ec-mono" style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{r.unit === "ea" ? r.qty : r.qty.toFixed(r.unit === "m3" ? 2 : 1)} {unitLabel(r.unit)}</td>
                          <td style={{ ...td, textAlign: "right" }}>{rateInput(r.rate, (v) => setRate(r.profile, v), r.custom, `Default ${currency}${(LANDSCAPE_RATES[r.profile] ?? 0).toFixed(2)} per ${unitLabel(r.unit)}`)}</td>
                          <td className="ec-mono" style={{ ...td, textAlign: "right" }}>{money(r.amount)}</td>
                        </tr>
                      ))}
                      {g.labourLines.map((r, i) => (
                        <tr key={`l${i}`} style={{ borderBottom: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight }}>
                          <td style={{ ...td, fontWeight: 600 }}>{r.item}</td>
                          <td style={td}>{r.tradeLabel}{r.per ? ` · ${r.qty.toFixed(r.unit === "m³" ? 1 : 0)} ${r.unit} at ${r.per} ${r.unit}/day` : ` · ${r.qty} ${r.unit}`}</td>
                          <td className="ec-mono" style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{r.days} days</td>
                          <td style={{ ...td, textAlign: "right" }}>{rateInput(r.rate, (v) => setDay(r.trade, v), (L.dayRates || {})[r.trade] != null, `${r.tradeLabel} day rate — default ${currency}${DAY_RATES[r.trade]}`)}</td>
                          <td className="ec-mono" style={{ ...td, textAlign: "right" }}>{money(r.amount)}</td>
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
        <div className="ec-eyebrow">What to check — before and during the work</div>
        <div style={{ fontSize: 13, color: TOKENS.steel, margin: "4px 0 12px" }}>
          Checked against this model where it can be; the rest are site tasks to tick off. Rules are NSW unless noted; councils and other states set their own limits.
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {checks.map((c) => (
            <div key={c.key} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${TOKENS.rule}` }}>
              <span aria-label={c.ok === null ? "to do on site" : c.ok ? "met" : "not met"} style={{ color: c.ok === null ? TOKENS.steel : c.ok ? TOKENS.ok : TOKENS.alert, fontWeight: 700 }}>{c.ok === null ? "○" : c.ok ? "✓" : "✕"}</span>
              <span style={{ fontSize: 13 }}>{c.rule}<span style={{ display: "block", fontSize: 11, color: TOKENS.steel }}>{c.ref}</span></span>
              <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{c.who}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: TOKENS.steel, marginTop: 12, lineHeight: 1.5 }}>
          Indicative layout and pricing for planning and quoting. Your landscaper sets out on site from the survey and confirms the final design, product and price.
        </div>
      </div>
    </div>
  );
}
