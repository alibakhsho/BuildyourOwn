import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind.css";
import { applyTheme, initialTheme } from "./design/theme.js";
import { trackPageView } from "./lib/analytics.js";
import { AuthProvider } from "./state/auth.jsx";
import { supabase } from "./lib/supabase.js";
import { isNative, initNativeAuth } from "./lib/native.js";
import { wantsPhoneLayout } from "./mobile/layout.js";

// Phones get the phone app, everything else the full app (mobile/layout.js).
// Each is its own chunk, so a phone never downloads the full app's importers,
// charts and spreadsheet code, and a computer never downloads the phone app.
const App = lazy(() => import("./App.jsx"));
const MobileApp = lazy(() => import("./mobile/MobileApp.jsx"));
const PHONE = wantsPhoneLayout();

// Applied before the first paint so a dark-mode user never sees a white flash.
applyTheme(initialTheme());

// Track page views for analytics funnel
trackPageView();

// Finishes Google / email-link sign-ins that return to the app by deep link.
initNativeAuth(supabase);

// The app bundle already ships offline inside the phone; a service worker
// there would only cache stale copies across app updates.
if (!isNative && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // updateViaCache "none": always check /sw.js against the server, so a fixed
    // worker reaches visitors on their next page load.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* No-ops when the Supabase env vars are absent, so the app runs
        unchanged on localStorage until auth is switched on. */}
    <AuthProvider>
      <Suspense fallback={null}>
        {PHONE ? <MobileApp /> : <App />}
      </Suspense>
    </AuthProvider>
  </React.StrictMode>
);
