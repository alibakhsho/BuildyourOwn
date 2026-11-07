/* =========================================================================
   BYOLogo — the brand mark: the tinted glass house (coral front, lilac roof,
   crimson door), the same art used for the app icon and share card.

   Served from /logo-mark.png (256px, transparent) so it stays light when it
   appears in the header on every screen and sits cleanly on the light and
   dark themes and on white proposals. The house is drawn inside a square, so
   `size` is the box it fits in. The art needs no `dark` variant — the prop is
   kept only so existing call sites don't have to change.

   Favicons use the flat vector in /favicon.svg instead, because the glass
   detail doesn't survive at 16px. Source files: brandkit/logo-3d.
   ========================================================================= */
export default function BYOLogo({ size = 34, dark = false }) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt="Build Your Own"
      style={{ flexShrink: 0, display: "block", objectFit: "contain" }}
    />
  );
}
