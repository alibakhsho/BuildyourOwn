/* =========================================================================
   InteriorCard — furniture & styling in the left rail: furnish the rooms
   (on by default) and pick an interior style. The 3D model, the cut list
   (as an FF&E list) and the cinematic film all follow it.
   ========================================================================= */
import InputCard from "./ui/InputCard.jsx";
import Field from "./ui/Field.jsx";
import Toggle from "./ui/Toggle.jsx";
import { colors as TOKENS } from "../design/system.js";
import { INTERIOR_STYLES } from "../logic/structure/index.js";

export default function InteriorCard({ spec, update }) {
  const on = spec.furnish !== false;
  const style = INTERIOR_STYLES[spec.interiorStyle] ? spec.interiorStyle : "modern";
  return (
    <InputCard defaultOpen={false} title="Interior design" badge={on ? INTERIOR_STYLES[style].label : "Unfurnished"}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Toggle label="Furnish the rooms" value={on} onChange={(v) => update({ furnish: v })} />
      </div>
      {on && (
        <Field label="Style">
          <select className="ec-select" value={style} onChange={(e) => update({ interiorStyle: e.target.value })}>
            {Object.entries(INTERIOR_STYLES).map(([k, s]) => <option key={k} value={k}>{s.label} — {s.note}</option>)}
          </select>
        </Field>
      )}
      <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 6, lineHeight: 1.5 }}>
        Every room furnished for what it is, against its real walls and clear of its doors: beds, sofas, dining, study, rugs, art, curtains and lighting, a car in the garage and a setting on the deck.
        Shown in 3D and the film; listed in the cut list, not priced.
      </p>
    </InputCard>
  );
}
