import type { Slot } from "./lib.ts";
import { pct } from "./lib.ts";

export interface Rule { title: string; rule: string; evidence: string; exceptions: string }

const mode = <T>(xs: T[]): T | undefined => {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// Inputs are the structured results returned by the q01-q09 modules.
export function buildRules(slots: Slot[], r: { q01: any; q02: any; q03: any; q04: any; q05: any; q06: any; q07: any; q08: any; q09: any }, ctx: { topUnresolved: string[]; weeksObserved: number; weeksMissing: number; blocks: number; unresolvedUses: number; totalUses: number }): Rule[] {
  const rules: Rule[] = [];

  // R1: weekly day structure.
  const tracks = [...new Set(slots.map((s) => s.track))].sort();
  const dayRows: string[] = [];
  let cells = 0, agree = 0;
  for (const t of tracks) {
    const ts = slots.filter((s) => s.track === t);
    const parts: string[] = [];
    for (const d of [1, 2, 3, 4, 5, 6, 7]) {
      const ds = ts.filter((s) => s.day === d);
      const m = mode(ds.map((s) => s.sessionType))!;
      cells += ds.length; agree += ds.filter((s) => s.sessionType === m).length;
      parts.push(`${d}:${m === "training" ? "T" : m === "recovery" ? "R" : "N"}`);
    }
    dayRows.push(`${t} ${parts.join(" ")}`);
  }
  rules.push({
    title: "A week is seven days: training days, recovery days, and a Day 7 note",
    rule: "Each track has the same day-type layout every week (T = training, R = recovery, N = Marcus's note): " + dayRows.join("; ") + ". Day 7 carries a written note in every track.",
    evidence: `${agree} of ${cells} track-days (${pct(agree, cells)}) match their track's usual day type, over ${ctx.weeksObserved} observed weeks and ${ctx.blocks} blocks.`,
    exceptions: agree === cells ? "None." : `${cells - agree} track-days differ from the usual type.`,
  });

  // R2: skeleton.
  const sk = r.q01.summary as any[];
  const hit = sk.reduce((n, x) => n + x.matchHypothesis, 0), tot = sk.reduce((n, x) => n + x.sessions, 0);
  rules.push({
    title: "Every training session follows its family's skeleton",
    rule: "Pump Lift: warmup, strength intensity 1, strength intensity 2, strength balance, finisher, cooldown. Pump Condition and Minimalist: warmup, strength intensity 1, strength balance, conditioning, cooldown. Perform: the same with a hot start or speed-strength section before the main lift. A daily focus note leads every session (present in all but a few).",
    evidence: `${hit} of ${tot} training sessions (${pct(hit, tot)}) match; Pump Lift 3x/4x and Pump Condition 3x/4x match 100%.`,
    exceptions: (() => {
      const dev = r.q01.deviations as any[];
      const d6 = dev.filter((x) => x.day === 6).length;
      const perf = dev.filter((x) => x.track === "perform").length;
      return `${dev.length} sessions deviate: ${d6} are Day 6 sessions (a shortened session that drops strength intensity 2 or, in Perform, the hot start or strength balance) and ${perf} are Perform sessions in total. See q01-skeleton-deviations.csv.`;
    })(),
  });

  // R3: pattern coverage in Pump Lift 5x and 3x.
  const covOf = (t: string) => (r.q02.csvRows as any[]).filter((x) => x.track === t && x.pattern !== "(unresolved)");
  const cov = covOf("pump-lift-5x");
  const full = cov.filter((x) => x.atLeastOnce / x.weeks >= 0.9).map((x) => x.pattern);
  const partial = cov.filter((x) => x.atLeastOnce / x.weeks < 0.9).map((x) => `${x.pattern} (${x.atLeastOnce}/${x.weeks})`);
  const cov3 = covOf("pump-lift-3x");
  const once3 = cov3.filter((x) => x.exactlyOnce / x.weeks >= 0.85).map((x) => x.pattern);
  rules.push({
    title: "Pump Lift 5x covers squat, hinge and both presses in nearly every week; pulls and single-leg work less consistently",
    rule: `Weekly strength slots (strength intensity 1 and 2) of Pump Lift 5x include ${full.join(", ")} in at least 90% of weeks, and usually more than once. ${partial.join(", ")} appear less reliably. Pump Lift 3x covers ${once3.join(", ") || "no pattern"} exactly once in at least 85% of weeks. Pattern is not tied to a day number: the pattern on a given day changes from block to block.`,
    evidence: cov.map((x) => `${x.pattern} ${x.atLeastOnce}/${x.weeks}`).join(", ") + " weeks covered at least once (Pump Lift 5x); exactly-once counts are in q02-pattern-coverage.csv.",
    exceptions: `Coverage counts exercises with a resolved pattern only. Dips and chest flies are counted as horizontal presses (a judgment call: the pattern list has no chest-isolation category), and burpees as plyometric. Still unresolved: ${ctx.topUnresolved.join(", ")}.`,
  });

  // R4: AB alternation.
  const si1 = (r.q03.out as any[]).filter((x) => x.track === "pump-lift-5x" && x.role === "strength-intensity-1" && x.item === 1 && x.kind !== "too-few-weeks");
  const si1Ab = si1.filter((x) => x.kind === "alternating-AB").length;
  const bal = (r.q03.out as any[]).filter((x) => x.track === "pump-lift-5x" && x.role === "strength-balance" && x.item === 1 && x.kind !== "too-few-weeks");
  rules.push({
    title: "Within a block the main lift alternates between two variations on odd and even weeks",
    rule: "Each main-lift slot has two variations (A on odd weeks, B on even weeks), for example sumo deadlift on odd weeks and deficit deadlift on even weeks. The pair is chosen per block and day.",
    evidence: `${si1Ab} of ${si1.length} Pump Lift 5x strength-intensity-1 slots (${pct(si1Ab, si1.length)}) alternate exactly; the other slots are fixed (${si1.filter((x) => x.kind === "fixed").length}) or rotate (${si1.filter((x) => x.kind === "rotating").length}). The first strength-balance movement alternates in ${pct(bal.filter((x) => x.kind === "alternating-AB").length, bal.length)} of slots.`,
    exceptions: (() => {
      const k = (role: string) => { const x = (r.q03.out as any[]).filter((y) => y.track === "pump-lift-5x" && y.role === role && y.item === 1 && y.kind !== "too-few-weeks"); return pct(x.filter((y) => y.kind === "alternating-AB").length, x.length); };
      return `Strength intensity 2 alternates in ${k("strength-intensity-2")} of slots and finishers in ${k("finisher")} (they rotate nearly every week).`;
    })(),
  });

  // R5: block-to-block change.
  rules.push({
    title: "A new block brings new main lifts, but the exercise pool is reused over time",
    rule: "The main lift in a given day and role almost never repeats in the next block. Exercises do return after a gap: by the sixth block about two thirds of the Pump Lift 5x strength exercises had been used before.",
    evidence: `The same day and role kept the same main lift in ${r.q03.same} of ${r.q03.total} block-to-block comparisons (${pct(r.q03.same, r.q03.total)}); 4-15% of each block's strength exercises also appeared in the previous block.`,
    exceptions: "Exercise identity is by catalog id, so equipment variants (dumbbell vs barbell) count as different exercises.",
  });

  // R6: progression.
  const st = r.q04.stats;
  const step = new Map<number, number>(st.stepDist);
  const steps = [...step.values()].reduce((a, b) => a + b, 0);
  const down = [...step].filter(([d]) => d < 0).reduce((n, [, c]) => n + c, 0);
  rules.push({
    title: "Strength slots use 3 or 4 working sets ramping RPE 7/8/9, with reps falling across the block",
    rule: "Working sets ramp RPE 7, 8, 9 (a fourth set is a max-reps set at RPE 10 at the Set 1 weight, or a set at RPE 9). Tempo and set count stay constant across a block. The opening reps for a slot fall by about two between same-parity weeks (for example 10, 8, 6), and the reps within a session are either flat or step down by about two.",
    evidence: `RPE starts 7/8/9 in ${pct(st.rpeStd, st.rpeTot)} of weeks; set count constant in ${pct(st.setsFixed, st.seqCount)} of slot sequences; at most two tempos in ${pct(st.tempoFixed, st.seqCount)}; opening reps never rise within a parity in ${pct(st.descendWithin, st.seqCount)}; ${down} of ${steps} two-week steps lower the opening reps.`,
    exceptions: `Odd and even weeks form a clean heavy/light pair in only ${pct(st.splitConsistent, st.splitTotal)} of slots, and the heavier parity is odd in ${st.heavyCount.odd} and even in ${st.heavyCount.even} slots, so "even weeks are heavier" is not a rule. The week-by-week scheme is in data/design/progression.json.`,
  });

  // R7: derivation.
  const sum = r.q06.csvSummary as any[];
  const g = (d: string, b: string) => sum.find((x) => x.derived === d && x.base === b);
  const pc = g("pump-condition-5x", "pump-lift-5x"), pf = g("perform", "pump-lift-5x"), p4 = g("pump-lift-4x", "pump-lift-5x"), p3 = g("pump-lift-3x", "pump-lift-5x"), mn = g("minimalist", "pump-lift-5x");
  rules.push({
    title: "Pump Condition 5x and Perform reuse the Pump Lift 5x main lift on the same day",
    rule: "Pump Condition 5x and Perform take the strength-intensity-1 lift of the Pump Lift 5x session with the same day number. Their other sections (balance, conditioning) are different.",
    evidence: `Same lift on the same day: Pump Condition 5x ${pc.sameDay}/${pc.days} (${pct(pc.sameDay, pc.days)}), Perform ${pf.sameDay}/${pf.days} (${pct(pf.sameDay, pf.days)}). Strength-intensity-1 sections are identical in ${pc.eq_strength_intensity_1 ?? pc["eq_strength-intensity-1"]} and ${pf["eq_strength-intensity-1"]} matched days.`,
    exceptions: "Strength balance is identical in only about a third of matched days; conditioning is its own piece.",
  });
  rules.push({
    title: "The 4x and 3x tracks use 5x sessions but choose a different subset in every block",
    rule: "Pump Lift 4x and 3x (and Pump Condition 4x and 3x) contain the main lifts of four or three of the 5x days, in an order picked per block. Strength intensity 2, balance and finisher are often changed too. There is no single drop rule; keep a per-block day mapping (data/design/track-derivation.json).",
    evidence: `Same lift on some 5x day: Pump Lift 4x ${pct(p4.sameLiftAnyDay, p4.days)}, 3x ${pct(p3.sameLiftAnyDay, p3.days)}; but on the same day number only ${pct(p4.sameDay, p4.days)} and ${pct(p3.sameDay, p3.days)}. The mapping stays constant across the block's weeks in ${p4.blocksWithConstantMapping} of ${p4.blocks} blocks (4x) and ${p3.blocksWithConstantMapping} of ${p3.blocks} (3x).`,
    exceptions: `The 3x track is not the 5x session with strength intensity 2 removed: it keeps a strength intensity 2 and nearly always replaces it (identical to the 5x counterpart in ${p3["eq_strength-intensity-2"]} matched days, versus ${p4["eq_strength-intensity-2"]} for 4x).`,
  });
  rules.push({
    title: "Minimalist keeps the pattern, not the lift",
    rule: "Minimalist days have the same movement pattern as a Pump Lift 5x day in the same week but use a dumbbell or bodyweight variation.",
    evidence: `Same pattern as a Pump Lift 5x day: ${pct(mn.samePatternOnly, mn.days)} of Minimalist days; the same exact lift only ${pct(mn.sameLiftAnyDay, mn.days)}.`,
    exceptions: "The day-to-day mapping is not constant within a block, so the pattern order cannot be copied by day number alone.",
  });

  // R8: recycling.
  const rr = (label: string) => (r.q05.rows as any[]).find((x) => x.group.startsWith(label));
  const cd = rr("cooldowns"), ar = rr("recovery days"), mob = rr("recovery mobility"), cond = rr("conditioning");
  const sess = r.q05.sessions as any[];
  rules.push({
    title: "Cooldowns and recovery content are recycled; training content is not",
    rule: "Training sessions never repeat in a later week, and conditioning, strength balance and strength intensity sections are almost always new. Cooldowns are drawn from a small set and repeat across weeks. Recovery sessions are partly reused (the same mobility or active-recovery work returns), within a block and across blocks, and are shared across tracks.",
    evidence: `Cooldowns: ${cd.distinctSections} distinct sections across ${cd.sectionWeekAppearances} week appearances (${pct(cd.sectionWeekAppearances - cd.distinctSections, cd.sectionWeekAppearances)} are repeats). Mobility sessions ${pct(mob.sectionWeekAppearances - mob.distinctSections, mob.sectionWeekAppearances)} repeats; active recovery ${pct(ar.sectionWeekAppearances - ar.distinctSections, ar.sectionWeekAppearances)}; conditioning/finishers/hot starts ${pct(cond.sectionWeekAppearances - cond.distinctSections, cond.sectionWeekAppearances)}. Training sessions repeated in a second week: ${sess[0][2]}.`,
    exceptions: `Recovery days are not copied verbatim between blocks as a rule: ${pct(ar.inMoreThanOneBlock, ar.distinctSections)} of active-recovery sections and ${pct(mob.inMoreThanOneBlock, mob.distinctSections)} of mobility sessions appear in more than one block.`,
  });

  // R9: pairings.
  const cls = r.q07.classes as [string, number][];
  const top = cls.slice(0, 3).map(([k, n]) => `${k} ${pct(n, r.q07.knownTotal)}`).join(", ");
  const pushPull = cls.find(([k]) => k === "pull + push")?.[1] ?? 0;
  const byMain = r.q07.byMain as (string | number)[][];
  const forMain = (p: string) => String(byMain.find((x) => x[0] === p)?.[2] ?? "").replace(/<br>/g, "; ");
  rules.push({
    title: "Strength-balance supersets are chosen around the day's main lift, not as push/pull pairs",
    rule: "The two movements of a strength-balance superset usually train neighbouring regions or the lift's complement. The top pairings by main-lift pattern: squat day " + forMain("squat") + "; hinge day " + forMain("hinge") + "; vertical-press day " + forMain("vertical-press") + ".",
    evidence: `Top pair types among ${r.q07.knownTotal} resolved supersets: ${top}. Push-with-pull pairs are only ${pct(pushPull, r.q07.knownTotal)} of them.`,
    exceptions: `${r.q07.total - r.q07.knownTotal} of ${r.q07.total} supersets have a movement whose pattern is unresolved (for example ${ctx.topUnresolved.slice(0, 3).join(", ")}), so these shares may shift once those patterns are resolved.`,
  });

  // R10: conditioning.
  const cr = r.q08.rows as any[][];
  const fmt = (role: string) => cr.filter((x) => x[0] === role).map((x) => `${x[1]} ${x[2]}`).join(", ");
  const condRows = cr.filter((x) => x[0] === "conditioning");
  const condTotal = condRows.reduce((n, x) => n + Number(x[2]), 0);
  const unclassified = Number(condRows.find((x) => x[1] === "unclassified")?.[2] ?? 0);
  rules.push({
    title: "Conditioning pieces come in a few formats with 9-30 minute time domains",
    rule: "Conditioning sections are AMRAP, every-N-seconds, for-time, interval or ladder pieces, built from rowing, biking, running, kettlebell and dumbbell work. Finishers (Pump Lift) are short supersets. Perform adds hot starts and speed-strength sections before the main lift.",
    evidence: `Distinct conditioning sections by format: ${fmt("conditioning")}. Finishers: ${fmt("finisher")}.`,
    exceptions: `${pct(unclassified, condTotal)} of conditioning sections name no format in their text (for example continuous-clock or "for quality" pieces), so they are left unclassified rather than guessed.`,
  });

  // R11: volume.
  const av = r.q09.avg as (t: string, p: string) => [number, number];
  const P = ["squat", "hinge", "horizontal-press", "horizontal-pull"];
  const ratio = (t: string) => { const rs = P.map((p) => av(t, p)[1] / av("pump-lift-5x", p)[1]); return rs.reduce((a, b) => a + b, 0) / rs.length; };
  const vol = (t: string) => P.map((p) => `${p} ${av(t, p)[0].toFixed(1)}${av(t, p)[0] === av(t, p)[1] ? "" : "-" + av(t, p)[1].toFixed(1)}`).join(", ");
  rules.push({
    title: "Pump Lift hard-set volume per pattern drops with frequency, but not proportionally",
    rule: `Averaged over squat, hinge, horizontal press and horizontal pull, Pump Lift 4x carries ${(100 * ratio("pump-lift-4x")).toFixed(0)}% and 3x ${(100 * ratio("pump-lift-3x")).toFixed(0)}% of the 5x hard sets. Hinge volume is nearly unchanged from 5x to 4x while horizontal pull falls the most.`,
    evidence: `Average weekly hard sets, Pump Lift 5x: ${vol("pump-lift-5x")}; 4x: ${vol("pump-lift-4x")}; 3x: ${vol("pump-lift-3x")}.`,
    exceptions: `Hard sets are working sets of strength intensity 1-2 plus the prescribed sets of each balance and finisher movement; conditioning is not counted. Volume on exercises with an unresolved pattern is excluded from the pattern rows (${r.q09.unresolvedPerWeek("pump-lift-5x").toFixed(1)} sets a week for Pump Lift 5x), so every number is a lower bound.`,
  });

  // R12: data limits.
  rules.push({
    title: "What the data cannot yet support",
    rule: "Rules above describe the program as published in these weeks. Gaps: four whole weeks are missing inside blocks (May 18/25 and Jun 22/29), the first block starts at Week 3, and the current block is only at Week 5.",
    evidence: `${ctx.weeksObserved} weeks observed, ${ctx.weeksMissing} missing, ${ctx.blocks} blocks. ${pct(ctx.unresolvedUses, ctx.totalUses)} of exercise uses still have no resolved pattern (data/reports/unmapped_exercises.json).`,
    exceptions: `Resolving the pattern for the top unresolved exercises (${ctx.topUnresolved.join(", ")}) would tighten the coverage, pairing and volume numbers.`,
  });
  return rules;
}
