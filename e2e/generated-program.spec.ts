import { expect, test } from "@playwright/test";

const FILE = "data/generated/pump-lift-3x-seed28-2026-11-02.json";

test("import → activate → start → check → reload → finish → undo", async ({ page }) => {
  await page.goto("/train");
  await page.locator('input[type="file"]').first().setInputFiles(FILE);
  await expect(page.getByRole("heading", { name: "Pump Lift · 3 days/week" })).toBeVisible();
  await expect(page.getByText("6 weeks · 18 training sessions")).toBeVisible();
  await page.getByRole("button", { name: "Use this program" }).click();

  await expect(page.getByText("Next session")).toBeVisible();
  await expect(page.getByText("0 of 18 training sessions complete")).toBeVisible();
  await page.getByRole("button", { name: "Start session" }).click();

  await expect(page.getByText("In progress · saved")).toBeVisible();
  const boxes = page.getByRole("checkbox");
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await expect(page.getByTestId("saved-state")).toContainText("2 of");

  await page.reload();
  await expect(page.getByTestId("saved-state")).toContainText("2 of");

  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "Finish with unchecked sets?" })).toBeVisible();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByText("Session complete").first()).toBeVisible();
  await page.getByRole("button", { name: "Undo finish" }).click();
  await expect(page.getByTestId("saved-state")).toContainText("2 of");
});
