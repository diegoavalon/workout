import { describe, expect, it } from "vitest";
import { equipmentOk, generate, renderStrength, rng } from "./generate.ts";
import { TRACK_IDS } from "./schema.ts";
import type { ViewIndex, WeekView } from "./views.ts";

describe("helpers", () => {
  it("rng is deterministic per seed and differs between seeds", () => {
    const a = rng(7), b = rng(7), c = rng(8);
    const xs = [a(), a(), a()];
    expect(xs).toEqual([b(), b(), b()]);
    expect(xs).not.toEqual([c(), c(), c()]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("filters by equipment, always allowing bodyweight", () => {
    const own = new Set(["dumbbell", "pull-up-bar"]);
    expect(equipmentOk(["dumbbell"], own)).toBe(true);
    expect(equipmentOk(["barbell"], own)).toBe(false);
    expect(equipmentOk(["bodyweight", "pull-up-bar"], own)).toBe(true);
    expect(equipmentOk(["dumbbell-or-kettlebell"], own)).toBe(true);
    expect(equipmentOk(["barbell"], undefined)).toBe(true);
  });

  it("renders a strength section as program-style text", () => {
    const item = {
      exercise: { id: "back-squat", name: "Back Squat", pattern: "squat", equipment: ["barbell"], unilateral: false },
      nameRaw: null, alternatives: [], tempo: "20X1", restSec: [120, 180] as [number, number], perSide: false, load: null,
      sets: [
        { kind: "working" as const, repsType: "count", repsMin: 8, repsMax: 8, unit: "reps", valueFemale: null, rpeMin: 7, rpeMax: 7, effort: null },
        { kind: "working" as const, repsType: "max", repsMin: null, repsMax: null, unit: "reps", valueFemale: null, rpeMin: 10, rpeMax: 10, effort: null },
      ],
    };
    const text = renderStrength("Strength Intensity 1 (15 min)", [item], [], [15, 15]);
    expect(text).toContain("Strength Intensity 1 (15 min):");
    expect(text).toContain("Back Squat");
    expect(text).toContain("Working Set - 8 reps @20X1 Tempo - RPE 7");
    expect(text).toContain("Max reps");
  });
});

// These run against the real view files when they have been generated (npm run persist:views).
// node:fs is loaded dynamically because the app's tsconfig does not include Node types.
// biome-ignore lint/suspicious/noExplicitAny: Node types are not available here
const fs: any = await import(/* @vite-ignore */ ["node", "fs"].join(":"));
const existsSync = (p: string): boolean => fs.existsSync(p);
const readFileSync = (p: string, enc: string): string => fs.readFileSync(p, enc);
const haveViews = existsSync("data/views/index.json");
describe.skipIf(!haveViews)("generate (real corpus)", () => {
  const index: ViewIndex = JSON.parse(readFileSync("data/views/index.json", "utf8"));
  const corpus: WeekView[] = [];
  for (const w of index.weeks) for (const f of Object.values(w.files)) corpus.push(JSON.parse(readFileSync(`data/views/${f}`, "utf8")));
  const start = "2027-01-04";

  it("builds six valid weeks with the right training-day count for every Pump Lift and Pump Condition track", () => {
    for (const track of TRACK_IDS.filter((t) => t.startsWith("pump"))) {
      const g = generate(corpus, { track, seed: 11, startDate: start });
      expect(g.weeks).toHaveLength(6);
      const freq = Number(track.slice(-2, -1));
      for (const wk of g.weeks) {
        expect(wk.days).toHaveLength(7);
        expect(wk.days.filter((d) => d.type === "training")).toHaveLength(freq);
        expect(wk.days[6].type).toBe("note");
      }
      expect(g.weeks.map((w) => w.weekStart)).toEqual(["2027-01-04", "2027-01-11", "2027-01-18", "2027-01-25", "2027-02-01", "2027-02-08"]);
    }
  });

  it("is reproducible for a seed and varies across seeds", () => {
    const a = generate(corpus, { track: "pump-lift-5x", seed: 3, startDate: start });
    const b = generate(corpus, { track: "pump-lift-5x", seed: 3, startDate: start });
    expect(JSON.stringify(a.weeks)).toBe(JSON.stringify(b.weeks));
    const lifts = new Set(Array.from({ length: 8 }, (_, s) => JSON.stringify(generate(corpus, { track: "pump-lift-5x", seed: s + 20, startDate: start }).plan.map((p) => p.main.a))));
    expect(lifts.size).toBeGreaterThan(3);
  });

  it("alternates the main lift on odd and even weeks and keeps the skeleton", () => {
    const g = generate(corpus, { track: "pump-lift-5x", seed: 4, startDate: start });
    for (const dayIdx of [0, 1, 2, 4, 5]) {
      const lifts = g.weeks.map((w) => w.days[dayIdx].headline.mainLift?.id);
      expect(lifts[0]).toBe(lifts[2]);
      expect(lifts[0]).toBe(lifts[4]);
      expect(lifts[1]).toBe(lifts[3]);
      expect(g.weeks[0].days[dayIdx].sections.map((s) => s.role)).toEqual([
        "focus-note", "warmup", "strength-intensity-1", "strength-intensity-2", "strength-balance", "finisher", "cooldown",
      ]);
    }
  });

  it("uses working sets in every strength slot and ramps RPE", () => {
    const g = generate(corpus, { track: "pump-lift-5x", seed: 9, startDate: start });
    for (const wk of g.weeks) for (const d of wk.days) for (const s of d.sections.filter((x) => x.role.startsWith("strength-intensity"))) {
      const working = s.items[0].sets.filter((x) => x.kind === "working");
      expect(working.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("avoids last block's main lifts and honors equipment when it can", () => {
    const g = generate(corpus, { track: "pump-lift-5x", seed: 5, startDate: start, equipment: ["barbell", "dumbbell", "kettlebell", "bench", "pull-up-bar", "box", "band", "rings", "plate", "landmine", "cable", "machine"] });
    expect(g.warnings.filter((w) => w.includes("nothing matches your equipment"))).toEqual([]);
  });

  it("refuses tracks it cannot generate yet", () => {
    expect(() => generate(corpus, { track: "perform", seed: 1, startDate: start })).toThrow(/pump-lift and pump-condition/);
  });
});
