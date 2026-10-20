import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { rmSync } from "node:fs";

/* The native app bundles dist/ inside the phone and only ever plays the 720p
   scroll film, so the mobile build leaves the 1080p cut (~18 MB) out. */
const dropHdFilmOnMobile = (mode) => ({
  name: "drop-hd-film-on-mobile",
  apply: "build",
  closeBundle() {
    if (mode !== "mobile") return;
    rmSync(fileURLToPath(new URL("./dist/media/byo-flight-1080.mp4", import.meta.url)), { force: true });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), dropHdFilmOnMobile(mode)],
  resolve: {
    alias: {
      // The shadcn convention. Components pasted from the shadcn registry or
      // from v0 assume `@/components/ui/...` and `@/lib/utils` resolve —
      // without this alias every one of them fails at the import line.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Proxy AI calls to the local backend (server/index.js) in dev so the
    // browser talks to same-origin /api and the key stays server-side.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
}));
