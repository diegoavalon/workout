import { describe, expect, it } from "vitest";
import { buildDataset } from "./build.ts";
import { buildCatalog } from "./catalog.ts";
import { classifyFormat, classifyRole, guessEquipment, guessPattern } from "./classify.ts";
import { contentHash } from "./hash.ts";
import { normalizeName } from "./normalize.ts";
import type { Day, Section, WeekFile } from "./schema.ts";

const key = (s: string) => normalizeName(s)?.key;

describe("normalizeName", () => {
  it("joins spellings of the same exercise", () => {
    expect(key("DB Bench Press")).toBe(key("Dumbbell Bench Press"));
    expect(key("Pull-Up")).toBe(key("Pullup"));
    expect(key("Pull Ups")).toBe(key("Pull Up"));
    expect(key("1:1/4 Goblet Squat")).toBe(key("1 1/4 Goblet Squat"));
    expect(key("1-1/4 Goblet Squat")).toBe(key("1 1/4 Goblet Squat"));
    expect(key("Child's Pose")).toBe(key("Childs Pose"));
    expect(key("KB Swing")).toBe(key("Kettlebell Swing"));
    expect(key("Windmill Right")).toBe(key("Windmill"));
  });

  it("keeps alternatives separate but splits only real exercise pairs", () => {
    const n = normalizeName("Bent Over Cable Chest Fly or DB Flat Bench Chest Fly")!;
    expect(n.key).toBe("bent over cable chest fly");
    expect(n.alternatives).toEqual(["dumbbell flat bench chest fly"]);
    expect(normalizeName("Run, Row or Bike")!.alternatives).toEqual([]);
  });
});

describe("classification", () => {
  it("only maps patterns it is sure about", () => {
    expect(guessPattern("back squat").pattern).toBe("squat");
    expect(guessPattern("romanian deadlift").pattern).toBe("hinge");
    expect(guessPattern("wide grip bench press").pattern).toBe("horizontal-press");
    expect(guessPattern("strict bar dip").pattern).toBe("horizontal-press");
    expect(guessPattern("incline dumbbell chest fly").pattern).toBe("horizontal-press");
    expect(guessPattern("dumbbell bent over reverse fly").pattern).toBe("isolation-shoulders");
    expect(guessPattern("hand release burpee").pattern).toBe("plyometric");
    expect(guessPattern("burpee pull up").pattern).toBe("vertical-pull");
    expect(guessPattern("bottom of bench dip stretch").pattern).toBe("mobility");
    expect(guessPattern("dip support").pattern).toBe("core");
    expect(guessPattern("something unheard of").pattern).toBeNull();
    expect(guessPattern("wall sit").pattern).toBe("squat");
    expect(guessPattern("russian kettlebell swing").pattern).toBe("hinge");
    expect(guessPattern("rear delt swing").pattern).toBe("isolation-shoulders");
    expect(guessPattern("side plank powell raise").pattern).toBe("core");
    expect(guessPattern("lateral banded walk").pattern).toBe("isolation-legs");
    expect(guessPattern("devils press").pattern).toBe("olympic");
    expect(guessPattern("wrist extension stretch").pattern).toBe("mobility");
    expect(guessPattern("dynamic adductor stretch").pattern).toBe("mobility");
    expect(guessPattern("assisted nordic hamstring curl").pattern).toBe("isolation-legs");
    expect(guessPattern("squat thoracic rotation").pattern).toBe("mobility");
    expect(guessPattern("bulgarian ring row").pattern).toBe("horizontal-pull");
    expect(guessPattern("pike strict handstand push up").pattern).toBe("vertical-press");
    expect(guessPattern("squat jump").pattern).toBe("plyometric");
    expect(guessPattern("something unheard of")).toMatchObject({ pattern: null, suggested: null });
  });

  const sec = (title: string, kind: Section["kind"]): Section =>
    ({ label: null, title, minutesMin: null, minutesMax: null, kind, exercise: null, scheme: [], sets: [], lines: [], notes: [], raw: "" });

  it("assigns roles by title and position", () => {
    expect(classifyRole(sec("Strength Intensity 2 (12 min)", "strength"), false)).toBe("strength-intensity-2");
    expect(classifyRole(sec("Strength Intensity (15 min)", "strength"), false)).toBe("strength-intensity-1");
    expect(classifyRole(sec("Upper Couplets (15 min)", "freeform"), false)).toBe("conditioning");
    expect(classifyRole(sec("Alphabet Soup (10 min)", "freeform"), true)).toBe("hot-start");
    expect(classifyRole(sec("Speed Strength - Clean", "freeform"), true)).toBe("speed-strength");
  });

  it("detects conditioning formats from explicit wording", () => {
    const f = (text: string) => classifyFormat({ ...sec("Conditioning", "freeform"), lines: [{ kind: "header", text, item: null }] }, "conditioning");
    expect(f("EMOM x 6 min")).toBe("emom");
    expect(f("AMRAP 12 min")).toBe("amrap");
    expect(f("For Time")).toBe("for-time");
    expect(f("20-15-10-5")).toBe("ladder");
    expect(f("Just some movements")).toBeNull();
  });
});

describe("guessEquipment", () => {
  it("assumes a barbell for barbell lifts unless another implement is named", () => {
    expect(guessEquipment("back squat")).toEqual(["barbell"]);
    expect(guessEquipment("dumbbell romanian deadlift")).toEqual(["dumbbell"]);
    expect(guessEquipment("kettlebell swing")).toEqual(["kettlebell"]);
    expect(guessEquipment("supinated strict pull up")).toContain("pull-up-bar");
    expect(guessEquipment("pancake stretch")).toEqual([]);
  });
});

describe("contentHash", () => {
  it("is stable and order sensitive", () => {
    expect(contentHash(["a", 1])).toBe(contentHash(["a", 1]));
    expect(contentHash(["a", 1])).not.toBe(contentHash([1, "a"]));
  });
});

// A week with one training day per track, identical content so sessions dedupe.
function week(start: string, weekNumber: number, focus = "Back Squat"): WeekFile {
  const set = { raw: "", kind: "working" as const, position: 1, reps: { type: "count" as const, min: 5, max: 5, perSide: false, unit: "reps", raw: "5" }, tempo: "20X1", rpeMin: 8, rpeMax: 8, effort: null, sameWeightAsSet1: false };
  const strength: Section = { label: "C", title: "Strength Intensity (12 min)", minutesMin: 12, minutesMax: 12, kind: "strength", exercise: "Back Squat", scheme: ["3 Working Sets; rest 2-3 min"], sets: [set], lines: [], notes: [], raw: "C) ..." };
  const day = (n: number): Day => ({ day: n, printedDate: null, date: start, headerLine: "", sessionType: "training", focusTopic: focus, focusBody: "prose", shortOnTime: [], sections: [strength], noteBody: null, raw: "" });
  return { sourceFile: `f-${start}`, headerWeekOf: null, weekStart: start, weekNumber, tracks: { "pump-lift-5x": [day(1)], "pump-lift-3x": [day(1)] } };
}

describe("buildDataset", () => {
  const weeks = [week("2026-01-05", 5), week("2026-01-12", 6), week("2026-01-19", 1), week("2026-02-09", 4, "Front Squat")];
  const cat = buildCatalog(weeks);
  const ds = buildDataset(weeks, cat);

  it("starts a block when the week number resets and records missing weeks", () => {
    expect(ds.blocks.map((b) => [b.weekCount, b.startInferred])).toEqual([[6, true], [4, false]]);
    expect(ds.blocks[0].startDate).toBe("2025-12-08");
    const missing = ds.weeks.filter((w) => w.status === "missing");
    expect(missing.map((w) => [w.weekNumber, w.startDate])).toEqual([[2, "2026-01-26"], [3, "2026-02-02"]]);
    expect(ds.report.warnings).toEqual([]);
  });

  it("stores identical sessions once and keeps schedule rows for every track-day", () => {
    expect(ds.schedule).toHaveLength(8);
    expect(ds.report.totalSessions).toBe(8);
    expect(ds.sessions).toHaveLength(1);
    expect(new Set(ds.schedule.map((s) => s.sessionId)).size).toBe(1);
  });

  it("builds items and sets from a strength section", () => {
    const item = ds.items[0];
    expect(item).toMatchObject({ exerciseId: "back-squat", tempo: "20X1", restMinSec: 120, restMaxSec: 180 });
    expect(ds.sets[0]).toMatchObject({ kind: "working", repsMin: 5, rpeMin: 8 });
  });

  it("changes the session hash when the training content changes", () => {
    const a = buildDataset([week("2026-01-05", 1)], cat);
    const b = buildDataset([{ ...week("2026-01-05", 1), tracks: { "pump-lift-5x": [{ ...week("x", 1).tracks["pump-lift-5x"][0], sections: [{ ...week("x", 1).tracks["pump-lift-5x"][0].sections[0], exercise: "Front Squat" }] }] } }], cat);
    expect(a.sessions[0].contentHash).not.toBe(b.sessions[0].contentHash);
  });
});
