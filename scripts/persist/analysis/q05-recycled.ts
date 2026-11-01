import type { Slot } from "./lib.ts";
import { mdTable, pct, writeCsv } from "./lib.ts";

const GROUPS: Record<string, string[]> = {
  "recovery days (active recovery work)": ["active-recovery"],
  "recovery mobility sessions": ["mobility"],
  cooldowns: ["cooldown"],
  warmups: ["warmup"],
  "conditioning, finishers, hot starts": ["conditioning", "finisher", "hot-start", "speed-strength"],
  "strength balance": ["strength-balance"],
  "strength intensity 1 and 2": ["strength-intensity-1", "strength-intensity-2"],
};

export function run(slots: Slot[]) {
  const weekIdx = new Map<string, number>();
  const rows: (string | number)[][] = [];
  const csv: Record<string, unknown>[] = [];
  for (const [label, roles] of Object.entries(GROUPS)) {
    // hash -> distinct weeks and blocks it appears in
    const h = new Map<string, { weeks: Set<string>; blocks: Set<number> }>();
    for (const s of slots) for (const sec of s.sections) if (roles.includes(sec.role)) {
      const e = h.get(sec.hash) ?? { weeks: new Set(), blocks: new Set() };
      e.weeks.add(s.weekStart);
      e.blocks.add(s.block);
      h.set(sec.hash, e);
    }
    const hashWeekPairs = [...h.values()].reduce((n, e) => n + e.weeks.size, 0);
    const repeats = hashWeekPairs - h.size;
    const multiWeek = [...h.values()].filter((e) => e.weeks.size > 1).length;
    const multiBlock = [...h.values()].filter((e) => e.blocks.size > 1).length;
    const maxWeeks = Math.max(...[...h.values()].map((e) => e.weeks.size));
    rows.push([label, h.size, hashWeekPairs, `${multiWeek} (${pct(multiWeek, h.size)})`, `${multiBlock} (${pct(multiBlock, h.size)})`, pct(repeats, hashWeekPairs), maxWeeks]);
    csv.push({ group: label, distinctSections: h.size, sectionWeekAppearances: hashWeekPairs, inMoreThanOneWeek: multiWeek, inMoreThanOneBlock: multiBlock, repeatShare: repeats / hashWeekPairs, maxWeeksOneSection: maxWeeks });
    void weekIdx;
  }
  writeCsv("q05-recycled-summary", csv);

  // Whole sessions: distinct sessions seen in more than one week, by session type.
  const sess = new Map<number, { type: string; weeks: Set<string>; blocks: Set<number>; tracks: Set<string> }>();
  for (const s of slots) {
    const e = sess.get(s.sessionId) ?? { type: s.sessionType, weeks: new Set(), blocks: new Set(), tracks: new Set() };
    e.weeks.add(s.weekStart); e.blocks.add(s.block); e.tracks.add(s.track);
    sess.set(s.sessionId, e);
  }
  const srows: (string | number)[][] = [];
  for (const type of ["training", "recovery", "note"]) {
    const list = [...sess.values()].filter((e) => e.type === type);
    const multi = list.filter((e) => e.weeks.size > 1).length;
    const multiTrack = list.filter((e) => e.tracks.size > 1).length;
    srows.push([type, list.length, `${multi} (${pct(multi, list.length)})`, `${multiTrack} (${pct(multiTrack, list.length)})`, Math.max(...list.map((e) => e.weeks.size))]);
  }

  const md = [
    "## 5. Recycled content",
    "",
    "Sections are compared by content hash (exercises, sets, reps, tempo, rest, format; not prose). An appearance is a distinct week, so the same section shared by several tracks in one week counts once. Per-hash detail (weeks, blocks, tracks, first and last date): `analysis/q05-recycled-sections.csv`.",
    "",
    mdTable(rows as string[][], ["Group", "Distinct sections", "Week appearances", "In 2+ weeks", "In 2+ blocks", "Share of appearances that repeat", "Most weeks for one section"]),
    "",
    "Whole sessions (a session is shared across tracks when its hash matches; prose such as the focus note counts only by topic):",
    "",
    mdTable(srows as string[][], ["Type", "Distinct sessions", "In 2+ weeks", "In 2+ tracks", "Most weeks"]),
  ].join("\n");
  return { md, rows: csv, sessions: srows };
}
