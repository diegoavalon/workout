import type { ItemRow, Slot } from "./lib.ts";
import { mdTable, pct, writeCsv } from "./lib.ts";

export type Shape = "ramp-down" | "flat" | "max-ending" | "ramp-then-max" | "other";

export interface WeekScheme {
  block: number; week: number; track: string; day: number; role: string; exercise: string | null;
  workingSets: number; reps: string; rpe: string; tempo: string | null; shape: Shape; firstReps: number | null; warmups: number; rest: string;
}

function shapeOf(reps: (number | "max")[]): Shape {
  const last = reps[reps.length - 1];
  const nums = reps.filter((r): r is number => r !== "max");
  const endsMax = last === "max";
  const flat = nums.every((r) => r === nums[0]);
  const ramp = nums.every((r, i) => i === 0 || r < nums[i - 1]);
  if (endsMax) return nums.length > 1 && flat ? "max-ending" : "ramp-then-max";
  if (nums.length === 1) return "flat";
  if (flat) return "flat";
  if (ramp) return "ramp-down";
  return "other";
}

export function schemes(slots: Slot[]): WeekScheme[] {
  const out: WeekScheme[] = [];
  for (const s of slots) {
    if (s.sessionType !== "training") continue;
    for (const sec of s.sections) {
      if (!sec.role.startsWith("strength-intensity")) continue;
      const it: ItemRow | undefined = sec.items[0];
      if (!it) continue;
      const working = it.sets.filter((x) => x.kind === "working");
      if (!working.length) continue;
      const reps = working.map((x) => (x.repsType === "max" ? "max" : x.repsMax ?? x.repsMin ?? 0) as number | "max");
      out.push({
        block: s.block, week: s.week, track: s.track, day: s.day, role: sec.role, exercise: it.exName,
        workingSets: working.length, reps: reps.join("/"), rpe: working.map((x) => x.rpeMin ?? "-").join("/"),
        tempo: it.tempo, shape: shapeOf(reps), firstReps: typeof reps[0] === "number" ? reps[0] : null,
        warmups: it.sets.filter((x) => x.kind === "warmup").length,
        rest: it.restMin != null ? `${it.restMin}-${it.restMax}s` : "",
      });
    }
  }
  return out;
}

export function run(slots: Slot[]) {
  const all = schemes(slots);
  writeCsv("q04-progression-by-slot-week", all as unknown as Record<string, unknown>[]);

  // Wave behaviour for the first strength slot of Pump Lift 5x, per (block, day).
  const seqs = new Map<string, WeekScheme[]>();
  for (const w of all.filter((x) => x.role === "strength-intensity-1")) {
    const k = `${w.track}|${w.block}|${w.day}`;
    (seqs.get(k) ?? seqs.set(k, []).get(k)!).push(w);
  }
  const heavyByBlock = new Map<string, number>();
  const heavyCount = { odd: 0, even: 0 };
  let splitTotal = 0, splitConsistent = 0;
  let seqCount = 0, alternates = 0, descendWithin = 0, tempoFixed = 0, setsFixed = 0, rpeStd = 0, rpeTot = 0;
  const wavePairs: Record<string, unknown>[] = [];
  const stepStats: number[] = [];
  for (const [k, list] of seqs) {
    list.sort((a, b) => a.week - b.week);
    if (list.length < 4) continue;
    seqCount++;
    const isRamp = (x: WeekScheme) => x.shape === "ramp-down";
    const alt = list.every((x, i) => i === 0 || isRamp(x) !== isRamp(list[i - 1]));
    if (alt) alternates++;
    for (const parity of [0, 1]) {
      const wave = list.filter((x) => x.week % 2 === parity && x.firstReps !== null);
      for (let i = 1; i < wave.length; i++) stepStats.push(wave[i].firstReps! - wave[i - 1].firstReps!);
    }
    const monotone = [0, 1].every((p) => {
      const w = list.filter((x) => x.week % 2 === p && x.firstReps !== null);
      return w.every((x, i) => i === 0 || x.firstReps! <= w[i - 1].firstReps!);
    });
    if (monotone) descendWithin++;
    const odd = list.filter((x) => x.week % 2 === 1 && x.firstReps !== null).map((x) => x.firstReps!);
    const even = list.filter((x) => x.week % 2 === 0 && x.firstReps !== null).map((x) => x.firstReps!);
    if (odd.length >= 2 && even.length >= 2) {
      splitTotal++;
      const oddAbove = Math.min(...odd) > Math.max(...even);
      const evenAbove = Math.min(...even) > Math.max(...odd);
      if (oddAbove || evenAbove) splitConsistent++;
      const heavyParity = oddAbove ? "odd weeks" : evenAbove ? "even weeks" : null;
      if (heavyParity) {
        // the lower-rep parity is the heavier wave
        const key = `${k.split("|")[1]}`;
        const heavier = oddAbove ? "even" : "odd";
        heavyByBlock.set(`${key}:${heavier}`, (heavyByBlock.get(`${key}:${heavier}`) ?? 0) + 1);
        heavyCount[heavier]++;
      }
    }
    if (new Set(list.map((x) => x.tempo)).size <= 2) tempoFixed++;
    if (new Set(list.map((x) => x.workingSets)).size === 1) setsFixed++;
    for (const x of list) { rpeTot++; if (/^7\/8\/9/.test(x.rpe)) rpeStd++; }
    wavePairs.push({ key: k, weeks: list.length, sequence: list.map((x) => `W${x.week}:${x.shape}:${x.reps}`).join(" ") });
  }
  writeCsv("q04-wave-sequences", wavePairs);

  const stepDist = new Map<number, number>();
  for (const d of stepStats) stepDist.set(d, (stepDist.get(d) ?? 0) + 1);

  // Week-number view: reps scheme distribution across all blocks, per track family and week.
  const byWeek = new Map<number, Map<string, number>>();
  for (const w of all.filter((x) => x.role === "strength-intensity-1" && x.track === "pump-lift-5x")) {
    const m = byWeek.get(w.week) ?? new Map<string, number>();
    const key = `${w.shape} ${w.reps}`;
    m.set(key, (m.get(key) ?? 0) + 1);
    byWeek.set(w.week, m);
  }
  const weekRows = [...byWeek].sort((a, b) => a[0] - b[0]).map(([wk, m]) => [wk, [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${s} (${n})`).join("<br>")]);

  const shapeByParity = new Map<string, number>();
  for (const w of all.filter((x) => x.role === "strength-intensity-1")) {
    const k = `week ${w.week % 2 ? "odd" : "even"}: ${w.shape}`;
    shapeByParity.set(k, (shapeByParity.get(k) ?? 0) + 1);
  }

  const md = [
    "## 4. Progression curves",
    "",
    "Per slot and week (`analysis/q04-progression-by-slot-week.csv`) the working-set reps, RPE, tempo and shape of the first exercise in each strength-intensity slot.",
    "",
    `Strength-intensity-1 sequences of 4+ observed weeks: ${seqCount} (a sequence is one track, block and day).`,
    "",
    mdTable(
      [
        ["Shape strictly alternates ramp-down / not ramp-down week to week", `${alternates}/${seqCount}`, pct(alternates, seqCount)],
        ["One week parity always opens with more reps than the other (two interleaved waves)", `${splitConsistent}/${splitTotal}`, pct(splitConsistent, splitTotal)],
        ["Opening reps never increase within the same-parity weeks", `${descendWithin}/${seqCount}`, pct(descendWithin, seqCount)],
        ["Working-set count is constant across the block", `${setsFixed}/${seqCount}`, pct(setsFixed, seqCount)],
        ["At most two tempos used in the block", `${tempoFixed}/${seqCount}`, pct(tempoFixed, seqCount)],
        ["Weeks whose RPE starts 7/8/9", `${rpeStd}/${rpeTot}`, pct(rpeStd, rpeTot)],
      ],
      ["Property", "Held", "%"],
    ),
    "",
    `Change in opening reps between same-parity weeks (two weeks apart): ${[...stepDist].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, n]) => `${d > 0 ? "+" : ""}${d} reps (${n})`).join(", ")}.`,
    "",
    `Where the two waves separate, the heavier (fewer opening reps) wave fell on odd weeks in ${heavyCount.odd} sequences and on even weeks in ${heavyCount.even}. By block: ${[...heavyByBlock].sort().map(([k, n]) => `block ${k} (${n})`).join(", ")}.`,
    "",
    "Shape of strength-intensity-1 by week parity (all tracks): " + [...shapeByParity].sort().map(([k, n]) => `${k} (${n})`).join("; ") + ".",
    "",
    "Pump Lift 5x, scheme by week number across blocks (top four, count of slots):",
    "",
    mdTable(weekRows as string[][], ["Week", "Shape and working-set reps"]),
  ].join("\n");
  return { md, all, stats: { seqCount, alternates, descendWithin, setsFixed, tempoFixed, rpeStd, rpeTot, splitConsistent, splitTotal, heavyCount, stepDist: [...stepDist] } };
}
