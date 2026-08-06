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

const url = import.meta.env?.VITE_SUPABASE_URL;
// Supabase renamed `anon` to `publishable`; accept either so an older
// project's keys keep working.
const key =
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const isAuthConfigured = !!(url && key);

export const supabase = isAuthConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The app is a single-page app with no server callback route, so
        // the OAuth code lands in the URL of whatever page we return to.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

/* Where Google should send the user back to. Uses the live origin so the
   same build works on localhost, a preview URL and production without a
   rebuild — each of these must also be listed as a redirect URL in the
   Supabase dashboard under Authentication → URL Configuration. */
export const redirectTo = () =>
  typeof window !== "undefined" ? window.location.origin : undefined;
