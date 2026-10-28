import { BASE_PROGRAMS, EXL, IMPORTED_PROGRAM, WEEK_TITLES, rawWorkout, sessionsOf, type Program as LegacyProgram } from "../lib/workout-data";
import type { Exercise, Program } from "../domain/types";
import { sessionKey } from "../domain/types";

export type SeedBundle = { programs: Program[]; items: Map<string, Record<string, unknown>[]>; exercises: Exercise[] };

const WEEKDAY_SUGGESTION = [1, 3, 5, 2, 4, 6];

function adaptItem(it: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...it };
  const child = out.child as Record<string, unknown> | null | undefined;
  if (child && typeof child === "object" && !("content" in child)) {
    out.child = { ...child, title: (child as { name?: string }).name, imageUrl: (child as { image?: string }).image, videoUrl: (child as { video?: string }).video };
  }
  if (Array.isArray(out.subAssignments)) out.subAssignments = (out.subAssignments as Record<string, unknown>[]).map(adaptItem);
  return out;
}

function buildProgram(legacy: LegacyProgram): { program: Program; items: Map<string, Record<string, unknown>[]> } {
  const items = new Map<string, Record<string, unknown>[]>();
  const defs = sessionsOf(legacy);
  const program: Program = {
    schemaVersion: 1, contentVersion: "1.0.0", id: legacy.id, title: legacy.title, description: legacy.description,
    daysPerWeek: legacy.daysPerWeek, focus: legacy.category, difficulty: legacy.difficulty, equipment: legacy.equipment,
    totalWeeks: legacy.totalWeeks,
    weeks: Array.from({ length: legacy.totalWeeks }, (_, wi) => ({
      id: `w${String(wi + 1).padStart(2, "0")}`, order: wi + 1, title: WEEK_TITLES[wi % WEEK_TITLES.length],
      sessions: defs.map(([title, , , minutes], si) => {
        const sid = `w${String(wi + 1).padStart(2, "0")}-s${si + 1}`;
        const doc = rawWorkout(legacy, wi + 1, si + 1);
        items.set(sessionKey(legacy.id, sid), (doc.items as unknown as Record<string, unknown>[]).map(adaptItem));
        return { id: sid, order: si + 1, title, summary: defs[si][1], suggestedWeekday: WEEKDAY_SUGGESTION[si % WEEKDAY_SUGGESTION.length], estimatedMinutes: minutes, contentPath: `week-${String(wi + 1).padStart(2, "0")}/session-${String(si + 1).padStart(2, "0")}.json` };
      }),
    })),
  };
  return { program, items };
}

export const OTHER_PROGRAM: LegacyProgram = {
  id: "weekend-warrior", title: "Weekend Warrior", description: "Two longer sessions for people who train on weekends.",
  daysPerWeek: 2, totalWeeks: 4, category: "General fitness", difficulty: "Beginner", equipment: ["Dumbbells"],
  custom: [["Full Body A", "Strength", "full", 60], ["Power & Core", "Power", "power", 45]],
};

export function buildSeed(): SeedBundle {
  const items = new Map<string, Record<string, unknown>[]>();
  const programs: Program[] = [];
  for (const legacy of [...BASE_PROGRAMS, IMPORTED_PROGRAM, OTHER_PROGRAM]) {
    const built = buildProgram(legacy);
    programs.push(built.program);
    for (const [k, v] of built.items) items.set(k, v);
  }
  const exercises: Exercise[] = Object.values(EXL).map((e) => ({ id: e.id, title: e.name, imageUrl: e.image, videoUrl: e.video ?? undefined, tags: [], logType: "reps" }));
  return { programs, items, exercises };
}
