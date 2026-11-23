import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { storage } from "void/storage";
import { POWER_THRASH_TEMPLATE } from "../../../src/domain/power-thrash";

// Source programs are uploaded to private storage with `npm run corpus:upload`.
const HASHED = /^corpus-[0-9a-f]{12}\.json$/;
const allowed = (name: string) => name === "manifest.json" || name === POWER_THRASH_TEMPLATE || HASHED.test(name);
const key = (name: string) => `corpus/${name}`;

// A real JSON 404: a bare notFound falls through to the SPA shell and reads as "200 + HTML".
const missing = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const GET = defineHandler(async (c) => {
  requireAuth(c);
  const name = c.req.param("name") ?? "";
  if (!allowed(name)) return missing();
  const object = await storage.get(key(name));
  if (!object) return missing();
  const headers = new Headers({ "content-type": "application/json", "x-content-type-options": "nosniff" });
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", HASHED.test(name) ? "private, max-age=31536000, immutable" : "private, no-cache");
  return new Response(object.body, { headers });
});

export const PUT = defineHandler(async (c) => {
  requireAuth(c);
  const name = c.req.param("name") ?? "";
  if (!allowed(name)) return missing();
  await storage.put(key(name), c.req.raw.body, { httpMetadata: { contentType: "application/json" } });
  return { ok: true, name };
});
