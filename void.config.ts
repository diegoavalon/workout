import { defineConfig } from "void/config";

export default defineConfig({
  worker: { compatibility_date: "2026-02-24" },
  cloudflare: {
    name: "nivelo-tempo",
    // Mirrors the Worker's dashboard settings so Void can republish without changing them.
    workers_dev: true,
    preview_urls: true,
    routes: [{ pattern: "tempo.nivelohq.com", custom_domain: true }],
  },
});
