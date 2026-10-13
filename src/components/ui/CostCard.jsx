/* =========================================================================
   CostCard — one headline figure. `hivis` marks the card that carries the
   number people are actually looking for (the total).

   The figure animates from its previous value to the new one whenever the
   estimate changes, so moving a slider visibly flows through to the money
   (300–450 ms ease-out). Formatting comes in as a string ("A$704,825",
   "26 wks"), so the number is pulled out, tweened, and re-wrapped in the
   same prefix/suffix with the same separators. Reduced motion → instant.
   ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { colors as TOKENS } from "../../design/system.js";

const NUM = /^(\D*?)(-?[\d,]+(?:\.\d+)?)(.*)$/;

function useTweenedText(text, ms = 420) {
  const [shown, setShown] = useState(text);
  const prev = useRef(text);
  useEffect(() => {
    const from = String(prev.current ?? "").match(NUM);
    const to = String(text ?? "").match(NUM);
    prev.current = text;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!from || !to || reduce || from[1] !== to[1] || from[3] !== to[3]) { setShown(text); return; }
    const a = parseFloat(from[2].replace(/,/g, "")), b = parseFloat(to[2].replace(/,/g, ""));
    if (!isFinite(a) || !isFinite(b) || a === b) { setShown(text); return; }
    const decimals = (to[2].split(".")[1] || "").length;
    const grouped = to[2].includes(",");
    const fmt = (v) => grouped
      ? v.toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : v.toFixed(decimals);
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(`${to[1]}${fmt(a + (b - a) * e)}${to[3]}`);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // rAF pauses in background tabs — make sure the real figure always lands.
    const settle = setTimeout(() => setShown(text), ms + 80);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [text, ms]);
  return shown;
}

export default function CostCard({ label, value, sub, hivis }) {
  const shown = useTweenedText(value);
  return (
    <div style={{
      background: hivis ? `linear-gradient(135deg, ${TOKENS.hivis} 0%, ${TOKENS.hivisDeep} 140%)` : TOKENS.card,
      border: `1px solid ${hivis ? "transparent" : TOKENS.rule}`,
      borderRadius: 14,
      boxShadow: hivis ? "0 1px 2px rgba(15,23,42,0.08), 0 12px 28px -10px rgba(217,172,0,0.55)" : TOKENS.shadowSm,
      padding: "16px 18px",
      position: "relative",
      overflow: "hidden",
      minHeight: 96,
    }}>
      {/* On a hivis card the text sits on safety yellow, which does NOT flip
          between themes — so its foreground must not either. Using `ink` here
          put the headline total in near-white on yellow in dark mode. */}
      <div className="ec-eyebrow" style={{ marginBottom: 10, ...(hivis && { color: TOKENS.onHivisSoft }) }}>{label}</div>
      <div className="ec-display ec-mono" style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.02em", color: hivis ? TOKENS.onHivis : TOKENS.ink }}>{shown}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 500, color: hivis ? TOKENS.onHivisSoft : TOKENS.steel, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
