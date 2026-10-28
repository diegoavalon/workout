import { expect, test } from "@playwright/test";

test("offline deep link, navigation with zero network, and completion persist", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /how many days/i })).toBeVisible();
  // Wait for the service worker to control the page.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active;
  });
  await page.reload();
  await page.getByRole("link", { name: "4× per week" }).first().click();
  await expect(page).toHaveURL(/\/programs\/4/);
  await page.getByRole("link", { name: /Athletic Performance/ }).click();
  await expect(page).toHaveURL(/\/program\/athletic-performance/);
  const sessionHref = await page.getByRole("link", { name: /Week 1/ }).getAttribute("href");
  expect(sessionHref).toBeTruthy();

  await context.setOffline(true);
  const failed: string[] = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  // Deep-link a nested session URL with no network.
  await page.goto("/program/athletic-performance/week/w01/session/w01-s1");
  await expect(page.getByRole("heading", { name: /Lower Body Strength|Session/ }).first()).toBeVisible();
  await expect(page.getByText("Back Squat")).toBeVisible();
  // In-app navigation offline, then complete the session.
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();
  // In-app transitions make zero network requests.
  let requestCount = 0;
  page.on("request", () => requestCount++);
  await page.getByRole("link", { name: "Week 1" }).click();
  await expect(page).toHaveURL(/\/week\/w01$/);
  await page.waitForTimeout(300);
  expect(requestCount).toBe(0);
  // Content JSON must never be answered with HTML (a network failure offline is acceptable; HTML is not).
  const res = await page.evaluate(async () => {
    const r = await fetch("/content/catalog.json").catch(() => null);
    return r ? { status: r.status, type: r.headers.get("content-type") ?? "" } : null;
  });
  if (res) expect(res.type).not.toContain("text/html");
  await context.setOffline(false);
});
