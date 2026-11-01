import { z } from "zod";
import type { Dataset } from "./build.ts";
import { trackId } from "./schema.ts";

// Layer 4: denormalized, read-only view models for the frontend and generator. They are built from
// the same rows as the database tables, so they can be rebuilt from D1 rows by a route later.

export const exerciseRef = z.object({
  id: z.string(),
  name: z.string(),
  pattern: z.string().nullable(),
  equipment: z.array(z.string()),
  unilateral: z.boolean(),
});

export const setView = z.object({
  kind: z.enum(["warmup", "working"]),
  repsType: z.string(),
  repsMin: z.number().nullable(),
  repsMax: z.number().nullable(),
  unit: z.string().nullable(),
  valueFemale: z.number().nullable(),
  rpeMin: z.number().nullable(),
  rpeMax: z.number().nullable(),
  effort: z.string().nullable(),
});

export const itemView = z.object({
  exercise: exerciseRef.nullable(),
  /** The name as printed; set when the exercise is null or differs from the catalog name. */
  nameRaw: z.string().nullable(),
  alternatives: z.array(exerciseRef),
  tempo: z.string().nullable(),
  restSec: z.tuple([z.number(), z.number()]).nullable(),
  perSide: z.boolean(),
  load: z.array(z.object({ male: z.number().nullable(), female: z.number().nullable(), unit: z.string() })).nullable(),
  sets: z.array(setView),
});

export const sectionView = z.object({
  label: z.string().nullable(),
  title: z.string(),
  role: z.string(),
  format: z.string().nullable(),
  minutes: z.tuple([z.number(), z.number()]).nullable(),
  scheme: z.record(z.string(), z.unknown()),
  notes: z.array(z.object({ label: z.string(), text: z.string() })),
  items: z.array(itemView),
  /** Original section text, for rendering anything the structured fields do not capture. */
  raw: z.string(),
});

export const dayView = z.object({
  day: z.number().int(),
  date: z.string(),
  type: z.enum(["training", "recovery", "note"]),
  sessionId: z.number().int(),
  /** Other tracks that run exactly this session in the same week. */
  sharedWith: z.array(trackId),
  headline: z.object({
    mainLift: exerciseRef.nullable(),
    focusTopic: z.string().nullable(),
    roles: z.array(z.string()),
  }),
  focus: z.object({ topic: z.string().nullable(), body: z.string().nullable(), shortOnTime: z.array(z.string()) }),
  sections: z.array(sectionView),
});

export const weekView = z.object({
  track: trackId,
  block: z.object({ id: z.number().int(), startDate: z.string(), weekNumber: z.number().int(), weekCount: z.number().int() }),
  weekStart: z.string(),
  note: z.object({ title: z.string().nullable(), body: z.string() }).nullable(),
  sourceFile: z.string().nullable(),
  days: z.array(dayView),
});
export type WeekView = z.infer<typeof weekView>;

export const viewIndex = z.object({
  tracks: z.array(z.object({ id: trackId, name: z.string(), family: z.string(), daysPerWeek: z.number().int() })),
  blocks: z.array(z.object({ id: z.number().int(), startDate: z.string(), endDate: z.string(), weekCount: z.number().int(), startInferred: z.boolean() })),
  weeks: z.array(z.object({
    weekStart: z.string(), blockId: z.number().int(), weekNumber: z.number().int(),
    status: z.enum(["observed", "missing"]),
    /** Path of each track's week file relative to the views directory; absent for missing weeks. */
    files: z.record(z.string(), z.string()),
  })),
});
export type ViewIndex = z.infer<typeof viewIndex>;

export interface ExerciseRow { id: string; name: string; pattern: string | null; equipment: string[]; unilateral: boolean }

export function buildViews(ds: Dataset, exercises: ExerciseRow[]): { index: ViewIndex; weeks: WeekView[] } {
  const ex = new Map(exercises.map((e) => [e.id, e] as const));
  const ref = (id: string | null) => {
    const e = id ? ex.get(id) : undefined;
    return e ? { id: e.id, name: e.name, pattern: e.pattern, equipment: e.equipment, unilateral: e.unilateral } : null;
  };
  const group = <T>(rows: T[], key: (r: T) => number) => {
    const m = new Map<number, T[]>();
    for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r);
    return m;
  };
  const setsByItem = group(ds.sets, (s) => s.itemId);
  const itemsBySection = group(ds.items, (i) => i.sectionId);
  const sectionsBySession = group(ds.sections, (s) => s.sessionId);
  const sessionById = new Map(ds.sessions.map((s) => [s.id, s] as const));
  const blockById = new Map(ds.blocks.map((b) => [b.id, b] as const));
  const weekById = new Map(ds.weeks.map((w) => [w.id, w] as const));

  const itemView = (it: Dataset["items"][number]) => {
    const exercise = ref(it.exerciseId);
    return {
      exercise,
      nameRaw: exercise && it.nameRaw === exercise.name ? null : it.nameRaw,
      alternatives: (it.alternatives ?? []).map(ref).filter((x): x is NonNullable<typeof x> => !!x),
      tempo: it.tempo,
      restSec: it.restMinSec != null ? ([it.restMinSec, it.restMaxSec ?? it.restMinSec] as [number, number]) : null,
      perSide: it.perSide,
      load: it.load,
      sets: (setsByItem.get(it.id) ?? []).map((s) => ({
        kind: s.kind as "warmup" | "working", repsType: s.repsType, repsMin: s.repsMin, repsMax: s.repsMax,
        unit: s.unit, valueFemale: s.valueFemale, rpeMin: s.rpeMin, rpeMax: s.rpeMax, effort: s.effort,
      })),
    };
  };

  // Which tracks run the same session in the same week.
  const tracksBySessionWeek = new Map<string, Set<string>>();
  for (const s of ds.schedule) {
    const k = `${s.weekId}|${s.sessionId}`;
    (tracksBySessionWeek.get(k) ?? tracksBySessionWeek.set(k, new Set()).get(k)!).add(s.trackId);
  }

  const weeks: WeekView[] = [];
  const files = new Map<number, Record<string, string>>();
  const byWeekTrack = new Map<string, Dataset["schedule"]>();
  for (const s of ds.schedule) {
    const k = `${s.weekId}|${s.trackId}`;
    (byWeekTrack.get(k) ?? byWeekTrack.set(k, []).get(k)!).push(s);
  }
  for (const [k, rows] of byWeekTrack) {
    const [weekId, track] = [Number(k.split("|")[0]), k.split("|")[1] as z.infer<typeof trackId>];
    const wk = weekById.get(weekId)!;
    const block = blockById.get(wk.blockId)!;
    const days = rows.sort((a, b) => a.day - b.day).map((row) => {
      const session = sessionById.get(row.sessionId)!;
      const sections = (sectionsBySession.get(row.sessionId) ?? []).map((sec) => ({
        label: sec.label, title: sec.title, role: sec.role, format: sec.format,
        minutes: sec.minutesMin != null ? ([sec.minutesMin, sec.minutesMax ?? sec.minutesMin] as [number, number]) : null,
        scheme: sec.scheme, notes: sec.notes, raw: sec.raw,
        items: (itemsBySection.get(sec.id) ?? []).map(itemView),
      }));
      const main = sections.find((x) => x.role === "strength-intensity-1")?.items[0]?.exercise ?? null;
      return {
        day: row.day, date: row.date, type: session.type as "training" | "recovery" | "note", sessionId: row.sessionId,
        sharedWith: [...(tracksBySessionWeek.get(`${weekId}|${row.sessionId}`) ?? [])].filter((t) => t !== track).sort() as z.infer<typeof trackId>[],
        headline: { mainLift: main, focusTopic: session.focusTopic, roles: sections.map((x) => x.role) },
        focus: { topic: session.focusTopic, body: session.focusBody, shortOnTime: session.shortOnTime },
        sections,
      };
    });
    const noteDay = days.find((d) => d.type === "note");
    weeks.push({
      track, block: { id: block.id, startDate: block.startDate, weekNumber: wk.weekNumber, weekCount: block.weekCount },
      weekStart: wk.startDate,
      note: wk.noteBody ? { title: wk.noteTitle, body: wk.noteBody } : noteDay?.focus.body ? { title: null, body: noteDay.focus.body } : null,
      sourceFile: wk.sourceFile, days,
    });
    (files.get(weekId) ?? files.set(weekId, {}).get(weekId)!)[track] = `${track}/${wk.startDate}.json`;
  }
  weeks.sort((a, b) => a.track.localeCompare(b.track) || a.weekStart.localeCompare(b.weekStart));

  const index: ViewIndex = {
    tracks: ds.tracks.map((t) => ({ id: t.id, name: t.name, family: t.family, daysPerWeek: t.daysPerWeek })),
    blocks: ds.blocks,
    weeks: ds.weeks.map((w) => ({ weekStart: w.startDate, blockId: w.blockId, weekNumber: w.weekNumber, status: w.status, files: files.get(w.id) ?? {} })),
  };
  return { index, weeks };
}
