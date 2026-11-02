import type { Plugin } from "vite";
import { packageCorpus } from "./persist/corpus.ts";

/**
 * Local development only: serves data/views as /api/corpus/* so the New program form works without
 * uploading anything. Builds never read data/views. In production the corpus lives in private storage
 * and is served by routes/api/corpus/[name].ts to signed-in users (upload with `npm run corpus:upload`).
 */
export function corpusPlugin(): Plugin {
  let built: ReturnType<typeof packageCorpus> | undefined;
  const get = () => (built ??= packageCorpus());
  return {
    name: "workout-corpus-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/corpus/")) return next();
        try {
          const c = get();
          if (url === "/api/corpus/manifest.json") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(c.manifest)); }
          if (url === `/api/corpus/${c.corpusName}`) { res.setHeader("content-type", "application/json"); return res.end(c.corpus); }
        } catch (e) { res.statusCode = 500; return res.end(String(e instanceof Error ? e.message : e)); }
        next();
      });
    },
  };
}
