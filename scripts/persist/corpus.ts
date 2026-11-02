import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ViewIndex, WeekView } from "../../src/persist/views.ts";

export interface CorpusManifest {
  /** Content hash; the corpus file name embeds it, so a cached copy is valid forever. */
  version: string;
  /** Path of the corpus file, relative to the site root. */
  url: string;
  bytes: number;
  weeks: number;
  /** Equipment tags found in the source, for the New program form. */
  equipment: string[];
}

/** Read every indexed week from data/views. Fails with an actionable message when the source is missing. */
export function loadCorpus(viewsDir = "data/views"): WeekView[] {
  const indexPath = join(viewsDir, "index.json");
  if (!existsSync(indexPath)) throw new Error(`Program generation needs the source weeks in ${viewsDir}/, but ${indexPath} is missing. Run "npm run persist:views" (or "npm run persist:all") first.`);
  const index: ViewIndex = JSON.parse(readFileSync(indexPath, "utf8"));
  const weeks: WeekView[] = [];
  for (const w of index.weeks) for (const f of Object.values(w.files)) {
    const p = join(viewsDir, f);
    if (!existsSync(p)) throw new Error(`Week file ${p} is listed in ${indexPath} but missing. Re-run "npm run persist:views".`);
    weeks.push(JSON.parse(readFileSync(p, "utf8")));
  }
  if (!weeks.length) throw new Error(`${indexPath} lists no weeks; nothing to generate from.`);
  return weeks;
}

export function equipmentTags(weeks: WeekView[]): string[] {
  const tags = new Set<string>();
  for (const w of weeks) for (const d of w.days) for (const s of d.sections) for (const i of s.items)
    for (const e of [i.exercise, ...i.alternatives]) for (const t of e?.equipment ?? []) tags.add(t);
  tags.delete("bodyweight");
  return [...tags].sort();
}

export function packageCorpus(viewsDir = "data/views"): { manifest: CorpusManifest; corpusName: string; corpus: string } {
  const weeks = loadCorpus(viewsDir);
  const corpus = JSON.stringify(weeks);
  const version = createHash("sha256").update(corpus).digest("hex").slice(0, 12);
  const corpusName = `corpus-${version}.json`;
  return { corpus, corpusName, manifest: { version, url: `/corpus/${corpusName}`, bytes: Buffer.byteLength(corpus), weeks: weeks.length, equipment: equipmentTags(weeks) } };
}

export function writeCorpus(outDir: string, viewsDir = "data/views") {
  const { manifest, corpus, corpusName } = packageCorpus(viewsDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, corpusName), corpus);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}
