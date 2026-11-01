import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { buildCatalog } from "../../src/persist/catalog.ts";
import type { Overrides } from "../../src/persist/catalog.ts";
import type { WeekFile } from "../../src/persist/schema.ts";

mkdirSync("data/catalog", { recursive: true });
const weeks: WeekFile[] = readdirSync("data/source").sort().map((f) => JSON.parse(readFileSync(`data/source/${f}`, "utf8")));
const overrides: Overrides = JSON.parse(readFileSync("data/catalog/overrides.json", "utf8"));
const cat = buildCatalog(weeks, overrides);

writeFileSync("data/catalog/exercises.json", JSON.stringify({ entries: cat.entries, aliasToId: cat.aliasToId, aliasAlternatives: cat.aliasAlternatives }, null, 1));
writeFileSync("data/reports/unmapped_exercises.json", JSON.stringify(cat.unmapped, null, 1));

const total = cat.entries.reduce((n, e) => n + e.uses, 0);
const unresolved = cat.unmapped.filter((u) => u.id);
const unresolvedUses = unresolved.reduce((n, e) => n + e.uses, 0);
console.log(`catalog: ${cat.entries.length} exercises from ${Object.keys(cat.aliasToId).length} spellings`);
console.log(`pattern unresolved: ${unresolved.length} exercises, ${unresolvedUses}/${total} uses (${((100 * unresolvedUses) / total).toFixed(1)}%)`);
const excluded = cat.unmapped.filter((u) => !u.id);
console.log(`kept out of the catalog: ${excluded.length} names, ${excluded.reduce((n, e) => n + e.uses, 0)} uses`);
