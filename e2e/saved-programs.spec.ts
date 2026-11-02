import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const source = JSON.parse(readFileSync("data/generated/pump-lift-3x-seed28-2026-11-02.json", "utf8"));
const importProgram = async (page: Page, seed: number) => {
  await page.goto("/programs/saved");
  const file = structuredClone(source);
  file.options.seed = seed;
  await page.getByLabel("Generated program file").setInputFiles({ name: "program.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByRole("button", { name: "Use this program" })).toBeVisible();
  return page.url();
};

test("cancel and delete saved programs, preserving other programs and persisting across reload", async ({ page }) => {
  const activeUrl = await importProgram(page, 28);
  await page.getByRole("button", { name: "Use this program" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByTestId("saved-state")).toContainText("1 of");
  const inactiveUrl = await importProgram(page, 29);
  await page.goto("/programs/saved");
  const rows = page.getByRole("list", { name: "Saved programs" }).getByRole("listitem");
  const inactive = rows.filter({ hasText: "Not started" });
  await inactive.getByRole("button", { name: /^Delete / }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete program?" });
  await expect(page).toHaveURL(/\/programs\/saved$/); // Delete is separate from the preview link.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(inactive.getByRole("button", { name: /^Delete / })).toBeFocused();
  await inactive.getByRole("button", { name: /^Delete / }).click();
  await dialog.getByRole("button", { name: "Delete program", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole("link")).toHaveAttribute("href", new URL(activeUrl).pathname);
  await page.goto(inactiveUrl);
  await expect(page.getByRole("heading", { name: "Generated program not found" })).toBeVisible();
  await page.goto("/active-program");
  await page.getByRole("button", { name: "Resume session" }).click();
  await expect(page.getByRole("checkbox").first()).toBeChecked();

  await page.goto("/programs/saved");
  await rows.getByRole("button", { name: /^Delete / }).click();
  await expect(dialog.getByText(/This is your active program/)).toBeVisible();
  await dialog.getByRole("button", { name: "Delete program", exact: true }).click();
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();
  await page.reload();
  await expect(rows).toHaveCount(0);
  await page.goto("/active-program");
  await expect(page.getByText("No active program yet. Generate one to get started.")).toBeVisible();
});

test("deleting the active program returns to the remaining program already in progress", async ({ page }) => {
  const firstUrl = await importProgram(page, 28);
  await page.getByRole("button", { name: "Use this program" }).click();
  await expect(page).toHaveURL(/\/active-program$/);
  await importProgram(page, 29);
  await page.getByRole("button", { name: "Use this program" }).click();
  await expect(page).toHaveURL(/\/active-program$/);
  await page.goto("/programs/saved");
  const rows = page.getByRole("list", { name: "Saved programs" }).getByRole("listitem");
  await rows.filter({ hasText: "Active" }).getByRole("button", { name: /^Delete / }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete program?" });
  await expect(dialog.getByText(/remaining program will become active/)).toBeVisible();
  await dialog.getByRole("button", { name: "Delete program", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Active");
  await page.goto("/active-program");
  await expect(page.getByRole("link", { name: "View program" })).toHaveAttribute("href", new URL(firstUrl).pathname);
});
