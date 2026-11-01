import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generate } from "../../src/persist/generate.ts";
import { TRACK_IDS } from "../../src/persist/schema.ts";
import type { TrackId } from "../../src/persist/schema.ts";
import type { ViewIndex, WeekView } from "../../src/persist/views.ts";

const { values } = parseArgs({
  options: {
    track: { type: "string", default: "pump-lift-5x" },
    seed: { type: "string" },
    start: { type: "string" },
    equipment: { type: "string" },
    "allow-recent": { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const track = values.track as TrackId;
if (!TRACK_IDS.includes(track)) throw new Error(`unknown track ${track}; choose one of ${TRACK_IDS.join(", ")}`);
// No seed given: pick one from 1 to 50 and report it, so the block can be reproduced. An explicit seed must be a
// whole number from 0 to 4294967295; larger or fractional values would silently wrap or truncate.
const randomSeed = values.seed === undefined;
const seed = randomSeed ? 1 + Math.floor(Math.random() * 50) : Number(values.seed);
if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error(`--seed must be a whole number from 0 to 4294967295, got "${values.seed}"`);
const nextMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const startDate = values.start ?? nextMonday();
if (new Date(`${startDate}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`--start must be a Monday, got ${startDate}`);

const index: ViewIndex = JSON.parse(readFileSync("data/views/index.json", "utf8"));
const corpus: WeekView[] = [];
for (const w of index.weeks) for (const f of Object.values(w.files)) corpus.push(JSON.parse(readFileSync(`data/views/${f}`, "utf8")));

const result = generate(corpus, {
  track, seed, startDate,
  equipment: values.equipment?.split(",").map((x) => x.trim()).filter(Boolean),
  avoidRecent: !values["allow-recent"],
});

const out = values.out ?? `data/generated/${track}-seed${seed}-${startDate}.json`;
mkdirSync("data/generated", { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1));

console.log(`generated ${track}, seed ${seed}${randomSeed ? " (picked at random; pass --seed " + seed + " to get this block again)" : ""}, starting ${startDate} -> ${out}\n`);
for (const p of result.plan.filter((x) => x.day !== null)) {
  console.log(`day ${p.day} (from 5x day ${p.baseDay}): ${p.main.pattern}  ${p.main.a} / ${p.main.b}${p.secondary ? `  +  ${p.secondary.pattern}  ${p.secondary.a} / ${p.secondary.b}` : ""}`);
}
for (const w of result.warnings) console.log(`warning: ${w}`);
console.log("\nChecks:");
for (const c of result.checks) console.log(`  ${c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "info"}  ${c.name}: ${c.detail}`);
