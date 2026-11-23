import type { RecoveryDay } from "../domain/generated";
import type { Generated, GenerateOptions, RecoveryOptions } from "../persist/generate";

export interface CorpusRef { version: string; url: string; bytes: number }
export type GenerateTask = { task: "program"; options: GenerateOptions } | { task: "recovery"; options: RecoveryOptions };
export type GenerateRequest = { id: number; corpus: CorpusRef } & GenerateTask;
export type Phase = "download" | "parse" | "generate";
export type GenerateResponse =
  | { id: number; type: "progress"; phase: Phase; loaded?: number; total?: number }
  | { id: number; type: "done"; result: Generated | RecoveryDay[][] }
  | { id: number; type: "error"; message: string; kind: "download" | "generate" };

export const CORPUS_CACHE = "workout-corpus-v1";
