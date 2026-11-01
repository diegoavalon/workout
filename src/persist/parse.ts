import type {
  Correction,
  Day,
  Item,
  Line,
  Quantity,
  Section,
  SetLine,
  TrackId,
  UnparsedLine,
  WeekFile,
} from "./schema.ts";

export interface ParseResult {
  week: WeekFile;
  corrections: Correction[];
  unparsed: UnparsedLine[];
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DATE_RE =
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/;
const TRACK_RE = /^(Pump Lift|Pump Cond(?:ition)?|Perform|Minimalist)(?:\s+(\d)x)?\s*$/i;
const DAY_HEADER_RE = /^Week\s+(\d+)\s+Day\s+(\d+)\s*[-–]\s*(.*)$/;
const SECTION_RE = /^([A-H])\)\.?\s+(.*)$/;
const UNLABELED_SECTION_RE =
  /^((?:Warm\s?-?up|Cooldown|Strength (?:Balance|Intensity[^(]*)|Finisher)\s*\(\d+(?:-\d+)?\s*min(?:ute)?s?\)):?\s*$/i;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function parsePrintedDate(line: string): string | null {
  const m = DATE_RE.exec(line.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (!month) return null;
  return iso(Number(m[4]), month, Number(m[3]));
}

export function trackFromName(name: string): TrackId | null {
  const m = TRACK_RE.exec(name.replace(/^Persist\s+/i, "").trim());
  if (!m) return null;
  const fam = m[1].toLowerCase();
  const freq = m[2];
  if (fam === "perform") return "perform";
  if (fam === "minimalist") return "minimalist";
  if (!freq) return null;
  return `${fam.startsWith("pump lift") ? "pump-lift" : "pump-condition"}-${freq}x` as TrackId;
}

// ---------------------------------------------------------------------------
// Quantities and items

const num = (s: string) => Number(s);

export function parseQuantity(spec: string): Quantity | null {
  const s = spec.trim();
  const perSide = /\/\s*(side|leg|arm)\b/i.test(s) || /\bper side\b/i.test(s);
  let m: RegExpExecArray | null;
  if ((m = /^max(?:imum)?\b/i.exec(s)) || (m = /\bmax(?: unbroken)? reps\b/i.exec(s)) || (!/^\d/.test(s) && (m = /\bmax\b/i.exec(s)))) {
    return { type: "max", min: null, max: null, perSide, unit: "reps", raw: s };
  }
  if ((m = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:\/\s*\d+)?\s*(cal|calories)\b/i.exec(s))) {
    return { type: "calories", min: num(m[1]), max: num(m[2] ?? m[1]), perSide, unit: "cal", raw: s };
  }
  if ((m = /(\d+(?:,\d{3})?(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(km|mi|miles?|meters?|metres?|m|yds?|yards?|ft|')(?!\w)/i.exec(s))) {
    return { type: "distance", min: num(m[1].replace(",", "")), max: num(m[2] ?? m[1].replace(",", "")), perSide, unit: m[3].toLowerCase(), raw: s };
  }
  if ((m = /(\d+(?::\d\d)?)(?:\s*-\s*(\d+(?::\d\d)?))?\s*(sec|secs|seconds?|s)\b/i.exec(s))) {
    return { type: "seconds", min: secs(m[1]), max: secs(m[2] ?? m[1]), perSide, unit: "sec", raw: s };
  }
  if ((m = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(min|mins|minutes?)\b/i.exec(s))) {
    return { type: "minutes", min: num(m[1]), max: num(m[2] ?? m[1]), perSide, unit: "min", raw: s };
  }
  if ((m = /^(\d+)\.(\d+)\.(\d+)(?:\s*reps?)?\b/i.exec(s))) {
    // cluster notation, e.g. 3.3.3
    const total = num(m[1]) + num(m[2]) + num(m[3]);
    return { type: "count", min: total, max: total, perSide, unit: "cluster", raw: s };
  }
  if ((m = /(\d+)(?:\s*-\s*(\d+))?\s*(reps?|rep)?(?=\s|$|\/|\(|,|@)/i.exec(s))) {
    return { type: "count", min: num(m[1]), max: num(m[2] ?? m[1]), perSide, unit: "reps", raw: s };
  }
  return null;
}

function secs(s: string): number {
  if (s.includes(":")) {
    const [mm, ss] = s.split(":").map(Number);
    return mm * 60 + ss;
  }
  return Number(s);
}

const TEMPO_RE = /@\s*([0-9X]{4})\b(?:\s*Tempo)?/i;
const LOAD_RE = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(#|lbs?|kg)/gi;

function parseLoads(s: string) {
  const out: Item["loads"] = [];
  for (const m of s.matchAll(LOAD_RE)) {
    out.push({
      male: num(m[1]),
      female: num(m[2]),
      unit: m[3].toLowerCase() === "kg" ? "kg" : "lb",
      raw: m[0],
    });
  }
  return out;
}

function emptyItem(raw: string): Item {
  return { raw, index: null, name: null, qty: null, tempo: null, loads: [], restRaw: null, extras: [] };
}

const INDEX_RE = /^(?:(\d+)[.)]|[A-F]\.\s|(\d+(?:st|nd|rd|th))(?:\s*Set)?\s*[-)]|Min\s+(\d+)\))\s*(.*)$/;
const LEADING_QTY_RE =
  /^(\d+(?::\d\d)?(?:\s*-\s*\d+)?)\s*(reps?|sec|secs|seconds?|min|mins|minutes?|m|km|ft|'|meters?|cal|Cal|calories?|x)?\s+(?=[A-Za-z])(.+)$/;
const PAIR_QTY_RE = /^(\d+)\s*\/\s*(\d+)\s*(m|km|cal|calor(?:ie|ies)|reps?)?\s+(?=[A-Za-z])(.+)$/i;

export function parseItem(text: string): Item | null {
  let body = text.trim();
  const it = emptyItem(text);
  const idx = INDEX_RE.exec(body);
  if (idx) {
    it.index = idx[1] ?? idx[2] ?? idx[3] ?? idx[0].split(".")[0];
    body = idx[4];
  }
  const tm = TEMPO_RE.exec(body);
  if (tm) {
    it.tempo = tm[1].toUpperCase();
    body = body.replace(TEMPO_RE, "").trim();
  }
  it.loads = parseLoads(body);
  body = body.replace(LOAD_RE, "").replace(/\(\s*\)/g, "").trim();
  // Trailing qualifiers stay out of the name but are kept.
  body = body.replace(/^"(.*)"$/, "$1");
  for (const re of [/\s*\d+(?:-\d+)?\s*\/\s*\d+\s*["”]/, /\s*\((?:R\s*\+\s*L\s*=\s*\d+)\)/i, /\s*\((?:Male\/Female|M\/F)\)/i, /\s*@\s*(?:\d+\s*%|high|moderate|easy|max)[^;]*$/i]) {
    const m = re.exec(body);
    if (m) {
      it.extras.push(m[0].trim());
      body = body.replace(re, "").trim();
    }
  }

  // Interval prescriptions: "2:00 @65% effort"
  const mins = /^(\d+)\s*mins?$/i.exec(body);
  if (mins && it.extras.length) {
    it.qty = { type: "minutes", min: num(mins[1]), max: num(mins[1]), perSide: false, unit: "min", raw: body };
    return it;
  }
  const iv = /^(\d+:\d\d)\s*$/.exec(body);
  if (iv && it.extras.length) {
    it.qty = { type: "seconds", min: secs(iv[1]), max: secs(iv[1]), perSide: false, unit: "sec", raw: iv[1] };
    return it;
  }

  const minAt = /^(\d+)\s*mins?\s*@\s*(\d+)\s*%\s*$/i.exec(body);
  if (minAt) {
    it.qty = { type: "minutes", min: num(minAt[1]), max: num(minAt[1]), perSide: false, unit: "min", raw: body };
    it.extras.push(`@${minAt[2]}%`);
    return it;
  }
  const side = /^(\d+(?:-\d+)?)\s*(sec|m|ft|')?\s*\/\s*(side|leg|arm)\s+(?=[A-Za-z])(.+)$/i.exec(body);
  if (side) {
    const [lo, hi] = side[1].split("-").map(Number);
    it.qty = { type: side[2] === "sec" ? "seconds" : side[2] ? "distance" : "count", min: lo, max: hi ?? lo, perSide: true, unit: side[2] ?? "reps", raw: `${side[1]}${side[2] ?? ""}/${side[3]}` };
    it.name = side[4].trim();
    return it;
  }
  const dualUnit = /^(\d+)\s*(m|km|k|ft)\s*\/\s*(\d+)\s*(m|km|ft)?\s+(?=[A-Za-z])(.+)$/i.exec(body);
  if (dualUnit) {
    const unit = (dualUnit[4] ?? dualUnit[2]).toLowerCase();
    const scale = dualUnit[2].toLowerCase() === "k" ? 1000 : 1;
    it.qty = { type: "distance", min: num(dualUnit[1]) * scale, max: num(dualUnit[1]) * scale, female: num(dualUnit[3]), perSide: false, unit: scale === 1000 ? "m" : unit, raw: `${dualUnit[1]}${dualUnit[2]}/${dualUnit[3]}${dualUnit[4] ?? ""}` };
    it.name = dualUnit[5].trim();
    return it;
  }

  const semi = body.indexOf(";");
  if (semi > 0) {
    it.name = body.slice(0, semi).trim();
    const spec = body.slice(semi + 1).trim();
    it.qty = parseQuantity(spec);
    const rest = /\brest\b.*/i.exec(spec);
    if (rest) it.restRaw = rest[0];
    if (!it.qty) it.extras.push(spec);
    return it;
  }
  const pair = PAIR_QTY_RE.exec(body);
  if (pair) {
    const unit = pair[3]?.toLowerCase() ?? (/cal/i.test(pair[4]) ? "cal" : "");
    const type = /^cal/.test(unit) ? "calories" : /^(m|km)$/.test(unit) ? "distance" : "count";
    it.qty = { type, min: num(pair[1]), max: num(pair[1]), female: num(pair[2]), perSide: false, unit: unit || null, raw: `${pair[1]}/${pair[2]}${unit ? " " + unit : ""}` };
    it.name = pair[4].trim();
    return it;
  }
  const lq = LEADING_QTY_RE.exec(body);
  if (lq) {
    const unit = lq[2] ?? "";
    it.qty = parseQuantity(`${lq[1]} ${unit}`.trim()) ?? parseQuantity(lq[1]);
    it.name = lq[3].trim();
    if (it.qty && /\/\s*(side|leg|arm)\b/i.test(it.name)) it.qty.perSide = true;
    return it;
  }
  const withX = /^([A-Za-z][^;]*?)\s+x\s*(\d.*)$/i.exec(body);
  if (withX) {
    it.name = withX[1].trim();
    it.qty = parseQuantity(withX[2]);
    if (!it.qty) it.extras.push(withX[2]);
    return it;
  }
  const trailingDist = /^([A-Za-z][^;]*?)\s+(\d+(?:\/\d+)?(?:-\d+)?\s*(?:m|km|ft|cals?|calories))\b\s*(.*)$/i.exec(body);
  if (trailingDist) {
    it.name = trailingDist[1].trim();
    it.qty = parseQuantity(trailingDist[2].replace(/(\d+)\/(\d+)/, "$1"));
    const fem = /(\d+)\/(\d+)/.exec(trailingDist[2]);
    if (it.qty && fem) it.qty.female = num(fem[2]);
    if (trailingDist[3]) it.extras.push(trailingDist[3]);
    return it;
  }
  const trailingReps = /^([A-Za-z][^;]*?)\s+(\d+(?:-\d+)?\s*reps?(?:\s*\/\s*(?:side|leg|arm))?)$/i.exec(body);
  if (trailingReps) {
    it.name = trailingReps[1].trim();
    it.qty = parseQuantity(trailingReps[2]);
    return it;
  }
  const trailing = /^(.+?)\s+(\d+(?::\d\d)?\s*(?:sec|secs|seconds?|min|mins|minutes?))\b\s*(.*)$/i.exec(body);
  if (trailing && /^[A-Za-z]/.test(trailing[1])) {
    it.name = trailing[1].trim();
    it.qty = parseQuantity(trailing[2]);
    if (trailing[3]) it.extras.push(trailing[3]);
    return it;
  }
  if (idx) {
    it.name = body;
    return it;
  }
  // A bare exercise name (no digits at the start, no sentence punctuation).
  if (/^[A-Z][A-Za-z0-9 /,'’+()&"-]{2,80}$/.test(body) && !/[.:]$/.test(body) && body.split(/\s+/).length <= 9) {
    it.name = body;
    return it;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sections

type Role =
  | "focus" | "warmup" | "cooldown" | "strength" | "balance" | "finisher"
  | "recovery" | "mobility" | "note" | "other";

function sectionRole(title: string): Role {
  const t = title.toLowerCase();
  if (/daily focus/.test(t)) return "focus";
  if (/coach notes?/.test(t)) return "note";
  if (/recovery mobility/.test(t)) return "mobility";
  if (/active recovery/.test(t)) return "recovery";
  if (/^warm\s?-?\s?up/.test(t)) return "warmup";
  if (/^cool\s?-?\s?down/.test(t)) return "cooldown";
  if (/^strength intensity/.test(t)) return "strength";
  if (/^strength balance/.test(t)) return "balance";
  if (/^finisher/.test(t)) return "finisher";
  return "other";
}

const SET_RE = /^(Warm-?\s?Up Set|Working Set)(?:\s*(\d+))?\s*[-–:]\s*(.+)$/i;
const SET_N_RE = /^Set\s+(\d+)\s*:\s*(.+)$/i;
const NOTE_START_RE = /^((?:[A-Za-z/-]+\s){0,3}[Nn]otes?|Goal)\s*(?::|\s-)\s*(.*)$/;
const LEGEND_RE = /^RPE\s*=/i;
const HEADER_RES = [
  /^\d+(?:\s*-\s*\d+)?\s+(?:working\s+)?(?:sets?|rounds?)\b/i,
  /^(?:x\s*\d+\s*sets?)\b/i,
  /^(?:EMOM|AMRAP|For Time|Every\s+\d|Intervals?|Ladder|Tabata|Rounds? for time|Cluster|Run the Rack)/i,
  /^\d+\s*min(?:ute)?s?\s*(?:TIMER|AMRAP|EMOM|CAP)\b/i,
  /^\*?\s*\d+\s*min(?:ute)?s?\s*CAP\b/i,
  /^\d+(?:\s*-\s*\d+)+\s*$/,
  /^x\s*\d+/i,
  /^Barbell Warm-?up:?$/i,
  /^Sets?\s+\d+(?:\s*-\s*\d+)?\s*:/i,
  /^Then[,:]?\s/i,
  /^Rest\s+\d/i,
  /^Part\s+\d+\b/i,
  /^Week\s+\d+\b/i,
  /^\d+(?:-\d+){2,}/,
  /\bat mins?\b/i,
  /^\*?\s*\d+\s*(?:min|m|ft)?\s*(?:time\s*)?cap\b/i,
  /^[A-Z][A-Za-z ]{2,40}:$/,
  /^then(?:\s+stop\s+and\s+do(?:\s+the\s+following)?)?:?$/i,
  /^\d+\s*min(?:ute)?s?\s+total\b/i,
];

/** Parse-time cleanup only; the original text is kept in `raw`. */
function norm(l: string): string {
  return l
    .replace(/\\([*+#\-_.])/g, "$1")
    .replace(/×/g, "x")
    .replace(/(\d)-(sec|min)\b/gi, "$1 $2")
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\u2026/g, "...");
}

function parenBalance(s: string): number {
  let b = 0;
  for (const ch of s) b += ch === "(" ? 1 : ch === ")" ? -1 : 0;
  return b;
}

function parseSetLine(text: string, position: number): SetLine | null {
  let kind: "warmup" | "working";
  let rest: string;
  let pos = position;
  const m = SET_RE.exec(text);
  const n = m ? null : SET_N_RE.exec(text);
  if (m) {
    kind = /warm/i.test(m[1]) ? "warmup" : "working";
    rest = m[3];
    if (m[2]) pos = Number(m[2]);
  } else if (n) {
    kind = "working";
    pos = Number(n[1]);
    rest = n[2];
  } else return null;

  const tm = TEMPO_RE.exec(rest);
  const rpe = /RPE\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/i.exec(rest);
  let repsPart = rest.split("@")[0].split(/\s-\s/)[0];
  // "Reduce weight from last set by 5-10% and perform 6": the instruction is not the rep count.
  const perform = /^(.*?)\bperform\s+(?:a\s+)?(.*)$/i.exec(repsPart);
  let instruction: string | null = null;
  if (perform) {
    instruction = perform[1].trim().replace(/\s+and$/i, "") || null;
    repsPart = perform[2];
  }
  const easy = /\bEasy\b/i.test(rest);
  return {
    raw: text,
    kind,
    position: pos,
    reps: parseQuantity(repsPart),
    tempo: tm ? tm[1].toUpperCase() : null,
    rpeMin: rpe ? num(rpe[1]) : null,
    rpeMax: rpe ? num(rpe[2] ?? rpe[1]) : null,
    effort: easy ? "easy" : instruction,
    sameWeightAsSet1: /set 1 weight/i.test(rest),
  };
}

/** Wrapped commentary: sentences, asterisk or parenthesised remarks, lowercase continuations. */
function isProse(t: string): boolean {
  if (/^[*(]/.test(t) || /^[a-z]/.test(t)) return true;
  const words = t.split(/\s+/).length;
  if (words >= 8 && !t.includes(";")) return true;
  return words >= 5 && /[.,;:!?-]$/.test(t);
}

function classifyLine(text: string): Line["kind"] {
  if (/^\+$/.test(text) || /^directly into$/i.test(text) || /^then$/i.test(text)) return "connector";
  if (/^[-–]?\s*rest\b/i.test(text)) return "rest";
  if (HEADER_RES.some((re) => re.test(text))) return "header";
  return "text";
}

export interface SectionCtx {
  file: string;
  location: string;
  unparsed: UnparsedLine[];
}

export function parseSection(label: string | null, title: string, bodyLines: string[], ctx: SectionCtx, raw: string): Section {
  const role = sectionRole(title);
  const mins = /\((\d+)(?:\s*-\s*(\d+))?\s*min(?:ute)?s?(?:\s+time cap)?\)/i.exec(title);
  const sec: Section = {
    label,
    title,
    minutesMin: mins ? num(mins[1]) : null,
    minutesMax: mins ? num(mins[2] ?? mins[1]) : null,
    kind: role === "focus" ? "focus" : role === "strength" ? "strength" : role === "note" ? "note" : role === "other" ? "freeform" : "list",
    exercise: null,
    scheme: [],
    sets: [],
    lines: [],
    notes: [],
    raw,
  };

  let i = 0;
  let setPos = 0;
  let sawExercise = false;
  const L = bodyLines.map(norm);
  const flag = (text: string, reason: string) =>
    ctx.unparsed.push({ file: ctx.file, location: ctx.location, section: title, text, reason });

  while (i < L.length) {
    const t = L[i].trim();
    if (!t) { i++; continue; }

    if (/^[:\\]*-*$/.test(t) && t.length <= 2) {
      if (t.includes("-")) sec.lines.push({ kind: "connector", text: t, item: null });
      i++;
      continue;
    }
    // "@30X0" on a line of its own belongs to the line before it.
    const tempoOnly = /^@\s*([0-9X]{4})\b/i.exec(t);
    const prevLine = sec.lines[sec.lines.length - 1];
    if (tempoOnly && prevLine?.item) {
      prevLine.item.tempo = tempoOnly[1].toUpperCase();
      prevLine.text += " " + t;
      i++;
      continue;
    }

    if (LEGEND_RE.test(t)) {
      let txt = t;
      while (i + 1 < L.length && L[i + 1].trim() && !SET_RE.test(L[i + 1].trim()) && !NOTE_START_RE.test(L[i + 1].trim())) txt += " " + L[++i].trim();
      sec.lines.push({ kind: "legend", text: txt, item: null });
      i++;
      continue;
    }

    const ns = NOTE_START_RE.exec(t);
    if (ns && !SET_RE.test(t)) {
      let txt = ns[2];
      while (i + 1 < L.length && L[i + 1].trim()) txt += (txt ? " " : "") + L[++i].trim();
      sec.notes.push({ label: ns[1], text: txt.trim() });
      i++;
      continue;
    }

    if (sec.kind === "strength") {
      const s = parseSetLine(t, setPos + 1);
      if (s) {
        sec.sets.push(s);
        setPos = s.position;
        if (!s.reps) flag(t, "set-reps-unparsed");
        i++;
        continue;
      }
      if (!sawExercise && !HEADER_RES.some((re) => re.test(t)) && !/^[-–]?\s*rest/i.test(t)) {
        // Some weeks put the whole prescription on the exercise line: "Back Squat; 4-6 reps @24X1 Tempo; rest 2 min".
        const semi = t.indexOf(";");
        sec.exercise = semi > 0 ? t.slice(0, semi).trim() : t;
        if (semi > 0) sec.scheme.push(t.slice(semi + 1).trim());
        sawExercise = true;
        i++;
        continue;
      }
    }

    // Join soft-wrapped continuation lines onto an item whose parentheses are open.
    let text = t.replace(/^(?:\\?[-•–]\s*)+(?=\S)/, "");
    if (text !== t && !text) { i++; continue; }
    while (parenBalance(text) > 0 && i + 1 < L.length && L[i + 1].trim()) text += " " + L[++i].trim();

    if (sec.kind === "strength" && (HEADER_RES.some((re) => re.test(text)) || /^[-–]?\s*rest/i.test(text))) {
      sec.scheme.push(text);
      i++;
      continue;
    }

    // The first bare line of a mobility session names its focus area ("Shoulder Flexion").
    if (role === "mobility" && !sec.lines.length && !sec.scheme.length && !INDEX_RE.test(text) && !text.includes(" x ") && !/\d/.test(text)) {
      sec.scheme.push(text);
      i++;
      continue;
    }
    const k = classifyLine(text);
    if (k === "text" && isProse(text)) {
      sec.lines.push({ kind: "note", text, item: null });
    } else if (k !== "text") {
      sec.lines.push({ kind: k, text, item: null });
    } else {
      const item = parseItem(text);
      if (item && (item.name || item.qty)) {
        sec.lines.push({ kind: "item", text, item });
      } else {
        sec.lines.push({ kind: "text", text, item: null });
        if (sec.kind !== "focus" && sec.kind !== "note") {
          const soft = sec.lines.length > 1 && sec.lines[sec.lines.length - 2].kind === "text";
          if (!soft) flag(text, `unclassified-line-in-${sec.kind}`);
        }
      }
    }
    i++;
  }
  return sec;
}

// ---------------------------------------------------------------------------
// Files

interface RawDay {
  track: TrackId | null;
  trackLabel: string;
  week: number;
  day: number;
  printedDate: string | null;
  headerLine: string;
  lines: string[];
}

const INVISIBLE_RE = /[​‌‍﻿ ]/g;

export function normalizeText(text: string, file: string, corrections: Correction[]): string[] {
  let invisibles = 0;
  const out: string[] = [];
  for (const [n, rawLine] of text.replace(/\f/g, "\n").split("\n").entries()) {
    let line = rawLine.replace(INVISIBLE_RE, () => { invisibles++; return " "; }).replace(/\s+$/, "");
    // Text that fused with the line before it, e.g. "...2026Pump Condition 5x" or "...minutesWarm-Up Set".
    const fused = /^(.*?(?:\d{4}|min(?:ute)?s?|[a-z)]))((?:Pump (?:Lift|Cond)|Perform|Minimalist|Warm-Up Set|Working Set \d|Loading Note|Effort Note|RPE =).*)$/.exec(line);
    if (fused && fused[1].trim() && !/^(Pump|Perform|Minimalist)/.test(fused[1].trim().split(" ").pop() ?? "x") && /\d{4}$|min(?:ute)?s?$/.test(fused[1])) {
      corrections.push({ file, location: `line ${n + 1}`, type: "line-merge-split", original: rawLine, corrected: `${fused[1]} | ${fused[2]}` });
      out.push(fused[1], fused[2]);
      continue;
    }
    out.push(line);
  }
  if (invisibles) {
    corrections.push({ file, location: "whole file", type: "invisible-chars-replaced", original: `${invisibles} zero-width/nbsp characters`, corrected: "replaced with spaces for parsing" });
  }
  return out;
}

export function parseWeekText(text: string, file: string): ParseResult {
  const corrections: Correction[] = [];
  const unparsed: UnparsedLine[] = [];
  const lines = normalizeText(text, file, corrections);

  const weekOf = lines.map((l) => /^Persist Week of ([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(l.trim())).find(Boolean);
  const headerWeekOf = weekOf ? iso(Number(weekOf[3]), MONTHS.indexOf(weekOf[1].toLowerCase()) + 1, Number(weekOf[2])) : null;

  // A standalone heading ("Pump Lift 4x") is more reliable than the day header's own title,
  // which some weeks copy verbatim from another track (e.g. every Day 7 says PUMP LIFT 5x).
  const headingTrackAt: (TrackId | null)[] = [];
  let heading: TrackId | null = null;
  lines.forEach((l) => {
    const t = l.trim();
    const tr = t.length < 24 ? trackFromName(t) : null;
    if (tr) heading = tr;
    headingTrackAt.push(heading);
  });

  // Each day starts at an un-indented dated line; the indented ones are the table of contents.
  // Some weeks omit or mis-number the "Week N Day N" header, so the date line is the anchor.
  const looseDate = (l: string) => /^[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4}$/.test(l.trim());
  const dateIdx: number[] = [];
  lines.forEach((l, i) => {
    if (!/^\S/.test(l) || !parsePrintedDate(l)) return;
    const prev = lines.slice(Math.max(0, i - 3), i).reverse().find((x) => x.trim());
    if (prev && parsePrintedDate(prev) && /^\S/.test(prev)) return;
    dateIdx.push(i);
  });

  const isTrackHeading = (l: string) => l.trim().length < 24 && !!trackFromName(l);
  const isTail = (l: string) => {
    const t = l.trim();
    return !t || !!parsePrintedDate(t) || looseDate(t) || DAY_HEADER_RE.test(t) || isTrackHeading(t);
  };

  // Pair each "Week N Day N" header with its date line. Either may come first, and either may be
  // missing, so a header and a date are paired only when nothing but blanks, loose dates or a
  // track heading sits between them, preferring the date whose weekday matches the day number.
  const hdrIdx: number[] = [];
  lines.forEach((l, i) => { if (/^\S/.test(l) && DAY_HEADER_RE.test(l.trim())) hdrIdx.push(i); });
  const adjacent = (i: number, j: number) => {
    const [lo, hi] = i < j ? [i, j] : [j, i];
    let titles = 0;
    for (let x = lo + 1; x < hi; x++) {
      const t = lines[x].trim();
      if (!t || looseDate(t) || isTrackHeading(t)) continue;
      // A date followed by a short title line and then its header ("Sunday Work In Lesson:").
      if (i < j && ++titles <= 2 && t.length <= 60 && !SECTION_RE.test(t)) continue;
      return false;
    }
    return true;
  };
  const usedDates = new Set<number>();
  const duplicateHeaders = new Set<number>();
  const pairOfHeader = new Map<number, number | null>();
  for (const h of hdrIdx) {
    const d = Number(DAY_HEADER_RE.exec(lines[h].trim())![2]);
    const weekdayOf = (i: number) => {
      const m = DATE_RE.exec(lines[i].trim())!;
      const w = WEEKDAYS.indexOf(m[1].toLowerCase());
      return w === 0 ? 7 : w;
    };
    const cands = dateIdx.filter((i) => !usedDates.has(i) && adjacent(i, h));
    const exact = cands.filter((i) => weekdayOf(i) === d);
    // A date whose weekday belongs to a different header is not this header's date.
    const free = cands.filter((i) => !hdrIdx.some((o) => o !== h && adjacent(i, o) && Number(DAY_HEADER_RE.exec(lines[o].trim())![2]) === weekdayOf(i)));
    const pick = (exact.length ? exact : free).sort((x, y) => Math.abs(x - h) - Math.abs(y - h))[0];
    if (pick === undefined) {
      // A header repeated across a page break sits next to a date its twin already claimed.
      const twin = [...pairOfHeader.keys()].find((ph) => lines[ph].trim() === lines[h].trim() && h - ph < 100 && headingTrackAt[ph] === headingTrackAt[h]);
      if (twin) {
        corrections.push({ file, location: `line ${h + 1}`, type: "duplicate-day-header", original: lines[h].trim(), corrected: "repeated copy dropped" });
        duplicateHeaders.add(h);
        continue;
      }
    }
    pairOfHeader.set(h, pick ?? null);
    if (pick !== undefined) usedDates.add(pick);
  }
  const starts: { at: number; date: number | null; hdr: number | null }[] = [];
  for (const h of hdrIdx) {
    if (duplicateHeaders.has(h)) continue;
    const d = pairOfHeader.get(h) ?? null;
    starts.push({ at: d === null ? h : Math.min(d, h), date: d, hdr: h });
  }
  for (const d of dateIdx) {
    if (usedDates.has(d)) continue;
    // A second date printed next to a paired header or date (e.g. a stale date left in place).
    const near = starts.some((st) => (st.hdr !== null && adjacent(d, st.hdr)) || (st.date !== null && st.date !== d && adjacent(d, st.date) && Math.abs(d - st.date) <= 6));
    if (near) {
      corrections.push({ file, location: `line ${d + 1}`, type: "extra-date-line", original: lines[d].trim(), corrected: "second date next to a day header ignored" });
      continue;
    }
    starts.push({ at: d, date: d, hdr: null });
  }
  starts.sort((x, y) => x.at - y.at);

  const rawDays: RawDay[] = [];
  starts.forEach((st, n) => {
    const nextAt = starts[n + 1]?.at ?? lines.length;
    let end = nextAt;
    while (end > st.at + 1 && isTail(lines[end - 1])) end--;
    const skip = new Set([st.date, st.hdr]);
    const body = lines.slice(st.at + 1, end).filter((_, x) => !skip.has(st.at + 1 + x));
    while (body.length && (!body[0].trim() || looseDate(body[0]) || parsePrintedDate(body[0]))) body.shift();
    const hdrLine = st.hdr !== null ? lines[st.hdr].trim() : null;
    const hm = hdrLine ? DAY_HEADER_RE.exec(hdrLine) : null;
    const di = st.at;
    for (let x = body.length - 1; x >= 0; x--) {
      if (!DAY_HEADER_RE.test(body[x].trim())) continue;
      corrections.push({ file, location: `line ${di + x + 2}`, type: "stray-day-header-in-body", original: body[x].trim(), corrected: "line dropped from body" });
      body.splice(x, 1);
    }
    const track = headingTrackAt[st.at];
    const titleTrack = hm ? trackFromName(hm[3].trim()) : null;
    if (titleTrack && track && titleTrack !== track) {
      corrections.push({
        file, location: `${track} ${hdrLine}`, type: "day-header-track-mismatch",
        original: hdrLine!, corrected: `assigned to ${track} from the track heading`,
      });
    }
    rawDays.push({
      track,
      trackLabel: hm ? hm[3].trim() : "",
      week: hm ? Number(hm[1]) : 0,
      day: hm ? Number(hm[2]) : 0,
      printedDate: st.date !== null ? parsePrintedDate(lines[st.date]) : null,
      headerLine: hdrLine ?? "(no day header)",
      lines: body,
    });
  });

  // A date and header repeated across a page break leave a first block with no content of its own.
  for (let i = rawDays.length - 2; i >= 0; i--) {
    const a = rawDays[i];
    const b = rawDays[i + 1];
    if (a.track === b.track && a.headerLine === b.headerLine && a.headerLine !== "(no day header)" && a.lines.every((l) => !l.trim())) {
      corrections.push({ file, location: `${a.track} ${a.headerLine}`, type: "duplicate-day-block", original: a.headerLine, corrected: "empty first copy dropped" });
      rawDays.splice(i, 1);
    }
  }

  // Week number: the value most days agree on.
  const weekNumber = mode(rawDays.filter((d) => d.week).map((d) => d.week)) ?? 0;
  for (const d of rawDays.filter((d) => d.week && d.week !== weekNumber)) {
    corrections.push({ file, location: `${d.track} day ${d.day}`, type: "week-number-inconsistent", original: d.headerLine, corrected: `kept as written; file mode is Week ${weekNumber}` });
  }

  // Days are numbered by their position in the track (a track has exactly 7 days). Header numbers
  // and printed dates are cross-checks, and every disagreement is logged.
  const byTrack = new Map<TrackId | null, RawDay[]>();
  for (const d of rawDays) byTrack.set(d.track, [...(byTrack.get(d.track) ?? []), d]);
  for (const [tr, ds] of byTrack) {
    ds.forEach((d, idx) => {
      const header = d.day;
      if (ds.length === 7) d.day = idx + 1;
      else if (!header) d.day = idx + 1;
      if (header !== d.day) {
        corrections.push({
          file, location: `${tr} block ${idx + 1} of ${ds.length}`,
          type: header ? "day-number-corrected" : "day-header-missing",
          original: d.headerLine, corrected: `Day ${d.day}${ds.length === 7 ? " (position in track)" : " (inferred)"}`,
        });
      }
    });
    if (ds.length !== 7) {
      corrections.push({ file, location: String(tr), type: "track-day-count", original: `${ds.length} days found`, corrected: "kept as found" });
    }
  }

  // Anchor on the Monday implied by the printed dates (most common wins).
  const implied = rawDays.filter((d) => d.printedDate).map((d) => addDays(d.printedDate!, -(d.day - 1)));
  const weekStart = mode(implied) ?? headerWeekOf ?? "0000-00-00";
  const weekday = WEEKDAYS[new Date(`${weekStart}T00:00:00Z`).getUTCDay()];
  if (weekday !== "monday") {
    corrections.push({ file, location: "week", type: "anchor-not-monday", original: weekStart, corrected: `${weekday}` });
  }
  if (headerWeekOf && headerWeekOf !== weekStart) {
    corrections.push({
      file, location: "page header", type: "header-week-mismatch",
      original: `Persist Week of ${headerWeekOf}`, corrected: `content is dated week of ${weekStart}; content trusted`,
    });
  }

  const tracks: Record<string, Day[]> = {};
  for (const rd of rawDays) {
    if (!rd.track) {
      unparsed.push({ file, location: rd.headerLine, section: "(day)", text: rd.headerLine, reason: "track-unresolved" });
      continue;
    }
    const date = addDays(weekStart, rd.day - 1);
    if (rd.printedDate && rd.printedDate !== date) {
      corrections.push({ file, location: `${rd.track} day ${rd.day}`, type: "printed-date-mismatch", original: rd.printedDate, corrected: date });
    }
    const day = parseDay(rd, date, { file, unparsed, corrections });
    (tracks[rd.track] ??= []).push(day);
  }

  return {
    week: { sourceFile: file, headerWeekOf, weekStart, weekNumber, tracks },
    corrections,
    unparsed,
  };
}

function mode<T>(xs: T[]): T | undefined {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function parseDay(rd: RawDay, date: string, env: { file: string; unparsed: UnparsedLine[]; corrections: Correction[] }): Day {
  const body = rd.lines;
  const location = `${rd.track} week ${rd.week} day ${rd.day}`;
  const starts: number[] = [];
  body.forEach((l, i) => { if (SECTION_RE.test(l.trim()) || UNLABELED_SECTION_RE.test(l.trim())) starts.push(i); });

  const sections: Section[] = [];
  let lastHeader = "";
  starts.forEach((si, n) => {
    const hm = SECTION_RE.exec(body[si].trim()) ?? [body[si], null, body[si].trim()];
    const end = starts[n + 1] ?? body.length;
    const bodyLines = body.slice(si + 1, end);
    // "Active Recovery Work (30 min): Goal: ..." keeps its tail as the first body line.
    let title = hm[2].trim();
    const colon = title.indexOf(":");
    if (colon >= 0 && colon < title.length - 1) {
      bodyLines.unshift(title.slice(colon + 1).trim());
      title = title.slice(0, colon).trim();
    } else {
      title = title.replace(/:$/, "").trim();
    }
    // A header printed twice in a row: the first copy has no content of its own.
    if (starts[n + 1] !== undefined && body[starts[n + 1]].trim() === body[si].trim() && bodyLines.every((l) => !l.trim())) {
      env.corrections.push({ file: env.file, location, type: "duplicate-header", original: body[si].trim(), corrected: "first (empty) copy dropped" });
      return;
    }
    if (title === lastHeader && bodyLines.every((l) => !l.trim())) {
      env.corrections.push({ file: env.file, location, type: "duplicate-header", original: body[si].trim(), corrected: "second occurrence dropped" });
      return;
    }
    lastHeader = title;
    const raw = body.slice(si, end).join("\n").trim();
    sections.push(parseSection(hm[1] as string | null, title, bodyLines, { file: env.file, location, unparsed: env.unparsed }, raw));
  });

  const hasTraining = sections.some((s) => /strength|conditioning|finisher|warm/i.test(s.title) || s.kind === "focus");
  const hasRecovery = sections.some((s) => /recovery/i.test(s.title));
  const sessionType: Day["sessionType"] = sections.length === 0 ? "note" : hasRecovery && !sections.some((s) => s.kind === "focus") ? "recovery" : hasTraining ? "training" : "recovery";

  let focusTopic: string | null = null;
  let focusBody: string | null = null;
  let shortOnTime: string[] = [];
  const focus = sections.find((s) => s.kind === "focus");
  if (focus) {
    const raw = focus.raw.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
    const sot = raw.findIndex((l) => /^short on time\?/i.test(l));
    const text = sot >= 0 ? raw.slice(0, sot) : raw;
    if (sot >= 0) shortOnTime = [raw.slice(sot).join(" ").replace(/^short on time\?\s*/i, "").replace(/\.$/, "")];
    focusTopic = text[0] ?? null;
    focusBody = text.slice(1).join(" ") || null;
    // Drop the pseudo-item lines that the focus text produced.
    focus.lines = [];
  }

  let noteBody: string | null = null;
  if (sections.length === 0) {
    noteBody = body.map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null;
  }

  return {
    day: rd.day,
    printedDate: rd.printedDate,
    date,
    headerLine: rd.headerLine,
    sessionType,
    focusTopic,
    focusBody,
    shortOnTime,
    sections,
    noteBody,
    raw: body.join("\n").trim(),
  };
}
