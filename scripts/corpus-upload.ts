// Publishes data/views to the deployment's private storage (served only to signed-in users).
//   APP_URL=https://... OWNER_EMAIL=... OWNER_PASSWORD=... npm run corpus:upload
// Needs data/views locally (npm run persist:views). Re-run after the source weeks change.
import { packageCorpus } from "./persist/corpus.ts";
import { origin, signIn } from "./site.ts";

const { corpus, corpusName, manifest } = packageCorpus();
const cookie = await signIn();
const put = async (name: string, body: string) => {
  const res = await fetch(`${origin}/api/corpus/${name}`, { method: "PUT", headers: { cookie, origin, "content-type": "application/json" }, body });
  if (!res.ok) { console.error(`Upload of ${name} failed (HTTP ${res.status}): ${await res.text()}`); process.exit(1); }
  console.log(`uploaded ${name} (${(Buffer.byteLength(body) / 1e6).toFixed(1)} MB)`);
};
await put(corpusName, corpus);
await put("manifest.json", JSON.stringify(manifest)); // last, so the manifest never points at a missing file
