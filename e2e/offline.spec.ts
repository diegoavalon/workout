import { expect, test } from "@playwright/test";
import { seedLegacyProgram } from "./legacy";

test("offline deep link, navigation with zero network, and completion persist", async ({ page, context }) => {
  await seedLegacyProgram(page, "minimalist-four-day");
  await expect(page.getByRole("heading", { name: "Active program" })).toBeVisible();
  // Wait for the service worker to control the page.
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  await page.reload();

  await context.setOffline(true);
  // Deep-link a nested session URL with no network.
  await page.goto("/program/minimalist-four-day/week/w01/session/w01-s1");
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();
  // In-app transitions make zero network requests.
  let requestCount = 0;
  page.on("request", (r) => { if (!/\/favicon[^/]*$/.test(r.url())) requestCount++; }); // browsers fetch the tab icon on their own
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
