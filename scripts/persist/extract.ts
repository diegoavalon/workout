import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SRC = "raw-export/weekly-plans";
const OUT = "data/text";
mkdirSync(OUT, { recursive: true });

const pdfs = readdirSync(SRC).filter((f) => f.endsWith(".pdf")).sort();
for (const f of pdfs) {
  const text = execFileSync("pdftotext", ["-layout", join(SRC, f), "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  writeFileSync(join(OUT, `${basename(f, ".pdf")}.txt`), text);
}
console.log(`extracted ${pdfs.length} PDFs to ${OUT}/`);
