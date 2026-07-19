/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (not the default generateSW) so src/sw.ts can own a
      // `push` event listener for Phase 3's tilt-nudge notifications —
      // generateSW's auto-generated service worker has no hook for that.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: [
        "favicon-32.png",
        "favicon-192.png",
        "images/masterball-logo.png",
      ],
      injectManifest: {
        // Phase 7's on-device mood model (src/workers/moodWorker.ts, via
        // @huggingface/transformers) bundles a large onnxruntime-web WASM
        // binary (~23MB) as a build asset of its own worker chunk. It's
        // fetched lazily, on demand, only once a user actually writes a
        // post-loss note — precaching it on every install would defeat the
        // whole "small, opt-in, one-time download" point of that feature, and
        // Workbox refuses to precache anything over its default 2MB cap
        // anyway. Restricting the precache glob to the file types the *core*
        // app shell actually needs upfront (JS/CSS/HTML/fonts/icons) is
        // simpler and more honest here than raising the size cap.
        globPatterns: ["**/*.{js,css,html,svg,woff2,png,ico}"],
      },
      manifest: {
        // Kept generic on purpose — see src/config/branding.ts for the single
        // source of truth this should eventually read from at build time.
        name: "Master Ball",
        short_name: "Master Ball",
        description:
          "AI-powered competitive Pokemon companion: Pokedex, Team Builder, Damage Calculator, and the Professor on top.",
        // Matches the dark theme's --background (Master Ball palette, see
        // src/index.css) since dark is the default theme.
        theme_color: "#0e0b17",
        background_color: "#0e0b17",
        display: "standalone",
        icons: [
          {
            src: "/favicon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/images/masterball-logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      // Docker Desktop on Windows/macOS doesn't forward host filesystem
      // change events through the bind mount, so chokidar's default (native
      // FS events) never fires inside the container and HMR silently goes
      // stale until the dev server is restarted. Polling trades a little CPU
      // for actually picking up edits.
      usePolling: true,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright's e2e/ suite (Phase 7 — see Docs/frontend/README.md's
    // "End-to-end tests" section) has its own runner/config and must never be
    // picked up by Vitest's default include glob, which would otherwise also
    // match *.spec.ts files here.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
