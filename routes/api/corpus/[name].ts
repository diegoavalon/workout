import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { storage } from "void/storage";

// The generator's source programs. Never a public static file: only signed-in requests read it,
// and it is uploaded to private storage with `npm run corpus:upload`.
const NAME = /^(manifest|corpus-[0-9a-f]{12})\.json$/;
const key = (name: string) => `corpus/${name}`;

export const GET = defineHandler(async (c) => {
  requireAuth(c);
  const name = c.req.param("name") ?? "";
  if (!NAME.test(name)) return c.notFound();
  const object = await storage.get(key(name));
  if (!object) return c.notFound();
  const headers = new Headers({ "content-type": "application/json", "x-content-type-options": "nosniff" });
  headers.set("etag", object.httpEtag);
  // Hashed corpus files never change; the manifest must always be revalidated.
  headers.set("cache-control", name === "manifest.json" ? "private, no-cache" : "private, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

export const PUT = defineHandler(async (c) => {
  requireAuth(c);
  const name = c.req.param("name") ?? "";
  if (!NAME.test(name)) return c.notFound();
  await storage.put(key(name), c.req.raw.body, { httpMetadata: { contentType: "application/json" } });
  return { ok: true, name };
});
