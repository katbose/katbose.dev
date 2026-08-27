import { expect, test } from "@playwright/test";

const story =
  "I care about the boundaries between a thoughtful interface and the systems that keep it trustworthy.";

test("Home disclosures start closed and expose honest labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(story)).not.toBeVisible();
  await page.getByRole("button", { name: "View more" }).click();
  await expect(page.getByText(story)).toBeVisible();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();

  await page.getByRole("button", { name: "View categories" }).click();
  await expect(page.getByRole("button", { name: "Hide categories" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "TypeScript" })).toBeVisible();
});

test("reduced motion keeps the stack static and count final", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".count-up")).toHaveText("11 routes");
  await expect(page.locator(".marquee-track")).toHaveCSS("animation-name", "none");
  await expect(page.locator('.marquee-track [aria-hidden="true"]').first()).toBeHidden();
});
