import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkoutRenderer } from "./WorkoutRenderer";

const D = (ops: unknown[]) => JSON.stringify({ ops });

describe("WorkoutRenderer", () => {
  beforeEach(() => {
    // jsdom 26 has no PointerEvent; Base UI dispatches one when a checkbox is clicked.
    vi.stubGlobal("PointerEvent", MouseEvent);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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
  it("watch video swaps the poster for a native-controls video player", () => {
    const items = [{ order: 1, type: "exerciseAssignment", itemId: "a1", exerciseId: "ex1", child: { id: "ex1", title: "Squat", imageUrl: "https://x/img.jpg", videoUrl: "https://x/vid.mp4" }, sets: 3, reps: "5" }];
    const { container } = render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Watch video/ }));
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.getAttribute("src")).toBe("https://x/vid.mp4");
    expect(screen.getByRole("button", { name: /Hide video/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hide video/ }));
    expect(container.querySelector("video")).toBeNull();
  });
  it("shows a placeholder and no media label when an exercise has no media", () => {
    const items = [{ order: 1, type: "exerciseAssignment", itemId: "a1", exerciseId: "ex1", child: { id: "ex1", title: "Sled Push" }, sets: 3, reps: "20 m" }];
    const { container } = render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    expect(container.textContent).toContain("No media available");
    expect(container.textContent).not.toContain("exercise media");
    expect(container.textContent).not.toContain("media unavailable");
  });
  it("renders invalid Delta as readable text", () => {
    render(<WorkoutRenderer items={[{ order: 1, type: "richText", itemId: "rt", child: { content: "{broken" } }]} exerciseIndex={new Map()} />);
    expect(screen.getByText("{broken")).toBeTruthy();
  });

  it("tracks each set independently and lets the user undo exercise completion", () => {
    const items = [{ type: "exerciseAssignment", itemId: "rdl", child: { id: "rdl", title: "Romanian Deadlift" }, sets: 3, reps: 8, rest: 180 }];
    render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    const card = screen.getByRole("article", { name: "Romanian Deadlift" });
    const sets = within(card).getAllByRole("checkbox");
    expect(sets).toHaveLength(3);
    expect(card.getAttribute("data-completed")).toBe("false");

    fireEvent.click(within(card).getByRole("checkbox", { name: "Set 2" }));
    expect(within(card).getByText("1 of 3 completed")).toBeTruthy();
    expect(sets[1].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(card).getByRole("checkbox", { name: "Set 1" }));
    fireEvent.click(within(card).getByRole("checkbox", { name: "Set 3" }));
    expect(card.getAttribute("data-completed")).toBe("true");
    expect(within(card).getByText("Completed")).toBeTruthy();
    expect(card.className).toContain("border-success");

    fireEvent.click(within(card).getByRole("checkbox", { name: "Set 2" }));
    expect(card.getAttribute("data-completed")).toBe("false");
    expect(within(card).queryByText("Completed")).toBeNull();
    expect(within(card).getByText("2 of 3 completed")).toBeTruthy();
  });

  it("tracks a superset as one round, keeps other supersets independent, and resets on remount", () => {
    const items = [{ type: "groupedAssignment", itemId: "g", isSuperset: true, subAssignments: [
      { type: "exerciseAssignment", itemId: "left", child: { id: "plank", title: "Plank" }, sets: 1 },
      { type: "exerciseAssignment", itemId: "right", child: { id: "plank", title: "Plank" }, sets: 1 },
    ] }, { type: "groupedAssignment", itemId: "other", isSuperset: true, subAssignments: [
      { type: "exerciseAssignment", itemId: "other-plank", child: { id: "plank", title: "Plank" }, sets: 1 },
    ] }];
    const { unmount } = render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    const group = screen.getByRole("region", { name: "Superset A", exact: true });
    const other = screen.getByRole("region", { name: "Superset B", exact: true });
    const cards = within(group).getAllByRole("article", { name: "Plank" });
    expect(cards.every((card) => within(card).queryByRole("checkbox") === null)).toBe(true);
    fireEvent.click(within(group).getByRole("checkbox", { name: "Round 1" }));
    expect(group.getAttribute("data-completed")).toBe("true");
    expect(cards.every((card) => card.getAttribute("data-completed") === "true")).toBe(true);
    expect(other.getAttribute("data-completed")).toBe("false");
    expect(within(group).getAllByText("Completed", { exact: true })).toHaveLength(1);
    fireEvent.click(within(group).getByRole("checkbox", { name: "Round 1" }));
    expect(group.getAttribute("data-completed")).toBe("false");
    expect(cards.every((card) => card.getAttribute("data-completed") === "false")).toBe(true);
    fireEvent.click(within(group).getByRole("checkbox", { name: "Round 1" }));
    unmount();
    render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    expect(screen.getAllByRole("article").every((card) => card.getAttribute("data-completed") === "false")).toBe(true);
  });

  it("shares one rest countdown in the header and keeps exercise prescriptions passive", () => {
    vi.useFakeTimers();
    const items = [{ type: "groupedAssignment", itemId: "g", isSuperset: true, sets: 3, subAssignments: [
      { type: "exerciseAssignment", itemId: "a", child: { id: "a", title: "Pull Up" }, sets: 3, reps: 10, rest: 30 },
      { type: "exerciseAssignment", itemId: "b", child: { id: "b", title: "Chin Up" }, sets: 3, times: 20, rest: 120 },
    ] }];
    render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    const group = screen.getByRole("region", { name: "Superset A", exact: true });
    const header = within(group).getByRole("group", { name: "Superset A tracking", exact: true });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(group).getAllByRole("timer")).toHaveLength(1);
    for (const card of within(group).getAllByRole("article")) {
      expect(within(card).queryByRole("timer")).toBeNull();
      expect(within(card).queryByRole("checkbox")).toBeNull();
    }
    expect(within(group).getByRole("article", { name: "Pull Up" }).textContent).toContain("30 s");
    expect(within(group).getByRole("article", { name: "Chin Up" }).textContent).toContain("20 s");
    expect(within(header).getByRole("timer").textContent).toBe("2:00");
    fireEvent.click(within(header).getByRole("button", { name: "Start rest timer" }));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(within(header).getByRole("timer").textContent).toBe("1:55");
    for (const checkbox of within(header).getAllByRole("checkbox")) fireEvent.click(checkbox);
    expect(group.getAttribute("data-completed")).toBe("true");
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(within(header).getByRole("timer").textContent).toBe("1:52");
  });

  it("uses an explicit group round count and rest prescription when provided", () => {
    const items = [{ type: "groupedAssignment", isSuperset: true, sets: 4, restSeconds: 90, subAssignments: [
      { type: "exerciseAssignment", itemId: "a", sets: 2, rest: 30 },
      { type: "exerciseAssignment", itemId: "b", sets: 2, rest: 120 },
    ] }];
    render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByRole("timer").textContent).toBe("1:30");
  });

  it("does not invent a shared round count when missing exercise prescriptions disagree", () => {
    const items = [{ type: "groupedAssignment", isSuperset: true, subAssignments: [
      { type: "exerciseAssignment", itemId: "a", sets: 2 },
      { type: "exerciseAssignment", itemId: "b", sets: 3 },
    ] }];
    render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("region", { name: "Superset A", exact: true }).getAttribute("data-completed")).toBe("false");
  });

  it("preserves individual tracking in sequential sections", () => {
    const items = [{ type: "groupedAssignment", isSection: true, title: "Warmup", subAssignments: [
      { type: "exerciseAssignment", itemId: "a", child: { id: "a", title: "Plank" }, sets: 1, times: 30 },
      { type: "exerciseAssignment", itemId: "b", child: { id: "b", title: "Bridge" }, sets: 2 },
    ] }];
    render(<WorkoutRenderer items={items} exerciseIndex={new Map()} />);
    const plank = screen.getByRole("article", { name: "Plank" });
    const bridge = screen.getByRole("article", { name: "Bridge" });
    fireEvent.click(within(plank).getByRole("checkbox", { name: "Set 1" }));
    expect(plank.getAttribute("data-completed")).toBe("true");
    expect(bridge.getAttribute("data-completed")).toBe("false");
    expect(within(plank).getByRole("timer")).toBeTruthy();
    expect(within(bridge).getAllByRole("checkbox")).toHaveLength(2);
  });

  it.each([undefined, null, 0, -1, 1.5])("does not invent checkboxes when sets is %s", (sets) => {
    render(<WorkoutRenderer items={[{ type: "exerciseAssignment", sets }]} exerciseIndex={new Map()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("article").getAttribute("data-completed")).toBe("false");
  });

  it.each([
    { times: 30, rest: 180 },
    { durationSeconds: 30, restSeconds: 180 },
    { seconds: 30, restSeconds: 180 },
  ])("uses independent work and rest countdowns for prescription aliases %j", (timing) => {
    vi.useFakeTimers();
    render(<WorkoutRenderer items={[{ type: "exerciseAssignment", sets: 1, ...timing }]} exerciseIndex={new Map()} />);
    const time = screen.getByRole("timer", { name: "Time countdown" });
    const rest = screen.getByRole("timer", { name: "Rest countdown" });
    fireEvent.click(screen.getByRole("button", { name: "Start time timer" }));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(time.textContent).toBe("25 s");
    expect(rest.textContent).toBe("3:00");
    fireEvent.click(screen.getByRole("button", { name: "Start rest timer" }));
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(time.textContent).toBe("24 s");
    expect(rest.textContent).toBe("2:59");
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });

  it.each([undefined, null, 0, -10, "As needed", [30, 0]])("keeps missing or non-countdown time and rest prescriptions passive: %j", (value) => {
    render(<WorkoutRenderer items={[{ type: "exerciseAssignment", times: value, rest: value }]} exerciseIndex={new Map()} />);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByRole("button", { name: /timer/ })).toBeNull();
  });
});
