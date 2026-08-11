/* =========================================================================
   TakeoffTable — the ITEM / QTY / RATE / TOTAL grid used by every breakdown
   section. Monospaced so the figures line up down the column.

   On the index `key`: the extraction notes flagged this as worth fixing.
   It isn't a bug here. These rows are stateless presentational output
   regenerated wholesale from the estimate, never reordered in place and
   holding no local state, which is exactly the case where an index key is
   safe. Rows also have no stable id to key on. Left as is deliberately.
   ========================================================================= */
import { colors as TOKENS } from "../../design/system.js";

const GRID = "1fr 100px 100px 110px";

export default function TakeoffTable({ rows }) {
  return (
    <div className="ec-mono" style={{ fontSize: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "6px 0", fontSize: 10, letterSpacing: "0.14em", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}` }}>
        <span>ITEM</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>RATE</span><span style={{ textAlign: "right" }}>TOTAL</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: GRID, padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "baseline" }}>
          <span style={{ color: TOKENS.ink }}>{r.label}</span>
          <span style={{ textAlign: "right", color: TOKENS.inkSoft }}>{r.qty}</span>
          <span style={{ textAlign: "right", color: TOKENS.inkSoft }}>{r.rate}</span>
          <span style={{ textAlign: "right", color: TOKENS.ink, fontWeight: 500 }}>{r.total}</span>
        </div>
      ))}
    </div>
  );
}
