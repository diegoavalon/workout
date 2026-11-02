import { TRACK_IDS, type TrackId } from "../persist/schema";
import type { GenerateOptions } from "../persist/generate";

export type Style = "pump-lift" | "pump-condition" | "perform" | "minimalist";
export const STYLES: { id: Style; label: string; blurb: string; days: number[] }[] = [
  { id: "pump-lift", label: "Pump Lift", blurb: "Strength-led training with pump work.", days: [3, 4, 5] },
  { id: "pump-condition", label: "Pump Condition", blurb: "Pump work with more conditioning.", days: [3, 4, 5] },
  { id: "perform", label: "Perform", blurb: "Athletic performance, five days a week.", days: [5] },
  { id: "minimalist", label: "Minimalist", blurb: "Shorter sessions, four days a week.", days: [4] },
];

export const MAX_SEED = 4294967295;
export const WEEKS = 6;

export interface ProgramInput {
  style: Style;
  days: number;
  /** false = "No restriction". When true, only `equipment` (plus bodyweight) is used. */
  restrictEquipment: boolean;
  equipment: string[];
  startDate: string;
  /** Raw text from the seed field; blank means "pick one". */
  seed: string;
  allowRecent: boolean;
}

export const daysFor = (style: Style) => STYLES.find((s) => s.id === style)!.days;

/** Track id for a style and frequency. Perform is fixed at 5 days and Minimalist at 4. */
export function trackFor(style: Style, days: number): TrackId {
  if (!daysFor(style).includes(days)) throw new Error(`No ${style} program with ${days} days per week.`);
  const id = style === "perform" || style === "minimalist" ? style : `${style}-${days}x`;
  if (!(TRACK_IDS as readonly string[]).includes(id)) throw new Error(`Unknown program ${id}.`);
  return id as TrackId;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The next Monday in the local calendar; today when today is Monday. */
export function nextMonday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return iso(d);
}
export function isMonday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date && d.getUTCDay() === 1;
}

/** Blank → null (pick one for me). Otherwise a whole number from 0 to 4294967295, or an error message. */
export function parseSeed(text: string): { seed: number | null; error?: string } {
  const t = text.trim();
  if (!t) return { seed: null };
  const n = /^\d+$/.test(t) ? Number(t) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > MAX_SEED) return { seed: null, error: `Seed must be a whole number from 0 to ${MAX_SEED}.` };
  return { seed: n };
}
/** Same range the CLI uses when no seed is given. */
export const randomSeed = () => 1 + Math.floor(Math.random() * 50);

export function validateInput(i: ProgramInput): string[] {
  const errors: string[] = [];
  if (!daysFor(i.style).includes(i.days)) errors.push("Choose a valid number of days per week.");
  if (!isMonday(i.startDate)) errors.push("Start date must be a Monday.");
  const s = parseSeed(i.seed);
  if (s.error) errors.push(s.error);
  return errors;
}

/** Options for `generate()`, matching what the CLI passes for the same inputs. */
export function buildOptions(i: ProgramInput, seed: number): GenerateOptions {
  const errors = validateInput(i);
  if (errors.length) throw new Error(errors.join(" "));
  const equipment = [...new Set(i.equipment.map((e) => e.trim()).filter(Boolean))];
  return {
    track: trackFor(i.style, i.days), seed, startDate: i.startDate,
    equipment: i.restrictEquipment ? equipment : undefined,
    avoidRecent: !i.allowRecent,
  };
}

export const defaultInput = (now = new Date()): ProgramInput => ({ style: "pump-lift", days: 3, restrictEquipment: false, equipment: [], startDate: nextMonday(now), seed: "", allowRecent: false });

const LABELS: Record<string, string> = { "pull-up-bar": "Pull-up bar", "dumbbell-or-kettlebell": "Dumbbell or kettlebell", "jump-rope": "Jump rope", "medicine-ball": "Medicine ball", "ski-erg": "Ski erg", pvc: "PVC pipe" };
export const equipmentLabel = (tag: string) => LABELS[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, " ");
