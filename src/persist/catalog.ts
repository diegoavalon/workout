import { guessEquipment, guessPattern, UNILATERAL_RE } from "./classify.ts";
import type { Pattern } from "./classify.ts";
import { idOf, normalizeName, titleCase } from "./normalize.ts";
import type { WeekFile } from "./schema.ts";

export interface Override {
  pattern?: Pattern | null;
  equipment?: string[];
  unilateral?: boolean;
  /** Treat this exercise as another catalog id (spelling variants the rules could not join). */
  mergeInto?: string;
  name?: string;
}
export type Overrides = Record<string, Override>;

export interface CatalogEntry {
  id: string;
  name: string;
  pattern: Pattern | null;
  equipment: string[];
  unilateral: boolean;
  aliases: string[];
  uses: number;
}

export interface UnmappedEntry {
  /** Catalog id, or the raw text when the name was kept out of the catalog. */
  id: string | null;
  name: string;
  uses: number;
  aliases: string[];
  reason: string;
  suggestedPattern: Pattern | null;
}

export interface Catalog {
  entries: CatalogEntry[];
  unmapped: UnmappedEntry[];
  /** raw trimmed name -> catalog id (null when kept out of the catalog) */
  aliasToId: Record<string, string | null>;
  /** raw trimmed name -> alternative catalog ids */
  aliasAlternatives: Record<string, string[]>;
}

const STRUCTURAL_DIGITS = /\b(1 1\/4|1\/2|90\/90|21s|45 degree|figure 4|3\/60\/10)\b/g;

/** Returns a reason when the text is clearly not a single exercise name. */
export function suspectReason(raw: string, key: string): string | null {
  if (key.split(" ").length > 9) return "too-long-for-an-exercise-name";
  if (/^(then|rest|goal|part|note|week|complete|perform|repeat|for this|as many|continuous|for quality|same|minutes|loading)\b|\bnote$|^rest-?$|^(min(ute)?|round|set)s?\s*\d|^continuous\b|\bamrap\b|^emom\b|^(effort|loading)\b|for max|quality sets|as many reps/i.test(raw.trim())) return "instruction-text";
  if (/\+/.test(raw)) return "compound-of-several-movements";
  if (/\d/.test(key.replace(STRUCTURAL_DIGITS, ""))) return "contains-numbers";
  return null;
}

export function buildCatalog(weeks: WeekFile[], overrides: Overrides = {}): Catalog {
  // Gather every item name with how it was used.
  const uses = new Map<string, { n: number; perSide: number }>();
  const note = (name: string | null | undefined, perSide: boolean) => {
    const t = name?.replace(/\s+/g, " ").trim();
    if (!t) return;
    const u = uses.get(t) ?? { n: 0, perSide: 0 };
    u.n++;
    if (perSide) u.perSide++;
    uses.set(t, u);
  };
  for (const w of weeks) {
    for (const days of Object.values(w.tracks)) {
      for (const d of days) {
        for (const s of d.sections) {
          if (s.exercise) note(s.exercise, s.sets.some((x) => x.reps?.perSide));
          for (const l of s.lines) if (l.item?.name) note(l.item.name, !!l.item.qty?.perSide);
        }
      }
    }
  }

  const byId = new Map<string, CatalogEntry & { perSide: number }>();
  const aliasToId: Record<string, string | null> = {};
  const aliasAlternatives: Record<string, string[]> = {};
  const unmapped: UnmappedEntry[] = [];

  const entryFor = (key: string, display: string): CatalogEntry & { perSide: number } => {
    let id = idOf(key);
    const ov = overrides[key] ?? overrides[id];
    if (ov?.mergeInto) id = ov.mergeInto;
    let e = byId.get(id);
    if (!e) {
      e = { id, name: ov?.name ?? display, pattern: null, equipment: [], unilateral: false, aliases: [], uses: 0, perSide: 0 };
      byId.set(id, e);
    }
    return e;
  };

  for (const [raw, u] of [...uses].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
    const norm = normalizeName(raw);
    if (!norm) { aliasToId[raw] = null; continue; }
    const reason = suspectReason(raw, norm.key);
    if (reason) {
      aliasToId[raw] = null;
      unmapped.push({ id: null, name: raw, uses: u.n, aliases: [], reason, suggestedPattern: null });
      continue;
    }
    const e = entryFor(norm.key, norm.display);
    e.uses += u.n;
    e.perSide += u.perSide;
    if (!e.aliases.includes(raw)) e.aliases.push(raw);
    aliasToId[raw] = e.id;
    if (norm.alternatives.length) {
      aliasAlternatives[raw] = norm.alternatives.map((k) => entryFor(k, titleCase(k)).id);
    }
  }

  const entries: CatalogEntry[] = [];
  for (const e of byId.values()) {
    const key = normalizeName(e.name)?.key ?? e.id;
    const ov = overrides[key] ?? overrides[e.id] ?? {};
    const g = guessPattern(key);
    const pattern = ov.pattern !== undefined ? ov.pattern : g.pattern;
    const unilateral = ov.unilateral ?? (UNILATERAL_RE.test(key) || (e.uses >= 3 && e.perSide / e.uses >= 0.5));
    entries.push({
      id: e.id,
      name: e.name,
      pattern,
      equipment: ov.equipment ?? guessEquipment(key),
      unilateral,
      aliases: e.aliases.sort(),
      uses: e.uses,
    });
    if (!pattern) {
      unmapped.push({
        id: e.id,
        name: e.name,
        uses: e.uses,
        aliases: e.aliases.slice(0, 5),
        reason: g.suggested ? "pattern-not-certain" : "no-pattern-rule-matched",
        suggestedPattern: g.suggested,
      });
    }
  }
  entries.sort((a, b) => b.uses - a.uses || a.id.localeCompare(b.id));
  unmapped.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  return { entries, unmapped, aliasToId, aliasAlternatives };
}
