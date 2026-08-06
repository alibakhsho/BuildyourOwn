import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/tailwind.css";
import { applyTheme, initialTheme } from "./design/theme.js";
import { trackPageView } from "./lib/analytics.js";
import { AuthProvider } from "./state/auth.jsx";

// Applied before the first paint so a dark-mode user never sees a white flash.
applyTheme(initialTheme());

// Track page views for analytics funnel
trackPageView();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* No-ops when the Supabase env vars are absent, so the app runs
        unchanged on localStorage until auth is switched on. */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
