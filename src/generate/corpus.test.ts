import { beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusDownloadError, fetchCorpusText, isCorpusCached, parseCorpus } from "./corpus";
import { CORPUS_CACHE } from "./protocol";

const ref = { version: "v1", url: "/corpus/corpus-v1.json", bytes: 20 };
const body = JSON.stringify([{ track: "x" }]);

// Minimal Cache Storage; jsdom has none.
function installCaches() {
  const stores = new Map<string, Map<string, Response>>();
  (globalThis as unknown as { caches: unknown }).caches = {
    async open(name: string) {
      const m = stores.get(name) ?? stores.set(name, new Map()).get(name)!;
      return {
        match: async (u: string) => m.get(new URL(u, "http://localhost").href)?.clone(),
        put: async (u: string, r: Response) => { m.set(new URL(u, "http://localhost").href, r); },
        keys: async () => [...m.keys()].map((url) => ({ url })),
        delete: async (r: { url: string }) => m.delete(r.url),
      };
    },
  };
  return stores;
}

describe("corpus download and cache", () => {
  beforeEach(() => { installCaches(); });

  it("downloads once with progress, caches it, and then works with no network", async () => {
    const fetchMock = vi.fn(async () => new Response(body));
    const seen: number[] = [];
    expect(await fetchCorpusText(ref, (l) => seen.push(l), fetchMock as unknown as typeof fetch)).toBe(body);
    expect(seen.at(-1)).toBeGreaterThan(0);
    expect(await isCorpusCached(ref)).toBe(true);
    const offline = vi.fn(async () => { throw new TypeError("offline"); });
    expect(await fetchCorpusText(ref, () => {}, offline as unknown as typeof fetch)).toBe(body);
    expect(offline).not.toHaveBeenCalled();
  });

  it("explains that the first generation needs a connection when offline and uncached", async () => {
    const offline = vi.fn(async () => { throw new TypeError("offline"); });
    const err = await fetchCorpusText(ref, () => {}, offline as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(CorpusDownloadError);
    expect(err.offline).toBe(true);
    expect(err.message).toMatch(/first generation needs a connection/);
    expect(await isCorpusCached(ref)).toBe(false);
  });

  it("reports server failures and does not cache them", async () => {
    const err = await fetchCorpusText(ref, () => {}, (async () => new Response("no", { status: 503 })) as unknown as typeof fetch).catch((e) => e);
    expect(err.message).toMatch(/503/);
    expect(await isCorpusCached(ref)).toBe(false);
  });

  it("retries after a failure and replaces older versions in the cache", async () => {
    await fetchCorpusText(ref, () => {}, (async () => new Response(body)) as unknown as typeof fetch);
    const next = { version: "v2", url: "/corpus/corpus-v2.json", bytes: 20 };
    await fetchCorpusText(next, () => {}, (async () => { throw new TypeError("x"); }) as unknown as typeof fetch).catch(() => {});
    await fetchCorpusText(next, () => {}, (async () => new Response(body)) as unknown as typeof fetch);
    expect(await isCorpusCached(next)).toBe(true);
    expect(await isCorpusCached(ref)).toBe(false);
    expect(CORPUS_CACHE).toBe("workout-corpus-v1");
  });

  it("rejects an empty or malformed corpus", () => {
    expect(() => parseCorpus("[]")).toThrow(CorpusDownloadError);
    expect(() => parseCorpus("{}")).toThrow();
    expect(parseCorpus(body)).toHaveLength(1);
  });
});
