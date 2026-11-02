/* =========================================================================
   WalkPad — on-screen movement pad for the walkthrough. Hold a button to
   walk (forward / back / step left / step right) or rise and sink. Made for
   touch screens and the mobile app, where there is no keyboard; works with
   a mouse too. Looking around is a drag on the 3D itself.
   ========================================================================= */
import { colors as TOKENS } from "../design/system.js";

const BTN = 40;

function Hold({ engine, f = 0, s = 0, u = 0, label, children, style }) {
  const go = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); engine?.walkInput(f, s, u); };
  const stop = () => engine?.walkInput(0, 0, 0);
  return (
    <button type="button" aria-label={label} title={label}
      onPointerDown={go} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: BTN, height: BTN, display: "grid", placeItems: "center", border: `1px solid ${TOKENS.rule}`, borderRadius: 8,
        background: TOKENS.card, color: TOKENS.ink, cursor: "pointer", touchAction: "none", userSelect: "none", padding: 0, ...style }}>
      {children}
    </button>
  );
}

const Arrow = ({ rot = 0 }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
    <path d="M12 5l7 9H5z" fill="currentColor" />
  </svg>
);

export default function WalkPad({ engine }) {
  return (
    <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 4, display: "flex", gap: 8, alignItems: "flex-end", opacity: 0.92 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${BTN}px)`, gridTemplateRows: `repeat(2, ${BTN}px)`, gap: 4 }}>
        <span />
        <Hold engine={engine} f={1} label="Walk forward"><Arrow /></Hold>
        <span />
        <Hold engine={engine} s={-1} label="Step left"><Arrow rot={-90} /></Hold>
        <Hold engine={engine} f={-1} label="Walk back"><Arrow rot={180} /></Hold>
        <Hold engine={engine} s={1} label="Step right"><Arrow rot={90} /></Hold>
      </div>
      <div style={{ display: "grid", gridTemplateRows: `repeat(2, ${BTN}px)`, gap: 4 }}>
        <Hold engine={engine} u={1} label="Rise" style={{ fontSize: 11, fontWeight: 700 }}>UP</Hold>
        <Hold engine={engine} u={-1} label="Sink" style={{ fontSize: 11, fontWeight: 700 }}>DN</Hold>
      </div>
    </div>
  );
}
