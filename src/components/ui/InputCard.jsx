/* =========================================================================
   InputCard — a bordered panel in the left input rail: title, optional badge,
   optional "Clear" button that turns alert-coloured on hover.

   Every card can collapse (click the title). Pass defaultOpen={false} for
   the secondary inputs so the Estimate page opens on the few that matter
   first; the badge stays visible while collapsed as a one-line summary.
   ========================================================================= */
import { useState } from "react";
import { colors as TOKENS } from "../../design/system.js";

export default function InputCard({ title, badge, children, onClear, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        marginBottom: open ? 12 : 0, paddingBottom: open ? 8 : 0, borderBottom: open ? `1px solid ${TOKENS.rule}` : "none" }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left", minWidth: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"
            style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="ec-display" style={{ fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{title}</h3>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {badge != null && <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: TOKENS.steel }}>{badge}</span>}
          {onClear && open && (
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
      {open && children}
    </div>
  );
}
