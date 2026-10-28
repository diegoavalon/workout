/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { createPartialResponse } from "workbox-range-requests";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] };

precacheAndRoute(self.__WB_MANIFEST);

// Offline deep links: every document navigation gets the precached shell; the
// router resolves the path client-side. Content, API, asset, and file-extension
// paths never receive HTML.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), {
  denylist: [/^\/content\//, /^\/api\//, /^\/assets\//, /\/[^/?]+\.[^/]+$/],
}));

// Downloaded media: serve from Cache Storage, synthesizing 206 responses for
// Range requests so video plays and seeks offline (required by Safari).
const MEDIA_CACHE = "workout-media-v1";
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith((async () => {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(request.url);
    if (!cached) return fetch(request);
    if (request.headers.has("range")) {
      try { return (await createPartialResponse(request, cached.clone())) as Response; }
      catch { return cached; }
    }
    return cached;
  })());
});

self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
