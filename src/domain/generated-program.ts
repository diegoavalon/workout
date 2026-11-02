import { contentHash } from "../persist/hash";
import type { GeneratedDay, GeneratedProgram, SessionView } from "./generated";
import type { SessionProgress } from "./types";

/**
 * Generated programs as a followable block: an immutable snapshot of the generated file
 * plus a stable registry of its sessions. Progress lives elsewhere (SessionProgress) and
 * joins on `sessionKey(programId, session.id)`.
 */

export type GeneratedCheck = { name: string; status: string; detail?: string };
export type GeneratedFile = GeneratedProgram & { checks?: GeneratedCheck[]; plan?: unknown; warnings?: string[] };
export type SessionKind = "training" | "recovery" | "rest";
export type SessionRef = {
  /** Stable within the snapshot: week number + generated day position. Independent of dates. */
  id: string; kind: SessionKind; week: number; day: number; date: string; weekday: number;
  /** 1-based ordinal among training sessions of the week (0 for recovery/rest). */
  order: number; title: string;
};
export type GeneratedSnapshot = {
  id: string; fingerprint: string; schemaVersion: 1; importedAt: string;
  title: string; track: string; daysPerWeek: number; weekCount: number; startDate?: string;
  file: GeneratedFile; sessions: SessionRef[];
};

export const GENERATED_ID_PREFIX = "gen-";
export const isGeneratedId = (id: string) => id.startsWith(GENERATED_ID_PREFIX);

const kindOf = (type: string): SessionKind => (type === "training" ? "training" : type === "recovery" ? "recovery" : "rest");
const sessionId = (week: number, day: number) => `w${week}d${day}`;

export function validateGeneratedFile(raw: unknown): string[] {
  const errors: string[] = [];
  const f = raw as Partial<GeneratedFile> | null;
  if (!f || typeof f !== "object") return ["Not a generated program file."];
  if (!f.options || typeof f.options.track !== "string") errors.push("Missing options.track.");
  if (!Array.isArray(f.weeks) || f.weeks.length === 0) return [...errors, "No weeks found."];
  let training = 0;
  f.weeks.forEach((w, wi) => {
    if (!Array.isArray(w?.days) || w.days.length === 0) { errors.push(`Week ${wi + 1} has no days.`); return; }
    w.days.forEach((d) => {
      if (typeof d?.type !== "string" || !Array.isArray(d.sections) || typeof d.date !== "string") { errors.push(`Week ${wi + 1} has a malformed day.`); return; }
      if (d.type !== "training") return;
      training++;
      if (!d.sections.some((s) => Array.isArray(s?.items) && s.items.length > 0)) errors.push(`Week ${wi + 1} · Day ${d.day} has no exercises.`);
    });
  });
  if (training === 0) errors.push("The block has no training sessions.");
  return errors;
}

const titleCase = (s: string) => s.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
function dayTitle(d: GeneratedDay): string {
  return d.headline?.focusTopic ?? d.focus?.topic ?? d.headline?.mainLift?.name ?? (d.type === "recovery" ? "Optional recovery" : d.type === "training" ? "Workout" : "Rest day");
}
const weekdayOf = (date: string) => { const n = new Date(`${date}T00:00:00`).getDay(); return n === 0 ? 7 : n; };

export function registerGenerated(file: GeneratedFile, importedAt = new Date().toISOString()): GeneratedSnapshot {
  const fingerprint = contentHash(file);
  const sessions: SessionRef[] = [];
  file.weeks.forEach((w, wi) => {
    const week = w.block?.weekNumber ?? wi + 1;
    let order = 0;
    for (const d of w.days) {
      const kind = kindOf(d.type);
      if (kind === "training") order++;
      sessions.push({ id: sessionId(week, d.day), kind, week, day: d.day, date: d.date, weekday: weekdayOf(d.date), order: kind === "training" ? order : 0, title: dayTitle(d) });
    }
  });
  const track = file.options.track;
  const freq = sessions.filter((s) => s.kind === "training" && s.week === sessions[0].week).length;
  const base = track.replace(/-\d+x$/, "");
  return {
    id: `${GENERATED_ID_PREFIX}${fingerprint.slice(0, 12)}`, fingerprint, schemaVersion: 1, importedAt,
    title: `${titleCase(base)} · ${freq} days/week`, track, daysPerWeek: freq, weekCount: file.weeks.length,
    startDate: file.options.startDate, file, sessions,
  };
}

export const dayOf = (snap: GeneratedSnapshot, ref: SessionRef): GeneratedDay | undefined =>
  snap.file.weeks.find((w, i) => (w.block?.weekNumber ?? i + 1) === ref.week)?.days.find((d) => d.day === ref.day);
export const sessionRef = (snap: GeneratedSnapshot, id: string) => snap.sessions.find((s) => s.id === id);
export const trainingSessions = (snap: GeneratedSnapshot) => snap.sessions.filter((s) => s.kind === "training");
export const weekSessions = (snap: GeneratedSnapshot, week: number) => snap.sessions.filter((s) => s.week === week);

/** Rest/note days: readable text when the day carries any, otherwise null ("Rest day"). */
export function noteText(day: GeneratedDay | undefined): string | null {
  const text = (day?.sections ?? []).flatMap((s) => [s.raw ?? "", ...(s.notes ?? []).map((n) => n.text)]).join("\n").trim();
  return text || null;
}

export type SessionState = Pick<SessionProgress, "startedAt" | "completedAt" | "checks" | "note" | "lastSection" | "savedAt">;
export type StateMap = Map<string, SessionState>;
export type Status = "complete" | "in-progress" | "not-started";
export const statusOf = (st: SessionState | undefined): Status => (st?.completedAt ? "complete" : st?.startedAt ? "in-progress" : "not-started");

export function statesFor(snap: GeneratedSnapshot, progress: SessionProgress[], runId: string | undefined): StateMap {
  const out: StateMap = new Map();
  if (!runId) return out;
  const prefix = `${snap.id}/`;
  for (const p of progress) if (p.runId === runId && p.sessionKey.startsWith(prefix)) out.set(p.sessionKey.slice(prefix.length), p);
  return out;
}

export type ProgramPosition = {
  done: number; total: number; recoveryDone: number; recoveryTotal: number;
  /** First unfinished training session in order (ignores calendar and recovery). */
  next: SessionRef | null;
  /** A started, unfinished session — takes precedence over `next` on the home screen. */
  inProgress: SessionRef | null;
  /** Program week of the first unfinished training session (last week when finished). */
  week: number; complete: boolean;
};
export function positionOf(snap: GeneratedSnapshot, states: StateMap): ProgramPosition {
  const training = trainingSessions(snap);
  const recovery = snap.sessions.filter((s) => s.kind === "recovery");
  const done = training.filter((s) => statusOf(states.get(s.id)) === "complete").length;
  const next = training.find((s) => statusOf(states.get(s.id)) !== "complete") ?? null;
  const inProgress = training.find((s) => statusOf(states.get(s.id)) === "in-progress") ?? null;
  return {
    done, total: training.length, next, inProgress,
    recoveryDone: recovery.filter((s) => statusOf(states.get(s.id)) === "complete").length, recoveryTotal: recovery.length,
    week: next?.week ?? snap.weekCount, complete: training.length > 0 && done === training.length,
  };
}
export function weekCounts(snap: GeneratedSnapshot, states: StateMap, week: number) {
  const t = weekSessions(snap, week).filter((s) => s.kind === "training");
  return { done: t.filter((s) => statusOf(states.get(s.id)) === "complete").length, total: t.length };
}

/** Unchecked set/round targets in a session view, for the finish decision. */
export type Unchecked = { key: string; title: string; label: string };
export function uncheckedOf(view: SessionView, checks: Record<string, string[]> | undefined): { items: Unchecked[]; total: number; checked: number } {
  const items: Unchecked[] = []; let total = 0; let checked = 0;
  const visit = (key: string, title: string, count: number, unit = "Set") => {
    if (count <= 0) return;
    const done = new Set(checks?.[key] ?? []);
    total += count;
    for (let i = 1; i <= count; i++) {
      if (done.has(String(i))) checked++;
      else items.push({ key, title, label: `${unit} ${i}` });
    }
  };
  for (const b of view.blocks) {
    if (b.kind === "section") for (const e of b.exercises) visit(e.key, `${e.label} · ${e.title}`, e.trackingCount);
    else if (b.kind === "superset") visit(b.key, `${b.label} · ${b.title}`, b.roundCount, "Round");
    else if (b.kind === "exercise") visit(b.exercise.key, `${b.exercise.label} · ${b.exercise.title}`, b.exercise.trackingCount);
  }
  return { items, total, checked };
}

/** Read-only copy of a view: no checkmarks and no timers (session preview). */
export function previewView(view: SessionView): SessionView {
  const strip = <E extends { trackingCount: number; metrics: { timerSeconds: number | null }[] }>(e: E): E =>
    ({ ...e, trackingCount: 0, metrics: e.metrics.map((m) => ({ ...m, timerSeconds: null })) });
  return {
    ...view,
    blocks: view.blocks.map((b) => {
      if (b.kind === "section") return { ...b, exercises: b.exercises.map(strip) };
      if (b.kind === "superset") return { ...b, roundCount: 0, timers: [], preferredTimerId: null, exercises: b.exercises.map(strip) };
      if (b.kind === "exercise") return { ...b, exercise: strip(b.exercise) };
      return b;
    }),
  };
}

export type Caveat = { kind: "blocking" | "action" | "info" | "unknown"; title: string; detail: string };
export function caveatsOf(file: GeneratedFile, errors: string[]): Caveat[] {
  const out: Caveat[] = errors.map((e) => ({ kind: "blocking" as const, title: "Can’t activate this block", detail: e }));
  if (!file.checks?.length) out.push({ kind: "unknown", title: "Checks unavailable", detail: "This file was generated before check results were saved. It hasn’t been verified either way." });
  else for (const c of file.checks) if (c.status === "fail") out.push({ kind: "action", title: c.name, detail: c.detail ?? "A generation check failed. Revise the inputs or choose another block." });
  for (const w of file.warnings ?? []) out.push({ kind: "info", title: "Generation note", detail: w });
  return out;
}

export function equipmentOf(file: GeneratedFile): string[] {
  const set = new Set<string>();
  for (const w of file.weeks) for (const d of w.days) if (d.type === "training") for (const s of d.sections) for (const it of s.items)
    for (const e of it.exercise?.equipment ?? []) set.add(e);
  return [...set].sort();
}

/** Main lift of a session, week by week: exact per-set reps and RPE (never collapsed to "3 × 10"). */
export function mainLiftSets(day: GeneratedDay | undefined): { name: string; reps: string; rpe: string } | null {
  const section = day?.sections.find((s) => s.role.startsWith("strength") && s.items.length);
  const item = section?.items[0];
  if (!item) return null;
  const working = item.sets.filter((s) => s.kind === "working");
  const fmt = (a: number | null, b: number | null) => (a === null && b === null ? "" : a === b || b === null ? String(a) : a === null ? String(b) : `${a}–${b}`);
  return {
    name: item.exercise?.name ?? item.nameRaw ?? "Main lift",
    reps: working.map((s) => fmt(s.repsMin, s.repsMax) || "max").join(" · "),
    rpe: working.map((s) => fmt(s.rpeMin, s.rpeMax)).filter(Boolean).join(" · "),
  };
}

const WD = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const weekdayShort = (n: number) => WD[n] ?? "";
export function dateShort(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
