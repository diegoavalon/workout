import { describe, expect, it } from "vitest";
import { generatedProgramFixture } from "../test-fixtures/generated-program";
import { MemoryRepository } from "../data/repository";
import { buildGeneratedDayView } from "./generated";
import { caveatsOf, dayOf, positionOf, previewView, registerGenerated, uncheckedOf, validateGeneratedFile, type GeneratedFile, type StateMap } from "./generated-program";

const file = generatedProgramFixture;
const snap = registerGenerated(file, "2026-11-01T00:00:00Z");

describe("registerGenerated", () => {
  it("counts training sessions from day types, not day entries", () => {
    expect(snap.title).toBe("Pump Lift · 3 days/week");
    expect(snap.sessions).toHaveLength(42);
    expect(snap.sessions.filter((s) => s.kind === "training")).toHaveLength(18);
    expect(snap.sessions.filter((s) => s.kind === "recovery")).toHaveLength(18);
    expect(snap.sessions.filter((s) => s.kind === "rest")).toHaveLength(6);
  });
  it("numbers training sessions per week and gives date-independent ids", () => {
    const w2 = snap.sessions.filter((s) => s.week === 2 && s.kind === "training");
    expect(w2.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(w2[0].id).toMatch(/^w2d\d$/);
  });
  it("is deterministic for identical content", () => {
    expect(registerGenerated(structuredClone(file)).id).toBe(snap.id);
  });
});

describe("positionOf", () => {
  const training = snap.sessions.filter((s) => s.kind === "training");
  it("starts at week 1 session 1", () => {
    const p = positionOf(snap, new Map());
    expect(p).toMatchObject({ done: 0, total: 18, week: 1, complete: false });
    expect(p.next?.id).toBe(training[0].id);
  });
  it("ignores recovery and follows training order; a later start leaves earlier sessions next", () => {
    const states: StateMap = new Map([[training[3].id, { startedAt: "x" }], [snap.sessions.find((s) => s.kind === "recovery")!.id, { completedAt: "x" }]]);
    const p = positionOf(snap, states);
    expect(p.next?.id).toBe(training[0].id);
    expect(p.inProgress?.id).toBe(training[3].id);
    expect(p.done).toBe(0);
    expect(p.recoveryDone).toBe(1);
  });
  it("moves to week 2 once week 1 training is done, and completes at 18", () => {
    const states: StateMap = new Map(training.slice(0, 3).map((s) => [s.id, { completedAt: "x" }]));
    expect(positionOf(snap, states).week).toBe(2);
    const all: StateMap = new Map(training.map((s) => [s.id, { completedAt: "x" }]));
    expect(positionOf(snap, all)).toMatchObject({ complete: true, next: null, week: 6 });
  });
});

describe("session view helpers", () => {
  const ref = snap.sessions.find((s) => s.kind === "training")!;
  const view = buildGeneratedDayView(dayOf(snap, ref)!, new Map(), `${snap.id}-${ref.id}`);
  it("scopes check keys with the stable prefix", () => {
    const keys = JSON.stringify(view.blocks);
    expect(keys).toContain(`${snap.id}-${ref.id}-C`);
    expect(keys).not.toContain(ref.date);
  });
  it("lists unchecked sets, and clears them once checked", () => {
    const u = uncheckedOf(view, {});
    expect(u.total).toBeGreaterThan(0);
    expect(u.items).toHaveLength(u.total);
    const checks = Object.fromEntries([...new Set(u.items.map((i) => i.key))].map((k) => [k, u.items.filter((i) => i.key === k).map((i) => i.label.split(" ")[1])]));
    expect(uncheckedOf(view, checks).items).toHaveLength(0);
  });
  it("previews without trackers or timers", () => {
    const p = previewView(view);
    expect(uncheckedOf(p, {}).total).toBe(0);
    expect(JSON.stringify(p)).not.toMatch(/"timerSeconds":\d/);
  });
});

describe("validation and caveats", () => {
  it("rejects files with no training sessions", () => {
    expect(validateGeneratedFile({ options: { track: "x" }, weeks: [{ days: [{ type: "recovery", date: "2026-01-01", sections: [] }] }] })).toContain("The block has no training sessions.");
    expect(validateGeneratedFile(file)).toEqual([]);
  });
  it("reports missing checks as unavailable, never a pass", () => {
    const { checks: _c, ...old } = file;
    expect(caveatsOf(old as GeneratedFile, []).map((c) => c.kind)).toContain("unknown");
    expect(caveatsOf(file, []).map((c) => c.kind)).not.toContain("unknown");
  });
});

describe("repository", () => {
  it("deletes only the selected snapshot and all its runs and progress", async () => {
    const repo = new MemoryRepository();
    const a = (await repo.importGenerated(structuredClone(file))).snapshot!;
    const other = structuredClone(file);
    other.options.seed = 29;
    const b = (await repo.importGenerated(other)).snapshot!;
    const first = await repo.startRun(a.id);
    await repo.patchProgress(first.id, a.id, a.sessions[0].id, { checks: { sets: ["1"] }, note: "First run" });
    await repo.endRun(first.id);
    const second = await repo.startRun(a.id);
    await repo.patchProgress(second.id, a.id, a.sessions[0].id, { startedAt: "now" });
    const kept = await repo.startRun(b.id);
    const progress = await repo.patchProgress(kept.id, b.id, b.sessions[0].id, { checks: { sets: ["1", "2"] } });

    await repo.deleteGenerated(a.id);
    expect(await repo.getGenerated(a.id)).toBeUndefined();
    expect((await repo.listGenerated()).map((s) => s.id)).toEqual([b.id]);
    expect(await repo.listRuns()).toEqual([kept]);
    expect(await repo.listProgress()).toEqual([progress]);
    await repo.deleteGenerated(a.id); // Repeated deletion is harmless.
    const backup = JSON.parse(await repo.exportProgress());
    expect(backup.generated.map((s: { id: string }) => s.id)).toEqual([b.id]);
    expect(backup.runs).toEqual([kept]);
    expect(backup.progress).toEqual([progress]);
  });
  it("keeps the program and its history available when deletion cannot be persisted", async () => {
    class FailingRepository extends MemoryRepository {
      fail = false;
      protected override async sync() { if (this.fail) throw new Error("Storage unavailable"); }
    }
    const repo = new FailingRepository();
    const snapshot = (await repo.importGenerated(structuredClone(file))).snapshot!;
    const run = await repo.startRun(snapshot.id);
    const progress = await repo.patchProgress(run.id, snapshot.id, snapshot.sessions[0].id, { checks: { sets: ["1"] } });
    repo.fail = true;
    await expect(repo.deleteGenerated(snapshot.id)).rejects.toThrow("Storage unavailable");
    expect(await repo.getGenerated(snapshot.id)).toEqual(snapshot);
    expect(await repo.listRuns()).toEqual([run]);
    expect(await repo.listProgress()).toEqual([progress]);
    repo.fail = false;
    await repo.deleteGenerated(snapshot.id);
    expect(await repo.listGenerated()).toEqual([]);
  });
  it("imports once, resumes, undoes finish with checks kept, and restores from backup", async () => {
    const repo = new MemoryRepository();
    const first = await repo.importGenerated(structuredClone(file));
    expect(first.snapshot).toBeDefined();
    expect((await repo.importGenerated(structuredClone(file))).duplicate).toBe(true);
    const id = first.snapshot!.id;
    const run = await repo.startRun(id);
    const sid = first.snapshot!.sessions[0].id;
    await repo.patchProgress(run.id, id, sid, { startedAt: "a", checks: { k: ["1", "2"] } });
    await repo.patchProgress(run.id, id, sid, { completedAt: "b" });
    await repo.patchProgress(run.id, id, sid, { completedAt: undefined });
    const p = (await repo.listProgress())[0];
    expect(p.checks).toEqual({ k: ["1", "2"] });
    expect(p.completedAt).toBeUndefined();

    const backup = await repo.exportProgress();
    const other = new MemoryRepository();
    expect(await other.importProgress(JSON.parse(backup))).toMatchObject({ generated: 1, runs: 1, progress: 1 });
    expect((await other.getGenerated(id))?.fingerprint).toBe(first.snapshot!.fingerprint);
    expect((await other.listProgress())[0].checks).toEqual({ k: ["1", "2"] });
  });
  it("rejects an invalid file without saving", async () => {
    const repo = new MemoryRepository();
    const r = await repo.importGenerated({ weeks: [] });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(await repo.listGenerated()).toHaveLength(0);
  });
});
