import { isMonday } from "./calendar.ts";
import type { GeneratedDay, GeneratedExerciseRef, GeneratedSection, GeneratedSet, GeneratedWeek, SupportingDay } from "./generated";
import type { GeneratedFile } from "./generated-program";

/**
 * Power Thrash II: a fixed 12-week, 3-day program whose weights are percentages
 * of the athlete's one-rep maxes. The template (`data/programs/power-thrash-ii.json`,
 * produced by `npm run power-thrash:convert`) holds the percentages; this module turns
 * a template plus the athlete's maxes into an ordinary generated program file, so the
 * existing review, train, week, and session screens follow it unchanged.
 */

export type PtMax = { id: string; label: string; /** The max the source spreadsheet shipped with. */ example: number };
/** One set: reps (several parts for combination lifts, e.g. 14 + 10) and a fraction of the exercise's max, or null when unloaded. */
export type PtSet = { reps: number[]; pct: number | null };
export type PtExercise = {
  name: string; catalogId?: string; equipment: string[];
  /** Max that the set percentages apply to; null for unloaded work. */
  max: string | null;
  restSec: number; sets: PtSet[]; notes: string[];
};
export type PtTemplate = {
  id: string; title: string; credit: string; unit: "lb"; roundTo: number; daysPerWeek: number;
  maxes: PtMax[];
  /** `day` is the position in a Monday-first week. The workbook supplies strength on days 1, 3, and 5. */
  weeks: { week: number; days: { day: number; exercises: PtExercise[] }[] }[];
  /** Corrections applied to the source spreadsheet, for the program details. */
  fixes: string[];
};

export type Maxes = Record<string, number>;
export type PowerThrashSetVolume = "full" | "half";

export const POWER_THRASH_TRACK = "power-thrash-ii-3x";
export const POWER_THRASH_TEMPLATE = "power-thrash-ii.json";
export const POWER_THRASH_CREDIT = "Istvan Javorek";
export const POWER_THRASH_TRAINING_DAYS: readonly number[] = [1, 3, 5];
export const POWER_THRASH_RECOVERY_DAYS: readonly number[] = [2, 4, 6];
export const isPowerThrash = (file: Pick<GeneratedFile, "options">) => file.options.track === POWER_THRASH_TRACK;

/** Reuse each complete set of supporting sections when editing a saved program. */
export function savedPowerThrashSupport(file: GeneratedFile | undefined, weekCount: number) {
  if (file?.weeks.length !== weekCount) return {};
  const read = (days: readonly number[], type: GeneratedDay["type"], select: (sections: GeneratedSection[]) => GeneratedSection[]) => {
    const weeks = file.weeks.map((week) => week.days
      .filter((day) => day.type === type && days.includes(day.day))
      .map(({ day, sections }) => ({ day, sections: select(sections) })));
    return weeks.every((week) => days.every((day) => week.some((session) => session.day === day && session.sections.length)))
      ? weeks
      : undefined;
  };
  return {
    recovery: read(POWER_THRASH_RECOVERY_DAYS, "recovery", (sections) => sections),
    warmups: read(POWER_THRASH_TRAINING_DAYS, "training", (sections) => sections.filter((section) => section.role === "warmup")),
  };
}

/**
 * Same rounding as the spreadsheet: INT(x / 5 + 0.5) * 5. The 1e-9 snap mirrors spreadsheet
 * precision so 0.7 × 175 (122.4999… in binary floating point) still rounds up to 125.
 */
export const roundLoad = (x: number, to = 5) => Math.floor(Math.round((x / to + 0.5) * 1e9) / 1e9) * to;

/** Field errors keyed by max id; empty when every max is a positive number of pounds. */
export function validateMaxes(template: PtTemplate, maxes: Partial<Record<string, number | null>>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const m of template.maxes) {
    const v = maxes[m.id];
    if (v === undefined || v === null || Number.isNaN(v)) errors[m.id] = "Enter your max.";
    else if (!Number.isFinite(v) || v <= 0) errors[m.id] = "Enter a weight above 0.";
    else if (v > 2000) errors[m.id] = "Enter 2,000 lb or less.";
  }
  return errors;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function exerciseRef(ex: PtExercise): GeneratedExerciseRef {
  return { id: ex.catalogId ?? `power-thrash:${ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, name: ex.name, equipment: ex.equipment };
}

function set(s: PtSet, load: number | null): GeneratedSet {
  const total = s.reps.reduce((a, b) => a + b, 0);
  return {
    kind: "working", repsType: "count", repsMin: total, repsMax: total, unit: null,
    rpeMin: null, rpeMax: null, effort: null,
    ...(s.reps.length > 1 ? { repsParts: s.reps } : {}),
    weight: load, weightUnit: load === null ? null : "lb",
  };
}

/** Build a followable program from the template and the athlete's maxes (lb). `startDate` is a Monday. */
export function buildPowerThrash(
  template: PtTemplate, maxes: Maxes, startDate: string, setVolume: PowerThrashSetVolume = "full", supportingWeeks?: SupportingDay[][],
): GeneratedFile {
  if (!isMonday(startDate)) throw new Error("Start date must be a Monday.");
  const errors = validateMaxes(template, maxes);
  if (Object.keys(errors).length) throw new Error(`Missing or invalid maxes: ${Object.keys(errors).join(", ")}.`);
  const own: Maxes = Object.fromEntries(template.maxes.map((m) => [m.id, maxes[m.id]]));
  const weeks: GeneratedWeek[] = template.weeks.map((w) => {
    const weekStart = addDays(startDate, (w.week - 1) * 7);
    const days: GeneratedDay[] = Array.from({ length: 7 }, (_, i) => {
      const dayNo = i + 1;
      const date = addDays(weekStart, i);
      const src = w.days.find((d) => d.day === dayNo);
      const support = supportingWeeks?.[w.week - 1]?.find((session) => session.day === dayNo);
      if (!src) {
        return support && POWER_THRASH_RECOVERY_DAYS.includes(dayNo)
          ? { day: dayNo, date, type: "recovery", sections: support.sections }
          : { day: dayNo, date, type: "rest", sections: [] };
      }
      const sections: GeneratedSection[] = src.exercises.map((ex, j) => {
        const max = ex.max === null ? null : own[ex.max];
        const sets = setVolume === "half" ? ex.sets.slice(0, Math.ceil(ex.sets.length / 2)) : ex.sets;
        return {
          label: LETTERS[j], title: ex.name, role: "strength", format: null, minutes: null, scheme: {},
          notes: ex.notes.map((text) => ({ label: null, text })),
          items: [{
            exercise: exerciseRef(ex), nameRaw: ex.name, tempo: null, restSec: ex.restSec, perSide: false, load: null,
            sets: sets.map((s) => set(s, max === null || s.pct === null ? null : roundLoad(s.pct * max, template.roundTo))),
          }],
        };
      });
      return {
        day: dayNo, date, type: "training", headline: { mainLift: exerciseRef(src.exercises[0]), focusTopic: null },
        sections: [...(support?.sections.filter((section) => section.role === "warmup") ?? []), ...sections],
      };
    });
    return { weekStart, days, block: { weekNumber: w.week, weekCount: template.weeks.length } };
  });
  return {
    options: {
      track: POWER_THRASH_TRACK, title: template.title, startDate, unit: template.unit, maxes: own,
      maxLabels: Object.fromEntries(template.maxes.map(({ id, label }) => [id, label])),
      ...(setVolume === "half" ? { setVolume } : {}),
    },
    weeks,
    checks: [{ name: "Weights", status: "pass", detail: `Calculated from your one-rep maxes and rounded to the nearest ${template.roundTo} lb.` }],
    warnings: [],
  };
}
