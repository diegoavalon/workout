import { BASE_PROGRAMS, EXL, IMPORTED_PROGRAM, type Program as LegacyProgram } from "../lib/workout-data";
import type { Exercise, Program } from "../domain/types";

export type SeedBundle = { programs: Program[]; items: Map<string, Record<string, unknown>[]>; exercises: Exercise[] };

export const OTHER_PROGRAM: LegacyProgram = {
  id: "weekend-warrior", title: "Weekend Warrior", description: "Two longer sessions for people who train on weekends.",
  daysPerWeek: 2, totalWeeks: 4, category: "General fitness", difficulty: "Beginner", equipment: ["Dumbbells"],
  custom: [["Full Body A", "Strength", "full", 60], ["Power & Core", "Power", "power", 45]],
};

/** Programs seeded by earlier versions. Removed from the catalog; existing local DBs purge these on load. */
export const SEED_PROGRAM_IDS: string[] = [...BASE_PROGRAMS, IMPORTED_PROGRAM, OTHER_PROGRAM].map((p) => p.id);

export function buildSeed(): SeedBundle {
  // No seeded workout programs: the library holds only what the user imports.
  // The exercise definitions remain as a fallback library for imported items.
  const exercises: Exercise[] = Object.values(EXL).map((e) => ({ id: e.id, title: e.name, imageUrl: e.image, videoUrl: e.video ?? undefined, tags: [], logType: "reps" }));
  return { programs: [], items: new Map(), exercises };
}
