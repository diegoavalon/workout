import { z } from "zod";

export const TRACK_IDS = [
  "pump-lift-5x",
  "pump-lift-4x",
  "pump-lift-3x",
  "pump-condition-5x",
  "pump-condition-4x",
  "pump-condition-3x",
  "perform",
  "minimalist",
] as const;
export const trackId = z.enum(TRACK_IDS);
export type TrackId = z.infer<typeof trackId>;

export const quantity = z.object({
  type: z.enum(["count", "max", "seconds", "minutes", "distance", "calories", "text"]),
  min: z.number().nullable(),
  max: z.number().nullable(),
  /** Second value of a "male/female" pair such as 12/10 Cal. */
  female: z.number().nullable().optional(),
  perSide: z.boolean(),
  unit: z.string().nullable(),
  raw: z.string(),
});
export type Quantity = z.infer<typeof quantity>;

export const load = z.object({
  male: z.number().nullable(),
  female: z.number().nullable(),
  unit: z.enum(["lb", "kg", "%"]),
  raw: z.string(),
});

export const item = z.object({
  raw: z.string(),
  index: z.string().nullable(),
  name: z.string().nullable(),
  qty: quantity.nullable(),
  tempo: z.string().nullable(),
  loads: z.array(load),
  restRaw: z.string().nullable(),
  extras: z.array(z.string()),
});
export type Item = z.infer<typeof item>;

export const setLine = z.object({
  raw: z.string(),
  kind: z.enum(["warmup", "working"]),
  position: z.number().int(),
  reps: quantity.nullable(),
  tempo: z.string().nullable(),
  rpeMin: z.number().nullable(),
  rpeMax: z.number().nullable(),
  effort: z.string().nullable(),
  sameWeightAsSet1: z.boolean(),
});
export type SetLine = z.infer<typeof setLine>;

export const line = z.object({
  kind: z.enum(["header", "item", "rest", "connector", "note", "legend", "text"]),
  text: z.string(),
  item: item.nullable(),
});
export type Line = z.infer<typeof line>;

export const section = z.object({
  label: z.string().nullable(),
  title: z.string(),
  minutesMin: z.number().nullable(),
  minutesMax: z.number().nullable(),
  kind: z.enum(["focus", "strength", "list", "freeform", "note"]),
  /** First non-structural line of a strength section. */
  exercise: z.string().nullable(),
  /** "3 Working Sets; rest 2-3 min" and other lines that describe the scheme. */
  scheme: z.array(z.string()),
  sets: z.array(setLine),
  lines: z.array(line),
  notes: z.array(z.object({ label: z.string(), text: z.string() })),
  raw: z.string(),
});
export type Section = z.infer<typeof section>;

export const day = z.object({
  day: z.number().int().min(1).max(7),
  printedDate: z.string().nullable(),
  date: z.string(),
  headerLine: z.string(),
  sessionType: z.enum(["training", "recovery", "note"]),
  focusTopic: z.string().nullable(),
  focusBody: z.string().nullable(),
  shortOnTime: z.array(z.string()),
  sections: z.array(section),
  noteBody: z.string().nullable(),
  raw: z.string(),
});
export type Day = z.infer<typeof day>;

export const weekFile = z.object({
  sourceFile: z.string(),
  headerWeekOf: z.string().nullable(),
  weekStart: z.string(),
  weekNumber: z.number().int(),
  tracks: z.record(z.string(), z.array(day)),
});
export type WeekFile = z.infer<typeof weekFile>;

export const correction = z.object({
  file: z.string(),
  location: z.string(),
  type: z.string(),
  original: z.string(),
  corrected: z.string(),
});
export type Correction = z.infer<typeof correction>;

export const unparsedLine = z.object({
  file: z.string(),
  location: z.string(),
  section: z.string(),
  text: z.string(),
  reason: z.string(),
});
export type UnparsedLine = z.infer<typeof unparsedLine>;
