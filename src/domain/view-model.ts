import { parseDelta, type DeltaLine } from "./delta";
import type { Exercise } from "./types";
import { deltaTextOf, fmtSeconds, notesOf, prescription, resolveExercise, sortItems, subAssignments, type RawItem } from "./workout";

/**
 * Root data model for workout rendering.
 *
 * Every builder in this module is a pure function: raw program data in,
 * fully-resolved view data out. UI components receive these views as props
 * and never resolve exercises, sort items, derive prescriptions, or compute
 * group rounds/timers themselves.
 */

export type MetricView = {
  key: string;
  label: string;
  value: string;
  /** Countdown length in seconds when this metric can be timed, else null. */
  timerSeconds: number | null;
};

export type ExerciseView = {
  key: string;
  label: string;
  title: string;
  /** False when the exercise could not be resolved; UI shows a placeholder warning. */
  known: boolean;
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  metrics: MetricView[];
  notes: string | null;
  /** Per-set breakdown lines (e.g. RPE ramps); empty when the metrics say it all. */
  setDetails: string[];
  /** Working-set/round count the UI should offer checkboxes for; 0 = no tracking. */
  trackingCount: number;
};

export type TimerOptionView = {
  id: string;
  label: string;
  /** Pre-formatted duration for display, e.g. "2:00". */
  display: string;
  seconds: number;
  kind: "Time" | "Rest";
};

export type NotesLineView = { line: DeltaLine; metric: "repeat" | "clock" | null };

export type BlockView =
  | { kind: "richText"; key: string; lines: NotesLineView[]; isSummary: boolean }
  | { kind: "notes"; key: string; title: string | null; lines: string[] }
  | { kind: "exercise"; key: string; exercise: ExerciseView }
  | {
      kind: "superset"; key: string; title: string; ariaLabel: string; label: string;
      subtitle: string; roundCount: number; timers: TimerOptionView[];
      preferredTimerId: string | null; notes: string[]; exercises: ExerciseView[];
    }
  | {
      kind: "section"; key: string; title: string; ariaLabel: string;
      subtitle: string; framed: boolean; notes: string[]; exercises: ExerciseView[];
    }
  | { kind: "unsupported"; key: string; typeLabel: string };

export type WorkoutView = { blocks: BlockView[] };

/* ---------------- legacy raw items ---------------- */

function noteLineMetric(line: DeltaLine): NotesLineView["metric"] {
  if (line.header || line.list || line.indent || line.align && line.align !== "left" || line.segs.some((seg) => seg.embed)) return null;
  const text = line.segs.map((seg) => seg.text).join("").trim();
  if (/^\d+(?:\s*[-–]\s*\d+)?\s*(?:sets?|rounds?|reps?)$/i.test(text)) return "repeat";
  if (/^\d+(?:\s*[-–]\s*\d+)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?)$/i.test(text)
    || /^every\s+\d+\s*(?:min(?:ute)?s?|sec(?:ond)?s?)(?:\s*[x×]\s*\d+\s*(?:sets?|rounds?))?$/i.test(text)
    || /^for time$/i.test(text)) return "clock";
  return null;
}

const positiveCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
const positiveSeconds = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function exerciseView(item: RawItem, label: string, index: Map<string, Exercise>, tracked: boolean, key: string): ExerciseView {
  const ex = resolveExercise(item, index);
  const time = item.times ?? item.durationSeconds ?? item.seconds;
  const rest = item.rest ?? item.restSeconds;
  const metrics: MetricView[] = prescription(item)
    .filter(([key]) => !tracked || key !== "Sets")
    .map(([label_, value]) => {
      const raw = label_ === "Time" ? time : label_ === "Rest" ? rest : null;
      return { key: label_, label: label_, value, timerSeconds: positiveSeconds(raw) ? raw : null };
    });
  return {
    key,
    label,
    title: ex?.title ?? "Unknown exercise",
    known: ex !== null,
    imageUrl: ex?.imageUrl ?? ex?.thumbnail ?? null,
    videoUrl: ex?.videoUrl ?? null,
    posterUrl: ex?.imageUrl ?? ex?.thumbnail ?? null,
    metrics,
    notes: notesOf(item),
    setDetails: [],
    trackingCount: tracked ? positiveCount(item.sets) : 0,
  };
}

function supersetRoundCount(item: RawItem, exercises: RawItem[]): number {
  const prescribed = positiveCount(item.sets ?? item.rounds);
  if (prescribed) return prescribed;
  // Older imports only prescribe sets on the exercises. Use a shared count when they agree.
  const counts = exercises.map((exercise) => positiveCount(exercise.sets));
  return counts.length > 0 && counts.every((count) => count === counts[0]) ? counts[0] : 0;
}

function supersetTimers(item: RawItem, exercises: RawItem[], label: string): TimerOptionView[] {
  const timers: TimerOptionView[] = [];
  const push = (id: string, timerLabel: string, seconds: number, kind: "Time" | "Rest") =>
    timers.push({ id, label: timerLabel, display: fmtSeconds(seconds), seconds, kind });
  const roundRest = item.rest ?? item.restSeconds;
  const roundTime = item.times ?? item.durationSeconds ?? item.seconds;
  if (positiveSeconds(roundRest)) push("round-rest", "Rest after round", roundRest, "Rest");
  if (positiveSeconds(roundTime)) push("round-time", "Round time", roundTime, "Time");
  exercises.forEach((exercise, i) => {
    const time = exercise.times ?? exercise.durationSeconds ?? exercise.seconds;
    const rest = exercise.rest ?? exercise.restSeconds;
    const last = i === exercises.length - 1;
    if (positiveSeconds(time)) push(`${i}-time`, `Time for ${label}${i + 1}`, time, "Time");
    if (positiveSeconds(rest) && !(last && rest === roundRest)) {
      push(`${i}-rest`, last && !positiveSeconds(roundRest) ? "Rest after round" : `Rest after ${label}${i + 1}`, rest, "Rest");
    }
  });
  return timers;
}

/** Build the root view model from legacy session items (`exerciseAssignment` etc.). */
export function buildWorkoutView(items: readonly Record<string, unknown>[], exerciseIndex: Map<string, Exercise>): WorkoutView {
  const blocks: BlockView[] = [];
  let letterIdx = 0;
  const letter = (i: number) => String.fromCharCode(64 + i);
  sortItems(items as RawItem[]).forEach((item, i) => {
    const key = String(item.itemId ?? i);
    if (item.type === "richText" || item.type === "text" || deltaTextOf(item) != null && item.type !== "exerciseAssignment" && item.type !== "groupedAssignment") {
      const lines = parseDelta(deltaTextOf(item)).map((line) => ({ line, metric: noteLineMetric(line) }));
      // Only heading-and-metadata summaries use tiles; detailed instructions stay prose.
      const isSummary = lines.some(({ line }) => !!line.header) && lines.every(({ line, metric }) => !line.segs.length || !!line.header || metric !== null);
      blocks.push({ kind: "richText", key, lines: isSummary ? lines : lines.map((l) => ({ ...l, metric: null })), isSummary });
      return;
    }
    if (item.type === "exerciseAssignment") {
      letterIdx++;
      blocks.push({ kind: "exercise", key, exercise: exerciseView(item, letter(letterIdx), exerciseIndex, true, key) });
      return;
    }
    if (item.type === "groupedAssignment") {
      const subs = subAssignments(item);
      const isSection = !!item.isSection;
      const isSuperset = !!item.isSuperset;
      letterIdx++;
      const lt = letter(letterIdx);
      if (isSuperset && !isSection) {
        const timers = supersetTimers(item, subs, lt);
        const preferred = timers.find((t) => t.label === "Rest after round") ?? timers.find((t) => t.kind === "Rest") ?? timers[0];
        blocks.push({
          kind: "superset", key, label: lt,
          title: typeof item.title === "string" && item.title.trim() ? item.title : `Superset ${lt}`,
          ariaLabel: typeof item.title === "string" && item.title.trim() ? item.title : `Superset ${lt}`,
          subtitle: "Alternate exercises",
          roundCount: supersetRoundCount(item, subs),
          timers, preferredTimerId: preferred?.id ?? null, notes: [],
          exercises: subs.map((sa, j) => exerciseView(sa, lt + (j + 1), exerciseIndex, false, `${key}-${String(sa.itemId ?? j)}`)),
        });
        return;
      }
      const title = typeof item.title === "string" && item.title ? item.title : isSuperset ? `Superset ${lt}` : `Group ${lt}`;
      blocks.push({
        kind: "section", key, title,
        ariaLabel: typeof item.title === "string" ? item.title : isSuperset ? `Superset ${lt}` : `Group ${lt}`,
        subtitle: isSection ? `${subs.length} exercises · in order` : isSuperset ? `Alternate exercises${typeof item.rest === "number" ? ` · rest ${fmtSeconds(item.rest)} after each round` : ""}` : "Complete in order",
        framed: !isSection, notes: [],
        exercises: subs.map((sa, j) => exerciseView(sa, isSection ? String(j + 1) : lt + (j + 1), exerciseIndex, true, `${key}-${String(sa.itemId ?? j)}`)),
      });
      return;
    }
    blocks.push({ kind: "unsupported", key, typeLabel: String(item.type ?? "unknown") });
  });
  return { blocks };
}
