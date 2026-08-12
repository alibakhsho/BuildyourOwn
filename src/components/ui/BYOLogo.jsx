/* =========================================================================
   BYOLogo — the brand mark. This renders the real crafted wooden logo
   (timber frame + forged B / A-frame / O tools), the same art used for the
   favicon and phone icon, so the brand is consistent everywhere instead of
   a flat SVG monogram inside the app and the real logo only on the tab.

   Served from /logo-mark.png (128px, ~40KB) rather than the 512px icon so it
   stays light when it appears in the header on every screen. Rounded to a
   tile; the image carries its own dark ground, so it reads on both themes
   and needs no `dark` variant — the prop is kept only so existing call sites
   don't have to change.
   ========================================================================= */
export default function BYOLogo({ size = 34, dark = false }) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt="Build Your Own"
      style={{
        flexShrink: 0,
        display: "block",
        borderRadius: Math.max(4, Math.round(size * 0.16)),
        objectFit: "cover",
        // A hairline keeps the dark tile from bleeding into a dark header.
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
      }}
    />
  );
}
