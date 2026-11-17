/* =========================================================================
   MODULE: design/global-css.js — the app-wide stylesheet
   ------------------------------------------------------------------------
   Fonts, the theme custom properties and the shared .ec-* classes (buttons,
   inputs, segments, cards). Both layouts mount it: the full app (App.jsx)
   and the phone app (mobile/MobileApp.jsx), so screens they share — sign-in,
   plans, the marketplace, the legal pages — look the same in either.
   ========================================================================= */
import DesignSystem, { cssVariables } from "./system.js";

const FONT_URL = DesignSystem.typography.fontUrl;

export const GLOBAL_CSS = `
  @import url('${FONT_URL}');
  /* The single source of colour for the whole app. TOKENS.* are var()
     references (design/system.js), so flipping data-theme on <html>
     re-colours every inline style and .ec-* class at once. */
  :root {
    ${cssVariables("light")}
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    ${cssVariables("dark")}
    color-scheme: dark;
  }
  /* A client-facing document is a sheet of white paper. It gets printed
     and PDF'd, so its surface cannot follow the app theme — but its text
     uses the same --ink/--steel/--hivis-deep tokens as everything else,
     and in dark mode those flip to near-white and land invisibly on the
     white page. Re-declaring the LIGHT palette on the sheet itself makes
     every token inside resolve against white again, so one class fixes
     the whole document rather than 40 hand-patched call sites. */
  .byo-doc-light {
    ${cssVariables("light")}
    color-scheme: light;
    color: var(--ink);
  }
  html { scroll-behavior: smooth; }
  body { background: var(--paper); overflow-x: clip; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
  html { overflow-x: clip; max-width: 100%; }
  body, button, input, select, textarea { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; }

  /* ---- Type: one enterprise sans (Plus Jakarta Sans) for everything.
     Numbers use tabular figures so columns of money line up. ---- */
  .ec-display { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.02em; }
  .ec-mono { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-feature-settings: "tnum", "lnum"; font-variant-numeric: tabular-nums; }
  .ec-code { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .ec-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--steel); }
  .ec-rule { border-top: 1px solid var(--rule); }
  .ec-rule-strong { border-top: 1px solid var(--rule); }
  .ec-paper {
    background-image:
      linear-gradient(var(--grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 24px 24px;
  }

  /* ---- Surfaces: soft layered elevation, 14px corners. Interactive
     cards lift on hover; static ones only sharpen their edge. ---- */
  .ec-card {
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 14px;
    box-shadow: var(--shadow-sm);
    transition: border-color .2s ease, box-shadow .25s ease, transform .25s cubic-bezier(.2,.8,.2,1);
  }
  .ec-card:hover { box-shadow: var(--shadow-md); }
  .ec-card[role="button"]:hover, .ec-card.is-interactive:hover, .ec-card[style*="cursor: pointer"]:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--hivis) 55%, var(--rule)); }

  .ec-tag {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--emphasis); color: var(--on-emphasis);
    font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  }
  /* --on-hivis, not --ink: safety yellow is a light colour in BOTH
     themes, so its text stays near-black. Using --ink here would flip
     to near-white on dark and give yellow-on-white. */
  .ec-tag-hivis { background: var(--hivis); color: var(--on-hivis); }

  /* ---- Fields ---- */
  .ec-input, .ec-select {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 10px 12px;
    min-height: 42px;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    outline: none;
    box-shadow: inset 0 1px 1px rgba(15,23,42,0.03);
    transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
  }
  .ec-input::placeholder { color: var(--steel); opacity: .85; }
  .ec-input:hover, .ec-select:hover { border-color: color-mix(in srgb, var(--ink) 25%, var(--rule)); }
  .ec-input:focus, .ec-select:focus { border-color: var(--hivis-deep); box-shadow: 0 0 0 3px var(--focus-ring); }
  .ec-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--ink-soft);
    margin-bottom: 6px;
    display: block;
  }
  input[type=range] { accent-color: var(--hivis-deep); }

  /* ---- Buttons: 10px corners, sentence case, press feedback ---- */
  .ec-btn {
    display: inline-flex; align-items: center; gap: 8px;
    min-height: 40px;
    padding: 9px 16px;
    border-radius: 10px;
    background: var(--emphasis); color: #fff;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0;
    border: 1px solid transparent;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: background .18s ease, box-shadow .2s ease, transform .12s ease, border-color .18s ease, color .18s ease;
  }
  .ec-btn:hover { background: color-mix(in srgb, var(--emphasis) 86%, #000); box-shadow: var(--shadow-md); }
  .ec-btn:active { transform: scale(0.98); }
  .ec-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; transform: none; }
  .ec-btn-hivis { background: var(--hivis); color: var(--on-hivis); }
  .ec-btn-hivis:hover { background: var(--hivis-deep); }
  .ec-btn-ghost { background: var(--card); color: var(--ink); border: 1px solid var(--rule); }
  .ec-btn-ghost:hover { background: var(--paper-light); border-color: color-mix(in srgb, var(--ink) 30%, var(--rule)); }
  .ec-btn-danger { color: var(--alert); }
  .ec-btn-danger:hover { color: var(--alert); border-color: var(--alert); background: var(--error-wash); }
  .ec-btn-hivis:disabled { background: color-mix(in srgb, var(--hivis) 38%, var(--card)); color: var(--on-hivis); opacity: .75; }
  /* Pressed/selected ghost button. This exists as a class because doing
     it with an inline colour beat the :hover rule above on specificity
     — hovering an unselected nav button gave it an ink background while
     the inline colour kept the label ink too, i.e. invisible. */
  .ec-btn-ghost-on,
  .ec-btn-ghost-on:hover { background: var(--accent-wash); color: var(--ink); border-color: color-mix(in srgb, var(--hivis) 60%, var(--rule)); }

  /* ---- Tabs: the strip scrolls sideways rather than wrapping. Each tab
     keeps its natural width — flex items shrink by default, and with
     white-space:nowrap that squeezed every box while the text kept full
     width, so labels overlapped their neighbours. ---- */
  .ec-tabstrip { display: flex; gap: 4px; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: none; -ms-overflow-style: none; }
  .ec-tabstrip::-webkit-scrollbar { display: none; }
  .ec-tab { position: relative; flex: 0 0 auto; scroll-snap-align: start; display: flex; align-items: center; min-height: 44px; padding: 10px 14px; font-weight: 600; font-size: 14px; color: var(--steel); cursor: pointer; border-bottom: 2px solid transparent; transition: color .18s ease, border-bottom-color .18s ease; white-space: nowrap; -webkit-tap-highlight-color: transparent; user-select: none; }
  .ec-tab:hover { color: var(--ink); }
  .ec-tab-active { color: var(--ink); border-bottom-color: var(--hivis); }
  /* Workspace segmented control */
  .ec-segment { display: inline-flex; gap: 2px; padding: 4px; max-width: 100%; overflow-x: auto; scrollbar-width: none; background: var(--paper-light); border: 1px solid var(--rule); border-radius: 12px; }
  .ec-segment::-webkit-scrollbar { display: none; }
  .ec-segment-btn { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; min-height: 38px; padding: 8px 14px; border: none; background: transparent; border-radius: 9px; font-size: 13.5px; font-weight: 600; color: var(--steel); cursor: pointer; transition: color .18s ease; white-space: nowrap; }
  .ec-segment-btn:hover { color: var(--ink); }
  .ec-segment-btn.is-active { color: var(--ink); }
  .ec-segment-pill { position: absolute; inset: 0; background: var(--card); border: 1px solid var(--rule); border-radius: 9px; box-shadow: var(--shadow-sm); }
  .ec-link { color: var(--ink); text-decoration: underline; text-decoration-color: var(--hivis); text-decoration-thickness: 2px; text-underline-offset: 3px; }
  .ec-link:hover { text-decoration-color: var(--ink); }

  /* ===== Hammer cursor — brand personality; "taps" (swings down) on click ===== */
  html.byo-hammer, html.byo-hammer * {
    cursor: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI4IDI4Ij48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtNDIgMTQgMTQpIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTUiIGhlaWdodD0iNiIgcng9IjEuNiIgZmlsbD0iIzNCNDE0QSIgc3Ryb2tlPSIjMTQxNzFBIiBzdHJva2Utd2lkdGg9IjEuMyIvPjxyZWN0IHg9IjEwIiB5PSI5LjUiIHdpZHRoPSI0IiBoZWlnaHQ9IjE0IiByeD0iMS4zIiBmaWxsPSIjRDlBQzAwIiBzdHJva2U9IiMxNDE3MUEiIHN0cm9rZS13aWR0aD0iMS4zIi8+PC9nPjwvc3ZnPg==") 6 5, auto !important;
  }
  html.byo-hammer.byo-hammer-down, html.byo-hammer.byo-hammer-down * {
    cursor: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI4IDI4Ij48ZyB0cmFuc2Zvcm09InJvdGF0ZSgtMTYgMTQgMTQpIj48cmVjdCB4PSI0IiB5PSI3IiB3aWR0aD0iMTUiIGhlaWdodD0iNiIgcng9IjEuNiIgZmlsbD0iIzNCNDE0QSIgc3Ryb2tlPSIjMTQxNzFBIiBzdHJva2Utd2lkdGg9IjEuMyIvPjxyZWN0IHg9IjEwIiB5PSIxMi41IiB3aWR0aD0iNCIgaGVpZ2h0PSIxNCIgcng9IjEuMyIgZmlsbD0iI0Q5QUMwMCIgc3Ryb2tlPSIjMTQxNzFBIiBzdHJva2Utd2lkdGg9IjEuMyIvPjwvZz48L3N2Zz4=") 8 9, auto !important;
  }
  /* Interactive elements keep the standard pointer: the hammer must not
     hide what's clickable. */
  html.byo-hammer a, html.byo-hammer button:not(:disabled), html.byo-hammer select,
  html.byo-hammer [role="button"], html.byo-hammer [role="tab"], html.byo-hammer label,
  html.byo-hammer .ec-tab, html.byo-hammer [style*="cursor: pointer"] { cursor: pointer !important; }
          /* keep text fields usable — real text cursor when typing */
  html.byo-hammer input:not([type=range]):not([type=checkbox]):not([type=radio]),
  html.byo-hammer textarea,
  html.byo-hammer [contenteditable="true"] { cursor: text !important; }

  /* ===== HERO ===== */
  .ec-hero-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .ec-hero-vignette {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%);
    pointer-events: none;
  }
  .ec-hero-bottom-fade {
    position: absolute; left: 0; right: 0; bottom: 0; height: 30%;
    background: linear-gradient(to bottom, transparent, var(--paper));
    pointer-events: none;
  }
  @keyframes fade-in-down {
    from { opacity: 0; transform: translate3d(0, -20px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes fade-in-up {
    from { opacity: 0; transform: translate3d(0, 30px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes scroll-bob {
    0%, 100% { transform: translateY(0); opacity: 0.7; }
    50%      { transform: translateY(8px); opacity: 1; }
  }
  .ec-fade-down { animation: fade-in-down 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .ec-fade-up   { animation: fade-in-up   0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .ec-delay-1 { animation-delay: 0.15s; }
  .ec-delay-2 { animation-delay: 0.30s; }
  .ec-delay-3 { animation-delay: 0.45s; }
  .ec-delay-4 { animation-delay: 0.60s; }
  .ec-scroll-bob { animation: scroll-bob 2s ease-in-out infinite; }

  /* Live blip */
  @keyframes blink { 50% { opacity: 0.3; } }
  .ec-live { animation: blink 1.4s infinite; }
  /* keyboard focus */
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible, [role="button"]:focus-visible, [role="tab"]:focus-visible { outline: 2px solid var(--hivis-deep); outline-offset: 2px; box-shadow: 0 0 0 4px var(--focus-ring); }
  /* phones: the trust badge repeats the line under the buttons — drop it so the hero fits */
  @media (max-width: 560px) { .ec-hero-badge { display: none !important; } }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .ec-live, .ec-scroll-bob, .ec-fade-down, .ec-fade-up { animation: none !important; }
  }
`;
