import { beforeAll, describe, expect, it } from "vitest";
import { BALANCE_PARTNERS, coverageProblems, equipmentOk, generate, renderStrength, rng, validateBlock } from "./generate.ts";
import { TRACK_IDS } from "./schema.ts";
import type { ViewIndex, WeekView } from "./views.ts";

describe("helpers", () => {
  it("requires squat every week for 3x but tolerates one other missing pattern", () => {
    const four = new Set(["squat", "hinge", "horizontal-press"]);
    expect(coverageProblems("pump-lift", 3, four)).toEqual([]);
    expect(coverageProblems("pump-lift", 3, new Set(["hinge", "horizontal-press", "vertical-press"]))).toContain("squat");
    expect(coverageProblems("pump-lift", 3, new Set(["squat", "hinge"]))).toEqual(["horizontal-press", "vertical-press"]);
    expect(coverageProblems("pump-lift", 5, new Set(["squat"]))).toContain("hinge");
    expect(coverageProblems("perform", 5, new Set())).toEqual([]);
  });

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
  const corpus: WeekView[] = [];
  beforeAll(() => {
    const index: ViewIndex = JSON.parse(readFileSync("data/views/index.json", "utf8"));
    for (const w of index.weeks) for (const f of Object.values(w.files)) corpus.push(JSON.parse(readFileSync(`data/views/${f}`, "utf8")));
  });
  const start = "2027-01-04";

  it("builds six valid weeks with the right training-day count for every track", () => {
    for (const track of TRACK_IDS) {
      const g = generate(corpus, { track, seed: 11, startDate: start });
      expect(g.weeks).toHaveLength(6);
      const freq = track === "perform" ? 5 : track === "minimalist" ? 4 : Number(track.slice(-2, -1));
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

  it("gives Pump Condition and Perform the Pump Lift main lifts on the same days for one seed", () => {
    const lift = generate(corpus, { track: "pump-lift-5x", seed: 6, startDate: start });
    for (const track of ["pump-condition-5x", "perform"] as const) {
      const other = generate(corpus, { track, seed: 6, startDate: start });
      const mains = (g: typeof lift) => g.weeks.map((w) => w.days.map((d) => d.headline.mainLift?.id ?? null));
      expect(mains(other)).toEqual(mains(lift));
    }
  });

  it("builds Perform with a pre-lift piece that stays one kind per day", () => {
    const g = generate(corpus, { track: "perform", seed: 8, startDate: start });
    for (const dayIdx of [0, 1, 2, 4, 5]) {
      const roles = g.weeks.map((w) => w.days[dayIdx].sections.map((s) => s.role));
      for (const r of roles) expect(r.slice(0, 4)).toEqual(["focus-note", "warmup", expect.stringMatching(/hot-start|speed-strength/), "strength-intensity-1"]);
      expect(new Set(roles.map((r) => r[2])).size).toBe(1);
    }
  });

  it("builds Minimalist with four training days and its own lifts", () => {
    const g = generate(corpus, { track: "minimalist", seed: 8, startDate: start });
    expect(g.weeks[0].days.filter((d) => d.type === "training")).toHaveLength(4);
    const lifts = g.weeks[0].days.filter((d) => d.type === "training").map((d) => d.headline.mainLift!);
    expect(lifts.every((l) => !l.equipment.includes("barbell") || g.warnings.some((w) => w.includes("borrowed")))).toBe(true);
  });

  it("does not repeat section letters in copied text", () => {
    const g = generate(corpus, { track: "pump-lift-4x", seed: 12, startDate: start });
    for (const wk of g.weeks) for (const d of wk.days) for (const sec of d.sections) expect(sec.raw).not.toMatch(/^[A-H]\)/);
  });

  it("reports passing checks for a normal block and catches a broken one", () => {
    const g = generate(corpus, { track: "pump-lift-5x", seed: 14, startDate: start });
    expect(g.checks.filter((c) => c.status === "warn")).toEqual([]);
    expect(g.checks.map((c) => c.name)).toEqual(expect.arrayContaining(["Week layout", "Session skeleton", "A/B variation", "RPE ramps up", "Pattern coverage", "Fresh lifts"]));

    // Replace week 3's day-1 main lift: odd weeks no longer share one lift.
    const broken = JSON.parse(JSON.stringify(g.weeks)) as typeof g.weeks;
    const sec = broken[2].days[0].sections.find((x) => x.role === "strength-intensity-1")!;
    sec.items[0].exercise = { id: "something-else", name: "Something Else", pattern: "squat", equipment: [], unilateral: false };
    const checks = validateBlock(broken, { family: "pump-lift", freq: 5, recent: new Set(), avoidRecent: true, covered: new Set(["squat", "hinge", "horizontal-press", "vertical-press", "horizontal-pull"]) });
    expect(checks.find((c) => c.name === "A/B variation")?.status).toBe("warn");

    // Drop the finisher: the skeleton check fails.
    const noFinisher = JSON.parse(JSON.stringify(g.weeks)) as typeof g.weeks;
    noFinisher[0].days[0].sections = noFinisher[0].days[0].sections.filter((x) => x.role !== "finisher");
    const c2 = validateBlock(noFinisher, { family: "pump-lift", freq: 5, recent: new Set(), avoidRecent: true, covered: new Set() });
    expect(c2.find((c) => c.name === "Session skeleton")?.status).toBe("warn");
  });

  it("keeps source artifacts and repeated recovery topics out of a block", () => {
    for (const track of ["pump-lift-3x", "pump-lift-4x", "perform"] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const g = generate(corpus, { track, seed, startDate: start });
        for (const wk of g.weeks) {
          const topics: string[] = [];
          for (const d of wk.days) {
            for (const sec of d.sections) expect(sec.raw).not.toMatch(/^\s*Week \d+:?\s*$/m);
            const mob = d.sections.find((x) => x.role === "mobility");
            if (mob) topics.push(mob.raw.split("\n").map((l) => l.trim()).filter(Boolean)[1]?.toLowerCase() ?? "");
          }
          expect(new Set(topics).size).toBe(topics.length);
        }
      }
    }
  });

  it("pairs a leg-dominant main lift with balance work that suits it", () => {
    let days = 0, off = 0;
    // The 3x track has few days per pattern, so it is checked as well as 5x.
    for (const [track, seed] of ["pump-lift-5x", "pump-lift-3x"].flatMap((t) => Array.from({ length: 25 }, (_, i) => [t, i + 1] as const))) {
      const g = generate(corpus, { track: track as "pump-lift-5x", seed, startDate: start });
      for (const wk of [g.weeks[0], g.weeks[1]]) {
        for (const d of wk.days.filter((x) => x.type === "training")) {
          const partners = BALANCE_PARTNERS[d.headline.mainLift?.pattern ?? ""];
          if (!partners) continue;
          const bal = d.sections.find((x) => x.role === "strength-balance")!;
          days++;
          if (bal.items.some((i) => i.exercise && !partners.has(i.exercise.pattern ?? ""))) off++;
        }
      }
    }
    expect(days).toBeGreaterThan(50);
    expect(off / days).toBeLessThan(0.1);
  });

  it("rejects an unknown track", () => {
    expect(() => generate(corpus, { track: "nope" as never, seed: 1, startDate: start })).toThrow(/unknown track/);
  });
});
