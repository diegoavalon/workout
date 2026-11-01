import { readFileSync, writeFileSync } from "node:fs";
import { generate } from "../../../src/persist/generate.ts";
import type { TrackId } from "../../../src/persist/schema.ts";
import type { ViewIndex, WeekView } from "../../../src/persist/views.ts";
import { mdTable } from "./lib.ts";

// Compares generated blocks with the published ones on measures the analysis found stable.
const N = 60;
const index: ViewIndex = JSON.parse(readFileSync("data/views/index.json", "utf8"));
const corpus: WeekView[] = [];
for (const w of index.weeks) for (const f of Object.values(w.files)) corpus.push(JSON.parse(readFileSync(`data/views/${f}`, "utf8")));

const PATTERNS = ["squat", "hinge", "lunge-single-leg", "horizontal-press", "vertical-press", "horizontal-pull", "vertical-pull"];

function measure(weeks: WeekView[]) {
  const sets: Record<string, number> = {};
  const covered: Record<string, number> = {};
  let rpe789 = 0, rpeN = 0, tempoConst = 0, blocks = 0, alt = 0, altN = 0;
  for (const wk of weeks) {
    const seen = new Set<string>();
    for (const d of wk.days) for (const s of d.sections) {
      if (!s.role.startsWith("strength-intensity") || !s.items[0]) continue;
      const it = s.items[0];
      const working = it.sets.filter((x) => x.kind === "working");
      const p = it.exercise?.pattern;
      if (p) { sets[p] = (sets[p] ?? 0) + working.length; seen.add(p); }
      if (s.role === "strength-intensity-1") { rpeN++; if (working.slice(0, 3).map((x) => x.rpeMin).join("/") === "7/8/9") rpe789++; }
    }
    for (const p of seen) covered[p] = (covered[p] ?? 0) + 1;
  }
  void tempoConst; void blocks; void alt; void altN;
  return { sets, covered, n: weeks.length, rpe: rpeN ? rpe789 / rpeN : 0 };
}

const observed = measure(corpus.filter((w) => w.track === "pump-lift-5x"));
const gen: WeekView[] = [];
let warnings = 0;
for (let seed = 1; seed <= N; seed++) {
  const g = generate(corpus, { track: "pump-lift-5x", seed, startDate: "2027-01-04" });
  gen.push(...g.weeks);
  warnings += g.warnings.length;
}
const generated = measure(gen);
const avg = (m: ReturnType<typeof measure>, p: string) => ((m.sets[p] ?? 0) / m.n).toFixed(1);
const cov = (m: ReturnType<typeof measure>, p: string) => `${Math.round((100 * (m.covered[p] ?? 0)) / m.n)}%`;

const md = [
  "# Generator check: Pump Lift 5x",
  "",
  `${N} generated blocks (${gen.length} weeks, seeds 1-${N}) against ${observed.n} observed weeks. Hard sets are working sets in the two strength slots.`,
  "",
  mdTable(PATTERNS.map((p) => [p, avg(observed, p), avg(generated, p), cov(observed, p), cov(generated, p)]), ["Pattern", "Observed sets/wk", "Generated sets/wk", "Observed weeks covered", "Generated weeks covered"]),
  "",
  `Strength-intensity-1 weeks whose RPE starts 7/8/9: observed ${(100 * observed.rpe).toFixed(0)}%, generated ${(100 * generated.rpe).toFixed(0)}%. Warnings per block: ${(warnings / N).toFixed(2)}.`,
].join("\n");
writeFileSync("data/reports/generator-check.md", md + "\n");
console.log(md);
