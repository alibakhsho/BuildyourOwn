import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy AI calls to the local backend (server/index.js) in dev so the
    // browser talks to same-origin /api and the key stays server-side.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
