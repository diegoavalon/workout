import { describe, expect, it } from "vitest";
import { generate } from "../persist/generate";
import { buildOptions, defaultInput } from "./options";

// node built-ins are loaded dynamically because the app tsconfig has no Node types.
// biome-ignore lint/suspicious/noExplicitAny: see above
const load = async (m: string): Promise<any> => import(/* @vite-ignore */ ["node", m].join(":"));
const fs = await load("fs");
const cp = await load("child_process");
// Not a literal path: the app tsconfig (no Node types) must not follow this into scripts/.
const corpusModule = (): Promise<{ packageCorpus: (dir?: string) => { corpus: string; corpusName: string; manifest: { version: string; url: string; weeks: number; equipment: string[] } } }> =>
  import(/* @vite-ignore */ ["../../scripts/persist", "corpus.ts"].join("/"));
const haveViews: boolean = fs.existsSync("data/views/index.json");

describe.skipIf(!haveViews)("browser and CLI generation", () => {
  const cases = [
    { name: "pump-lift 3x", input: { ...defaultInput(new Date(2026, 10, 2)), seed: "28" }, args: ["--track", "pump-lift-3x"] },
    { name: "perform with equipment and latest block allowed", input: { ...defaultInput(new Date(2026, 10, 2)), style: "perform" as const, days: 5, restrictEquipment: true, equipment: ["dumbbell", "band", "pull-up-bar"], allowRecent: true, seed: "4294967295" }, args: ["--track", "perform", "--equipment", "dumbbell,band,pull-up-bar", "--allow-recent"] },
  ];
  for (const c of cases) {
    it(`produces the identical payload for ${c.name}`, async () => {
      const { packageCorpus } = await corpusModule();
      const corpus = JSON.parse(packageCorpus().corpus); // what the worker parses
      const seed = Number(c.input.seed);
      const web = generate(corpus, buildOptions(c.input, seed));
      const out = `${await fs.promises.mkdtemp((await load("os")).tmpdir() + "/parity-")}/out.json`;
      cp.execFileSync("node", ["scripts/persist/generate.ts", ...c.args, "--seed", String(seed), "--start", c.input.startDate, "--out", out], { stdio: "pipe" });
      expect(JSON.parse(JSON.stringify(web))).toEqual(JSON.parse(fs.readFileSync(out, "utf8")));
    }, 120_000);
  }
});

describe.skipIf(!haveViews)("corpus packaging", () => {
  it("lists indexed weeks, a content-hash name, and the equipment tags", async () => {
    const { packageCorpus } = await corpusModule();
    const { manifest, corpusName } = packageCorpus();
    expect(corpusName).toBe(`corpus-${manifest.version}.json`);
    expect(manifest.url).toBe(`/api/corpus/${corpusName}`);
    expect(manifest.weeks).toBeGreaterThan(100);
    expect(manifest.equipment).toContain("dumbbell");
    expect(manifest.equipment).not.toContain("bodyweight");
  });
  it("fails clearly when the source data is missing", async () => {
    const { packageCorpus } = await corpusModule();
    expect(() => packageCorpus("data/does-not-exist")).toThrow(/persist:views/);
  });
});
