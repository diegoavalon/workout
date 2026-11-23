import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../data/repository";
import { generateRecoveryWeeks } from "../persist/generate";
import { examplePowerThrashMaxes, powerThrashFixture, recoveryCorpusFixture } from "../test-fixtures/power-thrash";
import { buildGeneratedDayView } from "./generated";
import { registerGenerated, validateGeneratedFile } from "./generated-program";
import { buildPowerThrash, isPowerThrash, POWER_THRASH_RECOVERY_DAYS, roundLoad, savedPowerThrashRecovery, validateMaxes } from "./power-thrash";

const monday = "2026-11-23";
const maxId = powerThrashFixture.maxes[0].id;
const build = (maxes = examplePowerThrashMaxes, date = monday) => buildPowerThrash(powerThrashFixture, maxes, date);

describe("Power Thrash II", () => {
  it.each([[0.7 * 175, 125], [122.4, 120], [122.5, 125]])("rounds %s lb to %s lb", (load, expected) => {
    expect(roundLoad(load)).toBe(expected);
  });

  it("validates each max and accepts the supported limits", () => {
    for (const value of [undefined, 0, -1, NaN, Infinity, 2001]) {
      expect(validateMaxes(powerThrashFixture, { ...examplePowerThrashMaxes, [maxId]: value })).toHaveProperty(maxId);
    }
    for (const value of [1, 175.5, 2000]) {
      expect(validateMaxes(powerThrashFixture, { ...examplePowerThrashMaxes, [maxId]: value })).toEqual({});
    }
    expect(() => build({ ...examplePowerThrashMaxes, [maxId]: 0 })).toThrow("invalid maxes");
  });

  it.each(["2026-11-24", "2026-02-30", ""])("rejects an invalid start date (%s)", (date) => {
    expect(() => build(examplePowerThrashMaxes, date)).toThrow("Start date must be a Monday.");
  });

  it("registers a 12-week program and shows the calculated weights and notes", () => {
    const file = build();
    expect(isPowerThrash(file)).toBe(true);
    expect(validateGeneratedFile(file)).toEqual([]);
    expect(file.options.maxLabels?.[maxId]).toBe("Test lift 1");
    expect(file.weeks).toHaveLength(12);
    for (const week of file.weeks) {
      expect(week.days).toHaveLength(7);
      expect(week.days.filter((day) => day.type === "training").map((day) => day.day)).toEqual([1, 3, 5]);
    }
    const snap = registerGenerated(file);
    expect(snap).toMatchObject({ title: "Power Thrash II · 3 days/week", daysPerWeek: 3, weekCount: 12 });
    expect(snap.sessions.filter((session) => session.kind === "training")).toHaveLength(36);
    expect(snap.sessions.filter((session) => session.kind === "rest")).toHaveLength(48);

    const day = file.weeks[0].days[0];
    expect(day.sections[0].items[0].sets[0]).toMatchObject({ repsParts: [14, 10], weight: 125, weightUnit: "lb" });
    expect(day.sections[1].items[0].sets[0]).toMatchObject({ weight: null, weightUnit: null });
    const view = buildGeneratedDayView(day);
    expect(view.blocks[0]).toMatchObject({ notes: ["Moves: Test press, Test row."], exercises: [
      { setDetails: ["Set 1: 14 + 10 reps @ 125 lb", "Set 2: 10 + 8 reps @ 130 lb"] },
    ] });
  });

  it("rounds half sets up for each exercise and preserves the selected sets in order", () => {
    const template = structuredClone(powerThrashFixture);
    const exercise = template.weeks[0].days[0].exercises[0];
    exercise.sets.push(
      { reps: [8, 4], pct: 0.8 },
      { reps: [6, 3], pct: 0.85 },
      { reps: [4, 2], pct: 0.9 },
    );
    const full = buildPowerThrash(template, examplePowerThrashMaxes, monday, "full");
    expect(full).toEqual(buildPowerThrash(template, examplePowerThrashMaxes, monday));
    expect(full.options.setVolume).toBeUndefined();

    const half = buildPowerThrash(template, examplePowerThrashMaxes, monday, "half");
    expect(half.options.setVolume).toBe("half");
    expect(registerGenerated(half).sessions).toEqual(registerGenerated(full).sessions);
    const setsFor = (file: typeof full, day: number, section: number) => file.weeks[0].days[day].sections[section].items[0].sets;
    expect(setsFor(half, 0, 0)).toEqual(setsFor(full, 0, 0).slice(0, 3));
    expect(setsFor(half, 0, 1)).toEqual(setsFor(full, 0, 1));
    expect(setsFor(half, 2, 0)).toEqual(setsFor(full, 2, 0).slice(0, 1));
  });

  it("schedules generated recovery on off days and reuses it when editing", () => {
    const recovery = generateRecoveryWeeks(recoveryCorpusFixture, {
      track: "pump-lift-3x", seed: 20261123, weeks: 12, days: POWER_THRASH_RECOVERY_DAYS,
    });
    const file = buildPowerThrash(powerThrashFixture, examplePowerThrashMaxes, monday, "full", recovery);
    const snap = registerGenerated(file);
    expect(snap.daysPerWeek).toBe(3);
    expect(snap.sessions.filter((session) => session.kind === "recovery")).toHaveLength(36);
    expect(snap.sessions.filter((session) => session.kind === "rest")).toHaveLength(12);
    for (const [index, week] of file.weeks.entries()) {
      expect(week.days.map((day) => day.type)).toEqual(["training", "recovery", "training", "recovery", "training", "recovery", "rest"]);
      expect(new Set(recovery[index].map((day) => day.sections[0].title)).size).toBe(3);
      for (const { day, sections } of recovery[index]) expect(week.days[day - 1].sections).toEqual(sections);
    }
    expect(savedPowerThrashRecovery(build(), 12)).toBeUndefined();
    const reused = savedPowerThrashRecovery(file, 12);
    expect(reused).toEqual(recovery);
    const edited = buildPowerThrash(powerThrashFixture, examplePowerThrashMaxes, "2026-11-30", "half", reused);
    expect(edited.weeks[0].days[1].date).toBe("2026-12-01");
    expect(edited.weeks[0].days[1].sections).toEqual(file.weeks[0].days[1].sections);
  });

  it("reopens identical content and keeps existing progress with its original program after an edit", async () => {
    const repo = new MemoryRepository();
    const original = (await repo.importGenerated(build())).snapshot!;
    const run = await repo.startRun(original.id);
    await repo.patchProgress(run.id, original.id, "w1d1", { completedAt: monday });
    expect(await repo.importGenerated(build())).toMatchObject({ snapshot: { id: original.id }, duplicate: true });

    const updated = await repo.importGenerated(build({ ...examplePowerThrashMaxes, [maxId]: 185 }));
    expect(updated.duplicate).toBe(false);
    expect(updated.snapshot?.id).not.toBe(original.id);
    expect(await repo.listRuns()).toEqual([run]);
    expect(await repo.listProgress()).toMatchObject([{ runId: run.id, sessionKey: `${original.id}/w1d1` }]);
  });
});
