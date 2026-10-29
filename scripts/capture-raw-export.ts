/**
 * Bridge between the source app in a browser and the raw-export workflow.
 *
 * Opens a real Chromium window (your login is kept in a local profile).
 * You click workout days as usual; every network response that looks like a
 * workout-day item array is saved, unchanged, as the next
 * <track>/week-<w>/day-<d>.json file. No credentials leave the browser profile.
 *
 * Usage:
 *   npm run capture:raw -- --url https://<source-app>/calendar
 *   npm run capture:raw -- --url ... --track raw-export/perform/five-day --week 2 --day 1
 *   npm run capture:raw -- --cdp http://127.0.0.1:9222   # attach to Chrome you started yourself
 *
 * While it runs, type in this terminal:
 *   w<enter>   set current week (e.g. "w2" then Enter sets week 2, day resets to 1)
 *   d<n>       set next day number (e.g. "d4")
 *   s          status (next file that will be written)
 *   q          quit (or Ctrl+C)
 *
 * Duplicate clicks on the same day are detected by content hash and skipped.
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const startUrl = opt("url");
const cdp = opt("cdp");
const track = opt("track") ?? "raw-export/perform/five-day";
const filter = opt("filter") ?? "/items";
const profileDir = opt("profile") ?? ".auth/source-browser";
let week = Number(opt("week") ?? 1);
let day = Number(opt("day") ?? 1);

if (!startUrl && !cdp) {
  console.error("Give --url <source calendar URL> (or --cdp http://127.0.0.1:9222 to attach to your own Chrome).");
  process.exit(1);
}

type RawItem = Record<string, unknown>;
const isDayPayload = (v: unknown): v is RawItem[] =>
  Array.isArray(v) && v.length > 0 && v.some((it) => {
    const o = it as RawItem | null;
    return !!o && typeof o.path === "string" && o.path.includes("/items/") && (o.type === "text" || o.type === "exercise");
  });

const sourceIdOf = (items: RawItem[]) =>
  items.find((it) => typeof it.path === "string")?.path?.toString().split("/items/")[0].split("/").pop() ?? "unknown";
const snippetOf = (items: RawItem[]) => {
  const t = items.find((it) => it.type === "text");
  const child = t?.child as RawItem | undefined;
  const text = typeof child?.text === "string" ? child.text : "";
  try {
    const ops = JSON.parse(text) as { insert?: unknown }[];
    return ops.map((o) => (typeof o.insert === "string" ? o.insert.replace(/\n/g, " ") : "")).join("").slice(0, 60);
  } catch { return ""; }
};

const savedHashes = new Map<string, string>();
const nextFile = () => join(track, `week-${week}`, `day-${day}.json`);
const advance = () => { day += 1; };

console.log(`Track:  ${track}`);
console.log(`Filter: responses whose URL contains "${filter}" and whose JSON is a workout-day item array`);
console.log("Click days in calendar order. Type w<n> at a new week, s for status, q to quit.\n");

const executablePath = process.env.PW_CHROMIUM ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const context = cdp
  ? (await chromium.connectOverCDP(cdp)).contexts()[0]
  : await chromium.launchPersistentContext(profileDir, {
      headless: args.includes("--headless"),
      executablePath,
      // viewport: null makes the page use the real window size, so the app
      // stays responsive and scrolls naturally when you resize/maximize.
      viewport: null,
      args: ["--no-sandbox", "--start-maximized"],
    });
const page = context.pages()[0] ?? (await context.newPage());

let saved = 0;
const handleResponse = async (response: { url(): string; status(): number; text(): Promise<string> }) => {
  const url = response.url();
  if (!url.includes(filter)) return;
  let body: string;
  try { body = await response.text(); } catch { return; }
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch {
    console.log(`[net] ${response.status()} ${url.slice(0, 100)} (not JSON, skipped)`);
    return;
  }
  if (!isDayPayload(parsed)) {
    console.log(`[net] ${response.status()} ${url.slice(0, 100)} (JSON, not a day payload, skipped)`);
    return;
  }
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
  const file = nextFile();
  if (savedHashes.has(hash)) {
    console.log(`= duplicate of ${savedHashes.get(hash)} (same day clicked twice), skipped`);
    return;
  }
  if (existsSync(file)) {
    console.log(`! ${file} already exists; not overwriting. Type d<n> to pick another slot, then click the day again.`);
    return;
  }
  mkdirSync(join(track, `week-${week}`), { recursive: true });
  writeFileSync(file, body);
  savedHashes.set(hash, file);
  saved++;
  console.log(`✓ saved ${file}  (${parsed.length} items, source ${sourceIdOf(parsed)}${snippetOf(parsed) ? `, "${snippetOf(parsed)}…"` : ""})`);
  advance();
  console.log(`  next click -> ${nextFile()}  (type w${week + 1} when you move to the next week)`);
};
page.on("response", (r) => { void handleResponse(r); });
context.on("page", (p) => p.on("response", (r) => { void handleResponse(r); }));

if (startUrl) await page.goto(startUrl);
console.log("\nLog in in the browser window if needed, then click workout days in order.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  const cmd = line.trim().toLowerCase();
  if (cmd === "q") { rl.close(); return; }
  if (cmd === "s") { console.log(`Next: ${nextFile()} · saved this session: ${saved}`); return; }
  const w = cmd.match(/^w(\d+)$/);
  if (w) { week = Number(w[1]); day = 1; console.log(`Week set. Next click -> ${nextFile()}`); return; }
  const d = cmd.match(/^d(\d+)$/);
  if (d) { day = Number(d[1]); console.log(`Day set. Next click -> ${nextFile()}`); return; }
  if (cmd) console.log("Commands: w<n> new week, d<n> set day, s status, q quit");
});
rl.on("close", async () => {
  console.log(`\nDone. ${saved} day(s) saved under ${track}. Next: npm run convert:raw -- ${track}`);
  await context.close().catch(() => undefined);
  process.exit(0);
});
