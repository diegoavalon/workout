import type { Plugin } from "vite";
import { packageCorpus } from "./persist/corpus.ts";

/**
 * Packages data/views into a versioned static file (/corpus/corpus-<hash>.json) plus /corpus/manifest.json.
 * It is emitted as an asset, outside the JS bundle, and the service worker does not precache .json.
 */
export function corpusPlugin(): Plugin {
  let built: ReturnType<typeof packageCorpus> | undefined;
  const get = () => (built ??= packageCorpus());
  return {
    name: "workout-corpus",
    buildStart() {
      const c = get();
      this.emitFile({ type: "asset", fileName: `corpus/${c.corpusName}`, source: c.corpus });
      this.emitFile({ type: "asset", fileName: "corpus/manifest.json", source: JSON.stringify(c.manifest) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/corpus/")) return next();
        try {
          const c = get();
          if (url === "/corpus/manifest.json") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(c.manifest)); }
          if (url === `/corpus/${c.corpusName}`) { res.setHeader("content-type", "application/json"); return res.end(c.corpus); }
        } catch (e) { res.statusCode = 500; return res.end(String(e instanceof Error ? e.message : e)); }
        next();
      });
    },
  };
}
