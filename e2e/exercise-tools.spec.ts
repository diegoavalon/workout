import { expect, test } from "@playwright/test";

const sessionUrl = "/program/minimalist-four-day/week/w01/session/w01-s1";

test("set tracking is reversible and local to the open session", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(sessionUrl);
  const card = page.getByRole("article", { name: "Dumbbell Bench Press", exact: true });
  await expect(card.getByRole("checkbox")).toHaveCount(3);
  // The whole label is a touch target, including its text.
  await card.getByText("Set 2", { exact: true }).click();
  await expect(card.getByText("1 of 3 completed")).toBeVisible();
  await card.getByRole("checkbox", { name: "Set 1" }).focus();
  await page.keyboard.press("Space");
  await card.getByRole("checkbox", { name: "Set 3" }).check();
  await expect(card).toHaveAttribute("data-completed", "true");
  await expect(card.getByText("Completed", { exact: true })).toBeVisible();
  await card.getByRole("checkbox", { name: "Set 2" }).uncheck();
  await expect(card).toHaveAttribute("data-completed", "false");

  // A loader refresh for session completion keeps the current local exercise progress.
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toBeVisible();
  await expect(card.getByText("2 of 3 completed")).toBeVisible();

  // Opening another session, then returning, starts with fresh exercise tools.
  await page.getByRole("button", { name: "Next session" }).click();
  await expect(page).toHaveURL(/w01-s2$/);
  await page.getByRole("button", { name: "Previous session" }).click();
  await expect(page).toHaveURL(/w01-s1$/);
  await expect(card.getByText("0 of 3 completed")).toBeVisible();
  await card.getByRole("checkbox", { name: "Set 1" }).check();
  await page.reload();
  await expect(card.getByText("0 of 3 completed")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("superset work and rest prescriptions use one shared timer offline", async ({ page, context }) => {
  await page.goto("/program/minimalist-four-day/week/w01/session/w01-s2");
  const group = page.getByRole("region", { name: "Superset C", exact: true });
  const tracker = group.getByRole("group", { name: "Superset C tracking", exact: true });
  const card = group.getByRole("article", { name: "Bent Knee Copenhagen Plank", exact: true });
  const rest = tracker.getByRole("timer", { name: "Rest countdown" });
  await expect(card.getByRole("timer")).toHaveCount(0);
  await expect(card.getByRole("checkbox")).toHaveCount(0);
  await expect(rest).toHaveText("1:30");
  await tracker.scrollIntoViewIfNeeded();
  await page.clock.install();
  await context.setOffline(true);

  await tracker.getByRole("button", { name: "Start rest timer" }).click();
  await page.clock.fastForward(5_000);
  await expect(rest).toHaveText("1:25");
  await tracker.getByRole("button", { name: "Pause rest timer" }).click();
  await page.clock.fastForward(5_000);
  await expect(rest).toHaveText("1:25");
  await tracker.getByRole("button", { name: "Reset rest timer" }).click();
  await expect(rest).toHaveText("1:30");

  await tracker.getByRole("combobox", { name: "Superset C timer prescription" }).click();
  await page.getByRole("option", { name: "Time for C2 · 30 s", exact: true }).click();
  const time = tracker.getByRole("timer", { name: "Time countdown" });
  await expect(time).toHaveText("30 s");
  await expect(tracker.getByRole("timer")).toHaveCount(1);
  await tracker.getByRole("button", { name: "Start time timer" }).click();
  await page.clock.fastForward(30_000);
  await expect(time).toHaveText("0 s");
  await expect(tracker.locator("[data-timer-completed=true]")).toHaveCount(1);
  await expect(tracker.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await tracker.getByRole("button", { name: "Restart time timer" }).click();
  await expect(time).toHaveText("30 s");
});

for (const width of [1280, 375]) {
  test(`superset tracking stays sticky within its group at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/program/minimalist-four-day/week/w01/session/w01-s4");
    const group = page.getByRole("region", { name: "Superset C", exact: true });
    const tracker = group.getByRole("group", { name: "Superset C tracking", exact: true });
    const articles = group.getByRole("article");
    await expect(articles).toHaveCount(2);
    await expect(group.getByRole("checkbox")).toHaveCount(3);
    await expect(tracker.getByRole("timer")).toHaveText("2:00");
    await expect(articles.getByRole("timer")).toHaveCount(0);
    const geometry = await group.evaluate((el) => ({ top: el.getBoundingClientRect().top + scrollY, height: el.getBoundingClientRect().height }));
    for (const offset of [40, 120]) {
      await page.evaluate((y) => window.scrollTo(0, y), geometry.top + offset);
      await expect.poll(async () => (await tracker.boundingBox())!.y).toBe(60);
    }
    await tracker.getByRole("combobox", { name: "Superset C timer prescription" }).click();
    await page.getByRole("option", { name: "Rest after C1 · 30 s", exact: true }).click();
    await expect(tracker.getByRole("timer")).toHaveText("30 s");
    for (const checkbox of await tracker.getByRole("checkbox").all()) await checkbox.check();
    await expect(group).toHaveAttribute("data-completed", "true");
    for (const article of await articles.all()) await expect(article).toHaveAttribute("data-completed", "true");
    await expect(tracker.getByText("Completed", { exact: true })).toBeVisible();
    await tracker.getByRole("checkbox", { name: "Round 2" }).uncheck();
    await expect(group).toHaveAttribute("data-completed", "false");
    for (const article of await articles.all()) await expect(article).toHaveAttribute("data-completed", "false");
    const end = await group.evaluate((el) => el.getBoundingClientRect().bottom + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), end - 20);
    await expect.poll(async () => (await tracker.boundingBox())!.y).toBeLessThan(60);
    expect(await page.evaluate(() => {
      const appHeader = document.querySelector("header");
      const rect = appHeader!.getBoundingClientRect();
      return appHeader!.contains(document.elementFromPoint(rect.x + 20, rect.y + 20));
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
