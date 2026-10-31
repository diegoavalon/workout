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
        name: "Tempo by Nivelo",
        short_name: "Tempo",
        description: "Offline-first training program reader and completion tracker",
        theme_color: "#171717",
        background_color: "#fafafa",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
