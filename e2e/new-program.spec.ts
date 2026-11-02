import { expect, test, type Page } from "@playwright/test";
import { seedLegacyProgram } from "./legacy";

const generate = async (page: Page) => {
  await page.getByRole("button", { name: /Generate program|Try again/ }).click();
  await expect(page.getByRole("button", { name: "Use this program" })).toBeVisible({ timeout: 45_000 });
};
/** Waits until `n` checkmarks are stored in IndexedDB (the UI shows them before the write lands). */
const persisted = (page: Page, n: number) => expect.poll(() => page.evaluate(() => new Promise<number>((res) => {
  const r = indexedDB.open("workout-app");
  r.onsuccess = () => {
    const get = r.result.transaction("progress").objectStore("progress").getAll();
    get.onsuccess = () => { r.result.close(); res(get.result.reduce((t: number, p: { checks?: Record<string, string[]> }) => t + Object.values(p.checks ?? {}).reduce((a, c) => a + c.length, 0), 0)); };
  };
})), { timeout: 10_000 }).toBe(n);
const setSeed = async (page: Page, seed: string) => {
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByPlaceholder("Pick one for me").fill(seed);
};

test("old entry points land on the new pages", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/active-program$/);
  await expect(page.getByRole("heading", { name: "Active program" })).toBeVisible();
  await page.goto("/train");
  await expect(page).toHaveURL(/\/active-program$/);
  await page.goto("/programs/4");
  await expect(page).toHaveURL(/\/programs\/new$/);
  await page.goto("/programs/other");
  await expect(page).toHaveURL(/\/programs\/new$/);
  for (const name of ["Active", "New", "Saved", "Downloads", "Settings"]) {
    await expect(page.getByRole("navigation", { name: /Programs|App/ }).getByRole("link", { name }).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Library" })).toHaveCount(0);
});

test("form defaults, fixed frequencies, and validation", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T12:00:00Z"));
  await page.goto("/programs/new");
  await expect(page.getByRole("button", { name: /Pump Lift/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Perform/ }).click();
  await expect(page.getByRole("button", { name: "5", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "3", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Minimalist/ }).click();
  await expect(page.getByRole("button", { name: "4", exact: true })).toBeDisabled();
  const start = page.getByLabel("Suggested start (a Monday)");
  await start.click();
  const calendar = page.getByRole("dialog", { name: "Choose a Monday" });
  await expect(calendar.getByRole("button", { name: /November 4th/ })).toBeDisabled();
  await calendar.getByRole("button", { name: /November 9th/ }).click();
  await expect(calendar).toBeHidden();
  await expect(start).toHaveText("Nov 9, 2026");
  // Keyboard navigation skips unavailable days and returns focus after selection.
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(calendar.getByRole("button", { name: /November 9th/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(start).toHaveText("Nov 16, 2026");
  await expect(start).toBeFocused();
  await setSeed(page, "4294967296");
  await page.getByRole("button", { name: "Generate program" }).click();
  await expect(page.getByText(/Seed must be a whole number/)).toBeVisible();
  await expect(page).toHaveURL(/\/programs\/new$/);
});

test("generate → review → activate → resume, then generate another without touching the active run", async ({ page }) => {
  await page.goto("/programs/new");
  await setSeed(page, "28");
  await generate(page);
  await expect(page.getByRole("heading", { name: "Pump Lift · 3 days/week" })).toBeVisible();
  await expect(page.getByText("6 weeks · 18 training sessions")).toBeVisible();
  const firstUrl = page.url();
  await page.getByRole("button", { name: "Use this program" }).click();
  await expect(page).toHaveURL(/\/active-program$/);
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("checkbox").nth(0).click();
  await expect(page.getByTestId("saved-state")).toContainText("1 of");
  await page.goto("/active-program");
  await expect(page.getByRole("button", { name: "Resume session" })).toBeVisible();

  // Generate another program; the first stays active and in progress.
  await page.getByRole("link", { name: "New", exact: true }).first().click();
  await setSeed(page, "29");
  await generate(page);
  expect(page.url()).not.toBe(firstUrl);
  await page.getByRole("button", { name: "Generate another" }).click();
  await expect(page.getByText("Another program saved on this device")).toBeVisible({ timeout: 45_000 });
  await page.goto("/active-program");
  await expect(page.getByRole("button", { name: "Resume session" })).toBeVisible();
  await page.getByRole("link", { name: "Saved", exact: true }).first().click();
  const saved = page.getByRole("list", { name: "Saved programs" }).getByRole("listitem");
  await expect(saved).toHaveCount(3);
  await expect(saved.filter({ hasText: "Active" })).toHaveCount(1);
  // Regenerating identical inputs is deduplicated.
  await page.goto(firstUrl.replace(/\/generated\/.*/, "/programs/new"));
  await setSeed(page, "28");
  await page.getByRole("button", { name: "Generate program" }).click();
  await expect(page).toHaveURL(firstUrl, { timeout: 45_000 }); // same snapshot: already active, so no "Use this program"
  await page.goto("/programs/saved");
  await expect(saved).toHaveCount(3);
});

test("edit inputs keeps the previous choices", async ({ page }) => {
  await page.goto("/programs/new");
  await page.getByRole("button", { name: /^Pump Condition/ }).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Choose what I have" }).click();
  await page.getByRole("checkbox", { name: "Dumbbell", exact: true }).check();
  await page.getByRole("checkbox", { name: "Band", exact: true }).check();
  await setSeed(page, "7");
  await generate(page);
  await page.getByRole("link", { name: "Edit inputs" }).click();
  await expect(page.getByRole("button", { name: /^Pump Condition/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox", { name: "Dumbbell", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByPlaceholder("Pick one for me")).toHaveValue("7");
});

test("first generation offline explains itself and keeps inputs; cached generation works offline", async ({ page, context }) => {
  await page.goto("/programs/new");
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  await page.reload();
  await setSeed(page, "5");
  await context.route("**/corpus/**", (r) => r.abort());
  await page.getByRole("button", { name: "Generate program" }).click();
  await expect(page.getByText(/first generation needs a connection/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByPlaceholder("Pick one for me")).toHaveValue("5");
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await context.unroute("**/corpus/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Use this program" })).toBeVisible({ timeout: 45_000 });
  await context.setOffline(true);
  await page.getByRole("link", { name: "New", exact: true }).first().click();
  await expect(page.getByText(/saved on this device, so you can generate offline/)).toBeVisible();
  await setSeed(page, "6");
  await generate(page);
  await context.setOffline(false);
});

test("mobile layout fits and the form works by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/programs/new");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /^Minimalist/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Minimalist/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Generate program" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Use this program" })).toBeVisible({ timeout: 45_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { name: "Minimalist · 4 days/week" })).toBeVisible();
});

test("previously saved library programs stay reachable", async ({ page }) => {
  await seedLegacyProgram(page, "minimalist-four-day");
  await page.goto("/program/minimalist-four-day/week/w01/session/w01-s1");
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
});

test("reload resumes the session; backup → delete progress → restore keeps checkmarks and history", async ({ page }, info) => {
  await page.goto("/programs/new");
  await setSeed(page, "28");
  await generate(page);
  await page.getByRole("button", { name: "Use this program" }).click();
  // Session 1: two checks, finished.
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("checkbox").nth(0).click();
  await page.getByRole("checkbox").nth(1).click();
  await expect(page.getByTestId("saved-state")).toContainText("2 of");
  await persisted(page, 2);
  await page.getByRole("button", { name: "Finish session" }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByText("Session complete").first()).toBeVisible();
  // Session 2: one check, then reload and resume.
  await page.goto("/active-program");
  await expect(page.getByText("1 of 18 training sessions complete")).toBeVisible();
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("checkbox").nth(0).click();
  await expect(page.getByTestId("saved-state")).toContainText("1 of");
  await persisted(page, 3);
  await page.goto("/active-program");
  await page.reload();
  await page.getByRole("button", { name: "Resume session" }).click();
  await expect(page.getByTestId("saved-state")).toContainText("1 of");
  await expect(page.getByRole("checkbox").first()).toBeChecked();

  // Back up, wipe progress, restore.
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const file = info.outputPath("backup.json");
  await (await download).saveAs(file);
  await page.getByRole("button", { name: "Delete progress" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();
  await page.goto("/active-program");
  await expect(page.getByText("none is active")).toBeVisible();
  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(/Restored .* · Your place: Week 1 · Session 2 · 1 of 18 complete/)).toBeVisible();
  await page.goto("/active-program");
  await expect(page.getByText("1 of 18 training sessions complete")).toBeVisible();
  await page.getByRole("button", { name: "Resume session" }).click();
  await expect(page.getByTestId("saved-state")).toContainText("1 of");
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  // Session 1 still shows its history.
  await page.goBack();
  await page.getByRole("link", { name: "View program" }).click();
  await page.getByRole("link", { name: /Session 1 .*Complete/ }).first().click();
  await expect(page.getByText("Session complete").first()).toBeVisible();
  await expect(page.getByTestId("saved-state")).toHaveCount(0);
});
