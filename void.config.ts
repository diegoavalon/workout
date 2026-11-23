import { defineConfig } from "void/config";

export default defineConfig({
  worker: { compatibility_date: "2026-02-24" },
  // Route misses open the SPA, while intentional API 404s keep their JSON body.
  routing: { notFound: "none", fallbacks: { "/*": "/" } },
  cloudflare: {
    name: "nivelo-tempo",
    // Mirrors the Worker's dashboard settings so Void can republish without changing them.
    workers_dev: true,
    preview_urls: true,
    routes: [{ pattern: "tempo.nivelohq.com", custom_domain: true }],
  },
});
