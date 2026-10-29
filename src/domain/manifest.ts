import { z } from "zod";
import type { Program, ProgramManifest } from "./types";

const id = z.string().min(1, "id must not be empty");
const contentPath = z.string().min(1).refine(
  (p) => !p.startsWith("/") && !p.includes("\\") && !p.split("/").includes(".."),
  { message: "contentPath must be relative and must not traverse directories" },
);
export const sessionSchema = z.object({
  id, order: z.number().int().min(1, "order is 1-based"),
  title: z.string().optional(), summary: z.string().optional(),
  suggestedWeekday: z.number().int().min(1).max(7).optional(),
  estimatedMinutes: z.number().positive().optional(),
  optional: z.boolean().optional(), contentPath,
}).passthrough();
export const weekSchema = z.object({
  id, order: z.number().int().min(1), title: z.string().optional(),
  sessions: z.array(sessionSchema).min(1, "a week needs at least one session"),
}).passthrough();
export const manifestSchema = z.object({
  schemaVersion: z.literal(1, "only manifest schemaVersion 1 is supported"),
  contentVersion: z.string().min(1),
  id, title: z.string().min(1),
  description: z.string().optional(),
  daysPerWeek: z.number().int().min(1, "daysPerWeek must be 1–7").max(7, "daysPerWeek must be 1–7"),
  focus: z.string().optional(), difficulty: z.string().optional(),
  equipment: z.array(z.string()).optional(), cover: z.string().optional(),
  weeks: z.array(weekSchema).min(1, "a program needs at least one week"),
}).passthrough();

export type ManifestIssue = { path: string; message: string };
export function validateManifest(input: unknown): { manifest?: Program; issues: ManifestIssue[]; warnings: string[] } {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) return { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })), warnings: [] };
  const m = parsed.data as unknown as ProgramManifest;
  const issues: ManifestIssue[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const dup = (kind: string, v: string) => { if (seen.has(`${kind}:${v}`)) issues.push({ path: kind, message: `duplicate ${kind} id "${v}"` }); seen.add(`${kind}:${v}`); };
  dup("program", m.id);
  for (const w of m.weeks) {
    dup("week", w.id);
    const required = w.sessions.filter((s) => !s.optional).length;
    if (required !== m.daysPerWeek)
      warnings.push(`Week ${w.order} has ${required} required sessions but daysPerWeek is ${m.daysPerWeek}; sessions are kept as authored.`);
    for (const s of w.sessions) dup("session", s.id);
  }
  if (issues.length) return { issues, warnings };
  return { manifest: { ...m, totalWeeks: m.weeks.length }, issues, warnings };
}

export const progressExportSchema = z.object({
  kind: z.literal("workout-progress"),
  version: z.literal(1),
  runs: z.array(z.object({ id: z.string(), programId: z.string(), contentVersionAtStart: z.string(), startedAt: z.string(), endedAt: z.string().optional() })),
  progress: z.array(z.object({
    runId: z.string(), sessionKey: z.string(),
    completedAt: z.string().optional(), startedAt: z.string().optional(), lastOpenedAt: z.string().optional(),
  })),
});
