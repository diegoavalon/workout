import { existsSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";
import { packageCorpus } from "../scripts/persist/corpus.ts";

export const E2E_USER = { email: "e2e@example.com", password: "e2e-password-123", name: "E2E" };
export const E2E_SETUP_KEY = "e2e-setup-key";
export const STATE = "test-results/auth-state.json";

/** Creates the owner on the preview server, signs in once, and uploads the corpus so program generation works. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  // The preview database persists between runs, so an existing owner is fine.
  await api.post("/api/auth/sign-up/email", { data: E2E_USER, headers: { "x-setup-key": E2E_SETUP_KEY } });
  const signIn = await api.post("/api/auth/sign-in/email", { data: { email: E2E_USER.email, password: E2E_USER.password } });
  if (!signIn.ok()) throw new Error(`e2e sign-in failed (HTTP ${signIn.status()}): ${await signIn.text()}`);
  if (existsSync("data/views/index.json")) {
    const { corpus, corpusName, manifest } = packageCorpus();
    for (const [name, body] of [[corpusName, corpus], ["manifest.json", JSON.stringify(manifest)]] as const)
      await api.put(`/api/corpus/${name}`, { data: body, headers: { "content-type": "application/json" } });
  }
  await api.storageState({ path: STATE });
  await api.dispose();
}
