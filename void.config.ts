import { defineConfig } from "void/config";

export default defineConfig({
  worker: { compatibility_date: "2026-02-24" },
  cloudflare: {
    name: "nivelo-tempo",
    routes: [{ pattern: "tempo.nivelohq.com", custom_domain: true }],
  },
});
