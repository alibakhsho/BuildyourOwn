/* =========================================================================
   MODULE: lib/native.js
   What changes when the app runs inside the iOS/Android shell (Capacitor)
   instead of a browser tab. Everything here is a no-op on the web.

   The one real difference is sign-in. In a browser, Supabase sends the user
   to Google and back to this page's own URL. A native app has no URL to come
   back to, and Google refuses to sign in inside an embedded webview at all —
   so on a phone we open Google in the system browser and have Supabase
   return to a custom-scheme deep link, which the OS hands back to the app.
   ========================================================================= */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

export const isNative = Capacitor.isNativePlatform();

/* Must match the URL scheme registered in AndroidManifest.xml and
   ios/App/App/Info.plist, and be listed as a redirect URL in the Supabase
   dashboard (Authentication → URL Configuration). */
export const AUTH_CALLBACK = "dev.buildyourown.estimator://auth-callback";

/** Open an external URL (OAuth consent, docs) in the system browser. */
export const openExternal = (url) => Browser.open({ url });

/**
 * Open the phone's camera and return the shot as a File, so it flows through
 * the same upload path as a picked file. Null if the user backs out.
 * correctOrientation bakes the EXIF rotation into the pixels — a sideways
 * plan would otherwise be measured sideways.
 */
export async function takePhoto() {
  let photo;
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
    });
  } catch (e) {
    if (/cancel/i.test(e?.message || "")) return null;
    throw e;
  }
  const blob = await (await fetch(photo.webPath)).blob();
  const ext = photo.format === "jpeg" ? "jpg" : photo.format;
  return new File([blob], `site-photo-${Date.now()}.${ext}`, { type: blob.type || `image/${photo.format}` });
}

/**
 * Listen for the deep link Supabase redirects to after Google sign-in, an
 * email confirmation or a password-reset link, and finish the PKCE exchange.
 * The code verifier was stored by this same app when the flow started, which
 * is why the exchange has to happen here rather than in the browser.
 */
export function initNativeAuth(supabase) {
  if (!isNative || !supabase) return;
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url?.startsWith(AUTH_CALLBACK)) return;
    // Supabase puts the result in the query string (PKCE) or, for errors,
    // sometimes in the fragment — read both.
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search || parsed.hash.slice(1));
    Browser.close().catch(() => {}); // iOS only; Android throws, harmlessly
    const err = params.get("error_description") || params.get("error");
    if (err) { console.error("[BYO] Sign-in failed:", err); return; }
    const code = params.get("code");
    if (!code) return;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[BYO] Couldn't finish sign-in:", error.message);
  });
}
