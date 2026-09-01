/**
 * Guards the bottom-bar shine's reduced-motion contract (requirement 7.3).
 *
 * The shine is painted by `.bottom-bar::before`, so the end-to-end spec reads it
 * with `getComputedStyle(node, "::before")`. That read is only meaningful while
 * three facts hold: the pseudo-element is generated, the shine really is a CSS
 * animation, and a reduced-motion block cancels that animation. Chromium answers
 * every property with an empty string whenever it cannot resolve a pseudo-element,
 * and `Number("") === 0`, so a browser assertion built on those facts degrades
 * into passing on nothing rather than failing when one of them stops being true.
 *
 * The facts are therefore asserted here as well, where they run on every
 * `pnpm test` instead of only in the Playwright job.
 */

import { describe, expect, it } from "vitest";
import {
  GLOBALS_CSS,
  reducedMotionBlocks,
  reducedMotionDeclarations,
  selectorPattern,
  withoutComments,
} from "./support/reduced-motion-css";

const SHINE_SELECTOR = ".bottom-bar::before";
const SHINE_KEYFRAMES = "bottom-shine";

const STRIPPED_CSS = withoutComments(GLOBALS_CSS);

/** Every rule in the stylesheet whose selector is exactly the shine pseudo-element. */
function shineRules(): { readonly start: number; readonly declarations: string }[] {
  const pattern = new RegExp(
    String.raw`(?:^|[,{}\s])${selectorPattern(SHINE_SELECTOR)}\s*\{([^}]*)\}`,
    "g",
  );
  return [...STRIPPED_CSS.matchAll(pattern)].map((match) => ({
    start: match.index,
    declarations: match[1] ?? "",
  }));
}

/** The rule that brings the pseudo-element into existence, identified by `content`. */
function baseShineRule(): { readonly start: number; readonly declarations: string } {
  const rule = shineRules().find((candidate) => /content\s*:/.test(candidate.declarations));
  expect(rule, `no ${SHINE_SELECTOR} rule declares content`).toBeDefined();
  return rule as { readonly start: number; readonly declarations: string };
}

describe("bottom-bar shine reduced-motion contract", () => {
  it("generates the pseudo-element the shine is painted on", () => {
    // Without a `content` declaration Chromium never creates the pseudo-element,
    // and `getComputedStyle(node, "::before")` then reports an empty string for
    // every property — which the browser spec would read as an absent animation.
    expect(baseShineRule().declarations).toMatch(/content\s*:/);
  });

  it("paints the shine with a named keyframe animation", () => {
    // The browser assertion is `animation-name === "none"`. That only distinguishes
    // a suppressed shine from a running one while the shine is an animation with a
    // name in the first place.
    expect(baseShineRule().declarations).toMatch(
      new RegExp(String.raw`animation\s*:[^;]*\b${SHINE_KEYFRAMES}\b`),
    );
    expect(STRIPPED_CSS).toMatch(new RegExp(String.raw`@keyframes\s+${SHINE_KEYFRAMES}\s*\{`));
  });

  it("cancels the animation under a reduced-motion preference", () => {
    const declarations = reducedMotionDeclarations(SHINE_SELECTOR);
    expect(declarations, `no ${SHINE_SELECTOR} rule inside a reduced-motion block`).not.toBe("");
    expect(declarations).toMatch(/animation\s*:\s*none/);
    expect(declarations).toMatch(/opacity\s*:\s*0/);
  });

  it("declares the cancellation after the rule it has to beat", () => {
    // Both rules select `.bottom-bar::before`, and a media query adds no
    // specificity, so source order is the only thing deciding which animation-name
    // wins. Moving the reduced-motion block above the base rule would leave the
    // shine running with nothing else in the cascade to stop it.
    const suppression = reducedMotionBlocks(STRIPPED_CSS).find((block) =>
      block.body.includes(SHINE_SELECTOR),
    );
    expect(suppression, `no reduced-motion block mentions ${SHINE_SELECTOR}`).toBeDefined();
    expect(suppression?.start ?? -1).toBeGreaterThan(baseShineRule().start);
  });
});
