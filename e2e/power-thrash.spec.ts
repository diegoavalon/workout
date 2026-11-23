import { expect, test } from "@playwright/test";
import { POWER_THRASH_TEMPLATE } from "../src/domain/power-thrash.ts";
import { CORPUS_CACHE } from "../src/generate/protocol.ts";
import { powerThrashFixture, recoveryCorpusFixture } from "../src/test-fixtures/power-thrash.ts";

test.use({ serviceWorkers: "block" });

test("create Power Thrash II, train from the first week, and edit the saved maxes offline", async ({ page, context }) => {
  const templatePath = `/api/corpus/${POWER_THRASH_TEMPLATE}`;
  const corpusBody = JSON.stringify(recoveryCorpusFixture);
  const version = "0aabbccddeef";
  const corpusUrl = `/api/corpus/corpus-${version}.json`;
  await context.route(corpusUrl, (route) => route.fulfill({ contentType: "application/json", body: corpusBody }));
  await page.route("/api/corpus/manifest.json", (route) => route.fulfill({
    json: { version, url: corpusUrl, bytes: Buffer.byteLength(corpusBody), weeks: recoveryCorpusFixture.length, equipment: [] },
  }));
  let downloads = 0;
  await page.route(templatePath, (route) => {
    downloads++;
    return route.fulfill({ json: powerThrashFixture });
  });
  await page.clock.setFixedTime(new Date("2026-11-23T12:00:00Z"));
  await page.goto("/programs/new");
  const choices = page.getByRole("radiogroup", { name: "Choose a program" });
  await expect(choices.getByRole("radio")).toHaveCount(5);
  await expect(choices.getByRole("radio", { name: "Pump Lift" })).toBeChecked();
  expect(downloads).toBe(0);
  await choices.getByText("Power Thrash II", { exact: true }).click();
  await expect(choices.getByRole("radio", { name: "Power Thrash II" })).toBeChecked();
  await expect(choices.getByRole("radio", { checked: true })).toHaveCount(1);

  const maxFields = page.getByRole("textbox", { name: / in pounds$/ });
  await expect(maxFields).toHaveCount(15);
  await expect(page.getByRole("radio", { name: "Full sets" })).toBeChecked();
  await expect(page.getByText("Original program by Istvan Javorek.", { exact: true })).toBeVisible();
  await expect(page.getByText(powerThrashFixture.credit, { exact: true })).toHaveCount(0);
  const maxInput = maxFields.first();
  await page.getByRole("button", { name: "Increase Test lift 1", exact: true }).click();
  await expect(maxInput).toHaveValue("5");
  await maxInput.fill("52.5");
  await maxInput.press("ArrowUp");
  await expect(maxInput).toHaveValue("55");
  await page.getByRole("button", { name: "Decrease Test lift 1", exact: true }).click();
  await expect(maxInput).toHaveValue("52.5");
  for (const { label, example } of powerThrashFixture.maxes) {
    await page.getByRole("textbox", { name: `${label} in pounds`, exact: true }).fill(String(example));
  }
  await page.getByRole("button", { name: "Create program" }).click();
  await expect(page.getByRole("heading", { name: "Power Thrash II · 3 days/week" })).toBeVisible();
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Use this program" }).click();
  await expect(page).toHaveURL(/\/active-program$/);
  await page.goto(originalUrl);
  await page.getByRole("link", { name: "Open Week 1" }).click();
  await expect(page.getByText(/Rest day$/)).toHaveCount(1);
  await expect(page.getByText("Sun · Rest day", { exact: true })).toBeVisible();
  for (const day of ["Mon", "Wed", "Fri"]) {
    await expect(page.getByRole("link", { name: new RegExp(`Session \\d · ${day}`) })).toBeVisible();
  }
  for (const day of ["Tue", "Thu", "Sat"]) {
    await expect(page.getByRole("link", { name: new RegExp(`${day} · Optional recovery`) })).toBeVisible();
  }
  await page.getByRole("link", { name: /Tue · Optional recovery/ }).click();
  await expect(page.getByRole("heading", { name: /Fixture mobility/ })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: /Session 1 · Mon/ }).click();
  await expect(page.getByText("Set 1: 14 + 10 reps @ 125 lb")).toBeVisible();
  await expect(page.getByText("Moves: Test press, Test row.")).toBeVisible();
  await expect(page.getByRole("article", { name: "Stair Run" }).getByText("Weight")).toHaveCount(0);

  await page.goto(originalUrl);
  await page.unroute(templatePath);
  await page.evaluate(async ({ template, corpusCache }) => {
    localStorage.setItem("workout-power-thrash-template", JSON.stringify(template));
    localStorage.removeItem("workout-corpus-manifest");
    await caches.delete(corpusCache);
  }, { template: powerThrashFixture, corpusCache: CORPUS_CACHE });
  await context.setOffline(true);
  try {
    await page.getByText("Program details", { exact: true }).click();
    await expect(page.getByText("Test lift 1", { exact: true })).toBeVisible();
    await expect(page.getByText("175 lb", { exact: true })).toBeVisible();
    await expect(page.getByText("Full sets", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Change maxes or sets" }).click();
    await expect(page.getByRole("radio", { name: "Power Thrash II" })).toBeChecked();
    const firstMax = page.getByRole("textbox", { name: "Test lift 1 in pounds", exact: true });
    await expect(firstMax).toHaveValue("175");
    await expect(page.getByText("Original program by Istvan Javorek.", { exact: true })).toBeVisible();
    await expect(page.getByText(powerThrashFixture.credit, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Suggested start (a Monday)")).toHaveText("Nov 23, 2026");
    await firstMax.fill("185");
    await page.getByRole("radio", { name: "Half sets" }).click();
    await page.getByRole("button", { name: "Create program" }).click();
    await expect(page.getByRole("heading", { name: "Power Thrash II · 3 days/week" })).toBeVisible();
    await expect(page).not.toHaveURL(originalUrl);
    await page.getByText("Program details", { exact: true }).click();
    await expect(page.getByText("Half sets", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Change maxes or sets" }).click();
    await expect(page.getByRole("radio", { name: "Half sets" })).toBeChecked();
  } finally {
    await context.setOffline(false);
  }
});
