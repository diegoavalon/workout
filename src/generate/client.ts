import type { Generated, GenerateOptions } from "../persist/generate";
import { isCorpusCached } from "./corpus";
import type { CorpusRef, GenerateResponse, Phase } from "./protocol";

export interface CorpusManifest extends CorpusRef { weeks: number; equipment: string[] }
export interface GenerateProgress { phase: Phase; loaded?: number; total?: number }
export class GenerateError extends Error {
  constructor(message: string, readonly kind: "download" | "generate") { super(message); this.name = "GenerateError"; }
}

const MANIFEST_URL = "/corpus/manifest.json";
const MANIFEST_KEY = "workout-corpus-manifest";

/** Latest manifest; the last good copy is kept so the form works offline once the corpus has been cached. */
export async function loadManifest(): Promise<CorpusManifest> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error(`HTTP ${res.status}`);
    const m = (await res.json()) as CorpusManifest;
    if (!m.version || !m.url) throw new Error("invalid manifest");
    try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(m)); } catch { /* private mode */ }
    return m;
  } catch (e) {
    try { const saved = localStorage.getItem(MANIFEST_KEY); if (saved) return JSON.parse(saved) as CorpusManifest; } catch { /* ignore */ }
    throw new GenerateError(navigator.onLine === false ? "The first generation needs a connection to download the source programs. Connect to the internet and try again." : `Could not reach the source programs (${e instanceof Error ? e.message : String(e)}). Try again.`, "download");
  }
}
export const corpusCached = (m: CorpusManifest) => isCorpusCached(m);

let worker: Worker | undefined;
let seq = 0;
const getWorker = () => (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));

/** Generates a block in a Web Worker. The generator and corpus are loaded lazily on first use. */
export function generateProgram(manifest: CorpusManifest, options: GenerateOptions, onProgress: (p: GenerateProgress) => void = () => {}): Promise<Generated> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = ++seq;
    const cleanup = () => { w.removeEventListener("message", onMessage); w.removeEventListener("error", onError); };
    const onMessage = (e: MessageEvent<GenerateResponse>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progress") onProgress(m);
      else if (m.type === "done") { cleanup(); resolve(m.result); }
      else { cleanup(); reject(new GenerateError(m.message, m.kind)); }
    };
    const onError = (e: ErrorEvent) => { cleanup(); worker?.terminate(); worker = undefined; reject(new GenerateError(e.message || "Generation failed unexpectedly.", "generate")); };
    w.addEventListener("message", onMessage); w.addEventListener("error", onError);
    w.postMessage({ id, corpus: { version: manifest.version, url: manifest.url, bytes: manifest.bytes }, options });
  });
}
