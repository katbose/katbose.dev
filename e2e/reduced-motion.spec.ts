/**
 * Reduced-motion coverage for the full interaction catalogue
 * (docs/19-design-reference.md §19.3).
 *
 * The previous spec checked two of the eight behaviours, so a new animation
 * could ship without a reduced-motion fallback and nothing would fail. Each
 * catalogue entry now has an assertion, plus the invariant that matters most:
 * no content is left mid-animation.
 *
 * That invariant is asserted twice, because the reveal has two distinct states to
 * defend. After hydration the client has resolved the preference and dropped the
 * `motion` wrapper entirely. Before hydration the server has already emitted the
 * wrapper with a transparent, blurred inline style, since the preference cannot
 * be read during a server render — so the pre-hydration paint has to be checked
 * on its own, with the script blocked, or the assertion is just racing hydration
 * and reporting whichever state it happened to catch.
 */

import { expect, test, type Page } from "@playwright/test";

/**
 * Upper bound, in seconds, for a transition no visitor can perceive.
 *
 * Reduced-motion CSS collapses durations to zero, but `motion` can leave a
 * hair above it behind, so the assertion allows anything under a millisecond
 * rather than demanding an exact zero.
 */
const IMPERCEPTIBLE_SECONDS = 0.001;

// `page.emulateMedia` rather than `test.use({ reducedMotion })`: the fixture
// option did not reach the page in CI, so the whole file silently ran with
// motion enabled and still passed some assertions. Emulating explicitly per
// test is the pattern already proven in this repository.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

/**
 * Longest transition on the element, in seconds.
 *
 * Comparing the raw `transitionDuration` string against a list of accepted
 * spellings was brittle: `transitionDuration` can carry several comma-separated
 * values, and Chromium serialises the same tiny duration as `0.01ms` in one
 * context and `1e-05s` in another, so a list that matched locally failed in CI
 * on a value identical in magnitude. Parsing to a number compares what the
 * assertion actually cares about — whether anything lasts long enough to see.
 */
async function longestTransitionSeconds(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((node) =>
      Math.max(
        ...getComputedStyle(node)
          .transitionDuration.split(",")
          .map((value) => {
            const trimmed = value.trim();
            const magnitude = Number.parseFloat(trimmed);
            if (Number.isNaN(magnitude)) return 0;
            return trimmed.endsWith("ms") ? magnitude / 1000 : magnitude;
          }),
      ),
    );
}

/**
 * Counts the elements inside `main` that are caught mid-animation.
 *
 * A partial opacity or a blur is the signature of a reveal that is still
 * animating. `transform` is deliberately not checked: it is used for static
 * layout in several places and would report false positives.
 */
async function midAnimationCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const elements = [...document.querySelectorAll("main, main *")];
    return elements.filter((element) => {
      const styles = getComputedStyle(element);
      const opacity = Number(styles.opacity);
      return (opacity > 0 && opacity < 1) || styles.filter.includes("blur");
    }).length;
  });
}

/**
 * Waits until the client has applied the reduced-motion preference.
 *
 * `Reveal` renders on the server, where the preference is unknowable, so the
 * server HTML always carries the reveal wrapper. The client renders the children
 * without it once the preference resolves. Waiting for the wrapper to go is
 * therefore a direct signal that hydration has settled — the invariant scan used
 * to race it — rather than a fixed sleep that would pass or fail with runner
 * load.
 */
async function settleReveal(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect(
    page.locator(".reveal"),
    "the reveal wrapper survived hydration under reduced motion",
  ).toHaveCount(0);
  // Two frames, so any style committed by that final render has been painted.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
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
  await settleReveal(page);
  expect(await midAnimationCount(page)).toBe(0);
});

test("the server-rendered reveal is already at rest before hydration", async ({ page }) => {
  // Blocking every script freezes the page in the state the server sent, which is
  // the window the previous test cannot see. `Reveal` renders on the server, where
  // the reduced-motion preference is unknowable, so `motion` inlines a transparent,
  // blurred initial state into the HTML for all nine wrappers. Only the stylesheet
  // can undo that before the script runs, and this is the assertion that proves it
  // does. Stylesheets and documents are left alone so the override is actually
  // loaded.
  await page.route("**/*", (route) =>
    route.request().resourceType() === "script" ? route.abort() : route.continue(),
  );
  await page.goto("/");

  // The wrapper is still there, so this really is the pre-hydration markup and
  // not a page that quietly hydrated and removed the evidence.
  await expect(page.locator(".reveal").first()).toBeAttached();
  expect(await midAnimationCount(page)).toBe(0);
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
  expect(await longestTransitionSeconds(page, ".collapsible-panel")).toBeLessThan(
    IMPERCEPTIBLE_SECONDS,
  );

  await page.getByRole("button", { name: "Current focus" }).click();
  expect(await longestTransitionSeconds(page, ".accordion-panel")).toBeLessThan(
    IMPERCEPTIBLE_SECONDS,
  );
});

test("hover affordances do not translate", async ({ page }) => {
  await page.goto("/");
  const link = page.locator(".home-section a").first();
  await link.hover();
  await expect(link).toHaveCSS("transform", "none");
});

test("the bottom bar shine animation is suppressed", async ({ page }) => {
  await page.goto("/");
  // Settling first is what makes the rest of this test mean anything. Under
  // reduced motion `Reveal` renders its children without the wrapper the server
  // emitted, so React reports a hydration mismatch and regenerates the tree —
  // which replaces the bottom bar. A locator resolved before that point holds a
  // detached node, and Chromium answers every property on a detached element with
  // an empty string. That is precisely how this test used to fail: `animationName`
  // came back as `""`, while `Number("") === 0` let the opacity assertion pass on
  // a pseudo-element it had never read.
  await settleReveal(page);

  // Querying inside the page rather than through a locator handle keeps the read
  // on whichever element is live at that moment.
  const shine = await page.evaluate(() => {
    const bar = document.querySelector(".bottom-bar");
    if (!bar) return null;
    const styles = getComputedStyle(bar, "::before");
    return {
      connected: bar.isConnected,
      content: styles.content,
      animationName: styles.animationName,
      opacity: styles.opacity,
      // Pseudo-element animations are reachable through the host's subtree, so
      // this reports whether anything is actually running on the shine rather
      // than only what the cascade resolved to.
      running: bar
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.pseudoElement === "::before")
        .map((animation) => (animation as CSSAnimation).animationName),
    };
  });

  expect(shine, "no .bottom-bar in the document").not.toBeNull();
  // The two guards against a vacuous pass. A detached node or an ungenerated
  // pseudo-element makes every property below an empty string, so both have to be
  // ruled out before the suppression assertions carry any weight.
  expect(shine?.connected, "the bottom bar was detached when its style was read").toBe(true);
  expect(shine?.content, "the ::before pseudo-element was not generated").toBe('""');

  // The discriminating assertion: `animation-name` is the only resolved property
  // that differs between a suppressed shine and a running one. The universal
  // reduced-motion reset already collapses every `animation-duration` to 0.01ms,
  // and the base rule already sets `opacity: 0`, so neither of those can tell the
  // two apart on its own.
  expect(shine?.animationName, "the shine animation is still declared").toBe("none");
  expect(shine?.running, "an animation is running on the shine").toEqual([]);
  // Compared as the reported string, never through `Number`, which would read an
  // empty string as a satisfied assertion.
  expect(shine?.opacity).toBe("0");
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
