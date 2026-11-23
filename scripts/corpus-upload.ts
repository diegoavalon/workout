// Publishes the generator corpus or the Power Thrash II template to private storage.
//   APP_URL=https://... OWNER_EMAIL=... OWNER_PASSWORD=... npm run corpus:upload
//   APP_URL=https://... OWNER_EMAIL=... OWNER_PASSWORD=... npm run corpus:upload -- --power-thrash
import { existsSync, readFileSync } from "node:fs";
import { POWER_THRASH_TEMPLATE } from "../src/domain/power-thrash.ts";
import { packageCorpus } from "./persist/corpus.ts";
import { origin, signIn } from "./site.ts";

function sourceFiles(): [name: string, body: string][] {
  if (process.argv.slice(2).includes("--power-thrash")) {
    const path = `data/programs/${POWER_THRASH_TEMPLATE}`;
    if (!existsSync(path)) {
      console.error("Run npm run power-thrash:convert first to generate the template.");
      process.exit(1);
    }
    return [[POWER_THRASH_TEMPLATE, readFileSync(path, "utf8")]];
  }
  const { corpusName, corpus, manifest } = packageCorpus();
  return [[corpusName, corpus], ["manifest.json", JSON.stringify(manifest)]];
}

const files = sourceFiles();
const cookie = await signIn();
for (const [name, body] of files) {
  const res = await fetch(`${origin}/api/corpus/${name}`, { method: "PUT", headers: { cookie, origin, "content-type": "application/json" }, body });
  if (!res.ok) { console.error(`Upload of ${name} failed (HTTP ${res.status}): ${await res.text()}`); process.exit(1); }
  console.log(`uploaded ${name} (${(Buffer.byteLength(body) / 1e6).toFixed(1)} MB)`);
}
