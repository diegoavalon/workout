import type { MediaRecord } from "../domain/types";
import type { MediaAsset } from "../domain/selectors";
import type { Repository } from "./repository";

export const MEDIA_CACHE = "workout-media-v1";

export async function downloadMedia(
  repo: Repository, programId: string, assets: MediaAsset[],
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; concurrency?: number; fetchFn?: typeof fetch } = {},
): Promise<MediaRecord[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const cache = typeof caches !== "undefined" ? await caches.open(MEDIA_CACHE) : null;
  const results: MediaRecord[] = [];
  let done = 0; let cursor = 0;
  const worker = async () => {
    while (cursor < assets.length) {
      const asset = assets[cursor++];
      const now = () => new Date().toISOString();
      try {
        const res = await fetchFn(asset.url, { mode: "cors", signal: opts.signal });
        if ((res as { type?: string }).type === "opaque") throw new Error("opaque (no CORS headers)");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const size = Number(res.headers.get("content-length") ?? 0) || undefined;
        if (cache) await cache.put(asset.url, res.clone());
        else await res.arrayBuffer();
        const rec: MediaRecord = { url: asset.url, programId, kind: asset.kind, status: "downloaded", size, updatedAt: now() };
        await repo.setMedia(rec); results.push(rec);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const rec: MediaRecord = { url: asset.url, programId, kind: asset.kind, status: /opaque|CORS|Failed to fetch|NetworkError/i.test(msg) ? "not-downloadable" : "failed", error: msg, updatedAt: now() };
        if (!opts.signal?.aborted) { await repo.setMedia(rec); results.push(rec); }
      }
      done++; opts.onProgress?.(done, assets.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, assets.length || 1) }, worker));
  return results;
}

export async function deleteCachedMedia(repo: Repository, programId: string) {
  const records = await repo.listMedia(programId);
  if (typeof caches !== "undefined") {
    const cache = await caches.open(MEDIA_CACHE);
    for (const r of records) await cache.delete(r.url);
  }
  await repo.deleteMedia(programId);
}

export async function storageEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
