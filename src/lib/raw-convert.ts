/**
 * Converts one raw source workout-day payload (array of text/exercise items,
 * as returned by the source API) into this app's session-item format.
 * Source fields are preserved on the converted items; only the fields the
 * renderer needs are rewritten, and display-relevant source data that the
 * renderer does not read (group richText, RPE, warm-up sets, descriptions)
 * is surfaced into notes / leading text blocks instead of being dropped.
 */

export type RawObj = Record<string, unknown>;
export type ConvertReport = {
  itemsIn: number;
  itemsOut: number;
  exercises: number;
  warnings: string[];
};

const asObj = (v: unknown): RawObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as RawObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Collapse [5,5,5] -> 5 / "5"; keep varying arrays as-is. Empty slots dropped. */
export function collapsePerSet(v: unknown): unknown {
  if (!Array.isArray(v)) return v ?? undefined;
  const vals = v.filter((x) => x !== "" && x !== null && x !== undefined);
  if (!vals.length) return undefined;
  const first = vals[0];
  return vals.every((x) => String(x) === String(first)) ? first : vals;
}

function orderSubs(src: RawObj, subs: RawObj[]): RawObj[] {
  const ids = asArr(src.assignmentIds).filter((x): x is string => typeof x === "string");
  if (!ids.length) return [...subs].sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999));
  const byId = new Map(subs.map((s) => [str(s.id), s] as const));
  const out: RawObj[] = [];
  const used = new Set<RawObj>();
  for (const id of ids) {
    const s = byId.get(id);
    if (s && !used.has(s)) { out.push(s); used.add(s); }
  }
  const rest = subs.filter((s) => !used.has(s)).sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999));
  return [...out, ...rest];
}

function noteLines(src: RawObj, child: RawObj | null): string[] {
  const lines: string[] = [];
  const notes = str(src.notes);
  if (notes) lines.push(notes);
  const fmtSet = (label: string, v: unknown) => {
    const c = collapsePerSet(v);
    if (c !== undefined) lines.push(`${label}: ${Array.isArray(c) ? c.join(", ") : c}`);
  };
  fmtSet("RPE", src.rpePerSet);
  fmtSet("RIR", src.rirPerSet);
  fmtSet("Effort", src.effortPerSet);
  const pct = collapsePerSet(src.percentOf1RM);
  if (pct !== undefined) lines.push(`% of 1RM: ${Array.isArray(pct) ? pct.join(", ") : pct}`);
  const wu = asObj(src.warmUp);
  if (wu) lines.push(`Warm-up set: ${wu.sets ?? "?"} × ${JSON.stringify(wu.reps ?? "")} (exercise ${str(wu.itemId) ?? "unknown"})`);
  if (child) {
    const sub = str(child.subtitle);
    if (sub) lines.push(sub);
    const desc = str(child.description);
    if (desc) lines.push(desc);
  }
  return lines;
}

function richTextItem(id: string, order: number, deltaOpsJson: string): RawObj {
  return { order, type: "richText", itemId: id, child: { content: deltaOpsJson } };
}

export function convertDayItems(raw: unknown): { items: RawObj[]; report: ConvertReport } {
  const warnings: string[] = [];
  const top = asArr(raw).filter((x): x is RawObj => !!asObj(x));
  const sorted = [...top].sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999));
  const out: RawObj[] = [];
  let exercises = 0;

  const convertExercise = (src: RawObj, order: number): RawObj => {
    exercises++;
    const child = asObj(src.child);
    const converted: RawObj = {
      ...src,
      order,
      itemId: str(src.id) ?? `item-${order}`,
      exerciseId: str(src.itemId) ?? undefined,
      notes: noteLines(src, child).join("\n\n") || undefined,
    };
    const reps = collapsePerSet(src.reps);
    if (reps !== undefined) converted.reps = Array.isArray(reps) ? reps : String(reps);
    const times = collapsePerSet(src.times);
    if (times !== undefined) converted.times = times;
    if (Array.isArray(src.reps)) converted.repsPerSet = src.reps;
    if (Array.isArray(src.times)) converted.timesPerSet = src.times;
    return converted;
  };

  for (const src of sorted) {
    const order = out.length + 1;
    if (src.type === "text") {
      const child = asObj(src.child) ?? {};
      out.push({ ...src, order, type: "richText", itemId: str(src.id) ?? `text-${order}`, child: { ...child, content: str(child.text) ?? str(child.content) ?? "" } });
      continue;
    }
    if (src.type === "exercise") {
      const rt = str(src.richText);
      if (rt) {
        if (asArr(src.subAssignments).length) {
          out.push(richTextItem(`${str(src.id) ?? `item-${order}`}-notes`, order, rt));
        }
      }
      const subsRaw = asArr(src.subAssignments).filter((x): x is RawObj => !!asObj(x));
      if (subsRaw.length) {
        const ids = asArr(src.assignmentIds).filter((x): x is string => typeof x === "string");
        const found = new Set(subsRaw.map((s) => str(s.id)));
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length) warnings.push(`Group ${str(src.id) ?? "?"}: assignmentIds not present in subAssignments (not rendered): ${missing.join(", ")}`);
        const subs = orderSubs(src, subsRaw).map((s, i) => {
          const c = convertExercise(s, i + 1);
          return { ...c, type: "exerciseAssignment" };
        });
        out.push({ ...src, order: out.length + 1, type: "groupedAssignment", itemId: str(src.id) ?? `group-${order}`, subAssignments: subs });
      } else {
        const c = convertExercise(src, out.length + 1);
        out.push({ ...c, type: "exerciseAssignment" });
        if (rt) {
          // Single-exercise richText (rare): keep it visible after the card.
          out.push(richTextItem(`${str(src.id) ?? `item-${order}`}-notes`, out.length + 1, rt));
        }
      }
      continue;
    }
    warnings.push(`Unknown top-level item type "${String(src.type)}" (${str(src.id) ?? "?"}): passed through unchanged`);
    out.push({ ...src, order });
  }
  out.forEach((it, i) => { it.order = i + 1; });
  return { items: out, report: { itemsIn: top.length, itemsOut: out.length, exercises, warnings } };
}

/** Deduped exercise library from every embedded child snapshot in converted items. */
export function buildLibrary(itemsBySession: Iterable<RawObj[]>): { library: RawObj[]; conflicts: string[] } {
  const lib = new Map<string, RawObj>();
  const conflicts: string[] = [];
  const visit = (it: RawObj) => {
    const child = asObj(it.child);
    if (child && str(child.id) && child.id !== "superset" && str(child.title)) {
      const id = child.id as string;
      const entry: RawObj = {
        id, title: child.title,
        imageUrl: str(child.imageUrl) ?? undefined,
        videoUrl: str(child.videoUrl) ?? undefined,
        thumbnail: str(child.thumbnail) ?? undefined,
        tags: Array.isArray(child.tags) ? child.tags : [],
        logType: child.logType != null ? String(child.logType) : undefined,
      };
      const prev = lib.get(id);
      if (prev && prev.title !== entry.title) conflicts.push(`Exercise ${id}: conflicting titles "${String(prev.title)}" vs "${String(entry.title)}"`);
      if (!prev) lib.set(id, entry);
    }
    asArr(it.subAssignments).forEach((s) => { if (asObj(s)) visit(s as RawObj); });
  };
  for (const items of itemsBySession) items.forEach(visit);
  return { library: [...lib.values()], conflicts };
}
