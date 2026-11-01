import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildDataset } from "../../src/persist/build.ts";
import type { Catalog } from "../../src/persist/catalog.ts";
import type { WeekFile } from "../../src/persist/schema.ts";
import { buildViews, viewIndex, weekView } from "../../src/persist/views.ts";

const OUT = "data/views";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const weeks: WeekFile[] = readdirSync("data/source").sort().map((f) => JSON.parse(readFileSync(`data/source/${f}`, "utf8")));
const cat: Catalog = JSON.parse(readFileSync("data/catalog/exercises.json", "utf8"));
const ds = buildDataset(weeks, cat);
const { index, weeks: views } = buildViews(ds, cat.entries);

// Parse before writing so a malformed view fails the build instead of the app.
viewIndex.parse(index);
let bytes = 0;
for (const v of views) {
  weekView.parse(v);
  const file = join(OUT, v.track, `${v.weekStart}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(v);
  bytes += text.length;
  writeFileSync(file, text);
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));

// Cross-check against the database tables the views were built from.
const days = views.reduce((n, v) => n + v.days.length, 0);
const items = views.reduce((n, v) => n + v.days.reduce((m, d) => m + d.sections.reduce((k, s) => k + s.items.length, 0), 0), 0);
if (days !== ds.schedule.length) throw new Error(`views hold ${days} days but the schedule has ${ds.schedule.length}`);
console.log(`views: ${views.length} week files, ${days} days, ${items} item placements, ${(bytes / 1e6).toFixed(1)} MB, ${index.weeks.filter((w) => w.status === "missing").length} missing weeks in the index`);
