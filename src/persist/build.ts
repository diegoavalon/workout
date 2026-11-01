import { classifyFormat, classifyRole } from "./classify.ts";
import type { Format, Role } from "./classify.ts";
import type { Catalog } from "./catalog.ts";
import { contentHash } from "./hash.ts";
import { normalizeName } from "./normalize.ts";
import type { Day, Item, Quantity, Section, TrackId, WeekFile } from "./schema.ts";
import { TRACK_IDS } from "./schema.ts";

export interface Row<T> { id: number; data: T }

export interface Dataset {
  tracks: { id: TrackId; name: string; family: string; daysPerWeek: number }[];
  blocks: { id: number; startDate: string; endDate: string; weekCount: number; startInferred: boolean }[];
  weeks: { id: number; blockId: number; weekNumber: number; startDate: string; status: "observed" | "missing"; sourceFile: string | null; noteTitle: string | null; noteBody: string | null }[];
  sessions: { id: number; type: string; focusTopic: string | null; focusBody: string | null; shortOnTime: string[]; contentHash: string }[];
  sections: { id: number; sessionId: number; position: number; label: string | null; title: string; role: Role | "weekly-note"; format: Format | null; minutesMin: number | null; minutesMax: number | null; scheme: Record<string, unknown>; notes: { label: string; text: string }[]; contentHash: string; raw: string }[];
  items: { id: number; sectionId: number; position: number; exerciseId: string | null; nameRaw: string | null; tempo: string | null; restMinSec: number | null; restMaxSec: number | null; perSide: boolean; load: { male: number | null; female: number | null; unit: string }[] | null; alternatives: string[] | null; raw: string }[];
  sets: { id: number; itemId: number; position: number; kind: string; repsMin: number | null; repsMax: number | null; repsType: string; unit: string | null; valueFemale: number | null; rpeMin: number | null; rpeMax: number | null; effort: string | null }[];
  schedule: { weekId: number; trackId: TrackId; day: number; date: string; sessionId: number }[];
  report: BuildReport;
}

export interface BuildReport {
  totalSessions: number;
  uniqueSessions: number;
  totalSections: number;
  uniqueSections: number;
  weeks: { observed: number; missing: number };
  warnings: string[];
  proseVariants: { hash: string; count: number; topics: string[] }[];
  unknownFormats: Record<string, number>;
}

const TRACKS: Dataset["tracks"] = [
  { id: "pump-lift-5x", name: "Pump Lift 5x", family: "pump-lift", daysPerWeek: 5 },
  { id: "pump-lift-4x", name: "Pump Lift 4x", family: "pump-lift", daysPerWeek: 4 },
  { id: "pump-lift-3x", name: "Pump Lift 3x", family: "pump-lift", daysPerWeek: 3 },
  { id: "pump-condition-5x", name: "Pump Condition 5x", family: "pump-condition", daysPerWeek: 5 },
  { id: "pump-condition-4x", name: "Pump Condition 4x", family: "pump-condition", daysPerWeek: 4 },
  { id: "pump-condition-3x", name: "Pump Condition 3x", family: "pump-condition", daysPerWeek: 3 },
  { id: "perform", name: "Perform", family: "perform", daysPerWeek: 5 },
  { id: "minimalist", name: "Minimalist", family: "minimalist", daysPerWeek: 4 },
];

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function restOf(text: string): [number, number] | null {
  const m = /\brest\b[^\d]*(\d+(?::\d\d)?)(?:\s*-\s*(\d+(?::\d\d)?))?\s*(sec|secs|seconds?|min|mins|minutes?)?/i.exec(text);
  if (!m) return null;
  const conv = (v: string) => (v.includes(":") ? Number(v.split(":")[0]) * 60 + Number(v.split(":")[1]) : Number(v));
  const unit = (m[3] ?? "sec").toLowerCase();
  const k = unit.startsWith("min") ? 60 : 1;
  const a = m[1].includes(":") ? conv(m[1]) : conv(m[1]) * k;
  const b = m[2] ? (m[2].includes(":") ? conv(m[2]) : conv(m[2]) * k) : a;
  return [a, b];
}

const qtyType = (q: Quantity) => (q.type === "text" ? "count" : q.type);

function schemeOf(sec: Section): Record<string, unknown> {
  const texts = [...sec.scheme, ...sec.lines.filter((l) => l.kind === "header").map((l) => l.text)];
  const out: Record<string, unknown> = { lines: texts };
  for (const t of texts) {
    const sets = /(\d+)(?:\s*-\s*(\d+))?\s+(?:working\s+)?sets?\b/i.exec(t);
    if (sets && out.setsMin === undefined) { out.setsMin = Number(sets[1]); out.setsMax = Number(sets[2] ?? sets[1]); }
    const rounds = /(\d+)(?:\s*-\s*(\d+))?\s+rounds?\b/i.exec(t);
    if (rounds && out.roundsMin === undefined) { out.roundsMin = Number(rounds[1]); out.roundsMax = Number(rounds[2] ?? rounds[1]); }
    const ladder = /^(\d+(?:-\d+){2,})(\s*(?:\.{2,}|…))?/.exec(t.trim());
    if (ladder && out.ladder === undefined) {
      out.ladder = ladder[1].split("-").map(Number);
      if (ladder[2]) out.open = true;
    }
  }
  return out;
}

/** Everything that defines a section's training content, without prose. */
function signature(sec: Section, role: string, format: Format | null): unknown {
  const nm = (n: string | null) => (n ? normalizeName(n)?.key ?? norm(n) : null);
  const q = (x: Quantity | null) => (x ? [x.type, x.min, x.max, x.female ?? null, x.perSide] : null);
  if (role === "focus-note") return ["focus", norm(sec.raw.split("\n")[1] ?? "")];
  return [
    role, format, sec.minutesMin, sec.minutesMax,
    sec.exercise ? nm(sec.exercise) : null,
    sec.scheme.map(norm),
    sec.sets.map((s) => [s.kind, q(s.reps), s.tempo, s.rpeMin, s.rpeMax, s.sameWeightAsSet1]),
    sec.lines
      .filter((l) => !["note", "legend"].includes(l.kind))
      .map((l) =>
        l.item
          ? ["item", nm(l.item.name), q(l.item.qty), l.item.tempo, l.item.loads.map((x) => [x.male, x.female, x.unit]), l.item.restRaw ? norm(l.item.restRaw) : null]
          : [l.kind, norm(l.text)],
      ),
  ];
}

export function buildDataset(weeksIn: WeekFile[], catalog: Catalog): Dataset {
  const warnings: string[] = [];
  const weeksSorted = [...weeksIn].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // Blocks: a new block starts when the week number does not increase.
  const ds: Dataset = { tracks: TRACKS, blocks: [], weeks: [], sessions: [], sections: [], items: [], sets: [], schedule: [], report: undefined as unknown as BuildReport };
  const weekRowByStart = new Map<string, number>();
  let prev: WeekFile | null = null;
  let block: Dataset["blocks"][number] | null = null;
  for (const w of weeksSorted) {
    const newBlock = !prev || w.weekNumber <= prev.weekNumber;
    if (newBlock) {
      const startInferred = w.weekNumber !== 1;
      block = { id: ds.blocks.length + 1, startDate: addDays(w.weekStart, -7 * (w.weekNumber - 1)), endDate: addDays(w.weekStart, 6), weekCount: w.weekNumber, startInferred };
      ds.blocks.push(block);
    } else if (prev) {
      const k = w.weekNumber - prev.weekNumber;
      const gap = daysBetween(prev.weekStart, w.weekStart);
      if (gap !== 7 * k) warnings.push(`${w.sourceFile}: week ${prev.weekNumber}->${w.weekNumber} but ${gap} days apart`);
      for (let i = 1; i < k; i++) {
        ds.weeks.push({ id: ds.weeks.length + 1, blockId: block!.id, weekNumber: prev.weekNumber + i, startDate: addDays(prev.weekStart, 7 * i), status: "missing", sourceFile: null, noteTitle: null, noteBody: null });
      }
    }
    block!.endDate = addDays(w.weekStart, 6);
    block!.weekCount = Math.max(block!.weekCount, w.weekNumber);
    const id = ds.weeks.length + 1;
    ds.weeks.push({ id, blockId: block!.id, weekNumber: w.weekNumber, startDate: w.weekStart, status: "observed", sourceFile: w.sourceFile, noteTitle: null, noteBody: null });
    weekRowByStart.set(w.weekStart, id);
    prev = w;
  }

  const sessionByHash = new Map<string, number>();
  const sectionHashes = new Set<string>();
  const variants = new Map<string, { count: number; topics: Set<string> }>();
  const unknownFormats: Record<string, number> = {};
  let totalSessions = 0;
  let totalSections = 0;

  const addSession = (day: Day): number => {
    totalSessions++;
    const strengthAt = day.sections.findIndex((s) => s.kind === "strength");
    const built = day.sections.map((sec, i) => {
      const role = classifyRole(sec, strengthAt < 0 ? false : i < strengthAt) as Role;
      // With no strength section, a freeform section is conditioning, not a hot start.
      const finalRole = strengthAt < 0 && role === "hot-start" && !/hot start/i.test(sec.title) ? "conditioning" : role;
      const format = classifyFormat(sec, finalRole);
      return { sec, role: finalRole as string, format, hash: contentHash(signature(sec, finalRole, format)) };
    });
    if (day.sessionType === "note") {
      const body = (day.noteBody ?? "").replace(/\s+/g, " ").trim();
      built.push({
        sec: { label: null, title: "Weekly note", minutesMin: null, minutesMax: null, kind: "note", exercise: null, scheme: [], sets: [], lines: [], notes: [], raw: day.noteBody ?? "" },
        role: "weekly-note", format: null, hash: contentHash(["note", body.toLowerCase()]),
      });
    }
    totalSections += built.length;
    built.forEach((b) => sectionHashes.add(b.hash));
    const hash = contentHash([day.sessionType, built.map((b) => b.hash)]);
    const existing = sessionByHash.get(hash);
    if (existing) {
      const v = variants.get(hash) ?? { count: 0, topics: new Set<string>() };
      v.count++;
      if (day.focusTopic) v.topics.add(day.focusTopic);
      variants.set(hash, v);
      return existing;
    }
    const id = ds.sessions.length + 1;
    sessionByHash.set(hash, id);
    ds.sessions.push({ id, type: day.sessionType, focusTopic: day.focusTopic, focusBody: day.focusBody ?? (day.sessionType === "note" ? day.noteBody : null), shortOnTime: day.shortOnTime, contentHash: hash });

    built.forEach((b, pos) => {
      if (b.format === null && !["focus-note", "weekly-note", "warmup", "cooldown", "mobility", "active-recovery"].includes(b.role)) {
        unknownFormats[b.sec.title] = (unknownFormats[b.sec.title] ?? 0) + 1;
      }
      const sectionId = ds.sections.length + 1;
      ds.sections.push({
        id: sectionId, sessionId: id, position: pos + 1, label: b.sec.label, title: b.sec.title,
        role: b.role as Role, format: b.format, minutesMin: b.sec.minutesMin, minutesMax: b.sec.minutesMax,
        scheme: schemeOf(b.sec), notes: b.sec.notes, contentHash: b.hash, raw: b.sec.raw,
      });
      addItems(sectionId, b.sec);
    });
    return id;
  };

  const exerciseId = (name: string | null) => {
    const t = name?.replace(/\s+/g, " ").trim();
    return t ? catalog.aliasToId[t] ?? null : null;
  };

  const addItem = (sectionId: number, position: number, it: { name: string | null; raw: string; tempo: string | null; rest: [number, number] | null; perSide: boolean; loads: Item["loads"] }) => {
    const t = it.name?.replace(/\s+/g, " ").trim() ?? null;
    const id = ds.items.length + 1;
    ds.items.push({
      id, sectionId, position, exerciseId: exerciseId(it.name), nameRaw: t, tempo: it.tempo,
      restMinSec: it.rest?.[0] ?? null, restMaxSec: it.rest?.[1] ?? null, perSide: it.perSide,
      load: it.loads.length ? it.loads.map((l) => ({ male: l.male, female: l.female, unit: l.unit })) : null,
      alternatives: t && catalog.aliasAlternatives[t] ? catalog.aliasAlternatives[t] : null, raw: it.raw,
    });
    return id;
  };

  const addItems = (sectionId: number, sec: Section) => {
    if (sec.kind === "strength") {
      if (!sec.exercise) return;
      const working = sec.sets.find((s) => s.kind === "working");
      const restText = sec.scheme.find((x) => /\brest\b/i.test(x)) ?? "";
      const id = addItem(sectionId, 1, { name: sec.exercise, raw: sec.exercise, tempo: working?.tempo ?? sec.sets[0]?.tempo ?? null, rest: restOf(restText), perSide: sec.sets.some((s) => s.reps?.perSide), loads: [] });
      sec.sets.forEach((s, i) => {
        ds.sets.push({
          id: ds.sets.length + 1, itemId: id, position: i + 1, kind: s.kind,
          repsMin: s.reps?.min ?? null, repsMax: s.reps?.max ?? null, repsType: s.reps ? qtyType(s.reps) : "count",
          unit: s.reps?.unit ?? null, valueFemale: null, rpeMin: s.rpeMin, rpeMax: s.rpeMax, effort: s.effort,
        });
      });
      return;
    }
    let pos = 0;
    let lastItemRow: Dataset["items"][number] | null = null;
    for (const l of sec.lines) {
      if (l.kind === "rest" && lastItemRow && lastItemRow.restMinSec === null) {
        const r = restOf(l.text);
        if (r) { lastItemRow.restMinSec = r[0]; lastItemRow.restMaxSec = r[1]; }
        continue;
      }
      if (!l.item) continue;
      const it = l.item;
      const inline = it.restRaw ? restOf(it.restRaw) : null;
      const id = addItem(sectionId, ++pos, { name: it.name, raw: it.raw, tempo: it.tempo, rest: inline, perSide: !!it.qty?.perSide, loads: it.loads });
      lastItemRow = ds.items[ds.items.length - 1];
      if (it.qty) {
        ds.sets.push({
          id: ds.sets.length + 1, itemId: id, position: 1, kind: "working",
          repsMin: it.qty.min, repsMax: it.qty.max, repsType: qtyType(it.qty), unit: it.qty.unit,
          valueFemale: it.qty.female ?? null, rpeMin: null, rpeMax: null, effort: null,
        });
      }
    }
  };

  // Schedule.
  const noteFor = new Map<number, { title: string | null; body: string }>();
  for (const w of weeksSorted) {
    const weekId = weekRowByStart.get(w.weekStart)!;
    for (const trackId of TRACK_IDS) {
      for (const day of w.tracks[trackId] ?? []) {
        const sessionId = addSession(day);
        ds.schedule.push({ weekId, trackId, day: day.day, date: day.date, sessionId });
        if (day.sessionType === "note" && day.noteBody && !noteFor.has(weekId)) {
          const first = day.noteBody.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
          noteFor.set(weekId, { title: first.length <= 80 && !/[.!?]$/.test(first) ? first : null, body: day.noteBody });
        }
      }
    }
  }
  for (const wk of ds.weeks) {
    const n = noteFor.get(wk.id);
    if (n) { wk.noteTitle = n.title; wk.noteBody = n.body; }
  }

  ds.report = {
    totalSessions, uniqueSessions: ds.sessions.length, totalSections, uniqueSections: sectionHashes.size,
    weeks: { observed: ds.weeks.filter((x) => x.status === "observed").length, missing: ds.weeks.filter((x) => x.status === "missing").length },
    warnings,
    proseVariants: [...variants].filter(([, v]) => v.topics.size > 1).map(([hash, v]) => ({ hash, count: v.count, topics: [...v.topics] })),
    unknownFormats,
  };
  return ds;
}
