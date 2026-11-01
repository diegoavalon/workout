import { mdTable, pct } from "./lib.ts";

const GROUP: Record<string, string> = {
  "horizontal-press": "push", "vertical-press": "push",
  "horizontal-pull": "pull", "vertical-pull": "pull",
  squat: "knee", "lunge-single-leg": "knee", hinge: "hip",
  "isolation-arms": "arms", "isolation-shoulders": "shoulders", "isolation-legs": "legs",
  core: "core", mobility: "mobility", carry: "carry",
};

export function run(res: Record<string, Record<string, unknown>[]>) {
  const pairs = res["q07-pairings-patterns"];
  const total = pairs.reduce((n, r) => n + Number(r.supersets), 0);
  const known = pairs.filter((r) => r.pattern_1 !== "unresolved" && r.pattern_2 !== "unresolved");
  const knownTotal = known.reduce((n, r) => n + Number(r.supersets), 0);
  const cls = new Map<string, number>();
  for (const r of known) {
    const a = GROUP[String(r.pattern_1)] ?? String(r.pattern_1);
    const b = GROUP[String(r.pattern_2)] ?? String(r.pattern_2);
    const key = a === b ? `same group (${a})` : [a, b].sort().join(" + ");
    cls.set(key, (cls.get(key) ?? 0) + Number(r.supersets));
  }
  const rows = [...cls].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => [k, n, pct(n, knownTotal)]);

  const vs = res["q07-pairings-vs-main-lift"];
  const byMain = new Map<string, Map<string, number>>();
  for (const r of vs) {
    const main = String(r.main_lift_pattern);
    const a = GROUP[String(r.balance_1)] ?? String(r.balance_1);
    const b = GROUP[String(r.balance_2)] ?? String(r.balance_2);
    const k = [a, b].sort().join(" + ");
    const m = byMain.get(main) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + Number(r.sessions));
    byMain.set(main, m);
  }
  const mainRows = [...byMain].map(([main, m]) => {
    const n = [...m.values()].reduce((x, y) => x + y, 0);
    return [main, n, [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `${k} (${c})`).join("<br>")];
  }).sort((a, b) => Number(b[1]) - Number(a[1]));

  const top = res["q07-pairings-exercises"].slice(0, 8).map((r) => [String(r.exercise_1), String(r.exercise_2), Number(r.supersets)]);
  const md = [
    "## 7. Accessory pairings",
    "",
    `${total} strength-balance supersets (unique sessions) with two or more movements; ${knownTotal} have both patterns resolved. Pair types by movement group (push = presses, pull = rows and pull-ups, knee = squats and lunges, hip = hinges):`,
    "",
    mdTable(rows as string[][], ["Pair type", "Supersets", "% of resolved"]),
    "",
    "What the superset trains, by the pattern of the same session's main lift (`analysis/q07-pairings-vs-main-lift.csv`):",
    "",
    mdTable(mainRows as string[][], ["Main lift pattern", "Sessions", "Top balance pairings"]),
    "",
    "Most repeated exercise pairs (`analysis/q07-pairings-exercises.csv`):",
    "",
    mdTable(top as string[][], ["Exercise 1", "Exercise 2", "Supersets"]),
  ].join("\n");
  return { md, classes: [...cls].sort((a, b) => b[1] - a[1]), knownTotal, total, byMain: mainRows };
}
