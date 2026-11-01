import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseWeekText } from "../../src/persist/parse.ts";
import { weekFile } from "../../src/persist/schema.ts";
import type { Correction, UnparsedLine } from "../../src/persist/schema.ts";

const TEXT = "data/text";
const SOURCE = "data/source";
const REPORTS = "data/reports";
mkdirSync(SOURCE, { recursive: true });
mkdirSync(REPORTS, { recursive: true });
for (const f of readdirSync(SOURCE)) if (f.endsWith(".json")) rmSync(join(SOURCE, f));

const corrections: Correction[] = [];
const unparsed: UnparsedLine[] = [];
const summary: Record<string, unknown>[] = [];
const seenStarts = new Map<string, string>();

for (const f of readdirSync(TEXT).filter((f) => f.endsWith(".txt")).sort()) {
  const name = f.replace(/\.txt$/, "");
  const r = parseWeekText(readFileSync(join(TEXT, f), "utf8"), name);
  const parsed = weekFile.parse(r.week);
  const dup = seenStarts.get(parsed.weekStart);
  if (dup) r.corrections.push({ file: name, location: "week", type: "duplicate-week", original: parsed.weekStart, corrected: `also produced by ${dup}` });
  seenStarts.set(parsed.weekStart, name);
  const exp = `persist-${parsed.weekStart.slice(5, 7)}${parsed.weekStart.slice(8, 10)}${parsed.weekStart.slice(2, 4)}`;
  if (exp !== name) r.corrections.push({ file: name, location: "filename", type: "filename-week-mismatch", original: name, corrected: `content is week of ${parsed.weekStart}` });
  writeFileSync(join(SOURCE, `${parsed.weekStart}.json`), JSON.stringify(parsed, null, 2));
  corrections.push(...r.corrections);
  unparsed.push(...r.unparsed);
  const days = Object.values(parsed.tracks).flat();
  summary.push({
    file: name, weekStart: parsed.weekStart, week: parsed.weekNumber,
    tracks: Object.keys(parsed.tracks).length, days: days.length,
    training: days.filter((d) => d.sessionType === "training").length,
    sections: days.reduce((n, d) => n + d.sections.length, 0),
    unparsed: r.unparsed.length,
  });
}

writeFileSync(join(REPORTS, "corrections.json"), JSON.stringify(corrections, null, 2));
writeFileSync(join(REPORTS, "unparsed.json"), JSON.stringify(unparsed, null, 2));
writeFileSync(join(REPORTS, "parse-summary.json"), JSON.stringify(summary, null, 2));

const by = (xs: { reason?: string; type?: string }[], k: "reason" | "type") => {
  const c: Record<string, number> = {};
  for (const x of xs) c[x[k]!] = (c[x[k]!] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
};
console.log(`weeks: ${summary.length}`);
console.log("corrections:", by(corrections, "type"));
console.log(`unparsed: ${unparsed.length}`, by(unparsed, "reason"));
