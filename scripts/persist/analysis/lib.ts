import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Opens the local D1 database that `void db seed` populated (read-only). */
export function openDb(): DatabaseSync {
  const dir = ".void/v3/d1/miniflare-D1DatabaseObject";
  const file = readdirSync(dir).find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (!file) throw new Error("local D1 database not found; run npm run persist:seed");
  return new DatabaseSync(join(dir, file), { readOnly: true });
}

export const OUT = "data/reports/analysis";
mkdirSync(OUT, { recursive: true });

export function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export function writeCsv(name: string, rows: Record<string, unknown>[]) {
  writeFileSync(join(OUT, `${name}.csv`), csv(rows));
}
export function writeJson(name: string, value: unknown) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(value, null, 1));
}

/** Runs every statement in a .sql file whose first line is `-- name: <output>`; one query per file. */
export function runSqlFiles(db: DatabaseSync, dir = "scripts/persist/analysis") {
  const results: Record<string, Record<string, unknown>[]> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, f), "utf8");
    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    const name = f.replace(/\.sql$/, "");
    results[name] = rows;
    writeCsv(name, rows);
  }
  return results;
}

export interface SetRow { kind: string; position: number; repsMin: number | null; repsMax: number | null; repsType: string; unit: string | null; rpeMin: number | null; rpeMax: number | null; effort: string | null }
export interface ItemRow {
  itemId: number; position: number; exId: string | null; exName: string | null; pattern: string | null;
  equipment: string[]; unilateral: boolean; tempo: string | null; restMin: number | null; restMax: number | null;
  perSide: boolean; nameRaw: string | null; sets: SetRow[];
}
export interface SectionRow {
  sectionId: number; position: number; role: string; format: string | null; title: string;
  hash: string; minutesMin: number | null; minutesMax: number | null; scheme: Record<string, any>; items: ItemRow[];
}
export interface Slot {
  block: number; week: number; weekStart: string; track: string; day: number; date: string;
  sessionId: number; sessionType: string; focusTopic: string | null; sections: SectionRow[];
}

/** One entry per schedule row (track-day) with its sections, items and sets attached. */
export function loadSlots(db: DatabaseSync): Slot[] {
  const q = <T = any>(sql: string) => db.prepare(sql).all() as T[];
  const sessions = new Map<number, SectionRow[]>();
  const secs = q(`select id, session_id sid, position, role, format, title, content_hash hash, minutes_min mn, minutes_max mx, scheme from sections order by session_id, position`);
  const secById = new Map<number, SectionRow>();
  for (const s of secs) {
    const row: SectionRow = { sectionId: s.id, position: s.position, role: s.role, format: s.format, title: s.title, hash: s.hash, minutesMin: s.mn, minutesMax: s.mx, scheme: JSON.parse(s.scheme), items: [] };
    secById.set(s.id, row);
    (sessions.get(s.sid) ?? sessions.set(s.sid, []).get(s.sid)!).push(row);
  }
  const itemById = new Map<number, ItemRow>();
  for (const i of q(`select i.id, i.section_id sec, i.position, i.exercise_id ex, e.name exname, e.pattern, e.equipment, e.unilateral uni, i.tempo, i.rest_min_sec rmin, i.rest_max_sec rmax, i.per_side ps, i.name_raw nr from items i left join exercises e on e.id=i.exercise_id order by i.section_id, i.position`)) {
    const it: ItemRow = { itemId: i.id, position: i.position, exId: i.ex, exName: i.exname, pattern: i.pattern, equipment: i.equipment ? JSON.parse(i.equipment) : [], unilateral: !!i.uni, tempo: i.tempo, restMin: i.rmin, restMax: i.rmax, perSide: !!i.ps, nameRaw: i.nr, sets: [] };
    itemById.set(i.id, it);
    secById.get(i.sec)!.items.push(it);
  }
  for (const s of q(`select item_id it, kind, position, reps_min rmin, reps_max rmax, reps_type rt, unit, rpe_min pmin, rpe_max pmax, effort from sets order by item_id, position`)) {
    itemById.get(s.it)!.sets.push({ kind: s.kind, position: s.position, repsMin: s.rmin, repsMax: s.rmax, repsType: s.rt, unit: s.unit, rpeMin: s.pmin, rpeMax: s.pmax, effort: s.effort });
  }
  return q(`select w.block_id block, w.week_number week, w.start_date ws, sc.track_id track, sc.day, sc.date, sc.session_id sid, s.type stype, s.focus_topic ft from schedule sc join weeks w on w.id=sc.week_id join sessions s on s.id=sc.session_id order by w.start_date, sc.track_id, sc.day`).map((r) => ({
    block: r.block, week: r.week, weekStart: r.ws, track: r.track, day: r.day, date: r.date, sessionId: r.sid, sessionType: r.stype, focusTopic: r.ft, sections: sessions.get(r.sid) ?? [],
  }));
}

export const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
export const mdTable = (rows: (string | number | null)[][], head: string[]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map((c) => c ?? "").join(" | ")} |`)].join("\n");
export const PL = ["pump-lift-5x", "pump-lift-4x", "pump-lift-3x"];
