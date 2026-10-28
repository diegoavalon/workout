import Dexie, { type Table } from "dexie";
import type { Exercise, MediaRecord, Program, ProgramRun, SessionProgress } from "../domain/types";
import { MemoryRepository } from "./repository";

type ItemRow = { key: string; items: Record<string, unknown>[] };
type MetaRow = { key: string; value: string };

class WorkoutDB extends Dexie {
  programs!: Table<Program, string>;
  workouts!: Table<ItemRow, string>;
  exercises!: Table<Exercise, string>;
  runs!: Table<ProgramRun, string>;
  progress!: Table<SessionProgress, [string, string]>;
  media!: Table<MediaRecord, string>;
  meta!: Table<MetaRow, string>;
  constructor() {
    super("workout-app");
    this.version(1).stores({
      programs: "id",
      workouts: "key",
      exercises: "id",
      runs: "id, programId",
      progress: "[runId+sessionKey], runId",
      media: "url, programId, status",
      meta: "key",
    });
  }
}

/** Dexie-backed repository. The in-memory maps are the working set; every mutation is written through. */
export class DexieRepository extends MemoryRepository {
  private db = new WorkoutDB();
  protected override async hydrate() {
    const [programs, workouts, exercises, runs, progress, media] = await Promise.all([
      this.db.programs.toArray(), this.db.workouts.toArray(), this.db.exercises.toArray(),
      this.db.runs.toArray(), this.db.progress.toArray(), this.db.media.toArray(),
    ]);
    for (const p of programs) this.programs.set(p.id, p);
    for (const w of workouts) this.items.set(w.key, w.items);
    for (const e of exercises) this.exercises.set(e.id, e);
    for (const r of runs) this.runs.set(r.id, r);
    for (const p of progress) this.progress.set(`${p.runId}::${p.sessionKey}`, p);
    for (const m of media) this.media.set(m.url, m);
    if (programs.length) this.seeded = true;
  }
  protected override async sync() {
    await this.db.transaction("rw", [this.db.programs, this.db.workouts, this.db.exercises, this.db.runs, this.db.progress, this.db.media], async () => {
      await Promise.all([this.db.programs.clear(), this.db.workouts.clear(), this.db.exercises.clear(), this.db.runs.clear(), this.db.progress.clear(), this.db.media.clear()]);
      await this.db.programs.bulkPut([...this.programs.values()]);
      await this.db.workouts.bulkPut([...this.items.entries()].map(([key, items]) => ({ key, items })));
      await this.db.exercises.bulkPut([...this.exercises.values()]);
      await this.db.runs.bulkPut([...this.runs.values()]);
      await this.db.progress.bulkPut([...this.progress.values()]);
      await this.db.media.bulkPut([...this.media.values()]);
    });
  }
}

export const repo: MemoryRepository = typeof indexedDB !== "undefined" ? new DexieRepository() : new MemoryRepository();
