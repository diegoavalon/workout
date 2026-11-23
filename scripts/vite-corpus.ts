import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";
import { POWER_THRASH_TEMPLATE } from "../src/domain/power-thrash.ts";
import { packageCorpus } from "./persist/corpus.ts";

/**
 * Serves local sources in development. Preview and production use the authenticated R2 route.
 */
export function corpusPlugin(): Plugin {
  let built: ReturnType<typeof packageCorpus> | undefined;
  const get = () => (built ??= packageCorpus());
  return {
    name: "workout-corpus-dev",
    apply: "serve",
    config(config) {
      const server = (config.server ??= {});
      const fs = (server.fs ??= {});
      // Setting fs.deny replaces Vite's default list.
      fs.deny = [
        ...(fs.deny ?? [".env", ".env.*", "*.{crt,pem,key,p12,pfx,cer,der}", ".npmrc", ".yarnrc.yml", "**/.git/**"]),
        `**/data/programs/${POWER_THRASH_TEMPLATE}`,
        "**/raw-export/power-thrash-ii.xlsx",
      ];
    },
    configureServer: {
      order: "pre",
      handler(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (req.method !== "GET" || !url.startsWith("/api/corpus/")) return next();
          if (url === `/api/corpus/${POWER_THRASH_TEMPLATE}`) {
            const { cookie } = req.headers;
            const { localAddress, localPort } = req.socket;
            if (!cookie || !localAddress || !localPort) return next();
            try {
              // Forward the cookie only to this Vite listener, irrespective of the request's Host.
              const host = localAddress.includes(":") ? `[${localAddress}]` : localAddress;
              const session = await fetch(`http://${host}:${localPort}/api/auth/get-session`, {
                headers: { cookie }, redirect: "error", signal: AbortSignal.timeout(5000),
              });
              if (!session.ok || !(await session.json())?.user) return next();
              const template = await readFile(`data/programs/${POWER_THRASH_TEMPLATE}`);
              res.setHeader("content-type", "application/json");
              res.setHeader("x-content-type-options", "nosniff");
              res.setHeader("cache-control", "private, no-cache");
              return res.end(template);
            } catch {
              return next();
            }
          }
          try {
            const c = get();
            if (url === "/api/corpus/manifest.json") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(c.manifest)); }
            if (url === `/api/corpus/${c.corpusName}`) { res.setHeader("content-type", "application/json"); return res.end(c.corpus); }
          } catch (e) { res.statusCode = 500; return res.end(String(e instanceof Error ? e.message : e)); }
          next();
        });
      },
    },
  };
}
