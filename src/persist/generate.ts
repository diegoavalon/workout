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

export interface Generated {
  options: GenerateOptions;
  weeks: WeekView[];
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

export function generate(corpus: WeekView[], opts: GenerateOptions): Generated {
  const r = rng(opts.seed);
  const warnings: string[] = [];
  const ix = new Index(corpus);
  const allowed = opts.equipment ? new Set(opts.equipment) : undefined;
  const nWeeks = opts.weeks ?? 6;
  const family = opts.track.replace(/-\dx$/, "");
  if (family !== "pump-lift" && family !== "pump-condition") throw new Error(`generator supports pump-lift and pump-condition tracks so far, not ${opts.track}`);
  const freq = Number(opts.track.slice(-2, -1));
  const base5 = "pump-lift-5x";
  if (!ix.complete.get(base5)?.size) throw new Error("the corpus has no complete Pump Lift 5x block to learn from");

  // Day-type layout of the requested track, from the corpus.
  const modalType = (track: string, day: number) => {
    const c = new Map<string, number>();
    for (const d of ix.days.filter((x) => x.track === track && x.day.day === day)) c.set(d.day.type, (c.get(d.day.type) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] as Day["type"] | undefined;
  };
  const layout = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day: d, type: modalType(opts.track, d) ?? (d === 7 ? "note" : "recovery") }));
  const trainingDays = layout.filter((l) => l.type === "training").map((l) => l.day);

  // 1. Main-lift layout per base day: sample observed layouts, keep the draw that covers most patterns.
  const baseDays = [1, 2, 3, 5, 6];
  const recent = new Set<string>();
  if (opts.avoidRecent !== false) {
    const last = ix.lastBlock.get(base5);
    for (const w of corpus.filter((x) => x.track === base5 && x.block.id === last)) for (const d of w.days) for (const s of d.sections) if (s.role.startsWith("strength-intensity")) for (const i of s.items.slice(0, 1)) if (i.exercise) recent.add(i.exercise.id);
  }
  const si1All = ix.slotSeqs(base5, "strength-intensity-1");
  const si2All = ix.slotSeqs(base5, "strength-intensity-2");
  const si2Patterns = [...new Set(si2All.map((s) => s.pattern))];
  const layoutDonors = baseDays.map((day) => {
    const all = si1All.filter((s) => s.day === day).map((s) => ({ p1: s.pattern, p2: si2All.find((x) => x.block === s.block && x.day === day)?.pattern ?? null }));
    if (family !== "pump-lift") return all;
    // A Pump Lift day always has a second strength slot; if no observed block gave this day one, pair it with any observed pattern.
    return all.map((l) => (l.p2 ? l : { p1: l.p1, p2: pick(si2Patterns, r) }));
  });
  let bestLayout: { p1: string; p2: string | null }[] = [];
  let bestScore = -1;
  for (let t = 0; t < 300; t++) {
    const draw = layoutDonors.map((l) => (l.length ? pick(l, r) : { p1: "squat", p2: null }));
    const score = coverage(draw.flatMap((x) => (family === "pump-lift" ? [x.p1, x.p2] : [x.p1])));
    if (score > bestScore) { bestScore = score; bestLayout = draw; }
  }

  // 2. A/B pairs per slot.
  const pairPool = (all: SlotSeq[]): PairPool[] =>
    all.flatMap((s) => {
      const items = s.secs.map((x) => x.items[0]);
      if (isAlternating(s.exercises)) return [{ pattern: s.pattern, a: items[0], b: items[1], from: `block ${s.block} day ${s.day}` }];
      if (new Set(s.exercises).size === 1) return [{ pattern: s.pattern, a: items[0], b: items[0], from: `block ${s.block} day ${s.day} (fixed)` }];
      return [];
    });
  const pools = { "strength-intensity-1": pairPool(si1All), "strength-intensity-2": pairPool(si2All) };
  // Every exercise seen in a strength slot, by pattern, to build pairs the program has not published.
  const exerciseBank = new Map<string, Map<string, Item>>();
  for (const sq of [...si1All, ...si2All]) for (const sec of sq.secs) {
    const it = sec.items[0];
    if (!it.exercise?.pattern) continue;
    const m = exerciseBank.get(it.exercise.pattern) ?? exerciseBank.set(it.exercise.pattern, new Map()).get(it.exercise.pattern)!;
    if (!m.has(it.exercise.id)) m.set(it.exercise.id, it);
  }
  const sameKit = (x: Item, y: Item) => JSON.stringify([...(x.exercise?.equipment ?? [])].sort()) === JSON.stringify([...(y.exercise?.equipment ?? [])].sort());
  const remixed = (pattern: string): PairPool[] => {
    const items = [...(exerciseBank.get(pattern)?.values() ?? [])];
    const out: PairPool[] = [];
    for (const x of items) for (const y of items) {
      if (x.exercise!.id >= y.exercise!.id || x.perSide !== y.perSide || !sameKit(x, y)) continue;
      out.push({ pattern, a: x, b: y, from: "remixed" });
    }
    return out;
  };
  const usedEx = new Set<string>();
  const choosePair = (role: "strength-intensity-1" | "strength-intensity-2", pattern: string): PairPool => {
    const observed = pools[role].filter((p) => p.pattern === pattern);
    const mixed = remixed(pattern);
    const equipOk = (p: PairPool) => [p.a, p.b].every((i) => !i.exercise || equipmentOk(i.exercise.equipment, allowed));
    const fresh = (p: PairPool) => ![p.a, p.b].some((i) => i.exercise && (recent.has(i.exercise.id) || usedEx.has(i.exercise.id)));
    const notUsed = (p: PairPool) => ![p.a, p.b].some((i) => i.exercise && usedEx.has(i.exercise.id));
    // Prefer unseen-this-block, then allow latest-block exercises, then repeats, then ignore equipment.
    const tiers: { label: string | null; test: (p: PairPool) => boolean }[] = [
      { label: null, test: (p) => equipOk(p) && fresh(p) },
      { label: `${role} ${pattern}: only pairs used in the latest block were available`, test: (p) => equipOk(p) && notUsed(p) },
      { label: `${role} ${pattern}: reused an exercise already in this block`, test: equipOk },
      { label: `${role} ${pattern}: nothing matches your equipment; ignored it for this slot`, test: () => true },
    ];
    for (const t of tiers) {
      const o = observed.filter(t.test), m = mixed.filter(t.test);
      if (!o.length && !m.length) continue;
      if (t.label) warnings.push(t.label);
      const p = o.length && (!m.length || r() < 0.5) ? pick(o, r) : pick(m, r);
      for (const i of [p.a, p.b]) if (i.exercise) usedEx.add(i.exercise.id);
      return p;
    }
    throw new Error(`no ${role} pair for pattern ${pattern}`);
  };

  // 3. Progression sequence per slot, from a different observed slot of the same pattern and per-side flag.
  const schemeFor = (role: "strength-intensity-1" | "strength-intensity-2", pattern: string, perSide: boolean): Scheme[] => {
    const all = role === "strength-intensity-1" ? si1All : si2All;
    let c = all.filter((s) => s.pattern === pattern && s.secs[0].items[0].perSide === perSide);
    if (!c.length) c = all.filter((s) => s.pattern === pattern);
    if (!c.length) c = all;
    const d = pick(c, r);
    return d.secs.map((s) => ({ sets: s.items[0].sets, tempo: s.items[0].tempo, restSec: s.items[0].restSec, minutes: s.minutes, title: s.title, scheme: s.scheme, from: `block ${d.block} day ${d.day}` }));
  };

  // 4. Plan the five base days.
  const plan: PlanDay[] = [];
  const baseSlots = baseDays.map((baseDay, i) => {
    const { p1, p2 } = bestLayout[i];
    const main = choosePair("strength-intensity-1", p1);
    const mainScheme = schemeFor("strength-intensity-1", p1, !!main.a.perSide);
    const sec = family === "pump-lift" && p2 ? choosePair("strength-intensity-2", p2) : null;
    const secScheme = sec && p2 ? schemeFor("strength-intensity-2", p2, !!sec.a.perSide) : null;
    return { baseDay, p1, p2: family === "pump-lift" ? p2 : null, main, mainScheme, sec, secScheme };
  });
  // The PL5x plan also drives Pump Condition: those tracks reuse the main lift on the same day.
  // Secondary slots only exist in Pump Lift.

  // 5. Subset of base days for 4x / 3x: the combination covering the most core patterns, then base order.
  const choose = <T>(xs: T[], k: number): T[][] => (k === 0 ? [[]] : xs.flatMap((x, i) => choose(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest])));
  const keep = freq === 5 ? baseSlots : (() => {
    const combos = choose(baseSlots, freq).map((c) => ({ c, score: coverage(c.flatMap((s) => [s.p1, s.p2])) + r() * 0.5 }));
    return combos.sort((a, b) => b.score - a.score)[0].c;
  })();
  const dayOf = new Map(trainingDays.map((d, i) => [d, keep[i]] as const));

  // 6. Supporting sections, sampled by the day's main-lift pattern from the requested family.
  const sectionPool = (track: string, role: string, pattern: string): { sec: Sec; shortOnTime: string[]; from: string }[] => {
    const exact = ix.daysFor(track, null);
    const out: { sec: Sec; shortOnTime: string[]; from: string; exact: boolean }[] = [];
    for (const d of exact) for (const s of d.day.sections) if (s.role === role && s.items.length) out.push({ sec: s, shortOnTime: d.day.focus.shortOnTime, from: `${d.track} block ${d.block} week ${d.week} day ${d.day.day}`, exact: d.mainPattern === pattern });
    // Pump Lift balance and finisher sections are supersets; skip single-movement formats from other tracks.
    const shaped = role === "strength-balance" || role === "finisher" ? out.filter((x) => x.sec.items.length >= 2 || !out.some((y) => y.sec.items.length >= 2)) : out;
    const ok = shaped.filter((x) => sectionOk(x.sec, allowed));
    const pool = ok.length ? ok : shaped;
    const exactOnly = pool.filter((x) => x.exact);
    return exactOnly.length >= 2 ? exactOnly : pool;
  };
  const distinct = <T extends { sec: Sec }>(pool: T[], n: number): T[] => {
    const seen = new Set<string>();
    const uniq = pool.filter((x) => { const k = x.sec.raw; if (seen.has(k)) return false; seen.add(k); return true; });
    const shuffled = shuffle(uniq, r);
    return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length]);
  };
  const genTrack = opts.track;
  const supporting = new Map<number, { balance: Sec[]; finisher: Sec[]; conditioning: Sec[]; warmup: Sec[]; cooldown: Sec[]; short: string[] }>();
  for (const [day, s] of dayOf) {
    const mainPattern = s.p1;
    const balPool = sectionPool(genTrack, "strength-balance", mainPattern);
    const two = distinct(balPool, 2);
    const balance = Array.from({ length: nWeeks }, (_, w) => two[w % 2].sec);
    const mk = (role: string, n = nWeeks) => distinct(sectionPool(genTrack, role, mainPattern), n).map((x) => x.sec);
    supporting.set(day, {
      balance,
      finisher: family === "pump-lift" ? mk("finisher") : [],
      conditioning: family === "pump-condition" ? mk("conditioning") : [],
      warmup: mk("warmup"),
      cooldown: mk("cooldown"),
      short: ix.daysFor(genTrack, mainPattern)[0]?.day.focus.shortOnTime ?? [],
    });
  }
  const recoveryDays = ix.days.filter((d) => d.track === opts.track && d.day.type === "recovery");

  // 7. Assemble the weeks.
  const weeks: WeekView[] = [];
  let sid = -1;
  const itemFor = (ex: Item, sch: Scheme): Item => ({ ...ex, tempo: sch.tempo, restSec: sch.restSec, sets: sch.sets });
  const recoveryOrder = shuffle(recoveryDays, r);
  for (let w = 0; w < nWeeks; w++) {
    const odd = w % 2 === 0; // week 1 is "A"
    const days: Day[] = layout.map(({ day, type }) => {
      const date = addDays(opts.startDate, w * 7 + day - 1);
      const dayBase = { day, date, sessionId: sid--, sharedWith: [] as TrackId[] };
      if (type === "training") {
        const slot = dayOf.get(day)!;
        const sup = supporting.get(day)!;
        const mainItem = itemFor(odd ? slot.main.a : slot.main.b, slot.mainScheme[w]);
        const sections: Sec[] = [];
        const add = (s: Omit<Sec, "label">) => sections.push({ ...s, label: LETTERS[sections.length + 0] });
        const focusTopic = [mainItem.exercise?.name, slot.sec ? (odd ? slot.sec.a : slot.sec.b).exercise?.name : null].filter(Boolean).join(" + ");
        add({ title: "Daily Focus Notes", role: "focus-note", format: null, minutes: null, scheme: {}, notes: [], items: [], raw: `Daily Focus Notes:\n${focusTopic}` });
        const copy = (s: Sec) => add({ ...s, raw: s.raw.replace(/^[A-H]\)\s*/, "") });
        copy(sup.warmup[w]);
        const mainSch = slot.mainScheme[w];
        add({ title: mainSch.title, role: "strength-intensity-1", format: "straight-sets", minutes: mainSch.minutes, scheme: mainSch.scheme, notes: [], items: [mainItem], raw: renderStrength(mainSch.title, [mainItem], [], mainSch.minutes) });
        if (slot.sec && slot.secScheme) {
          const it = itemFor(odd ? slot.sec.a : slot.sec.b, slot.secScheme[w]);
          const sch = slot.secScheme[w];
          add({ title: sch.title, role: "strength-intensity-2", format: "straight-sets", minutes: sch.minutes, scheme: sch.scheme, notes: [], items: [it], raw: renderStrength(sch.title, [it], [], sch.minutes) });
        }
        copy(sup.balance[w]);
        if (family === "pump-lift") copy(sup.finisher[w]); else copy(sup.conditioning[w]);
        copy(sup.cooldown[w]);
        const sectionsOut = sections;
        return {
          ...dayBase, type: "training" as const,
          headline: { mainLift: mainItem.exercise, focusTopic, roles: sectionsOut.map((x) => x.role) },
          focus: { topic: focusTopic, body: null, shortOnTime: sup.short },
          sections: sectionsOut,
        };
      }
      if (type === "recovery") {
        const rec = recoveryOrder.length ? recoveryOrder[(w + day) % recoveryOrder.length].day : null;
        const secs = rec ? rec.sections.map((s, i) => ({ ...s, label: LETTERS[i] })) : [];
        return { ...dayBase, type: "recovery" as const, headline: { mainLift: null, focusTopic: null, roles: secs.map((s) => s.role) }, focus: { topic: null, body: null, shortOnTime: [] }, sections: secs };
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
  const trainingPatterns = new Set(keep.flatMap((s) => [s.p1, s.p2]).filter(Boolean) as string[]);
  // Only the patterns the track covers reliably in the published program are worth a warning.
  const required = family === "pump-lift" ? (freq === 3 ? ["squat", "hinge", "horizontal-press", "vertical-press"] : CORE.slice(0, 5)) : ["squat", "hinge"];
  const missing = required.filter((p) => !trainingPatterns.has(p));
  if (missing.length) warnings.push(`this ${freq}x week does not cover: ${missing.join(", ")}`);
  for (const [i, s] of baseSlots.entries()) {
    plan.push({
      baseDay: baseDays[i], day: [...dayOf].find(([, v]) => v === s)?.[0] ?? null,
      main: { pattern: s.p1, a: s.main.a.exercise?.name ?? "?", b: s.main.b.exercise?.name ?? "?", schemeFrom: s.mainScheme[0].from },
      secondary: s.sec && s.p2 && s.secScheme ? { pattern: s.p2, a: s.sec.a.exercise?.name ?? "?", b: s.sec.b.exercise?.name ?? "?", schemeFrom: s.secScheme[0].from } : null,
    });
  }
  return { options: opts, weeks, plan, warnings };
}
