import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
