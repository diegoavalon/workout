import type { Slot } from "./lib.ts";
import { PL, mdTable, pct, writeCsv } from "./lib.ts";

type Kind = "fixed" | "alternating-AB" | "rotating" | "too-few-weeks";
const ROLES = ["strength-intensity-1", "strength-intensity-2", "strength-balance", "finisher"];

function classify(seq: { week: number; ex: string }[]): { kind: Kind; distinct: number } {
  const distinct = new Set(seq.map((s) => s.ex)).size;
  if (seq.length < 3) return { kind: "too-few-weeks", distinct };
  if (distinct === 1) return { kind: "fixed", distinct };
  const odd = new Set(seq.filter((s) => s.week % 2 === 1).map((s) => s.ex));
  const even = new Set(seq.filter((s) => s.week % 2 === 0).map((s) => s.ex));
  if (odd.size === 1 && even.size === 1 && distinct === 2) return { kind: "alternating-AB", distinct };
  return { kind: "rotating", distinct };
}

export function run(slots: Slot[]) {
  // Slot key = block, track, day, role, item position. Exercise key falls back to the raw name.
  const seqs = new Map<string, { block: number; track: string; day: number; role: string; pos: number; seq: { week: number; ex: string }[] }>();
  for (const s of slots) {
    if (s.sessionType !== "training") continue;
    for (const sec of s.sections) {
      if (!ROLES.includes(sec.role)) continue;
      sec.items.forEach((it, i) => {
        const ex = it.exId ?? it.nameRaw ?? "?";
        const k = `${s.block}|${s.track}|${s.day}|${sec.role}|${i}`;
        const e = seqs.get(k) ?? { block: s.block, track: s.track, day: s.day, role: sec.role, pos: i, seq: [] };
        e.seq.push({ week: s.week, ex });
        seqs.set(k, e);
      });
    }
  }
  const out: Record<string, unknown>[] = [];
  for (const e of seqs.values()) {
    const c = classify(e.seq);
    out.push({ block: e.block, track: e.track, day: e.day, role: e.role, item: e.pos + 1, weeks: e.seq.length, kind: c.kind, distinct: c.distinct, sequence: e.seq.map((x) => `${x.week}:${x.ex}`).join(" ") });
  }
  writeCsv("q03-rotation-by-slot", out);

  const tally = (track: string, role: string) => {
    const r = out.filter((x) => x.track === track && x.role === role && x.item === 1 && x.kind !== "too-few-weeks");
    const by = (k: Kind) => r.filter((x) => x.kind === k).length;
    return [track, role.replace("strength-", "S-"), r.length, `${by("alternating-AB")} (${pct(by("alternating-AB"), r.length)})`, `${by("fixed")} (${pct(by("fixed"), r.length)})`, `${by("rotating")} (${pct(by("rotating"), r.length)})`];
  };
  const rows = [] as (string | number)[][];
  for (const t of PL.slice(0, 1).concat(["pump-condition-5x", "perform", "minimalist"])) for (const r of ROLES) { const row = tally(t, r); if (row[2] !== 0) rows.push(row); }

  // What repeats from block to block: share of each block's strength exercises that appeared in the previous block / any earlier block.
  const poolByBlock = new Map<number, Set<string>>();
  for (const s of slots) {
    if (s.track !== "pump-lift-5x") continue;
    for (const sec of s.sections) if (sec.role.startsWith("strength-intensity")) for (const it of sec.items) if (it.exId) {
      (poolByBlock.get(s.block) ?? poolByBlock.set(s.block, new Set()).get(s.block)!).add(it.exId);
    }
  }
  const blocks = [...poolByBlock.keys()].sort((a, b) => a - b);
  const carry: (string | number)[][] = [];
  const carryCsv: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const pool = poolByBlock.get(b)!;
    const prev = poolByBlock.get(b - 1);
    const inPrev = prev ? [...pool].filter((x) => prev.has(x)).length : 0;
    const inAny = [...pool].filter((x) => seen.has(x)).length;
    carry.push([b, pool.size, prev ? `${inPrev} (${pct(inPrev, pool.size)})` : "-", b === blocks[0] ? "-" : `${inAny} (${pct(inAny, pool.size)})`]);
    carryCsv.push({ block: b, exercises: pool.size, inPreviousBlock: prev ? inPrev : "", inAnyEarlierBlock: b === blocks[0] ? "" : inAny });
    pool.forEach((x) => seen.add(x));
  }
  writeCsv("q03-block-carryover", carryCsv);

  // Same slot, next block: does the day/role keep the same exercise?
  let same = 0, total = 0;
  const first = new Map<string, string>();
  for (const e of [...seqs.values()].filter((x) => x.track === "pump-lift-5x" && x.pos === 0).sort((a, b) => a.block - b.block)) {
    const k = `${e.day}|${e.role}`;
    const mainEx = e.seq[0].ex;
    if (first.has(k)) { total++; if (first.get(k) === mainEx) same++; }
    first.set(k, mainEx);
  }

  const md = [
    "## 3. Variation rotation",
    "",
    "For each slot (block, track, day, role) the exercise is followed week by week (`analysis/q03-rotation-by-slot.csv`). A slot is *alternating-AB* when odd weeks share one exercise, even weeks share another, and there are exactly two; *fixed* when one exercise runs all block; *rotating* otherwise. Slots with fewer than 3 observed weeks are excluded. First item of each slot:",
    "",
    mdTable(rows as string[][], ["Track", "Role", "Slots", "Alternating AB", "Fixed", "Rotating"]),
    "",
    "Carry-over of Pump Lift 5x strength exercises between blocks:",
    "",
    mdTable(carry as string[][], ["Block", "Exercises used", "Also in previous block", "Also in any earlier block"]),
    "",
    `Same day and role, next block: the main lift was identical in ${same} of ${total} cases (${pct(same, total)}).`,
  ].join("\n");
  return { md, out, same, total };
}
