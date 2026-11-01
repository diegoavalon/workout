import type { Slot } from "./lib.ts";
import { mdTable, pct, writeCsv, writeJson } from "./lib.ts";

// The skeleton you described, tested as a fixed role order per track family.
const HYPOTHESIS: Record<string, string> = {
  "pump-lift": "warmup>strength-intensity-1>strength-intensity-2>strength-balance>finisher>cooldown",
  "pump-condition": "warmup>strength-intensity-1>strength-balance>conditioning>cooldown",
  perform: "warmup>(hot-start|speed-strength)>strength-intensity-1>strength-balance>conditioning>cooldown",
  minimalist: "warmup>strength-intensity-1>strength-balance>conditioning>cooldown",
};
const family = (t: string) => t.replace(/-\dx$/, "");

export function run(slots: Slot[]) {
  const training = slots.filter((s) => s.sessionType === "training");
  const sig = (s: Slot) => s.sections.filter((x) => x.role !== "focus-note").map((x) => x.role).join(">");
  const hasFocus = (s: Slot) => s.sections.some((x) => x.role === "focus-note");

  const byTrack = new Map<string, Slot[]>();
  for (const s of training) (byTrack.get(s.track) ?? byTrack.set(s.track, []).get(s.track)!).push(s);

  const summary: Record<string, unknown>[] = [];
  const deviations: Record<string, unknown>[] = [];
  const signatures: Record<string, unknown>[] = [];
  for (const [track, list] of [...byTrack].sort()) {
    const re = new RegExp(`^${HYPOTHESIS[family(track)]}$`);
    const match = list.filter((s) => re.test(sig(s)));
    const counts = new Map<string, Slot[]>();
    for (const s of list) (counts.get(sig(s)) ?? counts.set(sig(s), []).get(sig(s))!).push(s);
    const modal = [...counts].sort((a, b) => b[1].length - a[1].length)[0];
    summary.push({ track, sessions: list.length, matchHypothesis: match.length, pct: pct(match.length, list.length), modalSkeleton: modal[0], modalCount: modal[1].length, withFocusNote: list.filter(hasFocus).length });
    for (const [sg, ss] of counts) signatures.push({ track, skeleton: sg, sessions: ss.length, matchesHypothesis: re.test(sg) });
    for (const s of list) if (!re.test(sig(s))) deviations.push({ track, block: s.block, week: s.week, day: s.day, date: s.date, skeleton: sig(s), focus: s.focusTopic });
  }
  writeCsv("q01-skeleton-summary", summary);
  writeCsv("q01-skeleton-signatures", signatures);
  writeCsv("q01-skeleton-deviations", deviations);

  const byDay = new Map<string, number>();
  for (const d of deviations) byDay.set(`${d.track} day ${d.day}`, (byDay.get(`${d.track} day ${d.day}`) ?? 0) + 1);
  const dayText = [...byDay].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(", ");
  const md = [
    "## 1. Skeleton validation",
    "",
    `Skeleton tested per family (focus note excluded; it is present in ${training.filter(hasFocus).length} of ${training.length} training sessions):`,
    "",
    ...Object.entries(HYPOTHESIS).map(([f, h]) => `- **${f}**: \`${h}\``),
    "",
    mdTable(summary.map((r) => [r.track as string, r.sessions as number, r.matchHypothesis as number, r.pct as string]), ["Track", "Training sessions", "Match", "%"]),
    "",
    `Deviations (${deviations.length}), all listed in \`analysis/q01-skeleton-deviations.csv\`. Where they fall: ${dayText}.`,
    "",
    mdTable(
      [...new Map(signatures.filter((r) => !r.matchesHypothesis).map((r) => [`${r.track}|${r.skeleton}`, r])).values()].map((r) => [r.track as string, `\`${r.skeleton}\``, r.sessions as number]),
      ["Track", "Skeleton", "Sessions"],
    ),
  ].join("\n");
  writeJson("q01-skeleton", { summary, deviations });
  return { md, summary, deviations };
}
