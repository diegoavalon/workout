import type { WeekView } from "../persist/views";
import { CORPUS_CACHE, type CorpusRef } from "./protocol";

export class CorpusDownloadError extends Error {
  constructor(message: string, readonly offline: boolean) { super(message); this.name = "CorpusDownloadError"; }
}

/** Streams the corpus (reporting progress), stores it in Cache Storage, and returns the raw text. Cached copies are used as is. */
export async function fetchCorpusText(ref: CorpusRef, onProgress: (loaded: number, total: number) => void, fetchFn: typeof fetch = fetch): Promise<string> {
  const cache = typeof caches !== "undefined" ? await caches.open(CORPUS_CACHE) : undefined;
  const hit = await cache?.match(ref.url);
  if (hit) return hit.text();
  let res: Response;
  try { res = await fetchFn(ref.url); }
  catch { throw new CorpusDownloadError("The first generation needs a connection to download the source programs. Connect to the internet and try again.", true); }
  if (!res.ok) throw new CorpusDownloadError(`Could not download the source programs (HTTP ${res.status}). Try again.`, false);
  const total = ref.bytes;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.byteLength; onProgress(Math.min(loaded, total), total);
      }
    } else { chunks.push(new Uint8Array(await res.arrayBuffer())); onProgress(total, total); }
  } catch { throw new CorpusDownloadError("The download was interrupted. Check your connection and try again.", true); }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  if (cache) {
    // Drop older versions, then keep this one for offline use. A failed write only means we download again next time.
    try {
      for (const k of await cache.keys()) if (k.url !== new URL(ref.url, k.url).href) await cache.delete(k);
      await cache.put(ref.url, new Response(bytes, { headers: { "content-type": "application/json" } }));
    } catch { /* storage full or unavailable */ }
  }
  return new TextDecoder().decode(bytes);
}

export const parseCorpus = (text: string): WeekView[] => {
  const weeks = JSON.parse(text);
  if (!Array.isArray(weeks) || !weeks.length) throw new CorpusDownloadError("The downloaded source programs are invalid. Try again.", false);
  return weeks;
};

export async function isCorpusCached(ref: CorpusRef): Promise<boolean> {
  try { return typeof caches !== "undefined" && !!(await (await caches.open(CORPUS_CACHE)).match(ref.url)); } catch { return false; }
}
