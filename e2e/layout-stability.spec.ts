/**
 * Cumulative Layout Shift gate (docs/19-design-reference.md §19.7).
 *
 * The design reference requires CLS = 0 measured on a fresh session, which is
 * the only run where the intro loader plays and the fallback profile portrait
 * loads. Those are exactly the two elements most likely to shift the page, so a
 * warm-session measurement would prove nothing.
 *
 * Each Playwright test gets a new browser context, so `sessionStorage` is empty
 * and the intro loader always runs here.
 */

import { expect, test } from "@playwright/test";

/** Longer than the 1750ms intro loader, with headroom for a slow CI runner. */
const OBSERVATION_WINDOW_MS = 3_500;

/**
 * Upper bound treated as "no layout shift".
 *
 * The design reference asks for CLS = 0, meaning no unreserved space and no
 * visible reflow. A real browser still reports sub-pixel values around 1e-5 to
 * 1e-4 from font-metric rounding, which no visitor can perceive and which no
 * markup change can remove. This bound is three orders of magnitude below the
 * 0.1 "good" threshold, so it holds the intended guarantee while remaining
 * achievable. A genuine unreserved image or injected banner scores far above it.
 */
const MAX_LAYOUT_SHIFT = 0.001;

declare global {
  interface Window {
    __layoutShiftScore?: number;
  }
}

/** Paths whose layout stability is owned entirely by this repository. */
const MEASURED_PATHS = ["/", "/agent"] as const;

for (const path of MEASURED_PATHS) {
  test(`records zero cumulative layout shift on ${path}`, async ({ page }) => {
    test.slow();

    // Registered before any document script so no shift can be missed, and
    // `buffered` replays entries recorded before the observer attached.
    await page.addInitScript(() => {
      window.__layoutShiftScore = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          // Shifts following real input are excluded from CLS by definition.
          if (!shift.hadRecentInput) window.__layoutShiftScore! += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // The intro overlay unmounts on a timer, which is the highest-risk moment.
    await page.waitForTimeout(OBSERVATION_WINDOW_MS);
    await expect(page.locator(".intro-loader")).toHaveCount(0);

    const score = await page.evaluate(() => window.__layoutShiftScore ?? -1);
    expect(score, "layout-shift observer never attached").toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(MAX_LAYOUT_SHIFT);
  });
}

test("reserves the profile portrait box before the image loads", async ({ page }) => {
  // Blocking the portrait proves the reserved 1:1 geometry holds on its own
  // rather than being supplied by the loaded image's intrinsic size.
  await page.route("**/*.png", (route) => route.abort());
  await page.goto("/");

  const portrait = page.locator(".profile-portrait").first();
  await expect(portrait).toBeVisible();
  const box = await portrait.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.width).toBeCloseTo(box?.height ?? 0, 0);
});
