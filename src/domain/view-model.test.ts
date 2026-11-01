import { describe, expect, it } from "vitest";
import { buildWorkoutView, type BlockView } from "./view-model";

const D = (ops: unknown[]) => JSON.stringify({ ops });
const byKind = <K extends BlockView["kind"]>(blocks: BlockView[], kind: K) =>
  blocks.filter((b): b is Extract<BlockView, { kind: K }> => b.kind === kind);

describe("buildWorkoutView", () => {
  it("sorts items, assigns letters only to assignments, and resolves exercises", () => {
    const view = buildWorkoutView([
      { order: 2, type: "exerciseAssignment", itemId: "a1", exerciseId: "ex-nope", child: null, sets: 4, reps: "5", rest: 180 },
      { order: 1, type: "richText", itemId: "rt", child: { content: D([{ insert: "Strength" }, { insert: "\n", attributes: { header: 2 } }, { insert: "Move well.\n" }]) } },
      { order: 3, type: "mysteryBlock", itemId: "m1" },
    ], new Map());
    expect(view.blocks.map((b) => b.kind)).toEqual(["richText", "exercise", "unsupported"]);
    const [exercise] = byKind(view.blocks, "exercise");
    expect(exercise.exercise).toMatchObject({ label: "A", title: "Unknown exercise", known: false, trackingCount: 4 });
    // Tracked cards hide the Sets tile (the tracker shows it) but keep timers derivable.
    expect(exercise.exercise.metrics.map((m) => m.label)).toEqual(["Reps", "Rest"]);
    expect(exercise.exercise.metrics.find((m) => m.label === "Rest")?.timerSeconds).toBe(180);
  });

  it("derives superset round count, timers, and preferred timer from raw data", () => {
    const view = buildWorkoutView([
      { type: "groupedAssignment", itemId: "g", isSuperset: true, sets: 3, subAssignments: [
        { type: "exerciseAssignment", itemId: "a", child: { id: "a", title: "Pull Up" }, sets: 3, reps: 10, rest: 30 },
        { type: "exerciseAssignment", itemId: "b", child: { id: "b", title: "Chin Up" }, sets: 3, times: 20, rest: 120 },
      ] },
    ], new Map());
    const [superset] = byKind(view.blocks, "superset");
    expect(superset).toMatchObject({ label: "A", title: "Superset A", roundCount: 3 });
    expect(superset.exercises.map((e) => e.label)).toEqual(["A1", "A2"]);
    const preferred = superset.timers.find((t) => t.id === superset.preferredTimerId);
    expect(preferred).toMatchObject({ label: "Rest after round", seconds: 120 });
    // Nested exercises are passive: no tracking, Sets tile preserved.
    expect(superset.exercises.every((e) => e.trackingCount === 0)).toBe(true);
  });

  it("does not invent a superset round count when exercise prescriptions disagree", () => {
    const view = buildWorkoutView([
      { type: "groupedAssignment", isSuperset: true, subAssignments: [
        { type: "exerciseAssignment", itemId: "a", sets: 2 },
        { type: "exerciseAssignment", itemId: "b", sets: 3 },
      ] },
    ], new Map());
    expect(byKind(view.blocks, "superset")[0].roundCount).toBe(0);
  });
});
