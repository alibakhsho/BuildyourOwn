/* =========================================================================
   CostCard — one headline figure. `hivis` marks the card that carries the
   number people are actually looking for (the total).
   ========================================================================= */
import { colors as TOKENS } from "../../design/system.js";

export default function CostCard({ label, value, sub, hivis }) {
  return (
    <div style={{
      background: hivis ? TOKENS.hivis : TOKENS.card,
      border: `1px solid ${hivis ? TOKENS.hivis : TOKENS.rule}`,
      padding: "14px 16px",
      position: "relative",
    }}>
      {/* On a hivis card the text sits on safety yellow, which does NOT flip
          between themes — so its foreground must not either. Using `ink` here
          put the headline total in near-white on yellow in dark mode. */}
      <div className="ec-eyebrow" style={{ marginBottom: 8, ...(hivis && { color: TOKENS.onHivisSoft }) }}>{label}</div>
      <div className="ec-display" style={{ fontSize: 26, lineHeight: 1, color: hivis ? TOKENS.onHivis : TOKENS.ink }}>{value}</div>
      {sub && <div className="ec-mono" style={{ fontSize: 10, color: hivis ? TOKENS.onHivisSoft : TOKENS.inkSoft, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
