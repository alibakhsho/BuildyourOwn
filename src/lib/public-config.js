/* =========================================================================
   MODULE: lib/public-config.js
   Settings that are PUBLIC BY DESIGN and identical for every environment:
   the Supabase project URL and its publishable key. Both already ship to
   every visitor inside the JavaScript bundle (and inside the phone app), and
   the publishable key does nothing without a matching RLS policy — so they
   live in the repo instead of being re-typed into Vercel, .env files and the
   mobile build separately.

   Read by:
     src/lib/supabase.js       — the browser / app client
     api/_lib/ai-access.js     — the AI routes' plan check (server)
   The server can't see Vite's build-time VITE_ variables at runtime, which
   is exactly why the plan check needs a value from here: without it the AI
   lock silently switches off in production.

   Overrides: setting VITE_SUPABASE_URL / SUPABASE_URL (and the key) wins.
   Setting the URL to an EMPTY string turns accounts off entirely (local dev
   with every feature unlocked). NEVER put a secret / service-role key here.
   ========================================================================= */
export const PUBLIC_SUPABASE = Object.freeze({
  url: "https://guifftayxaszzjsehuyo.supabase.co",
  publishableKey: "sb_publishable_BViRew-WWqWXoSerMdgNGw_GM4GLghe",
});

/* The live site — used for links that must point at production (email
   redirects from the phone app, the app's API base). */
export const SITE_URL = "https://buildyourown.dev";
