/* =========================================================================
   MODULE: lib/supabase.js
   The Supabase browser client. Holds only the PUBLISHABLE key — that key is
   designed to ship to browsers and is useless without a matching RLS
   policy. The service-role/secret key must never appear in src/; if you
   ever need it, it belongs in server/.env behind the Express proxy.

   Auth is optional at runtime: if the env vars are absent the app still
   works exactly as it does today, entirely on localStorage, and simply
   offers no sign-in. That keeps local dev and the current deploy running
   for anyone who has not set Supabase up yet.
   ========================================================================= */
import { createClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env?.VITE_SUPABASE_URL || "").trim();
// Supabase renamed `anon` to `publishable`; accept either so an older
// project's keys keep working. .trim() defends against a stray newline or
// space pasted into the Vercel env field, a common cause of a broken client.
const key = (
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

// A malformed URL (wrong value pasted, quotes, the dashboard URL instead of
// the project URL) must NOT crash the whole app. Validate it here so a bad
// paste degrades to "auth off, app still runs" instead of a white screen.
const url = /^https:\/\/[^/]+\.supabase\.(co|in|net)/.test(rawUrl) ? rawUrl : "";

export const isAuthConfigured = !!(url && key);

/* createClient can throw on a bad argument. It is imported (via auth.jsx)
   into main.jsx, which wraps the entire app — so an unguarded throw here
   blanks every page. Fail safe: on any error, log it and run without auth. */
export const supabase = (() => {
  if (!isAuthConfigured) {
    if ((rawUrl || key) && !url) {
      console.warn(
        "[BYO] VITE_SUPABASE_URL doesn't look like a Supabase project URL " +
        "(expected https://<ref>.supabase.co). Running without sign-in."
      );
    }
    return null;
  }
  try {
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The app is a single-page app with no server callback route, so
        // the OAuth code lands in the URL of whatever page we return to.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  } catch (e) {
    console.error("[BYO] Supabase failed to initialise; running without sign-in.", e);
    return null;
  }
})();

/* Where Google should send the user back to. Uses the live origin so the
   same build works on localhost, a preview URL and production without a
   rebuild — each of these must also be listed as a redirect URL in the
   Supabase dashboard under Authentication → URL Configuration. */
export const redirectTo = () =>
  typeof window !== "undefined" ? window.location.origin : undefined;
