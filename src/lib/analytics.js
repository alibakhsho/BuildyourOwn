/* =========================================================================
   MODULE: lib/analytics.js
   Lightweight event tracking for BuildYourOwn.

   Sends events to:
   1. Vercel Analytics (if @vercel/analytics is loaded)
   2. A simple /api/events endpoint (for the admin panel)
   3. Console in dev mode

   Usage:
     import { track } from './analytics.js';
     track('estimate_completed', { region: 'AU', mode: 'residential', total: 142500 });

   Events we care about (conversion funnel):
     page_view           — landed on the site
     estimate_started    — clicked "Start Estimating" or changed a dimension
     estimate_completed  — a full estimate is visible
     plan_uploaded       — uploaded a plan image
     plan_ai_read        — used AI plan reader
     ai_chat_started     — opened AI crew chat
     ai_chat_message     — sent a message to a persona
     manage_opened       — opened Construction Manager
     job_created         — created a job in CM
     accounting_connected— connected Xero or MYOB
     quote_downloaded    — downloaded a proposal/quote
   ========================================================================= */

const IS_DEV = typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

/* Debounce map: don't spam the same event within 2 seconds */
const _last = {};

export function track(event, props = {}) {
  const now = Date.now();
  const key = event + JSON.stringify(props);
  if (_last[key] && now - _last[key] < 2000) return;
  _last[key] = now;

  const payload = {
    event,
    ...props,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.pathname : "",
  };

  /* 1. Dev console */
  if (IS_DEV) {
    console.log(`[analytics] ${event}`, props);
  }

  /* 2. Vercel Web Analytics (track custom event) */
  if (typeof window !== "undefined" && window.va) {
    try { window.va("event", { name: event, ...props }); } catch { /* noop */ }
  }

  /* 3. Beacon to our own endpoint (fire-and-forget, non-blocking) */
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon("/api/events", JSON.stringify(payload));
    } catch { /* noop — analytics should never break the app */ }
  }
}

/* Convenience: track page view on load */
export function trackPageView() {
  track("page_view", {
    referrer: typeof document !== "undefined" ? document.referrer : "",
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });
}
