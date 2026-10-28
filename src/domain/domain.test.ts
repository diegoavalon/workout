import { describe, expect, it } from "vitest";
import { parseDelta } from "./delta";
import { validateManifest } from "./manifest";
import { frequencyGroups, nextIncomplete } from "./selectors";
import { flatSessions, sessionKey, type Program } from "./types";
import { prescription, resolveExercise, sortItems } from "./workout";

const D = (ops: unknown[]) => JSON.stringify({ ops });

describe("parseDelta", () => {
  it("applies block attributes from the newline insert to the whole line", () => {
    const lines = parseDelta(D([{ insert: "Coaching notes" }, { insert: "\n", attributes: { header: 2 } }, { insert: "Move well.\n" }]));
    expect(lines[0].header).toBe(2);
    expect(lines[0].segs.map((s) => s.text).join("")).toBe("Coaching notes");
    expect(lines[1].header).toBeUndefined();
  });
  it("numbers ordered lists and renders embeds as placeholders", () => {
    const lines = parseDelta(D([{ insert: "One" }, { insert: "\n", attributes: { list: "ordered" } }, { insert: { image: "x.png" } }, { insert: "Two" }, { insert: "\n", attributes: { list: "ordered" } }]));
    expect(lines[0].number).toBe(1);
    expect(lines[1].segs[0].embed).toBe("image");
    expect(lines[1].number).toBe(2);
  });
  it("degrades malformed input to plain text without throwing", () => {
    expect(parseDelta("{not json")[0].segs[0].text).toBe("{not json");
    expect(parseDelta(42)[0].segs[0].text).toContain("could not be displayed");
    const rawHtml = "<scr" + "ipt>alert(1)</scr" + "ipt>";
    expect(parseDelta(D([{ insert: rawHtml + "\n" }]))[0].segs[0].text).toBe(rawHtml);
  });
});

const manifest = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, contentVersion: "1.0.0", id: "p1", title: "P", daysPerWeek: 3,
  weeks: [{ id: "w01", order: 1, sessions: [{ id: "s1", order: 1, contentPath: "week-01/session-01.json" }] }], ...over,
});

describe("validateManifest", () => {
  it("derives totalWeeks and warns on session-count mismatch without inventing sessions", () => {
    const r = validateManifest(manifest());
    expect(r.manifest?.totalWeeks).toBe(1);
    expect(r.warnings[0]).toContain("kept as authored");
  });
  it("rejects duplicate session IDs, traversal paths, and out-of-range daysPerWeek", () => {
    const dup = validateManifest(manifest({ weeks: [{ id: "w01", order: 1, sessions: [{ id: "s1", order: 1, contentPath: "a.json" }, { id: "s1", order: 2, contentPath: "b.json" }] }] }));
    expect(dup.issues.map((i) => i.message).join(" ")).toContain("duplicate");
    expect(validateManifest(manifest({ weeks: [{ id: "w01", order: 1, sessions: [{ id: "s1", order: 1, contentPath: "../evil.json" }] }] })).issues.length).toBeGreaterThan(0);
    expect(validateManifest(manifest({ daysPerWeek: 8 })).issues.length).toBeGreaterThan(0);
    expect(validateManifest(manifest({ daysPerWeek: 0 })).issues.length).toBeGreaterThan(0);
  });
});

describe("workout adapter", () => {
  it("sorts by order stably", () => {
    const items = [{ order: 2, id: "b" }, { order: 1, id: "a" }, { order: 2, id: "c" }, { id: "d" }];
    expect(sortItems(items).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("resolves embedded snapshot before library, library before placeholder", () => {
    const index = new Map([["ex1", { id: "ex1", title: "From library" }]]);
    expect(resolveExercise({ child: { id: "ex1", title: "Embedded" } }, index)?.title).toBe("Embedded");
    expect(resolveExercise({ exerciseId: "ex1", child: null }, index)?.title).toBe("From library");
    expect(resolveExercise({ exerciseId: "nope", child: null }, index)).toBeNull();
  });
  it("formats prescription exactly and invents nothing", () => {
    expect(prescription({ sets: 4, reps: "5", rest: 180 })).toEqual([["Sets", "4"], ["Reps", "5"], ["Rest", "3:00"]]);
    expect(prescription({ sets: 3, reps: ["8", "8", "6"], times: 20 })).toEqual([["Sets", "3"], ["Reps", "8, 8, 6"], ["Time", "20 s"]]);
    expect(prescription({})).toEqual([]);
  });
});

describe("selectors", () => {
  const prog = (daysPerWeek: number, id: string): Program => ({ schemaVersion: 1, contentVersion: "1", id, title: id, daysPerWeek, totalWeeks: 1, weeks: [{ id: "w01", order: 1, sessions: [{ id: "s1", order: 1, contentPath: "a.json" }, { id: "s2", order: 2, contentPath: "b.json" }] }] });
  it("groups 3/4/5 and puts everything else in Other schedules", () => {
    const g = frequencyGroups([prog(3, "a"), prog(2, "b"), prog(7, "c")]);
    expect(g.find((x) => x.key === "other")?.programs.map((p) => p.id)).toEqual(["b", "c"]);
  });
  it("next incomplete follows canonical order regardless of weekday", () => {
    const p = prog(3, "a");
    expect(nextIncomplete(p, new Set())?.id).toBe("s1");
    expect(nextIncomplete(p, new Set([sessionKey("a", "s1")]))?.id).toBe("s2");
    expect(flatSessions(p).map((s) => s.weekId)).toEqual(["w01", "w01"]);
  });
});
