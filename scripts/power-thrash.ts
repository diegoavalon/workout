/**
 * Convert the Power Thrash II spreadsheet into a percentage template.
 *
 *   npm run power-thrash:convert [-- path/to/Power\ Thrash\ II.xlsx]
 *
 * Reads raw-export/power-thrash-ii.xlsx by default and writes data/programs/power-thrash-ii.json.
 * Every weight cell in the sheet is `INT((pct * $B$n) / 5 + 0.5) * 5`, so the template stores
 * `pct` and the max it applies to; the app recomputes weights from the athlete's own maxes.
 * The script fails loudly if the sheet changes shape, and verifies that the template plus the
 * sheet's example maxes reproduces every cached weight (except the corrections listed below).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readXlsx, type Cell } from "./xlsx.ts";
import { POWER_THRASH_CREDIT, POWER_THRASH_TEMPLATE, roundLoad, type PtExercise, type PtMax, type PtTemplate } from "../src/domain/power-thrash.ts";

const input = process.argv[2] ?? "raw-export/power-thrash-ii.xlsx";
const output = `data/programs/${POWER_THRASH_TEMPLATE}`;
const [sheet] = readXlsx(readFileSync(input));
const cell = (ref: string): Cell => sheet.cells.get(ref) ?? { value: null, formula: null };
const val = (ref: string) => cell(ref).value?.trim() ?? "";
const col = (i: number) => String.fromCharCode(65 + i);
const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fail = (msg: string): never => { throw new Error(`${input}: ${msg}`); };

/* ---- Names: one spelling per lift ---- */
const RENAME: Record<string, string> = {
  "Bent-Over Row": "Bent Over Row",
  "Alternate Step-ups": "Alternate Step-Up",
  "High-Pull Snatch From Hip": "High-Pull Snatch from Hip",
  // Labels in the maxes table
  "In Out Rotation": "Inward Outward Rotation",
  "From Hip High-Pull Snatch": "High-Pull Snatch from Hip",
  Kickbacks: "Kickback",
};
const canon = (name: string) => { const n = name.replace(/\s+/g, " ").trim(); return RENAME[n] ?? n; };

/* ---- Library matches (only where the movement is clearly the same) ---- */
const CATALOG: Record<string, string> = {
  "Upright Row": "barbell-upright-row",
  "Bent Over Row": "barbell-bent-over-row",
  "Barbell Squat": "back-squat",
  "Overhead Press": "barbell-strict-press",
  "Bent Over Lateral Raises": "dumbbell-bent-over-reverse-fly",
  "Push Press": "push-press",
  "Pull Over": "dumbbell-pullover",
};
const DUMBBELL = /Complex|Flyes|Kickback|Lateral Raises|Rotation|Pull Over/;
const equipmentOf = (name: string) => (name === "Stair Run" ? [] : DUMBBELL.test(name) ? ["dumbbell"] : name === "Alternate Step-Up" ? ["barbell", "box"] : ["barbell"]);

/* ---- Corrections to the source sheet ---- */
const UNLOADED = new Set(["Stair Run"]);
/** Lifts whose weights the sheet takes from an unrelated max. Rebased so the sheet's example athlete gets identical weights. */
const REBASE: Record<string, { from: string; to: string }> = {
  "Walking Lunges": { from: "raise-to-armpit", to: "barbell-squat" },
  "Alternate Lunges": { from: "raise-to-armpit", to: "barbell-squat" },
  "Alternate Step-Up": { from: "raise-to-armpit", to: "barbell-squat" },
  "Squat Under Upright Row": { from: "upright-row", to: "squat-under-upright-row" },
};
const fixes = [
  "Stair Run has no weight. The sheet took one from the Raise to Armpit max.",
  "Walking Lunges, Alternate Lunges and Alternate Step-Ups use your Barbell Squat max. The sheet used the Raise to Armpit max; percentages are scaled so the sheet's example lifter gets the same weights.",
  "Squat Under Upright Row in weeks 10–11 uses its own max instead of the Upright Row max, scaled the same way.",
  "Exercise names are spelled consistently (for example Bent-Over Row → Bent Over Row).",
];

/* ---- Maxes (A2:B16) ---- */
const maxes: PtMax[] = [];
const maxByRow = new Map<number, PtMax>();
for (let r = 2; r <= 16; r++) {
  const label = canon(val(`A${r}`));
  const example = Number(val(`B${r}`));
  if (!label || !(example > 0)) fail(`expected a lift and its max in A${r}:B${r}`);
  const m = { id: slug(label), label, example };
  maxes.push(m); maxByRow.set(r, m);
}
const maxById = new Map(maxes.map((m) => [m.id, m]));

/* ---- Dumbbell complexes (E1:N8) ---- */
const complexNote = (nameCol: string, repsCol: string, desc: string[]) => {
  const moves = [2, 3, 4, 5, 6].map((r) => `${canon(val(`${nameCol}${r}`))} ${val(`${repsCol}${r}`).replace(/^x\s*/, "× ")}`);
  return [`Moves: ${moves.join(", ")}.`, `${desc.map((d) => val(d)).join(" ").replace(/\s+/g, " ").trim()}.`];
};
const COMPLEX: Record<string, string[]> = {
  "Dumbbell Complex 1": complexNote("E", "H", ["E7", "E8"]),
  "Dumbbell Complex 2": complexNote("J", "M", ["J7", "J8"]),
};

/* ---- Workouts ---- */
const FORMULA = /^INT\(\(([\d.]+)\*\$B\$(\d+)\)\/5\+0\.5\)\*5$/;
const weeks: PtTemplate["weeks"] = [];
let rebased = 0, unloaded = 0, checked = 0;
let r = 19;
const lastRow = Math.max(...[...sheet.cells.keys()].map((k) => Number(/\d+/.exec(k)![0])));
while (r <= lastRow) {
  const head = /^Week (\d+) Day (\d+)$/.exec(val(`A${r}`));
  if (!head) { r++; continue; }
  const [week, day] = [Number(head[1]), Number(head[2])];
  if (val(`B${r}`) !== "Rest" || val(`C${r}`) !== "Sets") fail(`unexpected header at row ${r}`);
  const exercises: PtExercise[] = [];
  for (r++; val(`A${r}`); r++) {
    const name = canon(val(`A${r}`));
    const restSec = Number(val(`B${r}`)), setCount = Number(val(`C${r}`));
    if (!(restSec > 0) || !(setCount > 0)) fail(`row ${r}: missing rest or sets`);
    const sets: PtExercise["sets"] = [];
    let max: string | null = null;
    for (let i = 0; i < setCount; i++) {
      const repsRef = `${col(3 + 2 * i)}${r}`, loadRef = `${col(4 + 2 * i)}${r}`;
      const reps = val(repsRef).split("\\").map(Number);
      if (!reps.length || reps.some((n) => !Number.isInteger(n) || n <= 0)) fail(`${repsRef}: unreadable reps "${val(repsRef)}"`);
      const f = FORMULA.exec(cell(loadRef).formula ?? "") ?? fail(`${loadRef}: expected a percentage-of-max formula`);
      let pct = Number(f[1]);
      let ref = maxByRow.get(Number(f[2]))?.id ?? fail(`${loadRef}: refers to B${f[2]}, which is not a max`);
      const sheetLoad = Number(cell(loadRef).value);
      if (roundLoad(pct * maxById.get(ref)!.example) !== sheetLoad) fail(`${loadRef}: formula does not reproduce ${sheetLoad}`);
      if (UNLOADED.has(name)) { sets.push({ reps, pct: null }); unloaded++; continue; }
      const fix = REBASE[name];
      if (fix && ref === fix.from) {
        pct = Number(((pct * maxById.get(fix.from)!.example) / maxById.get(fix.to)!.example).toFixed(6));
        ref = fix.to; rebased++;
      }
      if (max !== null && ref !== max) fail(`row ${r}: sets use different maxes (${max}, ${ref})`);
      max = ref;
      // The sheet's example lifter must get exactly the sheet's weights after any rebase.
      if (roundLoad(pct * maxById.get(ref)!.example) !== sheetLoad) fail(`${loadRef}: rebase changed ${sheetLoad}`);
      checked++;
      sets.push({ reps, pct });
    }
    if (val(`${col(3 + 2 * setCount)}${r}`)) fail(`row ${r}: more set columns than the ${setCount} sets listed`);
    const notes = [...(COMPLEX[name] ?? [])];
    if (name.includes(" + ") && sets.some((s) => s.reps.length > 1)) notes.push(`Reps are listed per movement: ${name}.`);
    if (UNLOADED.has(name)) notes.push("No weight prescribed.");
    exercises.push({ name, ...(CATALOG[name] ? { catalogId: CATALOG[name] } : {}), equipment: equipmentOf(name), max, restSec, sets, notes });
  }
  const sum = Number(val(`C${r}`));
  if (sum !== exercises.reduce((n, e) => n + e.sets.length, 0)) fail(`week ${week} day ${day}: set total ${sum} does not match`);
  let wk = weeks.find((w) => w.week === week);
  if (!wk) weeks.push((wk = { week, days: [] }));
  wk.days.push({ day, exercises });
}

if (weeks.length !== 12 || weeks.some((w, i) => w.week !== i + 1 || w.days.map((d) => d.day).join() !== "1,3,5")) fail("expected 12 weeks of Day 1 / 3 / 5");
const used = new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((e) => e.max))).filter(Boolean));
const unusedMaxes = maxes.filter((m) => !used.has(m.id)).map((m) => m.label);
if (unusedMaxes.length) fail(`maxes never used: ${unusedMaxes.join(", ")}`);

const template: PtTemplate = {
  id: "power-thrash-ii", title: "Power Thrash II",
  credit: POWER_THRASH_CREDIT,
  unit: "lb", roundTo: 5, daysPerWeek: 3, maxes, weeks, fixes,
};
mkdirSync("data/programs", { recursive: true });
writeFileSync(output, JSON.stringify(template, null, 1) + "\n");
const exerciseCount = weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.length, 0), 0);
console.log(`power-thrash: ${weeks.length} weeks, ${weeks.length * 3} sessions, ${exerciseCount} exercises, ${maxes.length} maxes → ${output}`);
console.log(`  ${checked} weights verified against the sheet · ${rebased} rebased · ${unloaded} made unloaded`);
