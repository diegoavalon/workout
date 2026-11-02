import { readFileSync, writeFileSync } from "node:fs";

// Matches catalog exercises to the local exercise-library export by normalized
// name/alias and writes a media-only map (URLs, no library content) that the
// generated-program views use for images and video.
// Reads raw-export/exercise-library.json (gitignored) + data/catalog/exercises.json.
// Optional hand fixes: data/catalog/media-overrides.json { "<catalogId>": "<libraryId>" }.

type LibEntry = { id: string; title?: string | null; imageUrl?: string; videoUrl?: string; thumbnail?: string; isDefault?: boolean };
type CatEntry = { id: string; name: string; aliases: string[]; uses: number };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const score = (e: LibEntry) => (e.videoUrl ? 4 : 0) + (e.imageUrl ? 2 : 0) + (e.isDefault ? 1 : 0);

const lib: LibEntry[] = JSON.parse(readFileSync("raw-export/exercise-library.json", "utf8"));
const catalog: { entries: CatEntry[] } = JSON.parse(readFileSync("data/catalog/exercises.json", "utf8"));
let overrides: Record<string, string> = {};
try { overrides = JSON.parse(readFileSync("data/catalog/media-overrides.json", "utf8")); } catch { /* optional */ }

const byId = new Map(lib.map((e) => [e.id, e]));
const byTitle = new Map<string, LibEntry>();
for (const e of lib) {
  if (!e.title || !(e.videoUrl || e.imageUrl || e.thumbnail)) continue;
  const k = norm(e.title);
  const cur = byTitle.get(k);
  if (!cur || score(e) > score(cur)) byTitle.set(k, e);
}

const out: Record<string, { libraryId: string; imageUrl?: string; videoUrl?: string; thumbnail?: string }> = {};
const misses: { name: string; uses: number }[] = [];
for (const c of catalog.entries) {
  const hit = (overrides[c.id] ? byId.get(overrides[c.id]) : undefined) ?? [c.name, ...c.aliases].map((n) => byTitle.get(norm(n))).find(Boolean);
  if (hit) out[c.id] = { libraryId: hit.id, imageUrl: hit.imageUrl, videoUrl: hit.videoUrl, thumbnail: hit.thumbnail };
  else misses.push({ name: c.name, uses: c.uses });
}
writeFileSync("data/catalog/media.json", JSON.stringify(out, null, 1));
misses.sort((a, b) => b.uses - a.uses);
writeFileSync("data/reports/unmatched_media.json", JSON.stringify(misses, null, 1));
const total = catalog.entries.reduce((n, e) => n + e.uses, 0);
const covered = catalog.entries.filter((e) => out[e.id]).reduce((n, e) => n + e.uses, 0);
console.log(`media: ${Object.keys(out).length}/${catalog.entries.length} catalog exercises matched (${((100 * covered) / total).toFixed(1)}% of uses)`);
