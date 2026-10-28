import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4173", launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] } },
  webServer: { command: "npm run preview -- --port 4173 --host 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: false, timeout: 120_000 },
});
