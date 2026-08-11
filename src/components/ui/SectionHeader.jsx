/* Numbered heading inside the cost breakdown. The index is a real reference
   (M, S, H …) used by the printed report, not decoration. */
import { colors as TOKENS } from "../../design/system.js";

export default function SectionHeader({ index, title }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
      <span className="ec-mono" style={{ fontSize: 22, color: TOKENS.hivis, fontWeight: 700 }}>{index}</span>
      <h3 className="ec-display" style={{ fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{title}</h3>
      <div style={{ flex: 1, borderTop: `1px solid ${TOKENS.rule}` }} />
    </div>
  );
}
