/* =========================================================================
   MODULE: lib/google-ads.js
   The Google Ads tag (gtag.js), so Google Ads can count sign-ups that came
   from an ad.

   Off until GOOGLE_ADS.tagId is filled in (lib/public-config.js). Even then
   it only loads on the live website, never in the phone app, on localhost or
   on Vercel previews, so test traffic isn't counted as conversions.

   Used by:
     src/main.jsx         — loadGoogleAds() once at start-up
     src/state/auth.jsx   — trackSignUpConversion() after a new account

   If this changes what's collected, update legal/privacy.js in the same
   change ("share" and "cookies" mention the Google Ads tag).
   ========================================================================= */

import { GOOGLE_ADS } from "./public-config.js";
import { isNative } from "./native.js";

const LIVE_HOSTS = ["buildyourown.dev", "www.buildyourown.dev"];

function enabled() {
  if (!GOOGLE_ADS.tagId || isNative || typeof window === "undefined") return false;
  return LIVE_HOSTS.includes(window.location.hostname);
}

let loaded = false;

export function loadGoogleAds() {
  if (loaded || !enabled()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ADS.tagId);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ADS.tagId)}`;
  document.head.appendChild(s);
}

/* A new account was just created (email or Google). Counted once per page
   load; Google Ads also de-duplicates by its own click id. */
let signUpSent = false;
export function trackSignUpConversion() {
  if (signUpSent || !enabled() || !GOOGLE_ADS.signUpLabel) return;
  loadGoogleAds();
  signUpSent = true;
  try {
    window.gtag("event", "conversion", { send_to: `${GOOGLE_ADS.tagId}/${GOOGLE_ADS.signUpLabel}` });
  } catch { /* tracking must never break sign-up */ }
}
