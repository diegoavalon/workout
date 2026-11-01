import type { TrackId } from "./schema.ts";
import type { WeekView } from "./views.ts";
import { weekView } from "./views.ts";

// Block generator. It remixes what the program has already published: every choice is sampled from
// observed material and recombined under the rules measured in data/reports/analysis.md.
//
//  - Layout:   which patterns fill each day's strength slots is sampled from observed blocks, then
//              the best of many draws is kept so the week covers the core patterns.
//  - Variation: each main-lift slot gets an A/B pair (odd weeks / even weeks) taken from an
//              observed alternating slot with the same pattern.
//  - Progression: the six-week sets/reps/RPE/tempo sequence is copied from a different observed slot
//              of the same pattern and role.
//  - Supporting sections: balance, finisher, conditioning, warm-up, cooldown and recovery sessions
//              are sampled from observed sessions that share the day's main-lift pattern.
//  - 4x / 3x:  a subset of the 5x days that keeps the most patterns, in 5x order.

type Day = WeekView["days"][number];
type Sec = Day["sections"][number];
type Item = Sec["items"][number];
type Exercise = NonNullable<Item["exercise"]>;

export interface GenerateOptions {
  track: TrackId;
  seed: number;
  /** ISO Monday of week 1. */
  startDate: string;
  /** Equipment you have; omit for no restriction. "bodyweight" is always allowed. */
  equipment?: string[];
  /** Avoid main lifts used in the most recent observed block. Default true. */
  avoidRecent?: boolean;
  weeks?: number;
}

export interface Check {
  name: string;
  /** pass: the rule holds. warn: it does not and a person should look. info: a measurement, not a rule. */
  status: "pass" | "warn" | "info";
  detail: string;
}

export interface Generated {
  options: GenerateOptions;
  weeks: WeekView[];
  /** Automatic checks of the finished block against the rules the program follows. */
  checks: Check[];
  /** What was chosen and where it came from, for review. */
  plan: PlanDay[];
  warnings: string[];
}

export interface PlanDay {
  baseDay: number;
  day: number | null;
  main: { pattern: string; a: string; b: string; schemeFrom: string };
  secondary: { pattern: string; a: string; b: string; schemeFrom: string } | null;
}

// ---------------------------------------------------------------------------
// Small utilities

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const pick = <T>(xs: T[], r: Rand): T => xs[Math.floor(r() * xs.length)];
const shuffle = <T>(xs: T[], r: Rand): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function equipmentOk(tags: string[], allowed?: Set<string>): boolean {
  if (!allowed) return true;
  return tags.every((t) => t === "bodyweight" || allowed.has(t) || (t === "dumbbell-or-kettlebell" && (allowed.has("dumbbell") || allowed.has("kettlebell"))));
}
const sectionOk = (s: Sec, allowed?: Set<string>) => s.items.every((i) => !i.exercise || equipmentOk(i.exercise.equipment, allowed));

const CORE = ["squat", "hinge", "horizontal-press", "vertical-press", "horizontal-pull", "vertical-pull", "lunge-single-leg"];
/** How much a week misses a pattern; squat and hinge are covered most reliably in the 3x tracks. */
const WEIGHT: Record<string, number> = { squat: 3, hinge: 3, "horizontal-press": 2, "vertical-press": 2, "horizontal-pull": 2, "vertical-pull": 1, "lunge-single-leg": 1 };
const coverage = (patterns: (string | null)[]) => {
  const have = new Set(patterns.filter(Boolean) as string[]);
  return CORE.reduce((n, p) => n + (have.has(p) ? WEIGHT[p] : 0), 0);
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const LETTERS = "ABCDEFGH";

/**
 * Pattern coverage the published program shows for a Pump Lift week: 5x and 4x cover squat, hinge, both presses and a
 * horizontal pull; 3x covers squat every week and three of squat, hinge and the two presses (the other patterns are
 * missed in 10-25% of published 3x weeks).
 */
export function coverageProblems(family: string, freq: number, covered: Set<string>): string[] {
  if (family !== "pump-lift") return [];
  if (freq === 3) {
    const four = ["squat", "hinge", "horizontal-press", "vertical-press"].filter((p) => !covered.has(p));
    return !covered.has("squat") || four.length > 1 ? four : [];
  }
  return ["squat", "hinge", "horizontal-press", "vertical-press", "horizontal-pull"].filter((p) => !covered.has(p));
}

// ---------------------------------------------------------------------------
// Corpus index

interface SlotSeq { block: number; day: number; role: string; secs: Sec[]; pattern: string; exercises: string[] }
interface DonorDay { track: string; block: number; week: number; day: Day; mainPattern: string | null }

class Index {
  complete = new Map<string, Map<number, WeekView[]>>(); // track -> block -> six weeks
  days: DonorDay[] = [];
  lastBlock = new Map<string, number>();
  readonly weeks: WeekView[];
  constructor(weeks: WeekView[]) {
    this.weeks = weeks;
    const byTB = new Map<string, WeekView[]>();
    for (const w of weeks) {
      const k = `${w.track}|${w.block.id}`;
      (byTB.get(k) ?? byTB.set(k, []).get(k)!).push(w);
      for (const d of w.days) this.days.push({ track: w.track, block: w.block.id, week: w.block.weekNumber, day: d, mainPattern: d.headline.mainLift?.pattern ?? null });
      this.lastBlock.set(w.track, Math.max(this.lastBlock.get(w.track) ?? 0, w.block.id));
    }
    for (const [k, ws] of byTB) {
      const [track, block] = [k.split("|")[0], Number(k.split("|")[1])];
      const nums = new Set(ws.map((w) => w.block.weekNumber));
      if ([1, 2, 3, 4, 5, 6].every((n) => nums.has(n))) {
        (this.complete.get(track) ?? this.complete.set(track, new Map()).get(track)!).set(block, ws.sort((a, b) => a.block.weekNumber - b.block.weekNumber));
      }
    }
  }

  slotSeqs(track: string, role: string): SlotSeq[] {
    const out: SlotSeq[] = [];
    for (const [block, ws] of this.complete.get(track) ?? []) {
      const dayNums = new Set(ws.flatMap((w) => w.days.map((d) => d.day)));
      for (const day of dayNums) {
        const secs = ws.map((w) => w.days.find((d) => d.day === day)?.sections.find((s) => s.role === role));
        // Giant-set and every-N-minutes strength sections have no per-set ramp to copy, so they are not donors.
        if (secs.some((s) => !s || !s.items[0] || s.items[0].sets.filter((x) => x.kind === "working").length < 2)) continue;
        const ss = secs as Sec[];
        out.push({ block, day, role, secs: ss, pattern: ss[0].items[0].exercise?.pattern ?? "", exercises: ss.map((s) => s.items[0].exercise?.id ?? s.items[0].nameRaw ?? "") });
      }
    }
    return out;
  }

  /** Training days of a track whose main lift has the given pattern. */
  daysFor(track: string, pattern: string | null): DonorDay[] {
    return this.days.filter((d) => d.track === track && d.day.type === "training" && (pattern === null || d.mainPattern === pattern));
  }
}

// ---------------------------------------------------------------------------
// Generation

interface PairPool { pattern: string; a: Item; b: Item; from: string }
interface Scheme { sets: Item["sets"]; tempo: string | null; restSec: Item["restSec"]; minutes: Sec["minutes"]; title: string; scheme: Sec["scheme"]; from: string }

function isAlternating(ex: string[]): boolean {
  const odd = new Set(ex.filter((_, i) => i % 2 === 0));
  const even = new Set(ex.filter((_, i) => i % 2 === 1));
  return odd.size === 1 && even.size === 1 && [...odd][0] !== [...even][0];
}

export function renderStrength(title: string, items: Item[], schemeLines: string[], minutes: Sec["minutes"]): string {
  const m = minutes ? ` (${minutes[0] === minutes[1] ? minutes[0] : `${minutes[0]}-${minutes[1]}`} min)` : "";
  const lines = [`${title.replace(/\s*\(.*$/, "")}${m}:`];
  for (const it of items) {
    lines.push(it.exercise?.name ?? it.nameRaw ?? "");
    for (const l of schemeLines) lines.push(l);
    for (const s of it.sets) {
      const reps = s.repsType === "max" ? "Max reps" : `${s.repsMin}${s.repsMax !== s.repsMin ? `-${s.repsMax}` : ""} reps${it.perSide ? "/side" : ""}`;
      const label = s.kind === "warmup" ? "Warm-Up Set" : "Working Set";
      lines.push(`${label} - ${reps}${it.tempo ? ` @${it.tempo} Tempo` : ""}${s.rpeMin != null ? ` - RPE ${s.rpeMin}` : s.effort ? ` - ${s.effort}` : ""}`);
    }
  }
  return lines.join("\n");
}

const STRAY_WEEK = /^\s*Week \d+:?\s*$/m;
const LOWER_MAINS = new Set(["squat", "hinge", "lunge-single-leg"]);
const LOWER_OR_TRUNK = new Set(["squat", "hinge", "lunge-single-leg", "isolation-legs", "core", "carry", "olympic", "plyometric"]);
const mobilityTopic = (d: Day) => (d.sections.find((x) => x.role === "mobility")?.raw.split("\n").map((l) => l.trim()).filter(Boolean)[1] ?? "").toLowerCase();
const FAMILIES = ["pump-lift", "pump-condition", "perform", "minimalist"];
const familyOf = (track: string) => (track === "perform" || track === "minimalist" ? track : track.replace(/-\dx$/, ""));
const PRE_LIFT = ["hot-start", "speed-strength"];

interface Pools { pairs: Record<"strength-intensity-1" | "strength-intensity-2", PairPool[]>; bank: Map<string, Map<string, Item>>; si1: SlotSeq[]; si2: SlotSeq[] }

export function generate(corpus: WeekView[], opts: GenerateOptions): Generated {
  // `r` is the plan stream: it only decides the main-lift layout, A/B pairs and progression, and it is
  // seeded the same for every track, so one seed gives Pump Lift, Pump Condition and Perform the same
  // main lifts on the same days, as the published program does. It is reseeded per track further down.
  let r = rng(opts.seed);
  const warnings: string[] = [];
  const ix = new Index(corpus);
  const allowed = opts.equipment ? new Set(opts.equipment) : undefined;
  const nWeeks = opts.weeks ?? 6;
  const family = familyOf(opts.track);
  if (!FAMILIES.includes(family)) throw new Error(`unknown track ${opts.track}`);
  const base5 = "pump-lift-5x";
  if (!ix.complete.get(base5)?.size) throw new Error("the corpus has no complete Pump Lift 5x block to learn from");
  // Minimalist keeps the pattern of the Pump Lift day but uses its own, dumbbell and bodyweight, lifts.
  const liftTrack = family === "minimalist" ? "minimalist" : base5;

  // Day-type layout of the requested track, from the corpus.
  const modalType = (track: string, day: number) => {
    const c = new Map<string, number>();
    for (const d of ix.days.filter((x) => x.track === track && x.day.day === day)) c.set(d.day.type, (c.get(d.day.type) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] as Day["type"] | undefined;
  };
  const layout = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day: d, type: modalType(opts.track, d) ?? (d === 7 ? "note" : "recovery") }));
  const trainingDays = layout.filter((l) => l.type === "training").map((l) => l.day);
  const freq = trainingDays.length;

  // 1. Main-lift layout per Pump Lift 5x day: sample observed layouts, keep the draw that covers most patterns.
  const baseDays = [1, 2, 3, 5, 6];
  const recent = new Set<string>();
  if (opts.avoidRecent !== false) {
    const last = ix.lastBlock.get(liftTrack);
    for (const w of corpus.filter((x) => x.track === liftTrack && x.block.id === last)) for (const d of w.days) for (const sec of d.sections) if (sec.role.startsWith("strength-intensity")) for (const i of sec.items.slice(0, 1)) if (i.exercise) recent.add(i.exercise.id);
  }
  const baseSi1 = ix.slotSeqs(base5, "strength-intensity-1");
  const baseSi2 = ix.slotSeqs(base5, "strength-intensity-2");
  const si2Patterns = [...new Set(baseSi2.map((x) => x.pattern))];
  const layoutDonors = baseDays.map((day) =>
    baseSi1.filter((x) => x.day === day).map((x) => {
      const p2 = baseSi2.find((y) => y.block === x.block && y.day === day)?.pattern ?? null;
      // A Pump Lift day always has a second strength slot; if no observed block gave this day one, use any observed pattern.
      return { p1: x.pattern, p2: p2 ?? pick(si2Patterns, r) };
    }),
  );
  // Draw layouts from the observed ones and keep the first that has the essentials (squat, hinge, both
  // presses and at least one pull). Maximizing coverage instead would over-train pulls and single-leg work
  // compared with the published program.
  const essentials = (draw: { p1: string; p2: string }[]) => {
    const have = new Set(draw.flatMap((x) => [x.p1, x.p2]));
    return ["squat", "hinge", "horizontal-press", "vertical-press"].every((p) => have.has(p)) && (have.has("horizontal-pull") || have.has("vertical-pull"));
  };
  let bestLayout: { p1: string; p2: string }[] = [];
  let bestScore = -1;
  for (let t = 0; t < 400; t++) {
    const draw = layoutDonors.map((l) => (l.length ? pick(l, r) : { p1: "squat", p2: "horizontal-pull" }));
    if (essentials(draw)) { bestLayout = draw; break; }
    const score = coverage(draw.flatMap((x) => [x.p1, x.p2]));
    if (score > bestScore) { bestScore = score; bestLayout = draw; }
  }

  // 2. A/B pairs per slot.
  const pairPool = (all: SlotSeq[]): PairPool[] =>
    all.flatMap((x) => {
      const items = x.secs.map((y) => y.items[0]);
      if (isAlternating(x.exercises)) return [{ pattern: x.pattern, a: items[0], b: items[1], from: `block ${x.block} day ${x.day}` }];
      if (new Set(x.exercises).size === 1) return [{ pattern: x.pattern, a: items[0], b: items[0], from: `block ${x.block} day ${x.day} (fixed)` }];
      return [];
    });
  const sameKit = (x: Item, y: Item) => JSON.stringify([...(x.exercise?.equipment ?? [])].sort()) === JSON.stringify([...(y.exercise?.equipment ?? [])].sort());
  const mkPools = (track: string): Pools => {
    const si1 = track === base5 ? baseSi1 : ix.slotSeqs(track, "strength-intensity-1");
    const si2 = track === base5 ? baseSi2 : ix.slotSeqs(track, "strength-intensity-2");
    // Every exercise seen in a strength slot, by pattern, to build pairs the program has not published.
    const bank = new Map<string, Map<string, Item>>();
    for (const sq of [...si1, ...si2]) for (const sec of sq.secs) {
      const it = sec.items[0];
      if (!it.exercise?.pattern) continue;
      const m = bank.get(it.exercise.pattern) ?? bank.set(it.exercise.pattern, new Map()).get(it.exercise.pattern)!;
      if (!m.has(it.exercise.id)) m.set(it.exercise.id, it);
    }
    return { pairs: { "strength-intensity-1": pairPool(si1), "strength-intensity-2": pairPool(si2) }, bank, si1, si2 };
  };
  const remixed = (bank: Pools["bank"], pattern: string): PairPool[] => {
    const items = [...(bank.get(pattern)?.values() ?? [])];
    const out: PairPool[] = [];
    for (const x of items) for (const y of items) {
      if (x.exercise!.id >= y.exercise!.id || x.perSide !== y.perSide || !sameKit(x, y)) continue;
      out.push({ pattern, a: x, b: y, from: "remixed" });
    }
    return out;
  };
  const primary = mkPools(liftTrack);
  const fallback = liftTrack === base5 ? null : mkPools(base5);
  const usedEx = new Set<string>();
  // Own-kit equipment for the fallback pool when Minimalist has no lift for a pattern.
  const minimalKit = new Set(["dumbbell", "kettlebell", "bodyweight", "pull-up-bar", "rings", "band", "dumbbell-or-kettlebell"]);
  const tryChoose = (pl: Pools, role: "strength-intensity-1" | "strength-intensity-2", pattern: string, allow: Set<string> | undefined, report: boolean, quiet: boolean, tierLimit = 99): PairPool | null => {
    const observed = pl.pairs[role].filter((p) => p.pattern === pattern);
    const mixed = remixed(pl.bank, pattern);
    const equipOk = (p: PairPool) => [p.a, p.b].every((i) => !i.exercise || equipmentOk(i.exercise.equipment, allow));
    const fresh = (p: PairPool) => ![p.a, p.b].some((i) => i.exercise && (recent.has(i.exercise.id) || usedEx.has(i.exercise.id)));
    const notUsed = (p: PairPool) => ![p.a, p.b].some((i) => i.exercise && usedEx.has(i.exercise.id));
    const tiers: { label: string | null; test: (p: PairPool) => boolean }[] = [
      { label: null, test: (p) => equipOk(p) && fresh(p) },
      { label: `${role} ${pattern}: only pairs used in the latest block were available`, test: (p) => equipOk(p) && notUsed(p) },
      { label: `${role} ${pattern}: reused an exercise already in this block`, test: equipOk },
      ...(report ? [{ label: `${role} ${pattern}: nothing matches your equipment; ignored it for this slot`, test: () => true }] : []),
    ];
    for (const t of tiers.slice(0, tierLimit)) {
      const o = observed.filter(t.test), m = mixed.filter(t.test);
      if (!o.length && !m.length) continue;
      if (t.label && !quiet) warnings.push(t.label);
      const p = o.length && (!m.length || r() < 0.5) ? pick(o, r) : pick(m, r);
      for (const i of [p.a, p.b]) if (i.exercise) usedEx.add(i.exercise.id);
      return p;
    }
    return null;
  };
  const choosePair = (role: "strength-intensity-1" | "strength-intensity-2", pattern: string): { pair: PairPool; pools: Pools } => {
    // The second strength slot is drawn for every family to keep the random stream aligned, but only Pump Lift uses it.
    const quiet = role === "strength-intensity-2" && family !== "pump-lift";
    const kit = allowed ? new Set([...allowed].filter((e) => minimalKit.has(e))) : minimalKit;
    // Order of preference: a fresh lift of the track's own, then (Minimalist only) a fresh Pump Lift lift that fits
    // its kit, then progressively looser matches from each pool.
    const steps: { pools: Pools; allow: Set<string> | undefined; limit: number; borrowed: boolean }[] = [
      { pools: primary, allow: allowed, limit: 1, borrowed: false },
      ...(fallback ? [{ pools: fallback, allow: kit, limit: 1, borrowed: true }] : []),
      { pools: primary, allow: allowed, limit: 99, borrowed: false },
      ...(fallback ? [{ pools: fallback, allow: kit, limit: 99, borrowed: true }] : []),
    ];
    for (const st of steps) {
      const hit = tryChoose(st.pools, role, pattern, st.allow, !fallback || st.borrowed, quiet, st.limit);
      if (!hit) continue;
      if (st.borrowed && !quiet) warnings.push(`${role} ${pattern}: borrowed a Pump Lift lift that fits the ${family} kit`);
      return { pair: hit, pools: st.pools };
    }
    throw new Error(`no ${role} pair for pattern ${pattern}`);
  };

  // 3. Progression sequence per slot, from a different observed slot of the same pattern and per-side flag.
  const schemeFor = (pl: Pools, role: "strength-intensity-1" | "strength-intensity-2", pattern: string, perSide: boolean): Scheme[] => {
    const all = role === "strength-intensity-1" ? pl.si1 : pl.si2;
    let c = all.filter((x) => x.pattern === pattern && x.secs[0].items[0].perSide === perSide);
    if (!c.length) c = all.filter((x) => x.pattern === pattern);
    if (!c.length) c = all;
    if (!c.length) c = role === "strength-intensity-1" ? baseSi1 : baseSi2;
    const d = pick(c, r);
    return d.secs.map((x) => ({ sets: x.items[0].sets, tempo: x.items[0].tempo, restSec: x.items[0].restSec, minutes: x.minutes, title: x.title, scheme: x.scheme, from: `block ${d.block} day ${d.day}` }));
  };

  // 4. Plan the five Pump Lift 5x days. Every family draws the full plan (including the second strength
  // slot) so the random stream, and therefore the main lifts, match across tracks.
  const plan: PlanDay[] = [];
  const baseSlots = baseDays.map((baseDay, i) => {
    const { p1, p2 } = bestLayout[i];
    const main = choosePair("strength-intensity-1", p1);
    const mainScheme = schemeFor(main.pools, "strength-intensity-1", p1, !!main.pair.a.perSide);
    const sec = choosePair("strength-intensity-2", p2);
    const secScheme = schemeFor(sec.pools, "strength-intensity-2", p2, !!sec.pair.a.perSide);
    return { baseDay, p1, p2, main: main.pair, mainScheme, sec: sec.pair, secScheme };
  });

  // 5. Subset of base days for 4x / 3x: the combination covering the most core patterns, then base order.
  const choose = <T>(xs: T[], k: number): T[][] => (k === 0 ? [[]] : xs.flatMap((x, i) => choose(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest])));
  // The published 3x tracks cover squat in every week, so a missing squat costs more than any other pattern.
  const subsetScore = (c: typeof baseSlots) => coverage(c.flatMap((x) => [x.p1, x.p2])) + (c.some((x) => x.p1 === "squat" || x.p2 === "squat") ? 10 : 0);
  const keep = freq >= 5 ? baseSlots : choose(baseSlots, freq).map((c) => ({ c, score: subsetScore(c) + r() * 0.5 })).sort((a, b) => b.score - a.score)[0].c;
  const dayOf = new Map(trainingDays.map((d, i) => [d, keep[i]] as const));
  const hasSecond = family === "pump-lift";

  // 6. Supporting sections, sampled by the day's main-lift pattern from the requested track. From here on the
  // stream is specific to the track.
  r = rng((opts.seed * 2654435761 + FAMILIES.indexOf(family) * 40503 + freq) >>> 0);
  const genTrack = opts.track;
  const sectionPool = (roles: string[], pattern: string, dayNumber?: number): { sec: Sec; exact: boolean }[] => {
    const out: { sec: Sec; exact: boolean }[] = [];
    for (const d of ix.daysFor(genTrack, null)) {
      if (dayNumber !== undefined && d.day.day !== dayNumber) continue;
      // A stray "Week 2" line inside a section is a leftover from the source PDF; such sections are not copied.
      for (const sec of d.day.sections) if (roles.includes(sec.role) && sec.items.length && !STRAY_WEEK.test(sec.raw)) out.push({ sec, exact: d.mainPattern === pattern });
    }
    // Pump Lift balance and finisher sections are supersets; skip single-movement formats.
    const shaped = roles.some((x) => x === "strength-balance" || x === "finisher") ? out.filter((x) => x.sec.items.length >= 2 || !out.some((y) => y.sec.items.length >= 2)) : out;
    const ok = shaped.filter((x) => sectionOk(x.sec, allowed));
    const pool = ok.length ? ok : shaped;
    const exactOnly = pool.filter((x) => x.exact);
    const matched = exactOnly.length >= 2 ? exactOnly : pool;
    // After a leg-dominant lift the published balance work trains the lower body or trunk in 81% of days; the other
    // 19% pair it with upper-body work only. Prefer the majority so a block reads coherently.
    if (roles.includes("strength-balance") && LOWER_MAINS.has(pattern)) {
      const coherent = matched.filter((x) => x.sec.items.some((i) => i.exercise && LOWER_OR_TRUNK.has(i.exercise.pattern ?? "")));
      if (coherent.length >= 2) return coherent;
    }
    return matched;
  };
  const distinct = (pool: { sec: Sec }[], n: number): Sec[] => {
    const seen = new Set<string>();
    const uniq = pool.filter((x) => { if (seen.has(x.sec.raw)) return false; seen.add(x.sec.raw); return true; });
    if (!uniq.length) throw new Error("the corpus has no section to sample for this slot");
    const shuffled = shuffle(uniq, r);
    return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length].sec);
  };
  // Within a block a day's pre-lift piece stays one kind (hot start or speed strength) and alternates A/B.
  const preLift = (pattern: string, day: number): Sec[] => {
    const pool = sectionPool(PRE_LIFT, pattern, day);
    const role = pick(pool, r).sec.role;
    const two = distinct(pool.filter((x) => x.sec.role === role), 2);
    return Array.from({ length: nWeeks }, (_, w) => two[w % 2]);
  };
  const supporting = new Map<number, { balance: Sec[]; finisher: Sec[]; conditioning: Sec[]; pre: Sec[]; warmup: Sec[]; cooldown: Sec[]; short: string[] }>();
  for (const [day, slot] of dayOf) {
    const mp = slot.p1;
    const two = distinct(sectionPool(["strength-balance"], mp), 2);
    const mk = (roles: string[], dayNumber?: number) => distinct(sectionPool(roles, mp, dayNumber), nWeeks);
    supporting.set(day, {
      balance: Array.from({ length: nWeeks }, (_, w) => two[w % 2]),
      finisher: family === "pump-lift" ? mk(["finisher"]) : [],
      conditioning: family === "pump-lift" ? [] : mk(["conditioning"]),
      // Perform opens with a hot start or speed-strength piece; which one depends on the day.
      pre: family === "perform" ? preLift(mp, day) : [],
      warmup: mk(["warmup"]),
      cooldown: mk(["cooldown"]),
      short: ix.daysFor(genTrack, mp)[0]?.day.focus.shortOnTime ?? [],
    });
  }
  const recoveryOrder = shuffle(ix.days.filter((d) => d.track === opts.track && d.day.type === "recovery" && !d.day.sections.some((x) => STRAY_WEEK.test(x.raw))), r);

  // 7. Assemble the weeks.
  const weeks: WeekView[] = [];
  let sid = -1;
  const itemFor = (ex: Item, sch: Scheme): Item => ({ ...ex, tempo: sch.tempo, restSec: sch.restSec, sets: sch.sets });
  for (let w = 0; w < nWeeks; w++) {
    const odd = w % 2 === 0; // week 1 is "A"
    const usedTopics = new Set<string>();
    const days: Day[] = layout.map(({ day, type }) => {
      const date = addDays(opts.startDate, w * 7 + day - 1);
      const dayBase = { day, date, sessionId: sid--, sharedWith: [] as TrackId[] };
      if (type === "training") {
        const slot = dayOf.get(day)!;
        const sup = supporting.get(day)!;
        const mainItem = itemFor(odd ? slot.main.a : slot.main.b, slot.mainScheme[w]);
        const sections: Sec[] = [];
        const add = (x: Omit<Sec, "label">) => sections.push({ ...x, label: LETTERS[sections.length] });
        const secondItem = hasSecond ? itemFor(odd ? slot.sec.a : slot.sec.b, slot.secScheme[w]) : null;
        const focusTopic = [mainItem.exercise?.name, secondItem?.exercise?.name].filter(Boolean).join(" + ");
        add({ title: "Daily Focus Notes", role: "focus-note", format: null, minutes: null, scheme: {}, notes: [], items: [], raw: `Daily Focus Notes:\n${focusTopic}` });
        const copy = (x: Sec) => add({ ...x, raw: x.raw.replace(/^[A-H]\)\s*/, "") });
        copy(sup.warmup[w]);
        if (family === "perform") copy(sup.pre[w]);
        const ms = slot.mainScheme[w];
        add({ title: ms.title, role: "strength-intensity-1", format: "straight-sets", minutes: ms.minutes, scheme: ms.scheme, notes: [], items: [mainItem], raw: renderStrength(ms.title, [mainItem], [], ms.minutes) });
        if (secondItem) {
          const sch = slot.secScheme[w];
          add({ title: sch.title, role: "strength-intensity-2", format: "straight-sets", minutes: sch.minutes, scheme: sch.scheme, notes: [], items: [secondItem], raw: renderStrength(sch.title, [secondItem], [], sch.minutes) });
        }
        copy(sup.balance[w]);
        copy(family === "pump-lift" ? sup.finisher[w] : sup.conditioning[w]);
        copy(sup.cooldown[w]);
        return {
          ...dayBase, type: "training" as const,
          headline: { mainLift: mainItem.exercise, focusTopic, roles: sections.map((x) => x.role) },
          focus: { topic: focusTopic, body: null, shortOnTime: sup.short },
          sections,
        };
      }
      if (type === "recovery") {
        // Walk the shuffled recovery sessions from this week's start and take the first whose mobility topic is new this week.
        let rec: Day | null = null;
        for (let k = 0; k < recoveryOrder.length; k++) {
          const cand = recoveryOrder[(w + day + k) % recoveryOrder.length].day;
          if (!usedTopics.has(mobilityTopic(cand)) || k === recoveryOrder.length - 1) { rec = cand; break; }
        }
        if (rec) usedTopics.add(mobilityTopic(rec));
        const secs = rec ? rec.sections.map((x, i) => ({ ...x, label: LETTERS[i], raw: x.raw.replace(/^[A-H]\)\s*/, "") })) : [];
        return { ...dayBase, type: "recovery" as const, headline: { mainLift: null, focusTopic: null, roles: secs.map((x) => x.role) }, focus: { topic: null, body: null, shortOnTime: [] }, sections: secs };
      }
      return { ...dayBase, type: "note" as const, headline: { mainLift: null, focusTopic: null, roles: [] }, focus: { topic: null, body: null, shortOnTime: [] }, sections: [] };
    });
    weeks.push({
      track: opts.track,
      block: { id: 0, startDate: opts.startDate, weekNumber: w + 1, weekCount: nWeeks },
      weekStart: addDays(opts.startDate, w * 7), note: null, sourceFile: null, days,
    });
  }

  // 8. Self-check against the rules.
  for (const wv of weeks) weekView.parse(wv);
  const covered = new Set(keep.flatMap((x) => (hasSecond ? [x.p1, x.p2] : [x.p1])));
  // Only what the track covers reliably in the published program is worth a warning.
  const missing = coverageProblems(family, freq, covered);
  if (missing.length) warnings.push(`this ${freq}-day week does not cover: ${missing.join(", ")}`);
  if (family !== "pump-lift" && covered.size < Math.min(freq, 4)) warnings.push(`only ${covered.size} distinct main-lift patterns this week`);
  for (const [i, x] of baseSlots.entries()) {
    plan.push({
      baseDay: baseDays[i], day: [...dayOf].find(([, v]) => v === x)?.[0] ?? null,
      main: { pattern: x.p1, a: x.main.a.exercise?.name ?? "?", b: x.main.b.exercise?.name ?? "?", schemeFrom: x.mainScheme[0].from },
      secondary: hasSecond ? { pattern: x.p2, a: x.sec.a.exercise?.name ?? "?", b: x.sec.b.exercise?.name ?? "?", schemeFrom: x.secScheme[0].from } : null,
    });
  }
  const checks = validateBlock(weeks, { family, freq, equipment: allowed, recent, avoidRecent: opts.avoidRecent !== false, covered });
  return { options: opts, weeks, checks, plan, warnings };
}

const SKELETON: Record<string, string[]> = {
  "pump-lift": ["focus-note", "warmup", "strength-intensity-1", "strength-intensity-2", "strength-balance", "finisher", "cooldown"],
  "pump-condition": ["focus-note", "warmup", "strength-intensity-1", "strength-balance", "conditioning", "cooldown"],
  minimalist: ["focus-note", "warmup", "strength-intensity-1", "strength-balance", "conditioning", "cooldown"],
  perform: ["focus-note", "warmup", "PRE", "strength-intensity-1", "strength-balance", "conditioning", "cooldown"],
};

/** Checks a finished block against the rules in data/reports/analysis.md. Pure, so it can run anywhere. */
export function validateBlock(
  weeks: WeekView[],
  ctx: { family: string; freq: number; equipment?: Set<string>; recent: Set<string>; avoidRecent: boolean; covered: Set<string> },
): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean | null, detail: string) => checks.push({ name, status: ok === null ? "info" : ok ? "pass" : "warn", detail });
  const training = (w: WeekView) => w.days.filter((d) => d.type === "training");
  const slots = (w: WeekView) => training(w).flatMap((d) => d.sections.filter((s) => s.role.startsWith("strength-intensity")).map((s) => ({ day: d.day, sec: s })));

  const layoutOk = weeks.every((w) => w.days.length === 7 && training(w).length === ctx.freq && w.days[6].type === "note");
  const mondays = weeks.every((w, i) => new Date(`${w.weekStart}T00:00:00Z`).getUTCDay() === 1 && (i === 0 || Date.parse(w.weekStart) - Date.parse(weeks[i - 1].weekStart) === 7 * 86400000));
  add("Week layout", layoutOk && mondays, `${weeks.length} weeks of 7 days, ${ctx.freq} training days each, Day 7 a note, weeks on consecutive Mondays`);

  const expected = SKELETON[ctx.family];
  const bad: string[] = [];
  for (const w of weeks) for (const d of training(w)) {
    const roles = d.sections.map((s) => s.role);
    const want = expected.map((r) => (r === "PRE" ? roles.find((x) => x === "hot-start" || x === "speed-strength") ?? "hot-start" : r));
    if (JSON.stringify(roles) !== JSON.stringify(want)) bad.push(`week ${w.block.weekNumber} day ${d.day}`);
  }
  add("Session skeleton", bad.length === 0, bad.length ? `wrong section order on ${bad.slice(0, 4).join(", ")}` : `every training day has ${expected.map((r) => (r === "PRE" ? "hot start or speed strength" : r)).join(" > ")}`);

  // A/B: the same lift on odd weeks, the same on even weeks, and (unless fixed) different between them.
  const byDay = new Map<string, string[]>();
  for (const w of weeks) for (const { day, sec } of slots(w)) {
    const k = `${day}|${sec.role}`;
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(sec.items[0].exercise?.id ?? "?");
  }
  let alternating = 0, fixed = 0;
  const broken: string[] = [];
  for (const [k, ex] of byDay) {
    const odd = new Set(ex.filter((_, i) => i % 2 === 0)), even = new Set(ex.filter((_, i) => i % 2 === 1));
    if (odd.size !== 1 || even.size !== 1) broken.push(k);
    else if ([...odd][0] === [...even][0]) fixed++;
    else alternating++;
  }
  add("A/B variation", broken.length === 0, broken.length ? `lifts change within a week parity in ${broken.join(", ")}` : `${alternating} strength slots alternate between two variations on odd and even weeks, ${fixed} stay fixed (the published program alternates in about 83% of main-lift slots)`);

  const weak: string[] = [], unramped: string[] = [];
  let setCounts = 0, setSlots = 0;
  for (const w of weeks) for (const { day, sec } of slots(w)) {
    const working = sec.items[0].sets.filter((x) => x.kind === "working");
    if (working.length < 2) weak.push(`week ${w.block.weekNumber} day ${day}`);
    const rpes = working.map((x) => x.rpeMin).filter((x): x is number => x != null);
    if (rpes.some((v, i) => i > 0 && v < rpes[i - 1])) unramped.push(`week ${w.block.weekNumber} day ${day}`);
  }
  for (const [k] of byDay) {
    const [day, role] = k.split("|");
    const counts = weeks.map((w) => slots(w).find((x) => String(x.day) === day && x.sec.role === role)?.sec.items[0].sets.filter((s) => s.kind === "working").length);
    setSlots++;
    if (new Set(counts).size === 1) setCounts++;
  }
  add("Working sets", weak.length === 0, weak.length ? `fewer than 2 working sets on ${weak.slice(0, 4).join(", ")}` : "every strength slot has at least 2 working sets every week");
  add("RPE ramps up", unramped.length === 0, unramped.length ? `RPE falls inside a slot on ${unramped.slice(0, 4).join(", ")}` : "within each slot RPE never goes down from one working set to the next (7, 8, 9, then 10 for a max set)");
  add("Set count stable", null, `${setCounts} of ${setSlots} strength slots keep the same number of working sets all block (82% in the published program)`);

  const missing = coverageProblems(ctx.family, ctx.freq, ctx.covered);
  add("Pattern coverage", missing.length === 0, missing.length ? `no main or secondary lift for ${missing.join(", ")}` : `covers ${[...ctx.covered].sort().join(", ")}`);

  const w1 = training(weeks[0]).map((d) => d.headline.mainLift?.id ?? "?");
  const repeated = w1.filter((x, i) => w1.indexOf(x) !== i);
  add("Variety within a week", repeated.length === 0, repeated.length ? `the same main lift appears on two days: ${[...new Set(repeated)].join(", ")}` : "each training day has a different main lift");

  const reused = [...new Set(weeks.flatMap((w) => slots(w).map((x) => x.sec.items[0].exercise?.id ?? "")))].filter((id) => ctx.recent.has(id));
  add("Fresh lifts", ctx.avoidRecent ? reused.length === 0 : null, ctx.avoidRecent ? (reused.length ? `reuses ${reused.join(", ")} from the latest published block` : "no strength lift comes from the latest published block (the program almost never repeats a main lift in the next block: 3%)") : `${reused.length} lifts also appear in the latest published block (allowed by request)`);

  if (ctx.equipment) {
    const off = [...new Set(weeks.flatMap((w) => slots(w).flatMap((x) => x.sec.items.filter((i) => i.exercise && !equipmentOk(i.exercise.equipment, ctx.equipment)).map((i) => i.exercise!.name))))];
    add("Equipment", off.length === 0, off.length ? `strength lifts outside your equipment: ${off.join(", ")}` : "every strength lift fits the equipment you listed (supporting sections are filtered the same way where a match exists)");
  }
  add("Prose", null, "focus notes name the lifts only and the Day 7 note is empty; the program's coaching text is not generated");
  return checks;
}
