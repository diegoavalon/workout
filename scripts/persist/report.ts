import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { buildDataset } from "../../src/persist/build.ts";
import type { Catalog } from "../../src/persist/catalog.ts";
import type { WeekFile } from "../../src/persist/schema.ts";

const weeks: WeekFile[] = readdirSync("data/source").sort().map((f) => JSON.parse(readFileSync(`data/source/${f}`, "utf8")));
const cat: Catalog = JSON.parse(readFileSync("data/catalog/exercises.json", "utf8"));
const ds = buildDataset(weeks, cat);
const counts = {
  tracks: ds.tracks.length, blocks: ds.blocks.length, weeks: ds.weeks.length, sessions: ds.sessions.length,
  sections: ds.sections.length, items: ds.items.length, sets: ds.sets.length, schedule: ds.schedule.length,
  exercises: cat.entries.length, exercise_aliases: Object.values(cat.aliasToId).filter(Boolean).length,
};
writeFileSync("data/reports/build-report.json", JSON.stringify({ counts, ...ds.report, blocks: ds.blocks, missingWeeks: ds.weeks.filter((w) => w.status === "missing").map((w) => ({ block: w.blockId, week: w.weekNumber, start: w.startDate })) }, null, 1));
console.log(counts);
console.log(ds.report.warnings);
console.log(`sessions: ${ds.report.uniqueSessions} unique of ${ds.report.totalSessions}; sections: ${ds.report.uniqueSections} unique of ${ds.report.totalSections}`);
console.log("unknown formats", Object.entries(ds.report.unknownFormats).sort((a, b) => b[1] - a[1]).slice(0, 12));
