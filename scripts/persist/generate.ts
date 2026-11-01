import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generate } from "../../src/persist/generate.ts";
import { TRACK_IDS } from "../../src/persist/schema.ts";
import type { TrackId } from "../../src/persist/schema.ts";
import type { ViewIndex, WeekView } from "../../src/persist/views.ts";

const { values } = parseArgs({
  options: {
    track: { type: "string", default: "pump-lift-5x" },
    seed: { type: "string", default: "1" },
    start: { type: "string" },
    equipment: { type: "string" },
    "allow-recent": { type: "boolean", default: false },
    out: { type: "string" },
  },
});

const track = values.track as TrackId;
if (!TRACK_IDS.includes(track)) throw new Error(`unknown track ${track}; choose one of ${TRACK_IDS.join(", ")}`);
const nextMonday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const startDate = values.start ?? nextMonday();
if (new Date(`${startDate}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`--start must be a Monday, got ${startDate}`);

const index: ViewIndex = JSON.parse(readFileSync("data/views/index.json", "utf8"));
const corpus: WeekView[] = [];
for (const w of index.weeks) for (const f of Object.values(w.files)) corpus.push(JSON.parse(readFileSync(`data/views/${f}`, "utf8")));

const result = generate(corpus, {
  track, seed: Number(values.seed), startDate,
  equipment: values.equipment?.split(",").map((x) => x.trim()).filter(Boolean),
  avoidRecent: !values["allow-recent"],
});

const out = values.out ?? `data/generated/${track}-seed${values.seed}-${startDate}.json`;
mkdirSync("data/generated", { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1));

console.log(`generated ${track}, seed ${values.seed}, starting ${startDate} -> ${out}\n`);
for (const p of result.plan.filter((x) => x.day !== null)) {
  console.log(`day ${p.day} (from 5x day ${p.baseDay}): ${p.main.pattern}  ${p.main.a} / ${p.main.b}${p.secondary ? `  +  ${p.secondary.pattern}  ${p.secondary.a} / ${p.secondary.b}` : ""}`);
}
for (const w of result.warnings) console.log(`warning: ${w}`);
