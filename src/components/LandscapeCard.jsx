/* =========================================================================
   LandscapeCard — the yard inputs in the left rail: the lot (as setbacks
   from the house), fences, deck, paths & driveway, garden beds, lawn and
   retaining. Everything lands in spec.landscape, which the 3D model, the
   landscape plan and the estimate all read.
   ========================================================================= */
import InputCard from "./ui/InputCard.jsx";
import InputRow from "./ui/InputRow.jsx";
import Field from "./ui/Field.jsx";
import Toggle from "./ui/Toggle.jsx";
import { colors as TOKENS } from "../design/system.js";
import { landscapeSpec, DECK_BOARDS, SURFACES, PLANTINGS } from "../logic/structure/index.js";
import { STD } from "../logic/house-geometry.js";

const sub = { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: TOKENS.steel, fontFamily: "var(--font-mono, monospace)", margin: "12px 0 6px" };

export default function LandscapeCard({ spec, setSpec, total, currency = "$" }) {
  const L = landscapeSpec(spec);
  const set = (patch) => setSpec((s) => ({ ...s, landscape: { ...(s.landscape || {}), ...patch } }));
  const n = (key, { min = 0, max = 40, step = 0.1 } = {}) => (
    <input className="ec-input" type="number" min={min} max={max} step={step} value={L[key]} onChange={(e) => set({ [key]: +e.target.value })} />
  );
  const sel = (key, options) => (
    <select className="ec-select" value={L[key]} onChange={(e) => set({ [key]: e.target.value })}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
  const lotW = (spec.widthM || 0) + (spec.hasGarage ? STD.garage.w : 0) + L.sideLeftM + L.sideRightM;
  const lotD = (spec.lengthM || 0) + L.frontSetbackM + L.rearYardM;
  const badge = L.enabled ? (total > 0 ? `${currency}${Math.round(total).toLocaleString("en-AU")}` : "On") : "Off";

  return (
    <InputCard defaultOpen={false} title="Landscaping" badge={badge}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Toggle label={L.enabled ? "Landscaping included" : "Add landscaping"} value={L.enabled} onChange={(v) => set({ enabled: v })} />
      </div>
      {!L.enabled ? (
        <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, lineHeight: 1.5, margin: 0 }}>
          Fences, a deck, paths and driveway, garden beds and lawn around the house: modelled piece by piece in 3D, drawn on a landscape plan and priced with labour.
        </p>
      ) : (
        <>
          <div style={sub}>The lot — {lotW.toFixed(1)} × {lotD.toFixed(1)} m ({Math.round(lotW * lotD)} m²)</div>
          <InputRow>
            <Field label="Front setback (m)">{n("frontSetbackM", { min: 1.5, max: 30, step: 0.5 })}</Field>
            <Field label="Back yard depth (m)">{n("rearYardM", { min: 1, max: 40, step: 0.5 })}</Field>
          </InputRow>
          <InputRow>
            <Field label={spec.hasGarage ? "Left side, garage side (m)" : "Left side (m)"}>{n("sideLeftM", { min: 0.45, max: 15 })}</Field>
            <Field label="Right side (m)">{n("sideRightM", { min: 0.45, max: 15 })}</Field>
          </InputRow>

          <div style={sub}>Fences</div>
          <InputRow>
            <Field label="Side & back fence">{sel("fence", [["colorbond", "Steel sheet"], ["paling", "Timber paling"], ["none", "None"]])}</Field>
            <Field label="Height (m)">{n("fenceHeightM", { min: 0.9, max: 2.4 })}</Field>
          </InputRow>
          <Field label="Front fence">{sel("frontFence", [["none", "None — open front yard"], ["picket", "Timber picket, 1.0 m"]])}</Field>

          <div style={sub}>Deck</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Toggle label="Rear deck" value={L.deck} onChange={(v) => set({ deck: v })} />
          </div>
          {L.deck && (
            <>
              <InputRow>
                <Field label="Width (m)">{n("deckWidthM", { min: 1.2, max: 20 })}</Field>
                <Field label="Depth (m)">{n("deckDepthM", { min: 1.2, max: 10 })}</Field>
              </InputRow>
              <Field label="Boards">{sel("deckBoard", Object.entries(DECK_BOARDS).map(([k, b]) => [k, b.label]))}</Field>
            </>
          )}

          <div style={sub}>Paths & driveway</div>
          <InputRow>
            <Field label="Paths">{sel("path", Object.entries(SURFACES).map(([k, x]) => [k, x.label]))}</Field>
            <Field label="Path width (m)">{n("pathWidthM", { min: 0.6, max: 2.4 })}</Field>
          </InputRow>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Toggle label="Side path to the back" value={L.sidePath} onChange={(v) => set({ sidePath: v })} />
          </div>
          {spec.hasGarage && <Field label="Driveway">{sel("driveway", [["concrete", "Plain concrete"], ["exposed", "Exposed aggregate"], ["pavers", "Concrete pavers"]])}</Field>}

          <div style={sub}>Garden</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Toggle label="Garden beds" value={L.beds} onChange={(v) => set({ beds: v })} />
          </div>
          {L.beds && (
            <>
              <InputRow>
                <Field label="Bed depth (m)">{n("bedDepthM", { min: 0.4, max: 4 })}</Field>
                <Field label="Edging">{sel("edging", [["steel", "Galvanised steel"], ["timber", "Treated pine"], ["brick", "Brick mowing strip"]])}</Field>
              </InputRow>
              <Field label="Planting">{sel("planting", Object.entries(PLANTINGS).map(([k, p]) => [k, `${p.label} — ${p.shrub.profile.split(" — ")[0]}, ${p.low.profile.split(" — ")[0]}`]))}</Field>
            </>
          )}
          <InputRow>
            <Field label="Lawn">{sel("lawn", [["turf", "Turf (soft-leaf buffalo)"], ["synthetic", "Synthetic turf"], ["none", "None — leave for later"]])}</Field>
            <Field label="Retaining wall (m)">{n("retainingM", { min: 0, max: 2.4 })}</Field>
          </InputRow>
          <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 6, lineHeight: 1.5 }}>
            Priced at the landscaper's price (no builder margin). Put your landscaper's own rates in on 3D Model → Landscape.
          </p>
        </>
      )}
    </InputCard>
  );
}
