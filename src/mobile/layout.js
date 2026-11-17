/* =========================================================================
   MODULE: mobile/layout.js — which app this device gets
   ------------------------------------------------------------------------
   Phones get the phone app (mobile/MobileApp.jsx): bottom tabs, one thing
   per screen, the 3D and the price side by side. Tablets and computers get
   the full app (App.jsx) with every tool in it.

   Decided once at boot, not on resize: turning a phone sideways makes it
   wider than the breakpoint, and swapping the whole app mid-task would lose
   what was on screen. Either app can switch to the other from its menu;
   the choice is remembered on this device, and ?layout=phone|full in the
   address sets it too.
   ========================================================================= */

const KEY = "byo.layout"; // "phone" | "full" — only set when someone chose

function remembered() {
  try {
    const q = new URLSearchParams(window.location.search).get("layout");
    if (q === "phone" || q === "full") {
      localStorage.setItem(KEY, q);
      // Stored, so the address can go back to normal (shared links stay clean).
      const u = new URL(window.location.href);
      u.searchParams.delete("layout");
      window.history.replaceState(null, "", u.href);
      return q;
    }
    return localStorage.getItem(KEY);
  } catch {
    return null; // private mode: fall back to the screen size
  }
}

/** True when this device should boot the phone app. */
export function wantsPhoneLayout() {
  const choice = remembered();
  if (choice === "phone") return true;
  if (choice === "full") return false;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  if (window.matchMedia("(max-width: 767px)").matches) return true;
  // A phone that booted sideways is wider than 767px, but its short side
  // still gives it away. Touch-only so a small laptop window isn't caught.
  const shortSide = Math.min(window.screen?.width || 9999, window.screen?.height || 9999);
  return window.matchMedia("(pointer: coarse)").matches && shortSide < 600;
}

/** Switch apps and reload into the other one. */
export function switchLayout(to) {
  try { localStorage.setItem(KEY, to); } catch { /* still switches for this load */ }
  const u = new URL(window.location.href);
  u.searchParams.set("layout", to);
  window.location.replace(u.href); // absolute: always this site
}
