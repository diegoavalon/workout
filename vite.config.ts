import { defineConfig } from "vite";
import { voidReact } from "@void/react/plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    voidReact({ react: { compiler: true } }),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectManifest: { globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"] },
      manifest: {
        name: "Logbook — Offline Workout",
        short_name: "Logbook",
        description: "Offline-first training program reader and completion tracker",
        theme_color: "#2f7d32",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      devOptions: { enabled: false },
    }),
  ],
});
