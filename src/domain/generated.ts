import type { Exercise } from "./types";
import { fmtSeconds } from "./workout";
import type { BlockView, ExerciseView, MetricView, TimerOptionView, WorkoutView } from "./view-model";
import mediaMap from "../../data/catalog/media.json";

/**
 * Adapter for generated program files (e.g. `data/generated/pump-lift-3x-*.json`).
 *
 * Pure functions only: a generated day/week/program goes in and the same root
 * view model the UI renders (`WorkoutView` blocks) comes out, so generated
 * programs need no renderer of their own.
 */

export type GeneratedExerciseRef = { id: string; name: string; pattern?: string; equipment?: string[]; unilateral?: boolean };
export type GeneratedSet = {
  kind: string; repsType: string; repsMin: number | null; repsMax: number | null;
  unit: string | null; valueFemale?: number | null; rpeMin: number | null; rpeMax: number | null; effort: string | null;
};
export type GeneratedItem = {
  exercise: GeneratedExerciseRef | null; nameRaw: string | null;
  alternatives?: GeneratedExerciseRef[]; tempo: string | null;
  restSec: [number, number] | number | null; perSide: boolean; load: unknown; sets: GeneratedSet[];
};
export type GeneratedSection = {
  label: string; title: string; role: string; format: string | null;
  minutes: [number, number] | null; scheme: { lines?: string[]; setsMin?: number; setsMax?: number; roundsMin?: number; roundsMax?: number };
  notes: { label: string | null; text: string }[]; raw?: string; items: GeneratedItem[];
};
export type GeneratedDay = {
  day: number; date: string; type: string;
  headline?: { mainLift: GeneratedExerciseRef | null; focusTopic: string | null };
  focus?: { topic: string | null; body: string | null; shortOnTime: string[] };
  sections: GeneratedSection[];
};
export type GeneratedWeek = { weekStart: string; days: GeneratedDay[]; block?: { weekNumber: number; weekCount: number } };
export type GeneratedProgram = { options: { track: string; seed?: number; startDate?: string; equipment?: string[]; avoidRecent?: boolean }; weeks: GeneratedWeek[] };

export type SessionView = WorkoutView & {
  key: string; title: string; dayLabel: string; date: string; type: string; badges: string[];
};
export type GeneratedProgramView = {
  title: string; track: string;
  weeks: { key: string; label: string; weekStart: string; days: SessionView[] }[];
};

const range = (min: number | null, max: number | null): string | null => {
  if (min === null && max === null) return null;
  if (min === null || max === null || min === max) return String(min ?? max);
  return `${min}–${max}`;
};
const rangeSeconds = (rest: GeneratedItem["restSec"]): { value: string; timerSeconds: number | null } | null => {
  if (rest === null) return null;
  const [min, max] = Array.isArray(rest) ? rest : [rest, rest];
  if (!Number.isFinite(min) || min <= 0) return null;
  // A ranged rest counts down from its lower bound; the tile still shows the full range.
  return { value: min === max ? fmtSeconds(min) : `${fmtSeconds(min)}–${fmtSeconds(max)}`, timerSeconds: min };
};

function setValue(set: GeneratedSet, perSide: boolean): string {
  const reps = range(set.repsMin, set.repsMax);
  if (reps === null) return "Max reps";
  const unit = set.repsType === "count" ? "reps" : set.unit ?? set.repsType;
  return `${reps} ${unit}${perSide ? "/side" : ""}`;
}
function setDetail(set: GeneratedSet, workingIndex: number, perSide: boolean): string {
  const head = set.kind === "warmup" ? "Warm-up" : `Set ${workingIndex}`;
  const rpe = range(set.rpeMin, set.rpeMax);
  return `${head}: ${setValue(set, perSide)}${rpe ? ` @ RPE ${rpe}` : ""}${set.effort ? ` (${set.effort})` : ""}`;
}

/** Catalog exercise id → media from the exercise-library export (`npm run persist:media`). */
const exerciseMedia = mediaMap as Record<string, { imageUrl?: string; videoUrl?: string; thumbnail?: string }>;

function generatedExercise(item: GeneratedItem, key: string, label: string, index: Map<string, Exercise>, tracked: boolean): ExerciseView {
  const working = item.sets.filter((s) => s.kind === "working");
  const effective = working.length ? working : item.sets;
  const library = item.exercise ? index.get(item.exercise.id) : undefined;
  // Imported libraries win; otherwise fall back to the media matched from the exercise-library export.
  const media = item.exercise && !library?.imageUrl && !library?.videoUrl ? exerciseMedia[item.exercise.id] : undefined;
  const metrics: MetricView[] = [];
  if (tracked && effective.length) metrics.push({ key: "Sets", label: "Sets", value: String(effective.length), timerSeconds: null });
  const firstType = effective[0]?.repsType;
  if (effective.length && firstType) {
    const values = [...new Set(effective.map((s) => setValue(s, item.perSide)))];
    const isTime = firstType === "seconds" || firstType === "minutes";
    const single = effective.length === 1 && effective[0].repsMin !== null && effective[0].repsMin === effective[0].repsMax;
    metrics.push({
      key: isTime ? "Time" : firstType === "distance" ? "Distance" : "Reps",
      label: isTime ? "Time" : firstType === "distance" ? "Distance" : "Reps",
      value: values.join(" · "),
      timerSeconds: isTime && single ? (firstType === "minutes" ? effective[0].repsMin! * 60 : effective[0].repsMin!) : null,
    });
    const rpes = [...new Set(effective.map((s) => range(s.rpeMin, s.rpeMax)).filter(Boolean))];
    if (rpes.length) metrics.push({ key: "RPE", label: "RPE", value: rpes.join(" · "), timerSeconds: null });
  }
  if (item.tempo) metrics.push({ key: "Tempo", label: "Tempo", value: item.tempo, timerSeconds: null });
  const rest = rangeSeconds(item.restSec);
  if (rest) metrics.push({ key: "Rest", label: "Rest", value: rest.value, timerSeconds: rest.timerSeconds });
  let workingIdx = 0;
  // Generated recovery work can prescribe anonymous timed intervals
  // (no exercise, no raw name): they are complete as written, not missing.
  const anonymous = item.exercise === null && item.nameRaw === null;
  return {
    key, label,
    title: library?.title ?? item.exercise?.name ?? item.nameRaw ?? (anonymous ? "Timed interval" : "Unknown exercise"),
    known: anonymous || item.exercise !== null || library !== undefined,
    imageUrl: library?.imageUrl ?? library?.thumbnail ?? media?.imageUrl ?? media?.thumbnail ?? null,
    videoUrl: library?.videoUrl ?? media?.videoUrl ?? null,
    posterUrl: library?.imageUrl ?? library?.thumbnail ?? media?.imageUrl ?? media?.thumbnail ?? null,
    // Tracked cards hide the Sets tile; the tracker itself shows the count.
    metrics: tracked ? metrics.filter((m) => m.key !== "Sets") : metrics,
    notes: item.alternatives?.length ? `Alternative: ${item.alternatives.map((a) => a.name).join(", ")}` : null,
    setDetails: item.sets.length > 1 ? item.sets.map((s) => setDetail(s, s.kind === "working" ? ++workingIdx : workingIdx, item.perSide)) : [],
    trackingCount: tracked ? effective.length : 0,
  };
}

const sectionNotes = (section: GeneratedSection): string[] =>
  (section.notes ?? []).map((n) => (n.label ? `${n.label}: ${n.text}` : n.text));

/**
 * Build the root view model for one generated day (training, recovery, or note).
 * `keyPrefix` scopes block/set keys; pass a stable session id so saved checkmarks survive date edits.
 */
export function buildGeneratedDayView(day: GeneratedDay, exerciseIndex: Map<string, Exercise> = new Map(), keyPrefix: string = day.date): SessionView {
  const blocks: BlockView[] = [];
  for (const section of day.sections) {
    const key = `${keyPrefix}-${section.label}`;
    const notes = sectionNotes(section);
    if (!section.items.length) {
      const lines = [
        ...(section.scheme?.lines ?? []),
        ...notes,
        ...(section.role === "focus-note" && day.focus?.topic ? [day.focus.topic] : []),
      ];
      blocks.push({ kind: "notes", key, title: section.title, lines });
      continue;
    }
    if (section.format === "superset" || section.format === "run-the-rack") {
      const roundCount = section.scheme?.setsMin ?? section.scheme?.roundsMin ?? 0;
      const timers: TimerOptionView[] = [];
      const lastRest = [...section.items].reverse().map((it) => rangeSeconds(it.restSec)).find(Boolean);
      if (lastRest?.timerSeconds) timers.push({ id: "round-rest", label: "Rest after round", display: lastRest.value, seconds: lastRest.timerSeconds, kind: "Rest" });
      blocks.push({
        kind: "superset", key, label: section.label, title: section.title, ariaLabel: section.title,
        subtitle: section.format === "superset" ? "Superset" : "Run the rack",
        roundCount, timers, preferredTimerId: timers[0]?.id ?? null, notes,
        exercises: section.items.map((it, j) => generatedExercise(it, `${key}-${j}`, section.label + (j + 1), exerciseIndex, false)),
      });
      continue;
    }
    blocks.push({
      kind: "section", key, title: section.title, ariaLabel: section.title,
      subtitle: section.scheme?.lines?.length ? section.scheme.lines.join(" · ") : `${section.items.length} exercises · in order`,
      framed: false, notes,
      exercises: section.items.map((it, j) => generatedExercise(
        it, `${key}-${j}`,
        section.items.length > 1 ? section.label + (j + 1) : section.label,
        exerciseIndex, true,
      )),
    });
  }
  const title = day.headline?.focusTopic ?? day.focus?.topic ?? day.headline?.mainLift?.name
    ?? (day.type === "recovery" ? "Recovery" : day.type === "note" ? "Rest day" : "Workout");
  const badges = [
    day.type === "training" ? "Training" : day.type === "recovery" ? "Recovery" : "Rest",
    ...(day.headline?.mainLift ? [`Main lift: ${day.headline.mainLift.name}`] : []),
    ...(day.focus?.shortOnTime?.length ? [`Short on time: ${day.focus.shortOnTime.join(", ")}`] : []),
  ];
  return { key: `${day.date}-${day.day}`, title, dayLabel: `Day ${day.day}`, date: day.date, type: day.type, badges, blocks };
}

/** Build the root view model for a whole generated program file. */
export function buildGeneratedProgramView(program: GeneratedProgram, exerciseIndex: Map<string, Exercise> = new Map()): GeneratedProgramView {
  return {
    title: program.options.track, track: program.options.track,
    weeks: program.weeks.map((week, i) => ({
      key: week.weekStart, label: `Week ${week.block?.weekNumber ?? i + 1}`, weekStart: week.weekStart,
      days: week.days.map((day) => buildGeneratedDayView(day, exerciseIndex)),
    })),
  };
}
