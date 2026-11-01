import { sqliteTable, text, integer, real, primaryKey, index } from "void/schema-d1";

// The Persist program: blocks contain weeks; a week has one schedule row per track and day,
// and each schedule row points at a session that is stored once and shared across tracks.

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Null until resolved: see data/reports/unmapped_exercises.json. */
  pattern: text("pattern"),
  equipment: text("equipment", { mode: "json" }).$type<string[]>().notNull(),
  unilateral: integer("unilateral", { mode: "boolean" }).notNull(),
});

export const exerciseAliases = sqliteTable("exercise_aliases", {
  alias: text("alias").primaryKey(),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id),
});

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  family: text("family").notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
});

export const blocks = sqliteTable("blocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  weekCount: integer("week_count").notNull(),
  /** True when the first observed week is not Week 1 and the start date was computed. */
  startInferred: integer("start_inferred", { mode: "boolean" }).notNull(),
});

export const weeks = sqliteTable(
  "weeks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    blockId: integer("block_id").notNull().references(() => blocks.id),
    weekNumber: integer("week_number").notNull(),
    startDate: text("start_date").notNull().unique(),
    /** 'observed' weeks came from a PDF; 'missing' weeks fall between observed weeks of a block. */
    status: text("status").notNull(),
    sourceFile: text("source_file"),
    noteTitle: text("note_title"),
    noteBody: text("note_body"),
  },
  (t) => [index("weeks_block_idx").on(t.blockId)],
);

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  focusTopic: text("focus_topic"),
  focusBody: text("focus_body"),
  shortOnTime: text("short_on_time", { mode: "json" }).$type<string[]>().notNull(),
  contentHash: text("content_hash").notNull().unique(),
});

export const sections = sqliteTable(
  "sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull().references(() => sessions.id),
    position: integer("position").notNull(),
    label: text("label"),
    title: text("title").notNull(),
    role: text("role").notNull(),
    format: text("format"),
    minutesMin: integer("minutes_min"),
    minutesMax: integer("minutes_max"),
    scheme: text("scheme", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    notes: text("notes", { mode: "json" }).$type<{ label: string; text: string }[]>().notNull(),
    contentHash: text("content_hash").notNull(),
    raw: text("raw").notNull(),
  },
  (t) => [index("sections_session_idx").on(t.sessionId), index("sections_hash_idx").on(t.contentHash), index("sections_role_idx").on(t.role)],
);

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sectionId: integer("section_id").notNull().references(() => sections.id),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").references(() => exercises.id),
    /** Name as written, before normalisation. */
    nameRaw: text("name_raw"),
    tempo: text("tempo"),
    restMinSec: integer("rest_min_sec"),
    restMaxSec: integer("rest_max_sec"),
    perSide: integer("per_side", { mode: "boolean" }).notNull(),
    load: text("load", { mode: "json" }).$type<{ male: number | null; female: number | null; unit: string }[] | null>(),
    /** Other exercises offered with "or" (e.g. cable fly or dumbbell fly). */
    alternatives: text("alternatives", { mode: "json" }).$type<string[]>(),
    raw: text("raw").notNull(),
  },
  (t) => [index("items_section_idx").on(t.sectionId), index("items_exercise_idx").on(t.exerciseId)],
);

export const sets = sqliteTable(
  "sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").notNull().references(() => items.id),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    repsMin: real("reps_min"),
    repsMax: real("reps_max"),
    /** count | max | seconds | minutes | distance | calories */
    repsType: text("reps_type").notNull(),
    unit: text("unit"),
    /** Second half of a male/female pair such as 12/10 Cal. */
    valueFemale: real("value_female"),
    rpeMin: real("rpe_min"),
    rpeMax: real("rpe_max"),
    effort: text("effort"),
  },
  (t) => [index("sets_item_idx").on(t.itemId)],
);

export const schedule = sqliteTable(
  "schedule",
  {
    weekId: integer("week_id").notNull().references(() => weeks.id),
    trackId: text("track_id").notNull().references(() => tracks.id),
    day: integer("day").notNull(),
    date: text("date").notNull(),
    sessionId: integer("session_id").notNull().references(() => sessions.id),
  },
  (t) => [primaryKey({ columns: [t.weekId, t.trackId, t.day] }), index("schedule_session_idx").on(t.sessionId)],
);
