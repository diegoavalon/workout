import { flatSessions, sessionKey, type Program, type SessionProgress } from "./types";
import { allAssignments, exerciseIdOf, resolveExercise, type RawItem } from "./workout";
import type { Exercise } from "./types";

export type FrequencyGroup = { key: string; label: string; daysPerWeek: number | null; programs: Program[] };
export function frequencyGroups(programs: Program[]): FrequencyGroup[] {
  const groups: FrequencyGroup[] = [3, 4, 5].map((n) => ({
    key: String(n), label: `${n}× per week`, daysPerWeek: n,
    programs: programs.filter((p) => p.daysPerWeek === n),
  }));
  const other = programs.filter((p) => ![3, 4, 5].includes(p.daysPerWeek));
  if (other.length) groups.push({ key: "other", label: "Other schedules", daysPerWeek: null, programs: other });
  return groups;
}
export function groupForParam(programs: Program[], param: string): FrequencyGroup | undefined {
  return frequencyGroups(programs).find((g) => g.key === param);
}

export function completedKeys(progress: SessionProgress[], runId: string | undefined): Set<string> {
  if (!runId) return new Set();
  return new Set(progress.filter((p) => p.runId === runId && p.completedAt).map((p) => p.sessionKey));
}
export function nextIncomplete(program: Program, done: Set<string>) {
  return flatSessions(program).find((s) => !s.optional && !done.has(sessionKey(program.id, s.id))) ?? null;
}
export function programProgress(program: Program, done: Set<string>) {
  const all = flatSessions(program).filter((s) => !s.optional);
  return { done: all.filter((s) => done.has(sessionKey(program.id, s.id))).length, total: all.length };
}

export type MediaAsset = { url: string; kind: "image" | "video"; exerciseId: string };
export function collectMedia(itemsBySession: Map<string, RawItem[]>, index: Map<string, Exercise>): MediaAsset[] {
  const seen = new Map<string, MediaAsset>();
  for (const items of itemsBySession.values()) for (const a of allAssignments(items)) {
    const ex = resolveExercise(a, index);
    const eid = ex?.id ?? exerciseIdOf(a) ?? "unknown";
    if (ex?.imageUrl) seen.set(ex.imageUrl, { url: ex.imageUrl, kind: "image", exerciseId: eid });
    if (ex?.thumbnail) seen.set(ex.thumbnail, { url: ex.thumbnail, kind: "image", exerciseId: eid });
    if (ex?.videoUrl) seen.set(ex.videoUrl, { url: ex.videoUrl, kind: "video", exerciseId: eid });
  }
  return [...seen.values()];
}
