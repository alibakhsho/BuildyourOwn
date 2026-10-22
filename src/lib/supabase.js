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
import { isNative, AUTH_CALLBACK } from "./native.js";
import { PUBLIC_SUPABASE } from "./public-config.js";

// Env var wins when set (even to "" — that turns accounts off for local
// dev); otherwise the committed public project settings.
const rawUrl = (import.meta.env?.VITE_SUPABASE_URL ?? PUBLIC_SUPABASE.url).trim();
// Supabase renamed `anon` to `publishable`; accept either so an older
// project's keys keep working. .trim() defends against a stray newline or
// space pasted into the Vercel env field, a common cause of a broken client.
const key = (
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  PUBLIC_SUPABASE.publishableKey
).trim();

// A malformed URL (wrong value pasted, quotes, the dashboard URL instead of
// the project URL) must NOT crash the whole app. Validate it here so a bad
// paste degrades to "auth off, app still runs" instead of a white screen.
const url = /^https:\/\/[^/]+\.supabase\.(co|in|net)/.test(rawUrl) ? rawUrl : "";

export const isAuthConfigured = !!(url && key);

// Read before the client starts: it rewrites the URL once it has used the code.
const landedUrl = typeof window !== "undefined" ? window.location?.href ?? "" : "";

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

/* ---- What an emailed link did ---------------------------------------------
   A password-reset link signs the user in and fires PASSWORD_RECOVERY while
   the client starts up — before React has mounted anything that could
   listen — so it's caught here, at module level, and kept until the app
   asks. Links that fail (expired, already used, or opened in a different
   browser from the one that asked for them, where the PKCE verifier isn't)
   otherwise do nothing visible; those become a `problem` the app explains. */
const linkState = { recovering: false, problem: null };
const linkListeners = new Set();
const emitLink = (patch) => {
  Object.assign(linkState, patch);
  linkListeners.forEach((cb) => cb({ ...linkState }));
};
export const authLinkState = () => ({ ...linkState });
export function onAuthLink(cb) { linkListeners.add(cb); return () => linkListeners.delete(cb); }
export const finishRecovery = () => emitLink({ recovering: false });
export const clearLinkProblem = () => emitLink({ problem: null });

function linkProblemFrom(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  const p = new URLSearchParams(u.hash.replace(/^#/, ""));
  u.searchParams.forEach((v, k) => { if (!p.has(k)) p.set(k, v); });
  const code = p.get("error_code");
  if (code === "otp_expired") return "That email link has expired or has already been used. Request a new one below.";
  if (p.get("error_description")) return `That link didn't work: ${p.get("error_description").replace(/\+/g, " ")}.`;
  return null;
}

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") emitLink({ recovering: true, problem: null });
  });
  supabase.auth.initialize().then(async ({ error }) => {
    // Links that carry a token_hash (our email templates use this form) work
    // in ANY browser on any device: the hash is checked by Supabase directly,
    // with no code verifier from the browser that asked. A reset requested
    // on a PC and opened on a phone just works. verifyOtp fires
    // PASSWORD_RECOVERY for a reset, which opens "set a new password".
    if (await finishTokenHashLink()) return;
    const hadCode = /[?&]code=/.test(landedUrl);
    const hadError = /[#?&]error(_code|_description)?=/.test(landedUrl);
    if (!hadCode && !hadError) return;
    const { data } = await supabase.auth.getSession();
    const problem = linkProblemFrom(landedUrl)
      || (error ? `That link didn't work: ${error.message}` : null)
      || (!data.session && hadCode
        ? "That link was opened in a different browser from the one that asked for it. If you were confirming your email, it's confirmed — just sign in. If you were resetting your password, request a new link here."
        : null);
    if (problem) emitLink({ problem });
    // Don't leave a dead code or error in the address bar to retry on reload.
    try {
      const clean = new URL(window.location.href);
      ["code", "error", "error_code", "error_description"].forEach((k) => clean.searchParams.delete(k));
      if (/error/.test(clean.hash)) clean.hash = "";
      window.history.replaceState(window.history.state, "", clean.toString());
    } catch { /* not fatal */ }
  });
}

const EMAIL_LINK_TYPES = new Set(["recovery", "signup", "email", "invite", "magiclink", "email_change"]);

async function finishTokenHashLink() {
  let u;
  try { u = new URL(landedUrl); } catch { return false; }
  const tokenHash = u.searchParams.get("token_hash");
  const type = u.searchParams.get("type");
  if (!tokenHash || !EMAIL_LINK_TYPES.has(type)) return false;
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    emitLink({
      problem: /expired|invalid|not found/i.test(error.message)
        ? "That email link has expired or has already been used. Request a new one below."
        : `That link didn't work: ${error.message}.`,
    });
  }
  // One-time link: never leave it in the address bar to be retried or shared.
  try {
    const clean = new URL(window.location.href);
    ["token_hash", "type"].forEach((k) => clean.searchParams.delete(k));
    window.history.replaceState(window.history.state, "", clean.toString());
  } catch { /* not fatal */ }
  return true;
}

/* Where Google should send the user back to. Uses the live origin so the
   same build works on localhost, a preview URL and production without a
   rebuild — each of these must also be listed as a redirect URL in the
   Supabase dashboard under Authentication → URL Configuration. The native
   app's origin is a fake local host, so it returns via a deep link instead. */
export const redirectTo = () =>
  isNative ? AUTH_CALLBACK
  : typeof window !== "undefined" ? window.location.origin : undefined;
