import { defineConfig } from "@playwright/test";
import { E2E_SETUP_KEY, STATE } from "./e2e/global-setup.ts";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:4173", storageState: STATE, launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] } },
  webServer: { command: "npm run preview -- --port 4173 --host 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: false, env: { CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", SETUP_KEY: E2E_SETUP_KEY, BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdef0123456789" }, timeout: 120_000 },
});
