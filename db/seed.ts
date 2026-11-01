import { readdirSync, readFileSync } from "node:fs";
import { defineSeed } from "void/seed";
import { buildDataset } from "../src/persist/build.ts";
import type { Catalog } from "../src/persist/catalog.ts";
import type { WeekFile } from "../src/persist/schema.ts";

// Rebuilds the whole database from data/source/ and data/catalog/exercises.json.
// `void db seed` resets and migrates the local database first, so this is safe to rerun.

// Stay well under SQLite's bound-parameter limit per statement.
const MAX_PARAMS = 900;

export default defineSeed<typeof import("./schema")>(async ({ db, schema }) => {
  const weeks: WeekFile[] = readdirSync("data/source").sort().map((f) => JSON.parse(readFileSync(`data/source/${f}`, "utf8")));
  const catalog: Catalog = JSON.parse(readFileSync("data/catalog/exercises.json", "utf8"));
  const ds = buildDataset(weeks, catalog);

  // biome-ignore lint/suspicious/noExplicitAny: table types differ per call
  const insert = async (table: any, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const size = Math.max(1, Math.floor(MAX_PARAMS / Object.keys(rows[0]).length));
    for (let i = 0; i < rows.length; i += size) await db.insert(table).values(rows.slice(i, i + size));
  };

  await insert(schema.exercises, catalog.entries.map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, equipment: e.equipment, unilateral: e.unilateral })));
  const aliases = Object.entries(catalog.aliasToId).filter(([, id]) => id).map(([alias, exerciseId]) => ({ alias, exerciseId: exerciseId! }));
  await insert(schema.exerciseAliases, aliases);
  await insert(schema.tracks, ds.tracks);
  await insert(schema.blocks, ds.blocks);
  await insert(schema.weeks, ds.weeks);
  await insert(schema.sessions, ds.sessions);
  await insert(schema.sections, ds.sections);
  await insert(schema.items, ds.items);
  await insert(schema.sets, ds.sets);
  await insert(schema.schedule, ds.schedule);
});
