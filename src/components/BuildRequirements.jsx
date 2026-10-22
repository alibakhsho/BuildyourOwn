/* =========================================================================
   COMPONENT: BuildRequirements
   The homeowner's read-only view of what their build will need signed off
   before it starts — soil test, engineering, building approval and so on —
   and roughly what that costs. They answer a few questions about the block;
   they can't manage anything here. Arranging the work is the builder's job,
   in Site Office → job → Approvals.
   ========================================================================= */

import React, { useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { fmt } from "../lib/format.js";
import { AU_STATES, BUILD_TYPES, homeownerRequirements } from "../logic/approvals.js";

const LS = "byo.homeownerSite.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

export default function BuildRequirements({ floors = 1, currency = "$" }) {
  const [site, setSite] = useState(() => ({ state: "QLD", buildType: "new_dwelling", ...load() }));
  const set = (changes) => {
    const next = { ...site, ...changes };
    setSite(next);
    try { localStorage.setItem(LS, JSON.stringify(next)); } catch { /* per-device convenience only */ }
  };
  const r = homeownerRequirements({ ...site, storeys: floors });

  return (
    <div className="ec-card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Before you can build</div>
      <div className="ec-display" style={{ fontSize: 20, lineHeight: 1.2, marginBottom: 10 }}>
        {r.needsStructural ? "This work needs structural sign-off" : "No structural sign-off expected"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
        <label className="ec-mono" style={{ fontSize: 11 }}>State
          <select className="ec-select" value={site.state} onChange={(e) => set({ state: e.target.value })} style={{ display: "block", width: "100%", marginTop: 3 }}>
            {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="ec-mono" style={{ fontSize: 11 }}>Type of work
          <select className="ec-select" value={site.buildType} onChange={(e) => set({ buildType: e.target.value })} style={{ display: "block", width: "100%", marginTop: 3 }}>
            {BUILD_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, marginBottom: 14 }}>
        {[["bushfire", "Bushfire-prone"], ["flood", "Flood overlay"], ["heritage", "Heritage area"], ["slopeOver15", "Steep block"]].map(([k, label]) => (
          <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={!!site[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>

      {r.needsStructural ? (
        <>
          <List title="Structural & approvals" items={r.structural} />
          {r.other.length > 0 && <List title="Also needed" items={r.other} />}
          <div style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.6, marginTop: 10 }}>
            Typically around <b>{currency}{fmt(r.typicalFees)}</b> in consultant and permit fees, on top of the build.
            {r.priceMovers > 0 && <> {r.priceMovers} of these reports can move the build price — your builder can only fix the price once they're in.</>}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.6 }}>
          Work that doesn't change the structure usually needs no engineer or building approval. Your builder will confirm.
        </div>
      )}
      <div style={{ fontSize: 10, color: TOKENS.steel, marginTop: 10, lineHeight: 1.5 }}>
        A guide, not advice. Your builder arranges and is responsible for engineering and approvals.
      </div>
    </div>
  );
}

function List({ title, items }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: TOKENS.steel, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((i) => (
          <div key={i.key} style={{ fontSize: 12, lineHeight: 1.5 }}>
            <b>{i.label}</b> <span style={{ color: TOKENS.steel }}>· {i.who}</span>
            <div style={{ color: TOKENS.inkSoft }}>{i.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
