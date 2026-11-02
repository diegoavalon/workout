import type { Generated, GenerateOptions } from "../persist/generate";

export interface CorpusRef { version: string; url: string; bytes: number }
export type GenerateRequest = { id: number; corpus: CorpusRef; options: GenerateOptions };
export type Phase = "download" | "parse" | "generate";
export type GenerateResponse =
  | { id: number; type: "progress"; phase: Phase; loaded?: number; total?: number }
  | { id: number; type: "done"; result: Generated }
  | { id: number; type: "error"; message: string; kind: "download" | "generate" };

export const CORPUS_CACHE = "workout-corpus-v1";
