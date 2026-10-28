export type Exercise = {
  id: string;
  title: string;
  tags?: string[];
  logType?: string;
  thumbnail?: string;
  imageUrl?: string;
  videoUrl?: string;
  [key: string]: unknown;
};

export type SessionManifest = {
  id: string;
  order: number;
  title?: string;
  summary?: string;
  suggestedWeekday?: number;
  estimatedMinutes?: number;
  contentPath: string;
};
export type WeekManifest = { id: string; order: number; title?: string; sessions: SessionManifest[] };
export type ProgramManifest = {
  schemaVersion: number;
  contentVersion: string;
  id: string;
  title: string;
  description?: string;
  daysPerWeek: number;
  focus?: string;
  difficulty?: string;
  equipment?: string[];
  cover?: string;
  weeks: WeekManifest[];
};
export type Program = ProgramManifest & { totalWeeks: number };
export type FlatSession = SessionManifest & { weekId: string; weekOrder: number; programId: string };

/** Canonical session key — defined once (PRD §8). */
export const sessionKey = (programId: string, sessionId: string) => `${programId}/${sessionId}`;

export type ProgramRun = {
  id: string;
  programId: string;
  contentVersionAtStart: string;
  startedAt: string;
  endedAt?: string;
};
export type SessionProgress = {
  runId: string;
  sessionKey: string;
  completedAt?: string;
  startedAt?: string;
  lastOpenedAt?: string;
};
export type MediaRecord = {
  url: string;
  programId: string;
  kind: "image" | "video";
  status: "pending" | "downloaded" | "failed" | "not-downloadable";
  size?: number;
  error?: string;
  updatedAt: string;
};
export type ImportReport = {
  programId: string;
  contentVersion: string;
  sessionsImported: number;
  missingExercises: string[];
  warnings: string[];
  errors: string[];
  removedSessionIds: string[];
  duplicate: boolean;
};

export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const sorted = <T extends { order: number }>(xs: T[]): T[] =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => a.x.order - b.x.order || a.i - b.i).map(({ x }) => x);
export const flatSessions = (p: Program): FlatSession[] =>
  sorted(p.weeks).flatMap((w) => sorted(w.sessions).map((s) => ({ ...s, weekId: w.id, weekOrder: w.order, programId: p.id })));
