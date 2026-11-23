import type { SupportingDay } from "../domain/generated";
import type { Generated, GenerateOptions, SupportingOptions } from "../persist/generate";

export interface CorpusRef { version: string; url: string; bytes: number }
export type GenerateTask = { task: "program"; options: GenerateOptions } | { task: "support"; options: SupportingOptions };
export type GenerateRequest = { id: number; corpus: CorpusRef } & GenerateTask;
export type Phase = "download" | "parse" | "generate";
export type GenerateResponse =
  | { id: number; type: "progress"; phase: Phase; loaded?: number; total?: number }
  | { id: number; type: "done"; result: Generated | SupportingDay[][] }
  | { id: number; type: "error"; message: string; kind: "download" | "generate" };

export const CORPUS_CACHE = "workout-corpus-v1";
