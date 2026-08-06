/* =========================================================================
   MODULE: design/theme.js — light / dark switching
   ------------------------------------------------------------------------
   The theme is applied by setting `data-theme` on <html>. Because every token
   in design/system.js is a `var()` reference, that single attribute re-colours
   every inline style, every `.ec-*` class and every border in the app at once
   — no context provider, no re-render, no prop threading.

   Two consumers can't read CSS variables and need real colour values:
   <canvas> 2D drawing and three.js materials. They call resolveTokens().

   Order of precedence for which theme you get:
     1. an explicit choice the user has made before (localStorage)
     2. the operating system preference
     3. light
   ========================================================================= */

import { useCallback, useEffect, useState } from "react";
import { paletteFor, kebab, lightPalette } from "./system.js";

const LS = "byo.theme";
export const THEMES = ["light", "dark"];

/** The theme to boot with, before React mounts. */
export function initialTheme() {
  try {
    const saved = localStorage.getItem(LS);
    if (THEMES.includes(saved)) return saved;
  } catch {
    /* private mode — fall through to the OS preference */
  }
  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Tells the browser to render form controls, scrollbars and the like in the
  // matching scheme. Without it you get white scrollbars framing a dark page.
  root.style.colorScheme = theme;
}

/**
 * Read the live value of every token as a real colour string.
 *
 * Call this from canvas/WebGL code, and re-run it whenever the theme changes
 * — the returned object is a snapshot, not a live binding.
 */
export function resolveTokens() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const key of Object.keys(lightPalette)) {
    out[key] = cs.getPropertyValue(`--${kebab(key)}`).trim() || lightPalette[key];
  }
  return out;
}

/**
 * Resolved colours for canvas/WebGL drawing, kept in step with the theme.
 *
 * Watches the `data-theme` attribute rather than taking the theme as a prop,
 * so it stays correct no matter who flips it — the header toggle, a system
 * preference change, or a future settings screen. Safe to call from as many
 * components as you like; unlike useTheme() it owns no theme state.
 */
export function useResolvedTokens() {
  const [tokens, setTokens] = useState(() =>
    typeof document === "undefined" ? lightPalette : resolveTokens()
  );

  useEffect(() => {
    const update = () => setTokens(resolveTokens());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return tokens;
}

/**
 * `const { theme, setTheme, toggle, tokens } = useTheme()`
 *
 * `tokens` is the resolved palette for canvas drawing. It is recomputed on
 * every theme change, so a canvas that lists it as a dependency repaints in
 * the new colours automatically.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(initialTheme);
  const [tokens, setTokens] = useState(() => paletteFor(initialTheme()));

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(LS, next);
    } catch {
      /* not persisting is survivable; the theme still applies for this session */
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    // Read back from the DOM rather than trusting the palette object, so
    // anything overridden in CSS wins for canvas consumers too. rAF lets the
    // attribute change commit before we sample computed styles.
    const id = requestAnimationFrame(() => setTokens(resolveTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  // Follow the OS while the user has never made an explicit choice.
  useEffect(() => {
    if (typeof matchMedia !== "function") return undefined;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      let hasChoice = false;
      try {
        hasChoice = THEMES.includes(localStorage.getItem(LS));
      } catch {}
      if (!hasChoice) setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme]
  );

  return { theme, setTheme, toggle, tokens };
}
