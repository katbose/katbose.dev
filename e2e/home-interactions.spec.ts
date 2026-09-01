import { expect, test } from "@playwright/test";

/**
 * Home interaction catalogue with motion enabled.
 *
 * The reduced-motion fallbacks for every one of these behaviours live in
 * `reduced-motion.spec.ts`.
 */

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

test("disclosure panels animate their measured height rather than snapping", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View more" }).click();

  const panel = page.locator(".collapsible-panel").first();
  const styles = await panel.evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      transitionProperty: computed.transitionProperty,
      transitionDuration: computed.transitionDuration,
      overflow: computed.overflow,
      // Base UI publishes the measured height the transition animates towards.
      measuredHeight: computed.getPropertyValue("--collapsible-panel-height").trim(),
    };
  });

  expect(styles.transitionProperty).toContain("height");
  expect(Number.parseFloat(styles.transitionDuration)).toBeGreaterThan(0);
  expect(styles.overflow).toBe("hidden");
  expect(styles.measuredHeight).not.toBe("");
  expect(Number.parseFloat(styles.measuredHeight)).toBeGreaterThan(0);
});

test("switching to the agent view crossfades the content region", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-mode-crossfade", /.*/);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Agent" })
    .click();

  // Armed on click, so it is present while the incoming view paints.
  await expect(html).toHaveAttribute("data-mode-crossfade", "");
  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.locator("main")).toHaveCSS("animation-name", "mode-crossfade");

  // Self-clearing, so a later navigation cannot replay the fade.
  await expect(html).not.toHaveAttribute("data-mode-crossfade", /.*/, { timeout: 2_000 });
});

test("navigation that is not a mode switch does not crossfade", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-mode-crossfade", /.*/);
});
