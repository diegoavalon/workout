import { describe, expect, it } from "vitest";
import { buildDataset } from "./build.ts";
import { buildCatalog } from "./catalog.ts";
import type { Day, Section, WeekFile } from "./schema.ts";
import { buildViews, viewIndex, weekView } from "./views.ts";

const set = (kind: "warmup" | "working", reps: number, rpe: number | null) => ({
  raw: "", kind, position: 1, reps: { type: "count" as const, min: reps, max: reps, perSide: false, unit: "reps", raw: String(reps) },
  tempo: "20X1", rpeMin: rpe, rpeMax: rpe, effort: kind === "warmup" ? "easy" : null, sameWeightAsSet1: false,
});
const strength: Section = {
  label: "C", title: "Strength Intensity (12 min)", minutesMin: 12, minutesMax: 12, kind: "strength", exercise: "Back Squat",
  scheme: ["3 Working Sets; rest 2-3 min"], sets: [set("warmup", 10, null), set("working", 5, 8)], lines: [], notes: [], raw: "C) ...",
};
const day = (n: number, type: Day["sessionType"] = "training"): Day => ({
  day: n, printedDate: null, date: "2026-01-05", headerLine: "", sessionType: type, focusTopic: type === "training" ? "Squat day" : null,
  focusBody: null, shortOnTime: [], sections: type === "training" ? [strength] : [], noteBody: type === "note" ? "A note" : null, raw: "",
});
const week = (start: string, n: number): WeekFile => ({
  sourceFile: `f-${start}`, headerWeekOf: null, weekStart: start, weekNumber: n,
  tracks: { "pump-lift-5x": [day(1), day(7, "note")], "pump-condition-5x": [day(1), day(7, "note")] },
});

describe("buildViews", () => {
  const weeks = [week("2026-01-05", 1), week("2026-01-12", 2), week("2026-01-26", 4)];
  const cat = buildCatalog(weeks);
  const ds = buildDataset(weeks, cat);
  const { index, weeks: views } = buildViews(ds, cat.entries);

  it("makes one file per observed week and track, and lists missing weeks without files", () => {
    expect(views).toHaveLength(6);
    expect(index.weeks.map((w) => [w.weekStart, w.status, Object.keys(w.files).length])).toEqual([
      ["2026-01-05", "observed", 2], ["2026-01-12", "observed", 2], ["2026-01-19", "missing", 0], ["2026-01-26", "observed", 2],
    ]);
    expect(index.weeks[0].files["pump-lift-5x"]).toBe("pump-lift-5x/2026-01-05.json");
  });

  it("validates against the shared schemas", () => {
    viewIndex.parse(index);
    for (const v of views) weekView.parse(v);
  });

  it("inlines exercise details, sets, tempo and rest", () => {
    const d = views[0].days[0];
    const item = d.sections[0].items[0];
    expect(item.exercise).toMatchObject({ id: "back-squat", pattern: "squat" });
    expect(item.restSec).toEqual([120, 180]);
    expect(item.sets.map((s) => [s.kind, s.repsMin, s.rpeMin])).toEqual([["warmup", 10, null], ["working", 5, 8]]);
    expect(d.headline.mainLift?.name).toBe("Back Squat");
  });

  it("records which other tracks run the same session and carries the week note", () => {
    const lift = views.find((v) => v.track === "pump-lift-5x" && v.weekStart === "2026-01-05")!;
    expect(lift.days[0].sharedWith).toEqual(["pump-condition-5x"]);
    expect(lift.note?.body).toBe("A note");
    expect(lift.block).toMatchObject({ weekNumber: 1, weekCount: 4 });
  });
});
