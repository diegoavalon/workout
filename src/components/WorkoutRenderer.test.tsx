import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkoutRenderer } from "./WorkoutRenderer";

const D = (ops: unknown[]) => JSON.stringify({ ops });

describe("WorkoutRenderer", () => {
  it("renders ordered rich text, exercises, groups, and an unknown-exercise placeholder without crashing", () => {
    const items = [
      { order: 2, type: "exerciseAssignment", itemId: "a1", exerciseId: "ex-nope", child: null, sets: 4, reps: "5", rest: 180 },
      { order: 1, type: "richText", itemId: "rt", child: { content: D([{ insert: "Strength" }, { insert: "\n", attributes: { header: 2 } }, { insert: "Move well.\n" }]) } },
      { order: 3, type: "groupedAssignment", itemId: "g1", isSuperset: true, subAssignments: [
        { order: 2, type: "exerciseAssignment", itemId: "a3", exerciseId: "ex2", child: { id: "ex2", title: "Second" }, sets: 3, reps: "8" },
        { order: 1, type: "exerciseAssignment", itemId: "a2", exerciseId: "ex1", child: { id: "ex1", title: "First" }, sets: 3, reps: "8" },
      ] },
      { order: 4, type: "mysteryBlock", itemId: "m1" },
    ];
    const { container } = render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    expect(screen.getByRole("heading", { name: "Strength" })).toBeTruthy();
    expect(screen.getByText("Unknown exercise")).toBeTruthy();
    expect(screen.getByText(/not found in the library/)).toBeTruthy();
    expect(screen.getByText("Unsupported block")).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text.indexOf("Strength")).toBeLessThan(text.indexOf("Unknown exercise"));
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
  });
  it("renders invalid Delta as readable text", () => {
    render(<WorkoutRenderer items={[{ order: 1, type: "richText", itemId: "rt", child: { content: "{broken" } }]} exerciseIndex={new Map()} />);
    expect(screen.getByText("{broken")).toBeTruthy();
  });
});
