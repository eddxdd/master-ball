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
      includeAssets: ["favicon.svg"],
      manifest: {
        // Kept generic on purpose — see src/config/branding.ts for the single
        // source of truth this should eventually read from at build time.
        name: "DexTrAIner",
        short_name: "DexTrAIner",
        description:
          "AI-powered competitive Pokemon companion: Pokedex, Team Builder, Damage Calculator, and an AI coach on top.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
