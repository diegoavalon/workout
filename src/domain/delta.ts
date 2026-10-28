export type DeltaSeg = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; size?: string; embed?: string };
export type DeltaLine = { segs: DeltaSeg[]; header?: number; list?: "bullet" | "ordered"; align?: string; indent?: number; number: number };

type Op = { insert?: unknown; attributes?: Record<string, unknown> };
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,20}$/;

/** Line-aware Quill Delta parser (PRD §5): block attributes live on the `\n` insert ending the line. Never produces HTML. */
export function parseDelta(input: unknown): DeltaLine[] {
  let ops: unknown;
  try {
    const obj = typeof input === "string" ? JSON.parse(input) : input;
    ops = Array.isArray(obj) ? obj : (obj as { ops?: unknown } | null)?.ops;
  } catch { /* fall through */ }
  if (!Array.isArray(ops)) return [{ segs: [{ text: typeof input === "string" ? input : "This note could not be displayed." }], number: 0 }];
  const lines: DeltaLine[] = [];
  let cur: DeltaSeg[] = [];
  let ordered = 0;
  const close = (attrs?: Record<string, unknown>) => {
    const a = attrs ?? {};
    const list = a.list === "bullet" || a.list === "ordered" ? a.list : undefined;
    ordered = list === "ordered" ? ordered + 1 : 0;
    lines.push({
      segs: cur, list, number: ordered,
      header: typeof a.header === "number" ? a.header : undefined,
      align: typeof a.align === "string" ? a.align : undefined,
      indent: typeof a.indent === "number" ? a.indent : undefined,
    });
    cur = [];
  };
  for (const raw of ops as Op[]) {
    const attrs = raw?.attributes ?? {};
    const ins = raw?.insert;
    if (typeof ins !== "string") {
      if (ins && typeof ins === "object") {
        const kind = Object.keys(ins)[0] ?? "embed";
        cur.push({ text: `[${kind} unavailable offline]`, embed: kind });
      }
      continue;
    }
    const segAttrs: Partial<DeltaSeg> = {
      bold: !!attrs.bold, italic: !!attrs.italic, underline: !!attrs.underline, strike: !!attrs.strike,
      color: typeof attrs.color === "string" && SAFE_COLOR.test(attrs.color) ? attrs.color : undefined,
      size: typeof attrs.size === "string" ? attrs.size : undefined,
    };
    let start = 0;
    for (let i = 0; i < ins.length; i++) {
      if (ins[i] === "\n") {
        if (i > start) cur.push({ text: ins.slice(start, i), ...segAttrs });
        close(attrs);
        start = i + 1;
      }
    }
    if (start < ins.length) cur.push({ text: ins.slice(start), ...segAttrs });
  }
  if (cur.length) close();
  return lines.length ? lines : [{ segs: [], number: 0 }];
}
