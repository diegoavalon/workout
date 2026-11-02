import { describe, expect, it } from "vitest";
import { MAX_SEED, buildOptions, daysFor, defaultInput, isMonday, nextMonday, parseSeed, randomSeed, trackFor, validateInput } from "./options";

describe("track and frequency", () => {
  it("maps Pump styles to their frequency and fixes Perform and Minimalist", () => {
    expect(trackFor("pump-lift", 3)).toBe("pump-lift-3x");
    expect(trackFor("pump-lift", 5)).toBe("pump-lift-5x");
    expect(trackFor("pump-condition", 4)).toBe("pump-condition-4x");
    expect(trackFor("perform", 5)).toBe("perform");
    expect(trackFor("minimalist", 4)).toBe("minimalist");
    expect(daysFor("perform")).toEqual([5]);
    expect(daysFor("minimalist")).toEqual([4]);
  });
  it("rejects frequencies the style does not offer", () => {
    expect(() => trackFor("perform", 3)).toThrow();
    expect(() => trackFor("minimalist", 5)).toThrow();
    expect(() => trackFor("pump-lift", 2)).toThrow();
  });
});

describe("start date", () => {
  it("suggests the next Monday, including today when it is Monday", () => {
    expect(nextMonday(new Date(2026, 10, 2))).toBe("2026-11-02"); // Monday
    expect(nextMonday(new Date(2026, 10, 3))).toBe("2026-11-09"); // Tuesday
    expect(nextMonday(new Date(2026, 10, 8))).toBe("2026-11-09"); // Sunday
    expect(nextMonday(new Date(2026, 11, 31))).toBe("2027-01-04"); // across a year
    expect(isMonday(nextMonday(new Date(2026, 5, 17, 23, 59)))).toBe(true);
  });
  it("requires a real Monday", () => {
    expect(isMonday("2026-11-02")).toBe(true);
    expect(isMonday("2026-11-03")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
    expect(isMonday("")).toBe(false);
    expect(isMonday("11/02/2026")).toBe(false);
  });
});

describe("seed", () => {
  it("accepts blank and whole numbers from 0 to 4294967295", () => {
    expect(parseSeed("")).toEqual({ seed: null });
    expect(parseSeed(" 0 ")).toEqual({ seed: 0 });
    expect(parseSeed(String(MAX_SEED))).toEqual({ seed: MAX_SEED });
  });
  it("rejects out-of-range, fractional, negative and non-numeric seeds", () => {
    for (const bad of [String(MAX_SEED + 1), "1.5", "-1", "abc", "1e3", "0x10"]) expect(parseSeed(bad).error).toBeTruthy();
  });
  it("picks omitted seeds from 1 to 50", () => {
    for (let i = 0; i < 500; i++) { const s = randomSeed(); expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(50); expect(Number.isInteger(s)).toBe(true); }
  });
});

describe("buildOptions", () => {
  const base = { ...defaultInput(new Date(2026, 10, 2)), seed: "" };
  it("defaults to Pump Lift, three days, no equipment restriction", () => {
    expect(buildOptions(base, 7)).toEqual({ track: "pump-lift-3x", seed: 7, startDate: "2026-11-02", equipment: undefined, avoidRecent: true });
  });
  it("passes selected equipment and the latest-block switch", () => {
    const o = buildOptions({ ...base, restrictEquipment: true, equipment: ["dumbbell", "dumbbell", "band"], allowRecent: true }, 1);
    expect(o.equipment).toEqual(["dumbbell", "band"]);
    expect(o.avoidRecent).toBe(false);
  });
  it("ignores ticked equipment under “No restriction”, and means bodyweight-only for an empty restricted list", () => {
    expect(buildOptions({ ...base, equipment: ["band"] }, 1).equipment).toBeUndefined();
    expect(buildOptions({ ...base, restrictEquipment: true, equipment: [] }, 1).equipment).toEqual([]);
  });
  it("refuses invalid input", () => {
    expect(() => buildOptions({ ...base, startDate: "2026-11-03" }, 1)).toThrow(/Monday/);
    expect(validateInput({ ...base, seed: "-4" })).toHaveLength(1);
    expect(validateInput({ ...base, style: "perform", days: 3 })).toHaveLength(1);
  });
});
