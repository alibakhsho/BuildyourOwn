/* =========================================================================
   BYOLogo — the brand mark: the leaf roof (coral and lilac leaves meeting
   at the ridge) over an arched door and a ground line. Mark only, never
   with lettering — the "BUILD YOUR OWN" wordmark sits beside it in the
   header as text.

   Drawn inline so it stays crisp at any size. The door and ground line use
   currentColor, so the mark follows the surrounding text colour on the light
   and dark themes and on white proposals. `dark` forces the cream ink.

   Source and icon/splash renders: brandkit/logo-leaf (build.py, render.cjs).
   ========================================================================= */
const CORAL = "#E8574E";
const LILAC = "#BDAEDD";
const LEFT = "M112 214C171.50 206.74 200.90 173.14 196 118C140.70 120.46 111.30 154.06 112 214Z";
const RIGHT = "M204 118C263.50 125.26 292.90 158.86 288 214C232.70 211.54 203.30 177.94 204 118Z";

export default function BYOLogo({ size = 34, dark = false }) {
  const ink = dark ? "#F4EFE6" : "currentColor";
  return (
    <svg viewBox="100 96 200 200" width={size} height={size} role="img" aria-label="Build Your Own"
      style={{ flexShrink: 0, display: "block" }}>
      <path d={LEFT} fill={CORAL} />
      <path d={RIGHT} fill={LILAC} />
      <path d="M176 286V236A24 24 0 0 1 224 236V286Z" fill={ink} />
      <path d="M124 286H276" stroke={ink} strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}
