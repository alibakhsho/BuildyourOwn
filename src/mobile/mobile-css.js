/* =========================================================================
   MODULE: mobile/mobile-css.js — the phone app's stylesheet
   ------------------------------------------------------------------------
   The leaf-roof brand: paper, ink, and the two leaves — coral for money
   and actions, lilac for the house and design. Mounted after GLOBAL_CSS,
   it also re-points the shared tokens (--paper, --ink, --hivis …) so the
   screens both apps share (sign-in, plans, marketplace, legal) match the
   phone app instead of the full app's blueprint palette.

   Sizes follow the platform floors: 48px touch targets, 15px body text,
   safe-area insets top and bottom.
   ========================================================================= */

const LIGHT = `
  --m-paper: #F4EFE6;
  --m-card: #FFFCF7;
  --m-sunk: #EBE4D8;
  --m-ink: #1F1C1A;
  --m-ink2: #625A52;
  --m-rule: #E2D9CB;
  --m-coral: #E8574E;
  --m-coral-ink: #B13A31;
  --m-coral-wash: #FBE3DF;
  --m-lilac: #BDAEDD;
  --m-lilac-ink: #5A4A8A;
  --m-lilac-wash: #ECE6F7;
  --m-ok: #2E7A4B;
  --m-on-ink: #F4EFE6;
  --m-shadow: 0 1px 2px rgba(31, 28, 26, 0.06), 0 8px 24px rgba(31, 28, 26, 0.06);
  /* the shared tokens, so shared screens follow the phone palette */
  --paper: #F4EFE6; --paper-light: #FAF6EF; --card: #FFFCF7;
  --ink: #1F1C1A; --ink-soft: #4A433D; --steel: #6A6158; --rule: #E2D9CB;
  --hivis: #E8574E; --hivis-deep: #D4463D; --hivis-ink: #B13A31; --on-hivis: #1F1C1A;
  --content-veil: rgba(244, 239, 230, 0.92);
`;

const DARK = `
  --m-paper: #161311;
  --m-card: #211D1A;
  --m-sunk: #2B2622;
  --m-ink: #F4EFE6;
  --m-ink2: #B3A99E;
  --m-rule: #363029;
  --m-coral: #EE6A60;
  --m-coral-ink: #FF9187;
  --m-coral-wash: #3A211E;
  --m-lilac: #C7BAEA;
  --m-lilac-ink: #CFC3F0;
  --m-lilac-wash: #2A2538;
  --m-ok: #5DC48A;
  --m-on-ink: #161311;
  --m-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  --paper: #161311; --paper-light: #1C1815; --card: #211D1A;
  --ink: #F4EFE6; --ink-soft: #D2C9BE; --steel: #A79D92; --rule: #363029;
  --hivis: #EE6A60; --hivis-deep: #FF8378; --hivis-ink: #FF9187; --on-hivis: #161311;
  --content-veil: rgba(22, 19, 17, 0.92);
`;

export const M_CSS = `
  :root { ${LIGHT} }
  :root[data-theme="dark"] { ${DARK} }
  html, body { background: var(--m-paper); }
  body { overscroll-behavior-y: none; -webkit-tap-highlight-color: transparent; }

  .m-app { min-height: 100dvh; background: var(--m-paper); color: var(--m-ink);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.45;
    padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
  .m-app.m-no-tabs { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
  .m-num { font-feature-settings: "tnum", "lnum"; font-variant-numeric: tabular-nums; }
  .m-app button { font-family: inherit; }
  .m-app :focus-visible { outline: 2px solid var(--m-coral); outline-offset: 2px; }

  /* ---- top bar ---- */
  .m-top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 8px;
    padding: calc(8px + env(safe-area-inset-top)) 12px 8px; min-height: 56px;
    background: color-mix(in srgb, var(--m-paper) 92%, transparent);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  .m-top-title { flex: 1; min-width: 0; font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m-icon-btn { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; border: 0;
    background: transparent; color: var(--m-ink); cursor: pointer; flex-shrink: 0; }
  .m-icon-btn:active { background: var(--m-sunk); }

  /* ---- bottom tabs ---- */
  .m-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--m-card) 94%, transparent);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-top: 1px solid var(--m-rule); }
  .m-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 52px;
    justify-content: center; border: 0; background: none; color: var(--m-ink2); font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .m-tab-ico { display: grid; place-items: center; width: 56px; height: 30px; border-radius: 15px; transition: background .18s; }
  .m-tab[aria-current="page"] { color: var(--m-ink); }
  .m-tab[aria-current="page"] .m-tab-ico { background: var(--m-coral-wash); color: var(--m-coral-ink); }

  /* ---- layout ---- */
  .m-pad { padding: 0 16px; }
  .m-stack > * + * { margin-top: 12px; }
  .m-section { margin-top: 28px; }
  .m-h1 { font-size: 30px; line-height: 1.12; font-weight: 800; letter-spacing: -0.025em; margin: 0; text-wrap: balance; }
  .m-h2 { font-size: 19px; line-height: 1.25; font-weight: 750; letter-spacing: -0.01em; margin: 0 0 10px; }
  .m-sub { color: var(--m-ink2); margin: 0; }
  .m-small { font-size: 13px; color: var(--m-ink2); }
  .m-card { background: var(--m-card); border: 1px solid var(--m-rule); border-radius: 20px; }
  .m-card-pad { padding: 16px; }
  .m-row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  /* ---- buttons ---- */
  .m-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 20px;
    border-radius: 16px; border: 0; background: var(--m-ink); color: var(--m-on-ink); font-size: 16px; font-weight: 700;
    cursor: pointer; transition: transform .08s, opacity .15s; text-decoration: none; }
  .m-btn:active { transform: scale(0.98); }
  .m-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
  .m-btn-block { width: 100%; }
  .m-btn-coral { background: var(--m-coral); color: #1F1C1A; }
  .m-btn-soft { background: var(--m-sunk); color: var(--m-ink); }
  .m-btn-line { background: transparent; color: var(--m-ink); border: 1.5px solid var(--m-rule); }
  .m-btn-sm { min-height: 40px; padding: 0 14px; font-size: 14px; border-radius: 12px; }
  .m-link { background: none; border: 0; padding: 8px 0; color: var(--m-coral-ink); font-weight: 700; font-size: 14px; cursor: pointer; }

  /* ---- inputs ---- */
  .m-input { width: 100%; box-sizing: border-box; border: 1.5px solid var(--m-rule); border-radius: 16px; background: var(--m-card);
    color: var(--m-ink); font: inherit; font-size: 16px; padding: 14px 16px; outline: none; }
  .m-input:focus { border-color: var(--m-ink); }
  textarea.m-input { resize: none; line-height: 1.4; }
  .m-label { display: block; font-size: 13px; font-weight: 700; color: var(--m-ink2); margin: 0 0 6px; }

  /* ---- controls: stepper, chips, switch, segmented ---- */
  .m-control { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; padding: 6px 0;
    border-bottom: 1px solid var(--m-rule); }
  .m-control:last-child { border-bottom: 0; }
  .m-control-label { font-weight: 650; }
  .m-control-hint { display: block; font-size: 12.5px; font-weight: 500; color: var(--m-ink2); }
  .m-stepper { display: flex; align-items: center; gap: 4px; }
  .m-step-btn { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; border: 1.5px solid var(--m-rule);
    background: var(--m-card); color: var(--m-ink); cursor: pointer; }
  .m-step-btn:disabled { opacity: 0.35; }
  .m-step-btn:active:not(:disabled) { background: var(--m-sunk); }
  .m-step-val { min-width: 56px; text-align: center; font-size: 18px; font-weight: 750; }
  .m-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0 14px; border-bottom: 1px solid var(--m-rule); }
  .m-chips:last-child { border-bottom: 0; }
  .m-chip { min-height: 40px; padding: 0 16px; border-radius: 20px; border: 1.5px solid var(--m-rule); background: var(--m-card);
    color: var(--m-ink); font-size: 14.5px; font-weight: 600; cursor: pointer; }
  .m-chip[aria-pressed="true"] { background: var(--m-ink); border-color: var(--m-ink); color: var(--m-on-ink); }
  .m-switch { position: relative; width: 52px; height: 32px; border-radius: 16px; border: 0; background: var(--m-sunk); cursor: pointer; flex-shrink: 0; transition: background .18s; }
  .m-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 13px; background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .18s; }
  .m-switch[aria-checked="true"] { background: var(--m-ink); }
  .m-switch[aria-checked="true"]::after { transform: translateX(20px); }
  .m-seg { display: flex; padding: 4px; border-radius: 16px; background: var(--m-sunk); gap: 2px; }
  .m-seg button { flex: 1; min-height: 40px; border: 0; border-radius: 12px; background: transparent; color: var(--m-ink2);
    font-size: 14px; font-weight: 700; cursor: pointer; }
  .m-seg button[aria-selected="true"] { background: var(--m-card); color: var(--m-ink); box-shadow: var(--m-shadow); }

  /* ---- list rows ---- */
  .m-list { list-style: none; margin: 0; padding: 0; }
  .m-list-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 64px; padding: 10px 16px; border: 0;
    border-bottom: 1px solid var(--m-rule); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; box-sizing: border-box; }
  .m-list li:last-child .m-list-row { border-bottom: 0; }
  .m-list-row:active { background: var(--m-sunk); }
  .m-list-main { flex: 1; min-width: 0; }
  .m-list-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m-list-meta { font-size: 13px; color: var(--m-ink2); }
  .m-thumb { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: var(--m-lilac-wash); color: var(--m-lilac-ink); flex-shrink: 0; }

  /* ---- 3D viewer ---- */
  .m-viewer { position: relative; height: clamp(260px, 44vh, 440px); border-radius: 24px; overflow: hidden;
    background: linear-gradient(180deg, var(--m-lilac-wash), var(--m-paper)); touch-action: none; }
  .m-viewer.is-full { position: fixed; inset: 0; height: auto; border-radius: 0; z-index: 60; }
  .m-viewer-stage { position: absolute; inset: 0; }
  .m-viewer-tools { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 8px; z-index: 2; }
  .m-viewer.is-full .m-viewer-tools { top: calc(10px + env(safe-area-inset-top)); }
  .m-viewer-tool { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; border: 0; cursor: pointer;
    background: color-mix(in srgb, var(--m-card) 88%, transparent); color: var(--m-ink); box-shadow: var(--m-shadow);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
  .m-viewer-tool[aria-pressed="true"] { background: var(--m-ink); color: var(--m-on-ink); }
  .m-viewer-hint { position: absolute; left: 12px; bottom: 10px; font-size: 12px; font-weight: 600; color: var(--m-ink2);
    background: color-mix(in srgb, var(--m-card) 80%, transparent); padding: 4px 10px; border-radius: 10px; pointer-events: none; }
  .m-viewer.is-full .m-viewer-hint { bottom: calc(10px + env(safe-area-inset-bottom)); }
  .m-viewer-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--m-ink2); font-size: 13px; }

  /* ---- price ---- */
  .m-price { font-size: 38px; line-height: 1.05; font-weight: 800; letter-spacing: -0.03em; }
  .m-price-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 13.5px; color: var(--m-ink2); }
  .m-price-meta b { color: var(--m-ink); font-weight: 700; }

  /* ---- sticky action bar (build screen) ---- */
  .m-actionbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; align-items: center; gap: 12px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--m-card) 95%, transparent);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 1px solid var(--m-rule); }
  .m-actionbar-total { flex: 1; min-width: 0; }
  .m-actionbar-total b { display: block; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
  .m-actionbar-total span { font-size: 12px; color: var(--m-ink2); }

  /* ---- cost bars ---- */
  .m-bar-row { padding: 10px 0; border-bottom: 1px solid var(--m-rule); }
  .m-bar-row:last-child { border-bottom: 0; }
  .m-bar { height: 8px; border-radius: 4px; background: var(--m-sunk); overflow: hidden; margin-top: 6px; }
  .m-bar > i { display: block; height: 100%; border-radius: 4px; background: var(--m-coral); }
  .m-bar.is-lilac > i { background: var(--m-lilac); }
  .m-gantt { position: relative; height: 10px; border-radius: 5px; background: var(--m-sunk); margin-top: 8px; }
  .m-gantt > i { position: absolute; top: 0; bottom: 0; border-radius: 5px; background: var(--m-lilac); }

  /* ---- cards that scroll sideways (designs) ---- */
  .m-rail { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 2px 16px 6px; margin: 0 -16px;
    scrollbar-width: none; }
  .m-rail::-webkit-scrollbar { display: none; }
  .m-design { flex: 0 0 72%; scroll-snap-align: start; text-align: left; padding: 16px; border-radius: 20px; border: 1px solid var(--m-rule);
    background: var(--m-card); color: inherit; font: inherit; cursor: pointer; }
  .m-design:active { transform: scale(0.99); }
  .m-design-price { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin-top: 10px; }

  /* ---- bottom sheet ---- */
  .m-scrim { position: fixed; inset: 0; z-index: 70; background: rgba(20, 16, 14, 0.42); display: flex; align-items: flex-end; animation: m-fade .18s ease-out; }
  .m-sheet { width: 100%; max-height: 88dvh; overflow-y: auto; background: var(--m-card); color: var(--m-ink); border-radius: 24px 24px 0 0;
    padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); animation: m-rise .24s cubic-bezier(.2,.8,.2,1); box-sizing: border-box; }
  .m-sheet-grip { width: 40px; height: 4px; border-radius: 2px; background: var(--m-rule); margin: 4px auto 12px; }
  .m-sheet-title { font-size: 18px; font-weight: 750; margin: 0 0 12px; }
  .m-sheet-action { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px; border: 0; background: none; color: var(--m-ink);
    font: inherit; font-size: 16px; font-weight: 600; text-align: left; cursor: pointer; border-radius: 12px; padding: 0 8px; }
  .m-sheet-action:active { background: var(--m-sunk); }
  .m-sheet-action.is-danger { color: var(--m-coral-ink); }

  /* ---- the shared marketplace: the top bar already names it ---- */
  .m-market > div > div:first-child > div > .pb-3 { display: none; }
  .m-market > div { min-height: 0; }

  /* ---- notices ---- */
  .m-note { display: flex; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--m-lilac-wash); color: var(--m-ink); font-size: 13.5px; }
  .m-note svg { flex-shrink: 0; color: var(--m-lilac-ink); margin-top: 1px; }
  .m-toast { position: fixed; left: 16px; right: 16px; bottom: calc(96px + env(safe-area-inset-bottom)); z-index: 80; padding: 14px 16px;
    border-radius: 16px; background: var(--m-ink); color: var(--m-on-ink); font-weight: 600; box-shadow: 0 8px 30px rgba(0,0,0,.25); animation: m-rise .2s ease-out; }
  .m-empty { text-align: center; padding: 48px 24px; color: var(--m-ink2); }
  .m-empty .m-h2 { color: var(--m-ink); }

  @keyframes m-fade { from { opacity: 0; } }
  @keyframes m-rise { from { transform: translateY(24px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .m-scrim, .m-sheet, .m-toast { animation: none; }
    .m-switch::after, .m-tab-ico { transition: none; }
  }
`;
