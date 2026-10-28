import type { Exercise } from "./types";

export type RawItem = Record<string, unknown> & { order?: number; type?: string; itemId?: string };

/** Stable sort by 1-based `order`; ties keep original array position. Missing order keeps position at the end of its peers. */
export function sortItems<T extends { order?: unknown }>(items: readonly T[]): T[] {
  return items.map((x, i) => ({ x, i })).sort((a, b) => {
    const ao = typeof a.x.order === "number" ? a.x.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.x.order === "number" ? b.x.order : Number.MAX_SAFE_INTEGER;
    return ao - bo || a.i - b.i;
  }).map(({ x }) => x);
}

export function normalizeExercise(raw: unknown): Exercise | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const idVal = r.id ?? r.exerciseId;
  const titleVal = r.title ?? r.name;
  if (typeof idVal !== "string" || typeof titleVal !== "string") return null;
  return {
    ...r, id: idVal, title: titleVal,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
    logType: typeof r.logType === "string" ? r.logType : undefined,
    thumbnail: typeof r.thumbnail === "string" ? r.thumbnail : undefined,
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : typeof r.image === "string" ? r.image : undefined,
    videoUrl: typeof r.videoUrl === "string" ? r.videoUrl : typeof r.video === "string" ? r.video : undefined,
  };
}

/** Resolution order everywhere: embedded snapshot → library index → null (placeholder). */
export function resolveExercise(item: RawItem, index: Map<string, Exercise>): Exercise | null {
  const embedded = normalizeExercise((item as { child?: unknown }).child);
  if (embedded) return embedded;
  const idVal = (item as { exerciseId?: unknown; itemId?: unknown }).exerciseId;
  if (typeof idVal === "string") return index.get(idVal) ?? null;
  return null;
}
export function exerciseIdOf(item: RawItem): string | null {
  const v = (item as { exerciseId?: unknown }).exerciseId;
  if (typeof v === "string") return v;
  const embedded = normalizeExercise((item as { child?: unknown }).child);
  return embedded?.id ?? null;
}
export function subAssignments(item: RawItem): RawItem[] {
  const subs = (item as { subAssignments?: unknown }).subAssignments;
  return Array.isArray(subs) ? sortItems(subs as RawItem[]) : [];
}
export function allAssignments(items: readonly RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const it of sortItems(items)) {
    if (it.type === "exerciseAssignment") out.push(it);
    else if (it.type === "groupedAssignment") out.push(...subAssignments(it));
  }
  return out;
}

export const fmtSeconds = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
function fmtVal(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.map((x) => fmtVal(x)).filter(Boolean).join(", ");
  return String(v);
}
/** Prescription comes from the assignment only; nothing is invented for missing fields. */
export function prescription(item: RawItem): [string, string][] {
  const out: [string, string][] = [];
  const push = (label: string, v: unknown, fmt?: (n: number) => string) => {
    if (typeof v === "number") out.push([label, fmt ? fmt(v) : String(v)]);
    else { const s = fmtVal(v); if (s) out.push([label, s]); }
  };
  push("Sets", item.sets);
  push("Reps", item.reps ?? item.repRange);
  push("Time", item.times ?? item.durationSeconds ?? item.seconds, fmtSeconds);
  push("Distance", item.distance);
  push("Rest", item.rest ?? item.restSeconds, fmtSeconds);
  return out;
}
export function notesOf(item: RawItem): string | null {
  return typeof item.notes === "string" && item.notes ? item.notes : typeof item.note === "string" ? item.note : null;
}
export function deltaTextOf(item: RawItem): unknown {
  const child = (item as { child?: unknown }).child;
  if (child && typeof child === "object") {
    const c = child as Record<string, unknown>;
    return c.content ?? c.text ?? c.delta ?? null;
  }
  return (item as { text?: unknown }).text ?? null;
}
