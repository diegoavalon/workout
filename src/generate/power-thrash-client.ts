import { fetch, FetchError } from "void/client";
import { z } from "zod";
import { POWER_THRASH_CREDIT, POWER_THRASH_RECOVERY_DAYS, POWER_THRASH_TEMPLATE, POWER_THRASH_TRAINING_DAYS, type PtTemplate } from "../domain/power-thrash";
import { generateSupport, loadManifest, type GenerateProgress } from "./client";

const text = z.string().trim().min(1);
const CACHE_KEY = "workout-power-thrash-template";
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const exercise = z.object({
  name: text,
  catalogId: text.optional(),
  equipment: z.array(text),
  max: id.nullable(),
  restSec: z.number().positive(),
  sets: z.array(z.object({
    reps: z.array(z.int().positive()).min(1),
    pct: z.number().nonnegative().nullable(),
  })).min(1),
  notes: z.array(text),
});
const templateSchema = z.object({
  id: z.literal("power-thrash-ii"),
  title: text,
  credit: text.transform(() => POWER_THRASH_CREDIT),
  unit: z.literal("lb"),
  roundTo: z.literal(5),
  daysPerWeek: z.literal(3),
  maxes: z.array(z.object({ id, label: text, example: z.number().positive() })).length(15),
  weeks: z.array(z.object({
    week: z.int().positive(),
    days: z.array(z.object({
      day: z.int().positive(),
      exercises: z.array(exercise).min(1).max(26),
    })).length(3),
  })).length(12),
  fixes: z.array(text),
}).refine((template) => {
  const maxIds = new Set(template.maxes.map((max) => max.id));
  return maxIds.size === template.maxes.length && template.weeks.every((week, index) =>
    week.week === index + 1 && week.days.every((day, dayIndex) =>
      day.day === POWER_THRASH_TRAINING_DAYS[dayIndex] && day.exercises.every((item) =>
        item.max === null ? item.sets.every((set) => set.pct === null) : maxIds.has(item.max),
      ),
    ),
  );
});

export async function loadPowerThrashTemplate(signal: AbortSignal): Promise<PtTemplate> {
  try {
    const raw = await fetch("/api/corpus/:name", {
      params: { name: POWER_THRASH_TEMPLATE }, signal, retry: 0, timeout: 12000,
    });
    const parsed = templateSchema.safeParse(raw);
    if (parsed.success) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(parsed.data)); } catch { /* Offline storage is optional. */ }
      return parsed.data;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof FetchError) {
      if (error.status === 404) throw new Error("The Power Thrash II template hasn’t been published to this server yet.");
      if (error.status === 401 || error.status === 403) throw new Error("Your session expired. Sign in again to load the program.");
    }
    if (!navigator.onLine) {
      try {
        const cached = templateSchema.safeParse(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"));
        if (cached.success) return cached.data;
      } catch { /* Offline storage is optional. */ }
    }
    if (!navigator.onLine) throw new Error("Connect to the internet to load the Power Thrash II template.");
    throw new Error("Couldn’t download the Power Thrash II template. Try again.");
  }
  throw new Error("The Power Thrash II template is invalid. Ask the owner to publish it again.");
}

export async function loadPowerThrashSupport(
  { weeks, startDate, needRecovery, needWarmups }: { weeks: number; startDate: string; needRecovery: boolean; needWarmups: boolean },
  onProgress: (progress: GenerateProgress) => void,
) {
  const manifest = await loadManifest();
  return generateSupport(manifest, {
    track: "pump-lift-3x",
    seed: Number(startDate.replaceAll("-", "")),
    weeks,
    recoveryDays: needRecovery ? POWER_THRASH_RECOVERY_DAYS : [],
    warmupDays: needWarmups ? POWER_THRASH_TRAINING_DAYS : [],
    warmupEquipment: ["dumbbell"],
  }, onProgress);
}
