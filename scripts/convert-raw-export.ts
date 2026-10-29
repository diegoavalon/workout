/**
 * Convert a raw-export track into an importable bundle.
 *
 * Usage:
 *   npm run convert:raw -- [trackDir] [--id slug] [--title "PERFORM"] [--version 1.0.0]
 *   trackDir defaults to raw-export/perform/five-day and must contain
 *   week-<n>/day-<n>.json files holding the raw source item arrays.
 *
 * Writes <programDir>/bundle-<track>.json (upload via Library -> Import program)
 * and <programDir>/index-<track>.json (conversion report). Raw files are never modified.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { buildLibrary, convertDayItems, type RawObj } from "../src/lib/raw-convert.ts";
import { validateManifest } from "../src/domain/manifest.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) { i++; continue; }
  positional.push(args[i]);
}
const trackDir = positional[0] ?? "raw-export/perform/five-day";
const programDir = dirname(trackDir);
const track = basename(trackDir);
const WORD_DAYS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const daysToken = track.split("-")[0].toLowerCase();
const daysPerWeek = Number(daysToken) || WORD_DAYS[daysToken] || 0;
if (!daysPerWeek) {
  console.error(`Cannot infer daysPerWeek from track name "${track}" (expected e.g. five-day or 5-day).`);
  process.exit(1);
}
const programId = opt("id") ?? `${basename(programDir)}-${track}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const title = opt("title") ?? basename(programDir).toUpperCase();
const contentVersion = opt("version") ?? "1.0.0";

const numSuffix = (name: string) => Number(name.match(/(\d+)/)?.[1] ?? 0);
const dirs = readdirSync(trackDir).filter((n) => /^week-\d+$/i.test(n) && statSync(join(trackDir, n)).isDirectory()).sort((a, b) => numSuffix(a) - numSuffix(b));
if (!dirs.length) {
  console.error(`No week-<n> directories found in ${trackDir}`);
  process.exit(1);
}

type SessionEntry = { week: number; day: number; file: string; sourceProgramId?: string; itemsIn: number; itemsOut: number; exercises: number };
const files: Record<string, unknown> = {};
const itemsBySession: RawObj[][] = [];
const warnings: string[] = [];
const indexSessions: SessionEntry[] = [];
const sourceIds = new Set<string>();

const weeks = dirs.map((weekDir) => {
  const weekNum = numSuffix(weekDir);
  const dayFiles = readdirSync(join(trackDir, weekDir)).filter((n) => /^day-\d+\.json$/i.test(n)).sort((a, b) => numSuffix(a) - numSuffix(b));
  if (!dayFiles.length) warnings.push(`${weekDir}: no day-<n>.json files`);
  const sessions = dayFiles.map((dayFile) => {
    const dayNum = numSuffix(dayFile);
    const rel = join(trackDir, weekDir, dayFile);
    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(readFileSync(rel, "utf8"));
    } catch (e) {
      console.error(`Invalid JSON in ${rel}: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    if (!Array.isArray(rawParsed)) {
      console.error(`${rel}: expected a top-level array of workout items`);
      process.exit(1);
    }
    const srcId = (rawParsed[0] as RawObj | undefined)?.path?.toString().split("/items/")[0].split("/").pop();
    if (srcId) sourceIds.add(srcId);
    const isRecovery = (rawParsed as RawObj[]).some((it) => it.type === "text" && typeof (it.child as RawObj | undefined)?.text === "string" && ((it.child as RawObj).text as string).includes("Active Recovery"));
    const { items, report } = convertDayItems(rawParsed);
    report.warnings.forEach((w) => warnings.push(`${weekDir}/${dayFile}: ${w}`));
    const contentPath = `week-${String(weekNum).padStart(2, "0")}/session-${String(dayNum).padStart(2, "0")}.json`;
    files[contentPath] = items;
    itemsBySession.push(items);
    indexSessions.push({ week: weekNum, day: dayNum, file: rel, sourceProgramId: srcId, itemsIn: report.itemsIn, itemsOut: report.itemsOut, exercises: report.exercises });
    return { id: `w${String(weekNum).padStart(2, "0")}-s${dayNum}`, order: dayNum, title: `Day ${dayNum}`, contentPath, ...(isRecovery ? { optional: true, summary: "Optional recovery" } : {}) };
  });
  return { id: `w${String(weekNum).padStart(2, "0")}`, order: weekNum, sessions };
});

const manifest = {
  schemaVersion: 1, contentVersion, id: programId, title,
  description: undefined as string | undefined,
  daysPerWeek, weeks,
};
const { library, conflicts } = buildLibrary(itemsBySession);
conflicts.forEach((c) => warnings.push(c));

const { manifest: valid, issues } = validateManifest(manifest);
if (!valid || issues.length) {
  console.error("Generated manifest failed the app's own validation:");
  issues.forEach((i) => console.error(`  ${i.path}: ${i.message}`));
  process.exit(1);
}

const bundlePath = join(programDir, `bundle-${track}.json`);
const indexPath = join(programDir, `index-${track}.json`);
writeFileSync(bundlePath, JSON.stringify({ manifest, files, library }, null, 2));

// Optional: publish as tracked app source under public/content (see docs/raw-export-workflow.md).
// Each variation (track) publishes under its own program id and is merged into
// the shared catalog and exercise library, so 3x/4x/5x variants coexist.
const publishDir = opt("publish");
if (publishDir) {
  const progDir = join(publishDir, "programs", programId);
  for (const [contentPath, items] of Object.entries(files)) {
    const dest = join(progDir, contentPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(items, null, 2));
  }
  mkdirSync(progDir, { recursive: true });
  writeFileSync(join(progDir, "program.json"), JSON.stringify(manifest, null, 2));
  const readJson = (p: string): Record<string, unknown> | unknown[] | null => {
    try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
  };
  mkdirSync(join(publishDir, "exercises"), { recursive: true });
  const libPath = join(publishDir, "exercises", "library.json");
  const existingLib = readJson(libPath);
  const mergedLib = new Map<string, RawObj>();
  if (Array.isArray(existingLib)) for (const e of existingLib as RawObj[]) if (typeof e.id === "string") mergedLib.set(e.id, e);
  for (const e of library) mergedLib.set(e.id as string, e);
  writeFileSync(libPath, JSON.stringify([...mergedLib.values()], null, 2));
  const catPath = join(publishDir, "catalog.json");
  const existingCat = readJson(catPath) as { programs?: RawObj[] } | null;
  const entry = { id: programId, title, daysPerWeek, contentVersion, manifestPath: `programs/${programId}/program.json` };
  const programs = [...(Array.isArray(existingCat?.programs) ? existingCat.programs.filter((p) => p.id !== programId) : []), entry]
    .sort((a, b) => Number(a.daysPerWeek ?? 99) - Number(b.daysPerWeek ?? 99));
  writeFileSync(catPath, JSON.stringify({ schemaVersion: 1, contentVersion, programs }, null, 2));
  console.log(`Published: ${progDir}/program.json (+ ${Object.keys(files).length} session files; catalog now ${programs.length} program(s); library ${mergedLib.size} exercises)`);
}
writeFileSync(indexPath, JSON.stringify({
  programId, title, daysPerWeek, contentVersion,
  sourceProgramIds: [...sourceIds],
  sessions: indexSessions,
  exercisesInLibrary: library.length,
  warnings,
  bundle: bundlePath,
}, null, 2));

console.log(`Sessions: ${indexSessions.length} (${indexSessions.reduce((n, s) => n + s.exercises, 0)} exercise assignments)`);
console.log(`Exercise library: ${library.length} unique exercises`);
console.log(`Bundle: ${bundlePath}`);
console.log(`Report: ${indexPath}`);
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  warnings.forEach((w) => console.log(`  - ${w}`));
} else console.log("Warnings: none");
