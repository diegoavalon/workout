import type { Slot } from "./lib.ts";
import { PL, mdTable, pct, writeCsv } from "./lib.ts";

const CORE = ["squat", "hinge", "lunge-single-leg", "horizontal-press", "vertical-press", "horizontal-pull", "vertical-pull"];
const ROLES = ["strength-intensity-1", "strength-intensity-2"];

export function run(slots: Slot[]) {
  const long: Record<string, unknown>[] = [];
  const weekly = new Map<string, { block: number; week: number; track: string; patterns: string[] }>();
  for (const s of slots) {
    if (s.sessionType !== "training") continue;
    for (const sec of s.sections) {
      if (!ROLES.includes(sec.role)) continue;
      for (const it of sec.items) {
        const pattern = it.pattern ?? (it.exName ? `unresolved:${it.exName}` : "none");
        long.push({ block: s.block, week: s.week, weekStart: s.weekStart, track: s.track, day: s.day, role: sec.role, exercise: it.exName, pattern: it.pattern ?? "" });
        const k = `${s.block}|${s.week}|${s.track}`;
        const w = weekly.get(k) ?? { block: s.block, week: s.week, track: s.track, patterns: [] };
        w.patterns.push(pattern);
        weekly.set(k, w);
      }
    }
  }
  writeCsv("q02-slot-fill", long);

  // Is each core pattern covered exactly once per week by the strength slots?
  const rows: (string | number)[][] = [];
  const csvRows: Record<string, unknown>[] = [];
  for (const track of PL.concat(["pump-condition-5x", "perform", "minimalist"])) {
    const weeks = [...weekly.values()].filter((w) => w.track === track);
    for (const p of CORE) {
      const counts = weeks.map((w) => w.patterns.filter((x) => x === p).length);
      const once = counts.filter((c) => c === 1).length;
      const some = counts.filter((c) => c >= 1).length;
      const multi = counts.filter((c) => c >= 2).length;
      csvRows.push({ track, pattern: p, weeks: weeks.length, atLeastOnce: some, exactlyOnce: once, twiceOrMore: multi });
      if (track === "pump-lift-5x" || track === "pump-lift-3x") rows.push([track, p, `${some}/${weeks.length}`, `${once}/${weeks.length}`, pct(once, weeks.length), `${multi}`]);
    }
    const unresolved = weeks.filter((w) => w.patterns.some((x) => x.startsWith("unresolved:"))).length;
    csvRows.push({ track, pattern: "(unresolved)", weeks: weeks.length, atLeastOnce: unresolved, exactlyOnce: "", twiceOrMore: "" });
  }
  writeCsv("q02-pattern-coverage", csvRows);

  // The weekly pattern layout per Pump Lift 5x day.
  const dayLayout = new Map<string, Map<string, number>>();
  for (const s of slots.filter((x) => x.track === "pump-lift-5x" && x.sessionType === "training")) {
    const key = `day ${s.day}`;
    const si1 = s.sections.find((x) => x.role === "strength-intensity-1")?.items[0];
    const si2 = s.sections.find((x) => x.role === "strength-intensity-2")?.items[0];
    const lay = `${si1?.pattern ?? "unresolved"}${si2 ? " + " + (si2.pattern ?? "unresolved") : ""}`;
    const m = dayLayout.get(key) ?? new Map<string, number>();
    m.set(lay, (m.get(lay) ?? 0) + 1);
    dayLayout.set(key, m);
  }
  const layoutRows = [...dayLayout].sort().map(([d, m]) => [d, [...m].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join("<br>")]);
  const md = [
    "## 2. Slot fill",
    "",
    "Every strength-intensity slot with its exercise and pattern is in `analysis/q02-slot-fill.csv` (block × week × track × day × role).",
    "",
    "Pattern coverage per week for the core patterns (strength-intensity 1 and 2 only; full table in `q02-pattern-coverage.csv`):",
    "",
    mdTable(rows as string[][], ["Track", "Pattern", "Weeks covered at least once", "Exactly once", "%", "2+ times"]),
    "",
    "Pump Lift 5x, what fills each training day (strength-intensity 1 + 2), across all weeks:",
    "",
    mdTable(layoutRows as string[][], ["Day", "Pattern layout (weeks)"]),
  ].join("\n");
  return { md, csvRows, dayLayout };
}
