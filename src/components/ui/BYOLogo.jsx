/* =========================================================================
   BYOLogo — circular monogram: the outer ring IS the "O", with B and Y
   nested inside. Hi-vis ring on an ink disc, tick marks like a site level
   dial. Drawn rather than bitmapped so it stays sharp at 34px in the header.
   ========================================================================= */
import { colors as TOKENS } from "../../design/system.js";

export default function BYOLogo({ size = 34, dark = false }) {
  const ink = dark ? "#f2f4f7" : TOKENS.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0, display: "block" }} aria-label="BYO logo">
      <circle cx="24" cy="24" r="22" fill={TOKENS.ink} />
      <circle cx="24" cy="24" r="18.5" fill="none" stroke={TOKENS.hivis} strokeWidth="4" />
      {/* dial ticks */}
      {[45, 135, 225, 315].map((a) => (
        <line key={a} x1={24 + 15 * Math.cos((a * Math.PI) / 180)} y1={24 + 15 * Math.sin((a * Math.PI) / 180)}
          x2={24 + 12.5 * Math.cos((a * Math.PI) / 180)} y2={24 + 12.5 * Math.sin((a * Math.PI) / 180)}
          stroke={TOKENS.hivis} strokeWidth="1.6" opacity="0.7" />
      ))}
      {/* B + Y nested inside the O-ring */}
      <text x="17.5" y="29.5" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="16.5" fill="#f2f4f7" letterSpacing="-0.5">B</text>
      <text x="29.5" y="29.5" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="16.5" fill={TOKENS.hivis} letterSpacing="-0.5">Y</text>
    </svg>
  );
}
