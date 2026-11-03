import type { GeneratedSection } from "../domain/generated";
import type { GeneratedFile } from "../domain/generated-program";

// Synthetic program for tests; independent of private source weeks and local exports.
const strength: GeneratedSection = {
  label: "C", title: "Strength", role: "strength-intensity-1", format: "straight-sets",
  minutes: [15, 15], scheme: { setsMin: 3, setsMax: 3 }, notes: [],
  items: [{
    exercise: { id: "test-squat", name: "Test Squat" }, nameRaw: null,
    tempo: "20X0", restSec: [120, 180], perSide: false, load: null,
    sets: [
      { kind: "warmup", repsType: "count", repsMin: 10, repsMax: 10, unit: "reps", rpeMin: null, rpeMax: null, effort: "easy" },
      ...[10, 8, 6].map((reps, i) => ({
        kind: "working", repsType: "count", repsMin: reps, repsMax: reps,
        unit: "reps", rpeMin: 7 + i, rpeMax: 7 + i, effort: null,
      })),
    ],
  }],
};

const dateAt = (offset: number) => new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10);

export const generatedProgramFixture: GeneratedFile = {
  options: { track: "pump-lift-3x", seed: 28, startDate: dateAt(0) },
  checks: [{ name: "Fixture structure", status: "pass" }],
  weeks: Array.from({ length: 6 }, (_, week) => ({
    weekStart: dateAt(week * 7),
    days: Array.from({ length: 7 }, (_, day) => {
      const type = day === 6 ? "note" : day % 2 === 0 ? "training" : "recovery";
      return {
        day: day + 1, date: dateAt(week * 7 + day), type,
        ...(type === "training" ? { headline: { mainLift: { id: "test-squat", name: "Test Squat" }, focusTopic: "Test Squat" } } : {}),
        sections: type === "training" ? [structuredClone(strength)] : [],
      };
    }),
  })),
};
