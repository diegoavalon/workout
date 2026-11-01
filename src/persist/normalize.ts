/**
 * Exercise-name normalisation. The key is deterministic text processing only (spelling,
 * abbreviations, punctuation, plurals), so equal keys mean the same words in a different spelling.
 */

const WORD_MAP: Record<string, string> = {
  db: "dumbbell", dbs: "dumbbell", dumbbells: "dumbbell",
  kb: "kettlebell", kbs: "kettlebell", kettlebells: "kettlebell",
  wtd: "weighted", bb: "barbell", bw: "bodyweight", btn: "behind the neck",
  rdl: "romanian deadlift", pullup: "pull up", pullups: "pull up", chinup: "chin up",
  pushup: "push up", pushups: "push up", situp: "sit up", situps: "sit up",
  goodmorning: "good morning", childs: "child", dips: "dip", hrs: "hours",
  "&": "and",
};

const CARDIO_WORDS = new Set(["run", "jog", "row", "bike", "ski", "walk", "swim", "cardio", "of", "choice", "sprint", "or", "and", "echo", "assault", "erg"]);

export interface NormalizedName {
  /** Canonical key, also used as the catalog id after kebab-casing. */
  key: string;
  /** Title-cased display name taken from the key. */
  display: string;
  /** Keys of other exercises offered with "or", excluding the primary. */
  alternatives: string[];
}

function singularLast(words: string[]): string[] {
  if (!words.length) return words;
  const w = words[words.length - 1];
  let s = w;
  if (/(sses|ches|shes|xes)$/.test(w)) s = w.slice(0, -2);
  else if ((w.length > 3 || w === "ups") && /s$/.test(w) && !/(ss|us|is)$/.test(w)) s = w.slice(0, -1);
  return [...words.slice(0, -1), s];
}

function keyOf(part: string): string {
  let s = part
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/^\s*(odd|even)(\s+minutes?)?\s*-\s*(\d+(-\d+)?\s*sec\s*)?/i, "")
    .replace(/^\s*(left|right)\s+side\s+/i, "")
    .replace(/\bR\s*\+\s*L\s*=\s*\d+/gi, " ")
    .replace(/\s+x\s*\d[\d\s-]*(reps?)?\s*$/i, "")
    .replace(/\s+\d+(-\d+)?\s*#\s*$/, "")
    .replace(/\s+to\s+\d+(\/\d+)?'.*$/i, "")
    .replace(/\s+(level\s+\d+(-\d+)?|\d+%|\d+(-\d+)?\s*sec|\d+k?\/\d+m?)\s*$/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["“”]/g, "")
    .replace(/[’']s\b/g, "s")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/\b1\s*[:\-]?\s*1\/4\b/g, "1 1/4")
    .replace(/[-_]/g, " ")
    .replace(/[,.;:*#]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\b(left or right|right or left|left\/right|right\/left|l\/r|r\/l)\b/g, " ")
    .replace(/\/(side|leg|arm)\b/g, " ")
    .replace(/\b(per side|each side|each|ea)\b/g, " ")
    .replace(/\bx\s*$/, " ")
    .replace(/\s+(right|left|r|l)\s*$/, " ")
    .replace(/\s+(unbroken|reps?)\s*$/, " ");
  const words = s.split(/\s+/).filter(Boolean).flatMap((w) =>
    w
      .split("/")
      .map((x) => WORD_MAP[x] ?? x)
      .join("/")
      .split(" "),
  );
  return singularLast(words).join(" ").trim();
}

export const titleCase = (key: string) => key.replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());

export function normalizeName(raw: string): NormalizedName | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+or\s+/i);
  const allCardio = parts.every((p) => keyOf(p).split(/[\s/]+/).every((w) => CARDIO_WORDS.has(w)));
  const splittable = parts.length > 1 && parts.length <= 3 && !allCardio && parts.every((p) => keyOf(p).split(" ").length >= 2);
  if (splittable) {
    const [first, ...rest] = parts.map(keyOf);
    return { key: first, display: titleCase(first), alternatives: rest };
  }
  const key = keyOf(cleaned);
  if (!key) return null;
  return { key, display: titleCase(key), alternatives: [] };
}

export const idOf = (key: string) =>
  key.replace(/\//g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
