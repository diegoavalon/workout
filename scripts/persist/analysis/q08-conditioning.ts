import { mdTable } from "./lib.ts";

export function run(res: Record<string, Record<string, unknown>[]>) {
  const lib = res["q08-conditioning-library"];
  const mv = res["q08-conditioning-movements"];
  const byFmt = new Map<string, { sections: number; mins: number[]; maxs: number[]; titles: Set<string> }>();
  for (const r of lib) {
    const k = `${r.role}|${r.format}`;
    const e = byFmt.get(k) ?? { sections: 0, mins: [], maxs: [], titles: new Set() };
    e.sections++;
    if (r.minutes_min != null) e.mins.push(Number(r.minutes_min));
    if (r.minutes_max != null) e.maxs.push(Number(r.minutes_max));
    e.titles.add(String(r.title).replace(/\s*\(.*$/, ""));
    byFmt.set(k, e);
  }
  const movesBy = new Map<string, Map<string, number>>();
  const equipBy = new Map<string, Map<string, number>>();
  for (const r of mv) {
    const k = `${r.role}|${r.format}`;
    const m = movesBy.get(k) ?? new Map<string, number>();
    m.set(String(r.movement), (m.get(String(r.movement)) ?? 0) + Number(r.sections));
    movesBy.set(k, m);
    const eq = equipBy.get(k) ?? new Map<string, number>();
    for (const x of (r.equipment ? JSON.parse(String(r.equipment)) : []) as string[]) eq.set(x, (eq.get(x) ?? 0) + Number(r.sections));
    equipBy.set(k, eq);
  }
  const top = (m: Map<string, number> | undefined, n: number) => m ? [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} (${c})`).join(", ") : "";
  const range = (a: number[], b: number[]) => (a.length ? `${Math.min(...a)}-${Math.max(...b.length ? b : a)}` : "n/a");
  const rows = [...byFmt].sort((a, b) => b[1].sections - a[1].sections).map(([k, e]) => {
    const [role, format] = k.split("|");
    return [role, format, e.sections, range(e.mins, e.maxs), top(equipBy.get(k), 4), top(movesBy.get(k), 5)];
  });
  const md = [
    "## 8. Conditioning library",
    "",
    `${lib.length} distinct conditioning-style sections (conditioning, finisher, hot start, speed strength), each listed with format, time domain and movements in \`analysis/q08-conditioning-library.csv\`. Formats are assigned only from explicit wording, so \`unclassified\` sections are ones that name no format (for example "for quality" rounds or continuous-clock pieces); their count is in the table.`,
    "",
    mdTable(rows as string[][], ["Role", "Format", "Distinct sections", "Minutes", "Equipment (sections)", "Top movements (sections)"]),
  ].join("\n");
  return { md, rows, total: lib.length };
}
