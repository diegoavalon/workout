import { describe, expect, it } from "vitest";
import { MemoryRepository } from "./repository";

const manifest = (version = "1.0.0", sessionIds = ["s1"]) => ({
  schemaVersion: 1, contentVersion: version, id: "p1", title: "P", daysPerWeek: 3,
  weeks: [{ id: "w01", order: 1, sessions: sessionIds.map((id, i) => ({ id, order: i + 1, contentPath: `${id}.json` })) }],
});
const files = (ids = ["s1"]) => Object.fromEntries(ids.map((id) => [`${id}.json`, [{ order: 1, type: "exerciseAssignment", exerciseId: "ex-missing", child: null, sets: 3, reps: "8" }]]));

describe("MemoryRepository", () => {
  it("seeds a catalog spanning 3/4/5 and Other schedules", async () => {
    const repo = new MemoryRepository();
    const programs = await repo.listPrograms();
    expect(new Set(programs.map((p) => p.daysPerWeek))).toEqual(new Set([3, 4, 5, 2, 3]));
    expect(await repo.getSessionItems("athletic-performance", "w01-s1")).toBeTruthy();
  });
  it("imports idempotently, reports missing exercises, and preserves progress across updates", async () => {
    const repo = new MemoryRepository();
    const r1 = await repo.importBundle({ manifest: manifest(), files: files() });
    expect(r1.missingExercises).toEqual(["ex-missing"]);
    const run = await repo.startRun("p1");
    await repo.toggleComplete(run.id, "p1", "s1");
    const r2 = await repo.importBundle({ manifest: manifest(), files: files() });
    expect(r2.duplicate).toBe(true);
    expect((await repo.listPrograms()).filter((p) => p.id === "p1")).toHaveLength(1);
    // Content update that removes s1: migration report names it; progress is not deleted.
    const r3 = await repo.importBundle({ manifest: manifest("2.0.0", ["s2"]), files: files(["s2"]) });
    expect(r3.removedSessionIds).toEqual(["s1"]);
    expect((await repo.listProgress()).some((p) => p.completedAt)).toBe(true);
  });
  it("rejects bundles with missing files without storing partial content", async () => {
    const repo = new MemoryRepository();
    const r = await repo.importBundle({ manifest: manifest(), files: {} });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(await repo.getProgram("p1")).toBeUndefined();
  });
  it("uncompleting clears completedAt; two runs keep separate progress; export/restore round-trips", async () => {
    const repo = new MemoryRepository();
    await repo.importBundle({ manifest: manifest("1.0.0", ["s1", "s2"]), files: files(["s1", "s2"]) });
    const a = await repo.startRun("p1");
    await repo.toggleComplete(a.id, "p1", "s1");
    await repo.toggleComplete(a.id, "p1", "s1");
    expect((await repo.listProgress()).find((p) => p.runId === a.id)?.completedAt).toBeUndefined();
    await repo.endRun(a.id);
    const b = await repo.startRun("p1");
    expect(b.id).not.toBe(a.id);
    await repo.toggleComplete(b.id, "p1", "s2");
    const done = (await repo.listProgress()).filter((p) => p.completedAt);
    expect(done).toHaveLength(1); expect(done[0].runId).toBe(b.id);
    const restored = new MemoryRepository();
    await restored.importProgress(JSON.parse(await repo.exportProgress()));
    expect(await restored.listProgress()).toHaveLength(2);
    await expect(restored.importProgress({ kind: "nope" })).rejects.toThrow();
  });
  it("deleting media keeps workouts and progress", async () => {
    const repo = new MemoryRepository();
    const run = await repo.startRun("foundations");
    await repo.toggleComplete(run.id, "foundations", "w01-s1");
    await repo.setMedia({ url: "https://x/img.jpg", programId: "foundations", kind: "image", status: "downloaded", updatedAt: new Date().toISOString() });
    await repo.deleteMedia("foundations");
    expect(await repo.listMedia("foundations")).toHaveLength(0);
    expect((await repo.listProgress()).some((p) => p.completedAt)).toBe(true);
    expect(await repo.getProgram("foundations")).toBeTruthy();
  });
});
