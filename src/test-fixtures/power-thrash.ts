import type { PtTemplate } from "../domain/power-thrash";
import type { WeekView } from "../persist/views";

const maxes = Array.from({ length: 15 }, (_, index) => ({
  id: `test-lift-${index + 1}`,
  label: `Test lift ${index + 1}`,
  example: 175 + 5 * index,
}));

export const examplePowerThrashMaxes = Object.fromEntries(maxes.map(({ id, example }) => [id, example]));

export const powerThrashFixture: PtTemplate = {
  id: "power-thrash-ii",
  title: "Power Thrash II",
  credit: "Synthetic test program",
  maxes,
  roundTo: 5,
  daysPerWeek: 3,
  unit: "lb",
  fixes: ["A correction for the fixture."],
  weeks: Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    days: [1, 3, 5].map((day, dayIndex) => ({
      day,
      exercises: [
        {
          name: "Fixture combination",
          max: maxes[(index * 3 + dayIndex) % maxes.length].id,
          equipment: ["barbell"],
          restSec: 45,
          sets: [{ reps: [14, 10], pct: 0.7 }, { reps: [10, 8], pct: 0.75 }],
          notes: ["Moves: Test press, Test row."],
        },
        {
          name: "Stair Run",
          max: null,
          equipment: [],
          restSec: 30,
          sets: [{ reps: [5], pct: null }],
          notes: [],
        },
      ],
    })),
  })),
};

export const supportCorpusFixture: WeekView[] = [{
  track: "pump-lift-3x",
  block: { id: 1, startDate: "2026-11-23", weekNumber: 1, weekCount: 6 },
  weekStart: "2026-11-23",
  note: null,
  sourceFile: null,
  days: [2, 4, 6].map<WeekView["days"][number]>((day, index) => ({
    day,
    date: `2026-11-${23 + day - 1}`,
    type: "recovery",
    sessionId: day,
    sharedWith: [],
    headline: { mainLift: null, focusTopic: null, roles: ["mobility"] },
    focus: { topic: null, body: null, shortOnTime: [] },
    sections: [{
      label: "A",
      title: `Fixture mobility ${index + 1}`,
      role: "mobility",
      format: null,
      minutes: null,
      scheme: {},
      notes: [{ label: "Mobility", text: `Mobility sequence ${index + 1}` }],
      items: [],
      raw: `A) Mobility:\nMobility sequence ${index + 1}`,
    }],
  })).concat({
    day: 1,
    date: "2026-11-23",
    type: "training",
    sessionId: 1,
    sharedWith: [],
    headline: { mainLift: null, focusTopic: null, roles: ["warmup"] },
    focus: { topic: null, body: null, shortOnTime: [] },
    sections: [{
      label: "B",
      title: "Fixture warm-up",
      role: "warmup",
      format: null,
      minutes: [8, 8],
      scheme: {},
      notes: [],
      items: [{
        exercise: { id: "test-warmup", name: "Test warm-up movement", pattern: null, equipment: ["dumbbell"], unilateral: false },
        nameRaw: null, alternatives: [], tempo: null, restSec: null, perSide: false, load: null,
        sets: [{ kind: "working", repsType: "count", repsMin: 5, repsMax: 5, unit: null, valueFemale: null, rpeMin: null, rpeMax: null, effort: null }],
      }],
      raw: "B) Warm-Up:\nTest warm-up movement",
    }],
  }),
}];
