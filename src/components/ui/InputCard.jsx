/* =========================================================================
   InputCard — a bordered panel in the left input rail: title, optional badge,
   optional "Clear" button that turns alert-coloured on hover.
   ========================================================================= */
import { colors as TOKENS } from "../../design/system.js";

export default function InputCard({ title, badge, children, onClear }) {
  return (
    <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${TOKENS.rule}` }}>
        <h3 className="ec-display" style={{ fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {badge != null && <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: TOKENS.steel }}>{badge}</span>}
          {onClear && (
            <button onClick={onClear} title={`Clear ${title}`}
              className="ec-mono"
              style={{ fontSize: 9, letterSpacing: "0.1em", padding: "3px 8px", border: `1px solid ${TOKENS.rule}`, background: "transparent", color: TOKENS.steel, cursor: "pointer", textTransform: "uppercase" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.alert; e.currentTarget.style.color = TOKENS.alert; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.rule; e.currentTarget.style.color = TOKENS.steel; }}>
              Clear
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
