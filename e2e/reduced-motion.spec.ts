/**
 * Reduced-motion coverage for the full interaction catalogue
 * (docs/19-design-reference.md §19.3).
 *
 * The previous spec checked two of the eight behaviours, so a new animation
 * could ship without a reduced-motion fallback and nothing would fail. Each
 * catalogue entry now has an assertion, and the final case checks the invariant
 * that matters most: no content is left mid-animation.
 */

import { expect, test, type Page } from "@playwright/test";

/** Values the browser reports for an effectively instant transition. */
const INSTANT_DURATIONS = ["0s", "0.01ms"];

test.use({ reducedMotion: "reduce" });

async function durationOf(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => getComputedStyle(node).transitionDuration);
}

test("intro loader never renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".intro-loader")).toHaveCount(0);
  // The overlay is the largest initial paint, so its absence must not leave the
  // hero hidden behind a stale animation state.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("scroll reveal renders content at rest", async ({ page }) => {
  await page.goto("/");
  const animating = await page.evaluate(() => {
    const elements = [...document.querySelectorAll("main, main *")];
    return elements.filter((element) => {
      const styles = getComputedStyle(element);
      return (
        Number(styles.opacity) < 1 || styles.filter.includes("blur") || styles.transform !== "none"
      );
    }).length;
  });
  expect(animating).toBe(0);
});

test("count-up shows its final value immediately", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".count-up")).toHaveText("11 routes");
});

test("marquee is a static wrapped grid with no duplicated track", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".marquee-track")).toHaveCSS("animation-name", "none");
  await expect(page.locator('.marquee-track [aria-hidden="true"]').first()).toBeHidden();
});

test("disclosure and accordion open instantly", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "View more" }).click();
  expect(INSTANT_DURATIONS).toContain(await durationOf(page, ".collapsible-panel"));

  await page.getByRole("button", { name: "Current focus" }).click();
  expect(INSTANT_DURATIONS).toContain(await durationOf(page, ".accordion-panel"));
});

test("hover affordances do not translate", async ({ page }) => {
  await page.goto("/");
  const link = page.locator(".home-section a").first();
  await link.hover();
  await expect(link).toHaveCSS("transform", "none");
});

test("the bottom bar shine animation is suppressed", async ({ page }) => {
  await page.goto("/");
  // The shine is painted by `.bottom-bar::before`, so the pseudo-element has to
  // be inspected directly — asserting on the host element would pass trivially.
  const shine = await page.locator(".bottom-bar").evaluate((node) => {
    const styles = getComputedStyle(node, "::before");
    return { animationName: styles.animationName, opacity: styles.opacity };
  });
  expect(shine.animationName).toBe("none");
  expect(Number(shine.opacity)).toBe(0);
});

test("switching between human and agent views does not crossfade", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Agent" })
    .click();
  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-mode-crossfade", /.*/);
});
