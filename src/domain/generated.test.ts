import { describe, expect, it } from "vitest";
import { generatedProgramFixture } from "../test-fixtures/generated-program";
import { buildGeneratedDayView, buildGeneratedProgramView, type GeneratedDay } from "./generated";
import type { BlockView } from "./view-model";

const byKind = <K extends BlockView["kind"]>(blocks: BlockView[], kind: K) =>
  blocks.filter((b): b is Extract<BlockView, { kind: K }> => b.kind === kind);

const set = (kind: string, repsMin: number | null, repsMax: number | null, extra: object = {}) => ({
  kind, repsType: "count", repsMin, repsMax, unit: "reps", valueFemale: null, rpeMin: null, rpeMax: null, effort: null, ...extra,
});

const day: GeneratedDay = {
  day: 1, date: "2026-11-02", type: "training",
  headline: { mainLift: { id: "sumo-deadlift", name: "Sumo Deadlift" }, focusTopic: "Sumo Deadlift + Push Press" },
  focus: { topic: "Sumo Deadlift + Push Press", body: null, shortOnTime: ["Remove Finisher"] },
  sections: [
    { label: "A", title: "Daily Focus Notes", role: "focus-note", format: null, minutes: null, scheme: {}, notes: [], items: [] },
    { label: "C", title: "Strength Intensity 1 (15 min)", role: "strength-intensity-1", format: "straight-sets", minutes: [15, 15],
      scheme: { lines: ["3 Working Sets; rest 2-3 min"], setsMin: 3, setsMax: 3 }, notes: [],
      items: [{ exercise: { id: "sumo-deadlift", name: "Sumo Deadlift" }, nameRaw: null, alternatives: [], tempo: "20X0", restSec: [120, 180], perSide: false, load: null,
        sets: [set("warmup", 10, 10, { effort: "easy" }), set("working", 10, 10, { rpeMin: 7, rpeMax: 7 }), set("working", 6, 6, { rpeMin: 9, rpeMax: 9 })] }] },
    { label: "E", title: "Strength Balance (10 min)", role: "strength-balance", format: "superset", minutes: [10, 10],
      scheme: { lines: ["3 sets"], setsMin: 3, setsMax: 3 }, notes: [{ label: "Loading Note", text: "Aim for RPE 7-8." }],
      items: [
        { exercise: { id: "pistol", name: "Pistol" }, nameRaw: null, alternatives: [], tempo: null, restSec: [60, 60], perSide: true, load: null, sets: [set("working", 6, 8)] },
        { exercise: null, nameRaw: "Mystery Move", alternatives: [], tempo: null, restSec: [90, 90], perSide: false, load: null, sets: [set("working", 10, 12)] },
      ] },
  ],
};

describe("buildGeneratedDayView", () => {
  it("maps sections to notes, section, and superset blocks with per-set details", () => {
    const view = buildGeneratedDayView(day);
    expect(view).toMatchObject({ title: "Sumo Deadlift + Push Press", dayLabel: "Day 1" });
    expect(view.badges).toContain("Main lift: Sumo Deadlift");
    expect(view.blocks.map((b) => b.kind)).toEqual(["notes", "section", "superset"]);

    const [notes] = byKind(view.blocks, "notes");
    expect(notes.lines).toEqual(["Sumo Deadlift + Push Press"]);

    const [section] = byKind(view.blocks, "section");
    const [lift] = section.exercises;
    expect(lift).toMatchObject({ label: "C", title: "Sumo Deadlift", known: true, trackingCount: 2 });
    expect(lift.setDetails).toEqual(["Warm-up: 10 reps (easy)", "Set 1: 10 reps @ RPE 7", "Set 2: 6 reps @ RPE 9"]);
    expect(lift.metrics.find((m) => m.label === "Rest")).toMatchObject({ value: "2:00–3:00", timerSeconds: 120 });
    expect(lift.metrics.find((m) => m.label === "Tempo")?.value).toBe("20X0");

    const [superset] = byKind(view.blocks, "superset");
    expect(superset).toMatchObject({ roundCount: 3, notes: ["Loading Note: Aim for RPE 7-8."] });
    expect(superset.timers).toEqual([{ id: "round-rest", label: "Rest after round", display: "1:30", seconds: 90, kind: "Rest" }]);
    expect(superset.exercises.map((e) => [e.label, e.known])).toEqual([["E1", true], ["E2", false]]);
    expect(superset.exercises[0].metrics.find((m) => m.label === "Reps")?.value).toBe("6–8 reps/side");
  });

  it("renders anonymous timed intervals as complete prescriptions, not unknown exercises", () => {
    const recovery: GeneratedDay = {
      day: 7, date: "2026-11-28", type: "recovery",
      sections: [
        { label: "A", title: "Active Recovery Work (30 min)", role: "active-recovery", format: null, minutes: [30, 30],
          scheme: { lines: ["EMOM x 6 min"] }, notes: [],
          items: [{ exercise: null, nameRaw: null, alternatives: [], tempo: null, restSec: null, perSide: false, load: null,
            sets: [{ kind: "working", repsType: "seconds", repsMin: 180, repsMax: 180, unit: "sec", valueFemale: null, rpeMin: null, rpeMax: null, effort: null }] }] },
      ],
    };
    const view = buildGeneratedDayView(recovery);
    const [section] = byKind(view.blocks, "section");
    expect(section.exercises[0]).toMatchObject({ title: "Timed interval", known: true, trackingCount: 1 });
    expect(section.exercises[0].metrics.find((m) => m.label === "Time")).toMatchObject({ value: "180 sec", timerSeconds: 180 });
  });

  it("builds a six-week program with per-set details", () => {
    const view = buildGeneratedProgramView(generatedProgramFixture);
    expect(view.weeks).toHaveLength(6);
    const days = view.weeks.flatMap((w) => w.days);
    expect(days.filter((d) => d.type === "training")).toHaveLength(18);

    const first = days[0];
    expect(first.title).toBe("Test Squat");
    const titles = first.blocks.flatMap((b) => (b.kind === "section" || b.kind === "superset" ? b.exercises.map((e) => e.title) : []));
    expect(titles).toContain("Test Squat");
    const lift = first.blocks.flatMap((b) => (b.kind === "section" || b.kind === "superset" ? b.exercises : [])).find((e) => e.title === "Test Squat");
    expect(lift?.setDetails).toContain("Set 3: 6 reps @ RPE 9");
    expect(lift?.trackingCount).toBe(3);
  });
});
