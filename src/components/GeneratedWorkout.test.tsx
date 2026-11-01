import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedDay } from "../domain/generated";
import type { ExerciseView } from "../domain/view-model";
import { GeneratedProgramViewComponent, GeneratedWorkoutRenderer } from "./GeneratedWorkout";
import type { GeneratedProgramView } from "../domain/generated";
import { ExerciseCard } from "./WorkoutRenderer";

const set = (kind: string, repsMin: number | null, repsMax: number | null, extra: object = {}) => ({
  kind, repsType: "count", repsMin, repsMax, unit: "reps", valueFemale: null, rpeMin: null, rpeMax: null, effort: null, ...extra,
});

const day: GeneratedDay = {
  day: 1, date: "2026-11-02", type: "training",
  headline: { mainLift: { id: "sumo-deadlift", name: "Sumo Deadlift" }, focusTopic: "Sumo Deadlift + Push Press" },
  focus: { topic: "Sumo Deadlift + Push Press", body: null, shortOnTime: [] },
  sections: [
    { label: "C", title: "Strength Intensity 1 (15 min)", role: "strength-intensity-1", format: "straight-sets", minutes: [15, 15],
      scheme: { lines: ["2 Working Sets"], setsMin: 2, setsMax: 2 }, notes: [],
      items: [{ exercise: { id: "sumo-deadlift", name: "Sumo Deadlift" }, nameRaw: null, alternatives: [], tempo: null, restSec: [120, 120], perSide: false, load: null,
        sets: [set("working", 10, 10, { rpeMin: 7, rpeMax: 7 }), set("working", 6, 6, { rpeMin: 9, rpeMax: 9 })] }] },
  ],
};

describe("GeneratedWorkoutRenderer", () => {
  beforeEach(() => { vi.stubGlobal("PointerEvent", MouseEvent); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders a generated day from the root view model and tracks its sets", () => {
    render(<GeneratedWorkoutRenderer day={day} />);
    expect(screen.getByRole("heading", { name: "Sumo Deadlift + Push Press" })).toBeTruthy();
    const card = screen.getByRole("article", { name: "Sumo Deadlift" });
    expect(within(card).getByText("Set 2: 6 reps @ RPE 9")).toBeTruthy();
    const sets = within(card).getAllByRole("checkbox");
    expect(sets).toHaveLength(2);
    fireEvent.click(sets[0]);
    fireEvent.click(sets[1]);
    expect(card.getAttribute("data-completed")).toBe("true");
    expect(within(card).getByText("Completed")).toBeTruthy();
  });
});

describe("GeneratedProgramViewComponent (pure UI)", () => {
  afterEach(() => { cleanup(); });

  it("renders weeks and days only from the root model passed as props", () => {
    const program: GeneratedProgramView = {
      title: "pump-lift-3x", track: "pump-lift-3x",
      weeks: [{ key: "2026-11-02", label: "Week 1", weekStart: "2026-11-02", days: [{
        key: "2026-11-02-1", title: "Prop-Only Day", dayLabel: "Day 1", date: "2026-11-02", type: "training",
        badges: ["Training"], blocks: [],
      }] }],
    };
    render(<GeneratedProgramViewComponent program={program} tracking={{}} onTrackingChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "pump-lift-3x" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Week 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prop-Only Day" })).toBeTruthy();
  });
});

describe("ExerciseCard (pure UI)", () => {
  afterEach(() => { cleanup(); });

  it("renders only what its props say, with no data resolution", () => {
    const exercise: ExerciseView = {
      key: "k1", label: "A", title: "Prop-Only Press", known: true,
      imageUrl: null, videoUrl: null, posterUrl: null,
      metrics: [{ key: "Reps", label: "Reps", value: "8", timerSeconds: null }],
      notes: "From props.", setDetails: [], trackingCount: 0,
    };
    render(<ExerciseCard exercise={exercise} />);
    expect(screen.getByRole("article", { name: "Prop-Only Press" })).toBeTruthy();
    expect(screen.getByText("From props.")).toBeTruthy();
    expect(screen.getByText("No media available")).toBeTruthy();
  });
});
