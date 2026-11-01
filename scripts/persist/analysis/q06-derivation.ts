import type { SectionRow, Slot } from "./lib.ts";
import { mdTable, pct, writeCsv } from "./lib.ts";

const ROLES = ["warmup", "strength-intensity-1", "strength-intensity-2", "strength-balance", "finisher", "conditioning", "cooldown"];

const si1 = (s: Slot) => s.sections.find((x) => x.role === "strength-intensity-1")?.items[0];
const role = (s: Slot, r: string): SectionRow | undefined => s.sections.find((x) => x.role === r);

interface Rel { derived: string; base: string }
const RELATIONS: Rel[] = [
  { derived: "pump-lift-4x", base: "pump-lift-5x" },
  { derived: "pump-lift-3x", base: "pump-lift-5x" },
  { derived: "pump-condition-5x", base: "pump-lift-5x" },
  { derived: "pump-condition-4x", base: "pump-condition-5x" },
  { derived: "pump-condition-3x", base: "pump-condition-5x" },
  { derived: "perform", base: "pump-lift-5x" },
  { derived: "minimalist", base: "pump-lift-5x" },
  { derived: "minimalist", base: "pump-condition-5x" },
];

export function run(slots: Slot[]) {
  const byWeekTrack = new Map<string, Slot[]>();
  for (const s of slots) if (s.sessionType === "training") {
    const k = `${s.weekStart}|${s.track}`;
    (byWeekTrack.get(k) ?? byWeekTrack.set(k, []).get(k)!).push(s);
  }
  const weeks = [...new Set(slots.map((s) => s.weekStart))].sort();
  const blockOf = new Map(slots.map((s) => [s.weekStart, s.block]));

  const summary: (string | number)[][] = [];
  const csvSummary: Record<string, unknown>[] = [];
  const mapRows: Record<string, unknown>[] = [];
  const mapMd: (string | number)[][] = [];

  for (const rel of RELATIONS) {
    let days = 0, sameDay = 0, anyDay = 0, patAny = 0, patSame = 0;
    const roleEq: Record<string, [number, number]> = Object.fromEntries(ROLES.map((r) => [r, [0, 0]]));
    for (const wk of weeks) {
      const d = byWeekTrack.get(`${wk}|${rel.derived}`) ?? [];
      const b = byWeekTrack.get(`${wk}|${rel.base}`) ?? [];
      if (!d.length || !b.length) continue;
      const mapping: string[] = [];
      for (const day of d) {
        days++;
        const x = si1(day);
        const same = b.find((y) => y.day === day.day);
        const matches = b.filter((y) => x?.exId && si1(y)?.exId === x.exId);
        if (same && x?.exId && si1(same)?.exId === x.exId) sameDay++;
        if (same && x?.pattern && si1(same)?.pattern === x.pattern) patSame++;
        if (matches.length) anyDay++;
        else if (x?.pattern && b.some((y) => si1(y)?.pattern === x.pattern)) patAny++;
        const target = matches[0] ?? (x?.pattern ? b.find((y) => si1(y)?.pattern === x.pattern) : undefined);
        mapping.push(`${day.day}=${target ? target.day + (matches.length ? "" : "~") : "-"}`);
        if (target) {
          for (const r of ROLES) {
            const a = role(day, r), c = role(target, r);
            if (a && c) { roleEq[r][1]++; if (a.hash === c.hash) roleEq[r][0]++; }
          }
        }
      }
      mapRows.push({ derived: rel.derived, base: rel.base, block: blockOf.get(wk), weekStart: wk, mapping: mapping.join(" ") });
    }
    // per block: is the mapping constant across the block's observed weeks?
    const perBlock = new Map<number, Set<string>>();
    for (const r of mapRows.filter((x) => x.derived === rel.derived && x.base === rel.base)) {
      (perBlock.get(r.block as number) ?? perBlock.set(r.block as number, new Set()).get(r.block as number)!).add(String(r.mapping));
    }
    const constantBlocks = [...perBlock.values()].filter((v) => v.size === 1).length;
    summary.push([rel.derived, rel.base, days, `${sameDay} (${pct(sameDay, days)})`, `${anyDay} (${pct(anyDay, days)})`, `${patAny} (${pct(patAny, days)})`, `${constantBlocks}/${perBlock.size}`]);
    csvSummary.push({ derived: rel.derived, base: rel.base, days, sameDay, sameLiftAnyDay: anyDay, samePatternOnly: patAny, blocksWithConstantMapping: constantBlocks, blocks: perBlock.size, ...Object.fromEntries(ROLES.map((r) => [`eq_${r}`, `${roleEq[r][0]}/${roleEq[r][1]}`])) });
    if (["pump-lift-4x", "pump-lift-3x"].includes(rel.derived) || (rel.derived === "pump-condition-5x")) {
      for (const [bl, v] of [...perBlock].sort((a, b) => a[0] - b[0])) mapMd.push([rel.derived, bl, v.size === 1 ? [...v][0] : `${v.size} variants: ${[...v].slice(0, 2).join(" / ")}`]);
    }
  }
  writeCsv("q06-derivation-summary", csvSummary);
  writeCsv("q06-derivation-mapping", mapRows);

  const eqRows = csvSummary.map((r) => [r.derived as string, r.base as string, ...ROLES.map((x) => String(r[`eq_${x}`]))]);
  const md = [
    "## 6. Track derivation",
    "",
    "Each training day of a derived track is matched to a base-track day in the same week by its strength-intensity-1 lift (exact exercise), else by pattern (marked `~`). Full week-by-week mappings: `analysis/q06-derivation-mapping.csv`.",
    "",
    mdTable(summary as string[][], ["Derived", "Base", "Training days", "Same lift, same day number", "Same lift, any day", "Same pattern only", "Blocks with one constant mapping"]),
    "",
    "Where a day is matched, how often each section is *identical* (content hash) to its counterpart:",
    "",
    mdTable(eqRows as string[][], ["Derived", "Base", ...ROLES]),
    "",
    "Which base day each derived day copies, by block (`derived day = base day`):",
    "",
    mdTable(mapMd as string[][], ["Derived", "Block", "Mapping"]),
  ].join("\n");
  const blockMaps = [...new Set(mapRows.map((r) => `${r.derived}|${r.base}|${r.block}`))].map((k) => {
    const [derived, base, block] = k.split("|");
    const maps = [...new Set(mapRows.filter((r) => r.derived === derived && r.base === base && String(r.block) === block).map((r) => String(r.mapping)))];
    return { derived, base, block: Number(block), mappings: maps };
  });
  return { md, csvSummary, blockMaps };
}
