import type { Slot } from "./lib.ts";
import { mdTable, writeCsv } from "./lib.ts";

const PATTERNS = ["squat", "hinge", "lunge-single-leg", "horizontal-press", "vertical-press", "horizontal-pull", "vertical-pull", "carry", "core", "isolation-arms", "isolation-shoulders", "isolation-legs", "olympic", "plyometric"];

/**
 * Hard sets are the working sets of strength-intensity slots, plus the prescribed sets of each
 * movement in a strength-balance or finisher superset (a range such as 2-3 sets gives a min and a max).
 * Warm-ups, conditioning pieces, cooldowns and mobility are not counted.
 */
export function run(slots: Slot[]) {
  const perWeek = new Map<string, { track: string; block: number; week: number; min: Record<string, number>; max: Record<string, number>; unresolved: number }>();
  for (const s of slots) {
    if (s.sessionType !== "training") continue;
    const k = `${s.track}|${s.block}|${s.week}`;
    const w = perWeek.get(k) ?? { track: s.track, block: s.block, week: s.week, min: {}, max: {}, unresolved: 0 };
    for (const sec of s.sections) {
      for (const it of sec.items) {
        let lo = 0, hi = 0;
        if (sec.role.startsWith("strength-intensity")) {
          lo = hi = it.sets.filter((x) => x.kind === "working").length;
        } else if (sec.role === "strength-balance" || sec.role === "finisher") {
          if (sec.items.length < 2 && !sec.scheme.setsMin) continue;
          lo = Number(sec.scheme.setsMin ?? 0);
          hi = Number(sec.scheme.setsMax ?? lo);
        } else continue;
        const p = it.pattern;
        if (!p) { w.unresolved += hi; continue; }
        w.min[p] = (w.min[p] ?? 0) + lo;
        w.max[p] = (w.max[p] ?? 0) + hi;
      }
    }
    perWeek.set(k, w);
  }
  const csv: Record<string, unknown>[] = [];
  for (const w of perWeek.values()) {
    for (const p of PATTERNS) if (w.min[p] || w.max[p]) csv.push({ track: w.track, block: w.block, week: w.week, pattern: p, hardSetsMin: w.min[p] ?? 0, hardSetsMax: w.max[p] ?? 0 });
    if (w.unresolved) csv.push({ track: w.track, block: w.block, week: w.week, pattern: "(unresolved pattern)", hardSetsMin: "", hardSetsMax: w.unresolved });
  }
  writeCsv("q09-weekly-volume", csv);

  // Average per week per track.
  const tracks = [...new Set([...perWeek.values()].map((w) => w.track))].sort();
  const rows = PATTERNS.map((p) => {
    const cells = tracks.map((t) => {
      const ws = [...perWeek.values()].filter((w) => w.track === t);
      const lo = ws.reduce((n, w) => n + (w.min[p] ?? 0), 0) / ws.length;
      const hi = ws.reduce((n, w) => n + (w.max[p] ?? 0), 0) / ws.length;
      return lo === 0 && hi === 0 ? "-" : lo === hi ? lo.toFixed(1) : `${lo.toFixed(1)}-${hi.toFixed(1)}`;
    });
    return [p, ...cells];
  });
  const unres = tracks.map((t) => {
    const ws = [...perWeek.values()].filter((w) => w.track === t);
    return (ws.reduce((n, w) => n + w.unresolved, 0) / ws.length).toFixed(1);
  });
  rows.push(["(unresolved pattern)", ...unres]);
  const md = [
    "## 9. Weekly volume",
    "",
    "Average hard sets per movement pattern per observed week, by track (min-max where the prescription is a range such as 2-3 sets). Counted: working sets of strength-intensity 1 and 2 plus the prescribed sets of each movement in strength-balance and finisher supersets. Not counted: warm-ups, conditioning pieces, mobility. Per-week values by block: `analysis/q09-weekly-volume.csv`. The last row is volume on exercises whose pattern is still unresolved.",
    "",
    mdTable(rows as string[][], ["Pattern", ...tracks]),
  ].join("\n");
  const avg = (t: string, p: string) => { const ws = [...perWeek.values()].filter((w) => w.track === t); return [ws.reduce((n, w) => n + (w.min[p] ?? 0), 0) / ws.length, ws.reduce((n, w) => n + (w.max[p] ?? 0), 0) / ws.length]; };
  return { md, avg, tracks, unresolvedPerWeek: (t: string) => { const ws = [...perWeek.values()].filter((w) => w.track === t); return ws.reduce((n, w) => n + w.unresolved, 0) / ws.length; } };
}
