/// <reference lib="webworker" />
import { generate, generateRecoveryWeeks } from "../persist/generate";
import type { WeekView } from "../persist/views";
import { CorpusDownloadError, fetchCorpusText, parseCorpus } from "./corpus";
import type { GenerateRequest, GenerateResponse } from "./protocol";

const post = (m: GenerateResponse) => (self as unknown as Worker).postMessage(m);
let loaded: { version: string; weeks: WeekView[] } | undefined;

self.onmessage = async (e: MessageEvent<GenerateRequest>) => {
  const { id, corpus } = e.data;
  try {
    if (loaded?.version !== corpus.version) {
      const text = await fetchCorpusText(corpus, (l, t) => post({ id, type: "progress", phase: "download", loaded: l, total: t }));
      post({ id, type: "progress", phase: "parse" });
      loaded = { version: corpus.version, weeks: parseCorpus(text) };
    }
  } catch (err) {
    post({ id, type: "error", kind: "download", message: err instanceof CorpusDownloadError ? err.message : `Could not load the source programs: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  try {
    post({ id, type: "progress", phase: "generate" });
    const result = e.data.task === "recovery"
      ? generateRecoveryWeeks(loaded.weeks, e.data.options)
      : generate(loaded.weeks, e.data.options);
    post({ id, type: "done", result });
  } catch (err) { post({ id, type: "error", kind: "generate", message: err instanceof Error ? err.message : String(err) }); }
};
