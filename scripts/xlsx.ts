import { inflateRawSync } from "node:zlib";

/**
 * Minimal .xlsx reader (no dependencies): enough to read cell values and formulas
 * from a workbook's sheets. Shared formulas are expanded as written in the master
 * cell, which is correct for formulas whose references are all absolute.
 */

export type Cell = { value: string | null; formula: string | null };
export type Sheet = { name: string; cells: Map<string, Cell> };

function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad zip central directory.");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 0 ? raw : method === 8 ? inflateRawSync(raw) : Buffer.alloc(0));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const text = (xml: string) => unescape([...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(""));

export function readXlsx(buf: Buffer): Sheet[] {
  const files = unzip(buf);
  const read = (n: string) => files.get(n)?.toString("utf8") ?? "";
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => text(m[1]));
  const rels = new Map([...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])![1], /Target="([^"]+)"/.exec(m[0])![1]]));
  return [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = unescape(/name="([^"]+)"/.exec(m[0])![1]);
    const target = rels.get(/r:id="([^"]+)"/.exec(m[0])![1])!.replace(/^\/?(xl\/)?/, "");
    const xml = read(`xl/${target}`);
    const masters = new Map<string, string>();
    const cells = new Map<string, Cell>();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, body = ""] = c;
      const f = /<f([^>]*?)(?:\/>|>([^<]*)<\/f>)/.exec(body);
      let formula: string | null = null;
      if (f) {
        const si = /si="(\d+)"/.exec(f[1])?.[1];
        formula = f[2] ? unescape(f[2]) : null;
        if (si !== undefined) { if (formula) masters.set(si, formula); else formula = masters.get(si) ?? null; }
      }
      const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
      let value: string | null = v === undefined ? null : unescape(v);
      if (/t="s"/.test(attrs) && value !== null) value = shared[Number(value)];
      else if (/t="inlineStr"/.test(attrs)) value = text(body);
      cells.set(ref, { value, formula });
    }
    return { name, cells };
  });
}
