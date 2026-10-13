/* =========================================================================
   MultiDwelling — the Builder plan's multi-dwelling quoting screens.

   A project is a list of house TYPES (each a normal residential spec) with
   a count of each, plus the project assumptions from logic/multi-dwelling.
   Three views, one per workspace page:
     MultiDwellingPanel  Estimate page, left rail — types + assumptions
     MultiCostPlan       Costs page — per-type and project cost plan
     MultiProgramme      Timeline page — waves of construction
   ========================================================================= */
import { colors as TOKENS } from "../design/system.js";
import InputCard from "../components/ui/InputCard.jsx";
import InputRow from "../components/ui/InputRow.jsx";
import Field from "../components/ui/Field.jsx";
import { fmt } from "../lib/format.js";
import { MD_DEFAULT_ASSUMPTIONS } from "../logic/multi-dwelling.js";

let seq = 0;
const uid = () => `ht_${Date.now().toString(36)}${(seq++).toString(36)}`;

/* A plain house type: envelope + finishes. Rooms are left empty so the
   estimator uses its GFA-based internal allowances — right for volume
   builds where every unit shares a standard inclusions list. */
export function houseType(name, patch = {}) {
  return {
    id: uid(), name, count: 1,
    spec: {
      widthM: 10, lengthM: 16, floors: 1, wallHeightM: 2.55, roofPitch: 22, slabThicknessM: 0.1,
      siteCondition: "flat", framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
      hasGarage: true, solar: false, staircaseType: "none",
      openings: { windowsCount: 9, windowsM2: 12, doors: 2 },
      rooms: [], kitchens: [], bathrooms: [], extras: [],
      ...patch,
    },
  };
}

export function defaultMultiSpec() {
  return {
    types: [
      { ...houseType("Type A — single storey"), count: 6 },
      { ...houseType("Type B — double storey", { widthM: 8, lengthM: 14, floors: 2, staircaseType: "timber", openings: { windowsCount: 12, windowsM2: 16, doors: 2 } }), count: 4 },
    ],
    assumptions: {},
  };
}

const sel = (value, onChange, opts) => (
  <select className="ec-select" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
    {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);
const num = (value, onChange, props = {}) => (
  <input className="ec-input" type="number" value={value} onChange={(e) => onChange(+e.target.value)} {...props} />
);

export function MultiDwellingPanel({ mdSpec, setMdSpec, estimate, currency }) {
  const types = mdSpec.types || [];
  const A = { ...MD_DEFAULT_ASSUMPTIONS, ...(mdSpec.assumptions || {}) };
  const site = { ...MD_DEFAULT_ASSUMPTIONS.site, ...((mdSpec.assumptions || {}).site || {}) };
  const setTypes = (next) => setMdSpec({ ...mdSpec, types: next });
  const patchType = (id, patch) => setTypes(types.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const patchSpec = (id, patch) => setTypes(types.map((t) => (t.id === id ? { ...t, spec: { ...t.spec, ...patch } } : t)));
  const setA = (patch) => setMdSpec({ ...mdSpec, assumptions: { ...(mdSpec.assumptions || {}), ...patch } });
  const setSite = (patch) => setA({ site: { ...((mdSpec.assumptions || {}).site || {}), ...patch } });
  const dwellings = types.reduce((a, t) => a + (+t.count || 0), 0);

  return (
    <>
      <InputCard title="House types" badge={`${dwellings} dwellings`}>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.steel, margin: "0 0 12px" }}>
          Add each design once and say how many you're building. Repeat units get cheaper — see Costs.
        </p>
        {types.map((t, i) => (
          <div key={t.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 12, marginBottom: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input className="ec-input" value={t.name} onChange={(e) => patchType(t.id, { name: e.target.value })} style={{ flex: 1, fontWeight: 600 }} aria-label="House type name" />
              <button className="ec-btn ec-btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} title="Remove this type"
                onClick={() => setTypes(types.filter((x) => x.id !== t.id))}>Remove</button>
            </div>
            <InputRow>
              <Field label="How many">{num(t.count, (v) => patchType(t.id, { count: Math.max(0, Math.round(v)) }), { min: 0, max: 500, step: 1 })}</Field>
              <Field label="Storeys">{num(t.spec.floors, (v) => patchSpec(t.id, { floors: Math.max(1, Math.min(3, Math.round(v))), staircaseType: v > 1 ? (t.spec.staircaseType === "none" ? "timber" : t.spec.staircaseType) : "none" }), { min: 1, max: 3, step: 1 })}</Field>
            </InputRow>
            <InputRow>
              <Field label="Width (m)">{num(t.spec.widthM, (v) => patchSpec(t.id, { widthM: v }), { min: 4, max: 30, step: 0.5 })}</Field>
              <Field label="Length (m)">{num(t.spec.lengthM, (v) => patchSpec(t.id, { lengthM: v }), { min: 4, max: 40, step: 0.5 })}</Field>
            </InputRow>
            <InputRow>
              <Field label="Cladding">{sel(t.spec.claddingType, (v) => patchSpec(t.id, { claddingType: v }), [["brick", "Brick"], ["weatherboard", "Weatherboard"], ["render", "Render"]])}</Field>
              <Field label="Roof">{sel(t.spec.roofType, (v) => patchSpec(t.id, { roofType: v }), [["colorbond", "Colorbond"], ["tile", "Tile"], ["shingle", "Shingle"]])}</Field>
            </InputRow>
            <InputRow>
              <Field label="Windows">{num(t.spec.openings.windowsCount, (v) => patchSpec(t.id, { openings: { ...t.spec.openings, windowsCount: Math.max(0, Math.round(v)) } }), { min: 0, max: 60 })}</Field>
              <Field label="Garage">{sel(t.spec.hasGarage ? "yes" : "no", (v) => patchSpec(t.id, { hasGarage: v === "yes" }), [["yes", "Double"], ["no", "None"]])}</Field>
            </InputRow>
            {estimate?.types?.[i] && (
              <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>
                {fmt(estimate.types[i].gfaM2)} m² each · one-off {currency}{fmt(estimate.types[i].oneOffUnit)}
              </div>
            )}
          </div>
        ))}
        <button className="ec-btn ec-btn-ghost" style={{ width: "100%", justifyContent: "center" }}
          onClick={() => setTypes([...types, { ...houseType(`Type ${String.fromCharCode(65 + types.length)}`), count: 1 }])}>
          + Add a house type
        </button>
      </InputCard>

      <InputCard title="Delivery" defaultOpen={false} badge={`${A.concurrent} at a time`}>
        <InputRow>
          <Field label="Built at once">{num(A.concurrent, (v) => setA({ concurrent: Math.max(1, Math.round(v)) }), { min: 1, max: 50 })}</Field>
          <Field label="Wave overlap %">{num(Math.round(A.waveOverlap * 100), (v) => setA({ waveOverlap: Math.min(1, Math.max(0.1, v / 100)) }), { min: 10, max: 100 })}</Field>
        </InputRow>
      </InputCard>

      <InputCard title="Margins & site works" defaultOpen={false} badge="Editable">
        <InputRow>
          <Field label="Margin %">{num(Math.round(A.marginPct * 1000) / 10, (v) => setA({ marginPct: Math.max(0, v / 100) }), { min: 0, max: 40, step: 0.5 })}</Field>
          <Field label="Contingency %">{num(Math.round(A.contingencyPct * 1000) / 10, (v) => setA({ contingencyPct: Math.max(0, v / 100) }), { min: 0, max: 20, step: 0.5 })}</Field>
        </InputRow>
        <InputRow>
          <Field label={`Civil / lot (${currency})`}>{num(site.civilPerLot, (v) => setSite({ civilPerLot: v }), { min: 0, step: 500 })}</Field>
          <Field label={`Fencing / lot (${currency})`}>{num(site.fencingPerLot, (v) => setSite({ fencingPerLot: v }), { min: 0, step: 500 })}</Field>
        </InputRow>
        <InputRow>
          <Field label={`Landscape / lot (${currency})`}>{num(site.landscapingPerLot, (v) => setSite({ landscapingPerLot: v }), { min: 0, step: 500 })}</Field>
          <Field label={`Shared civil (${currency})`}>{num(site.sharedCivilFixed, (v) => setSite({ sharedCivilFixed: v }), { min: 0, step: 1000 })}</Field>
        </InputRow>
        <p style={{ fontSize: 11, lineHeight: 1.5, color: TOKENS.steel, margin: 0 }}>
          Defaults are indicative AU figures. Replace them with your own rates — every number on the Costs page follows.
        </p>
      </InputCard>
    </>
  );
}

const th = { textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}`, fontWeight: 600 };
const td = { padding: "9px 10px", fontSize: 13, borderBottom: `1px solid ${TOKENS.rule}` };
const tdr = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export function MultiCostPlan({ estimate: e, currency }) {
  const money = (v) => `${currency}${fmt(v || 0)}`;
  if (!e?.dwellings) return <p style={{ color: TOKENS.steel }}>Add at least one house type with a count above zero.</p>;
  const saving = e.oneOffTotal - e.houseOnlyTotal;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="ec-card" style={{ padding: 18, borderLeft: `4px solid ${TOKENS.hivis}` }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Why it's cheaper than {e.dwellings} one-off quotes</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: TOKENS.inkSoft }}>
          Quoted one at a time these homes come to <strong>{money(e.oneOffTotal)}</strong>. As one project they cost <strong>{money(e.houseOnlyTotal)}</strong> before site works —
          {" "}<strong style={{ color: TOKENS.ok }}>{money(saving)} less</strong> from a {Math.round(e.discount * 100)}% volume materials discount, repeat-build labour, shared equipment and one set of preliminaries.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className="ec-eyebrow" style={{ marginBottom: 8 }}>By house type</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Type</th><th style={{ ...th, textAlign: "right" }}>Units</th><th style={{ ...th, textAlign: "right" }}>m² each</th><th style={{ ...th, textAlign: "right" }}>Labour factor</th><th style={{ ...th, textAlign: "right" }}>Build cost (all units)</th></tr></thead>
          <tbody>
            {e.types.map((t) => (
              <tr key={t.id}>
                <td style={td}>{t.name}</td>
                <td style={tdr}>{t.count}</td>
                <td style={tdr}>{fmt(t.gfaM2)}</td>
                <td style={tdr}>{Math.round(t.learningFactor * 100)}%</td>
                <td style={tdr}>{money(t.buildCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className="ec-eyebrow" style={{ marginBottom: 8 }}>Site works</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {e.siteLines.map((l) => (
              <tr key={l.label}><td style={td}>{l.label}</td><td style={tdr}>{l.qty} {l.unit}</td><td style={tdr}>{money(l.rate)}</td><td style={tdr}>{money(l.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ maxWidth: 520, marginLeft: "auto", width: "100%" }}>
        {[
          ["Materials (after volume discount)", e.materialsTotal],
          ["Labour (with learning curve)", e.labourTotal],
          ["Equipment (shared)", e.equipmentTotal],
          ["Site works", e.siteWorks],
          [`Preliminaries (${Math.round(e.prelimsPct * 100)}%, whole project)`, e.prelims],
          [`Margin (${Math.round(e.assumptions.marginPct * 1000) / 10}%)`, e.margin],
          [`Contingency (${Math.round(e.assumptions.contingencyPct * 1000) / 10}%)`, e.contingency],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${TOKENS.rule}`, fontSize: 13 }}>
            <span style={{ color: TOKENS.inkSoft }}>{l}</span><span className="ec-mono">{money(v)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 16, fontWeight: 700 }}>
          <span>Project total (ex {e.taxLabel})</span><span className="ec-mono">{money(e.total)}</span>
        </div>
      </div>
    </div>
  );
}

export function MultiProgramme({ estimate: e }) {
  if (!e?.dwellings) return <p style={{ color: TOKENS.steel }}>Add house types to see the programme.</p>;
  const unit = Math.max(...e.types.map((t) => t.unitWeeks), 1);
  const per = Math.max(1, e.assumptions.concurrent);
  const waves = Array.from({ length: e.waves }, (_, i) => ({
    i, start: i * unit * e.assumptions.waveOverlap, homes: Math.min(per, e.dwellings - i * per),
  }));
  const total = e.totalWeeks || 1;
  return (
    <div>
      <p style={{ fontSize: 13, color: TOKENS.inkSoft, lineHeight: 1.6, marginTop: 0 }}>
        {e.dwellings} homes in {e.waves} wave{e.waves > 1 ? "s" : ""} of up to {per}. Each home takes about {unit} weeks; a new wave starts when the last is {Math.round(e.assumptions.waveOverlap * 100)}% through, so trades roll from house to house. <strong>About {e.totalWeeks} weeks</strong> overall.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {waves.map((w) => (
          <div key={w.i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "center" }}>
            <span className="ec-mono" style={{ fontSize: 11 }}>Wave {w.i + 1} · {w.homes} home{w.homes > 1 ? "s" : ""}</span>
            <div style={{ position: "relative", height: 18, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
              <div style={{ position: "absolute", left: `${(w.start / total) * 100}%`, width: `${(unit / total) * 100}%`, top: 0, bottom: 0, background: TOKENS.hivis }} />
            </div>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10 }}>
          <span />
          <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: TOKENS.steel }}>
            <span>Week 0</span><span>Week {Math.round(total / 2)}</span><span>Week {total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
