import { progressExportSchema, validateManifest } from "../domain/manifest";
import { flatSessions, sessionKey, type Exercise, type ImportReport, type MediaRecord, type Program, type ProgramRun, type SessionProgress } from "../domain/types";
import { exerciseIdOf, allAssignments } from "../domain/workout";
import { buildSeed } from "./fixtures";

export type BundleInput = { manifest: unknown; files: Record<string, unknown>; library?: unknown[] };
export interface Repository {
  ensureSeeded(): Promise<void>;
  listPrograms(): Promise<Program[]>;
  getProgram(id: string): Promise<Program | undefined>;
  getSessionItems(programId: string, sessionId: string): Promise<Record<string, unknown>[] | undefined>;
  getAllSessionItems(programId: string): Promise<Map<string, Record<string, unknown>[]>>;
  exerciseIndex(): Promise<Map<string, Exercise>>;
  listExercises(): Promise<Exercise[]>;
  importBundle(input: BundleInput): Promise<ImportReport>;
  listRuns(): Promise<ProgramRun[]>;
  activeRun(programId: string): Promise<ProgramRun | undefined>;
  startRun(programId: string): Promise<ProgramRun>;
  endRun(runId: string): Promise<void>;
  listProgress(): Promise<SessionProgress[]>;
  setProgress(p: SessionProgress): Promise<void>;
  toggleComplete(runId: string, programId: string, sessionId: string): Promise<SessionProgress>;
  markOpened(runId: string, programId: string, sessionId: string): Promise<void>;
  exportProgress(): Promise<string>;
  importProgress(json: unknown): Promise<{ runs: number; progress: number }>;
  listMedia(programId?: string): Promise<MediaRecord[]>;
  setMedia(r: MediaRecord): Promise<void>;
  deleteMedia(programId: string): Promise<void>;
  resetProgress(): Promise<void>;
  resetContent(): Promise<void>;
}

const uid = () => `run-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export class MemoryRepository implements Repository {
  programs = new Map<string, Program>();
  items = new Map<string, Record<string, unknown>[]>();
  exercises = new Map<string, Exercise>();
  runs = new Map<string, ProgramRun>();
  progress = new Map<string, SessionProgress>();
  media = new Map<string, MediaRecord>();
  seeded = false;
  protected syncing: Promise<void> | null = null;
  protected async sync(): Promise<void> { /* overridden by Dexie */ }

  async ensureSeeded() {
    if (this.seeded) return;
    if (!this.syncing) this.syncing = (async () => { await this.hydrate(); if (!this.seeded && this.programs.size === 0) { const s = buildSeed(); for (const p of s.programs) this.programs.set(p.id, structuredClone(p)); for (const [k, v] of s.items) this.items.set(k, structuredClone(v)); for (const e of s.exercises) this.exercises.set(e.id, e); } this.seeded = true; await this.sync(); })();
    await this.syncing;
  }
  protected async hydrate() { /* Dexie overrides */ }
  async listPrograms() { await this.ensureSeeded(); return [...this.programs.values()].sort((a, b) => a.title.localeCompare(b.title)); }
  async getProgram(id: string) { await this.ensureSeeded(); return this.programs.get(id); }
  async getSessionItems(pid: string, sid: string) { await this.ensureSeeded(); return this.items.get(sessionKey(pid, sid)); }
  async getAllSessionItems(pid: string) {
    await this.ensureSeeded();
    const out = new Map<string, Record<string, unknown>[]>();
    for (const [k, v] of this.items) if (k.startsWith(`${pid}/`)) out.set(k, v);
    return out;
  }
  async exerciseIndex() { await this.ensureSeeded(); return new Map(this.exercises); }
  async listExercises() { await this.ensureSeeded(); return [...this.exercises.values()]; }

  async importBundle(input: BundleInput): Promise<ImportReport> {
    await this.ensureSeeded();
    const { manifest, issues, warnings } = validateManifest(input.manifest);
    if (!manifest) return { programId: "", contentVersion: "", sessionsImported: 0, missingExercises: [], warnings, errors: issues.map((i) => `${i.path}: ${i.message}`), removedSessionIds: [], duplicate: false };
    const errors: string[] = [];
    const staged = new Map<string, Record<string, unknown>[]>();
    const old = this.programs.get(manifest.id);
    for (const s of flatSessions(manifest)) {
      const file = input.files[s.contentPath];
      if (!Array.isArray(file)) { errors.push(`Missing or invalid session file "${s.contentPath}" for session ${s.id}`); continue; }
      staged.set(sessionKey(manifest.id, s.id), structuredClone(file) as Record<string, unknown>[]);
    }
    if (errors.length) return { programId: manifest.id, contentVersion: manifest.contentVersion, sessionsImported: 0, missingExercises: [], warnings, errors, removedSessionIds: [], duplicate: false };
    const library = new Map(this.exercises);
    const libReport: string[] = [];
    if (Array.isArray(input.library)) for (const raw of input.library) {
      const r = raw as Exercise;
      if (r && typeof r.id === "string" && typeof (r.title ?? (r as { name?: string }).name) === "string")
        library.set(r.id, { ...r, title: r.title ?? (r as unknown as { name: string }).name });
      else libReport.push("Skipped an exercise-library entry without an id/title.");
    }
    const missing = new Set<string>();
    for (const items of staged.values()) for (const a of allAssignments(items as never)) {
      const eid = exerciseIdOf(a as never);
      const embedded = (a as { child?: unknown }).child;
      if (eid && !embedded && !library.has(eid)) missing.add(eid);
    }
    const newIds = new Set(flatSessions(manifest).map((s) => s.id));
    const removedSessionIds = old ? flatSessions(old).filter((s) => !newIds.has(s.id)).map((s) => s.id) : [];
    const duplicate = !!old && old.contentVersion === manifest.contentVersion && removedSessionIds.length === 0;
    // Idempotent upsert: replaces content for this program only; progress (separate store) is untouched.
    for (const k of [...this.items.keys()]) if (k.startsWith(`${manifest.id}/`)) this.items.delete(k);
    for (const [k, v] of staged) this.items.set(k, v);
    this.programs.set(manifest.id, manifest);
    for (const [k, v] of library) this.exercises.set(k, v);
    await this.sync();
    return { programId: manifest.id, contentVersion: manifest.contentVersion, sessionsImported: staged.size, missingExercises: [...missing], warnings: [...warnings, ...libReport], errors: [], removedSessionIds, duplicate };
  }

  async listRuns() { await this.ensureSeeded(); return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  async activeRun(pid: string) { return (await this.listRuns()).find((r) => r.programId === pid && !r.endedAt); }
  async startRun(pid: string) {
    const existing = await this.activeRun(pid);
    if (existing) return existing;
    const program = await this.getProgram(pid);
    const run: ProgramRun = { id: uid(), programId: pid, contentVersionAtStart: program?.contentVersion ?? "unknown", startedAt: new Date().toISOString() };
    this.runs.set(run.id, run); await this.sync(); return run;
  }
  async endRun(runId: string) { const r = this.runs.get(runId); if (r) { this.runs.set(runId, { ...r, endedAt: new Date().toISOString() }); await this.sync(); } }
  async listProgress() { await this.ensureSeeded(); return [...this.progress.values()]; }
  async setProgress(p: SessionProgress) { this.progress.set(`${p.runId}::${p.sessionKey}`, p); await this.sync(); }
  async toggleComplete(runId: string, pid: string, sid: string) {
    const key = sessionKey(pid, sid); const mapKey = `${runId}::${key}`;
    const prev = this.progress.get(mapKey);
    const next: SessionProgress = { runId, sessionKey: key, startedAt: prev?.startedAt, lastOpenedAt: new Date().toISOString(), completedAt: prev?.completedAt ? undefined : new Date().toISOString() };
    this.progress.set(mapKey, next); await this.sync(); return next;
  }
  async markOpened(runId: string, pid: string, sid: string) {
    const key = sessionKey(pid, sid); const mapKey = `${runId}::${key}`;
    const prev = this.progress.get(mapKey);
    this.progress.set(mapKey, { ...prev, runId, sessionKey: key, lastOpenedAt: new Date().toISOString() }); await this.sync();
  }
  async exportProgress() {
    return JSON.stringify({ kind: "workout-progress", version: 1, runs: [...this.runs.values()], progress: [...this.progress.values()] }, null, 2);
  }
  async importProgress(json: unknown) {
    const parsed = progressExportSchema.parse(json);
    for (const r of parsed.runs) this.runs.set(r.id, r);
    for (const p of parsed.progress) this.progress.set(`${p.runId}::${p.sessionKey}`, p);
    await this.sync();
    return { runs: parsed.runs.length, progress: parsed.progress.length };
  }
  async listMedia(pid?: string) { await this.ensureSeeded(); return [...this.media.values()].filter((m) => !pid || m.programId === pid); }
  async setMedia(r: MediaRecord) { this.media.set(r.url, r); await this.sync(); }
  async deleteMedia(pid: string) { for (const [k, v] of [...this.media]) if (v.programId === pid) this.media.delete(k); await this.sync(); }
  async resetProgress() { this.progress.clear(); this.runs.clear(); await this.sync(); }
  async resetContent() { this.programs.clear(); this.items.clear(); this.exercises.clear(); this.media.clear(); this.seeded = false; this.syncing = null; await this.sync(); await this.ensureSeeded(); }
}
