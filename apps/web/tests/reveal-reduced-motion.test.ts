/**
 * Guards the scroll reveal's pre-hydration state (requirement 7.3).
 *
 * `Reveal` skips the `motion` wrapper under a reduced-motion preference, but that
 * decision needs `matchMedia`, so it cannot be made during the server render. The
 * server therefore always emits the wrapper, and `motion` inlines the hidden
 * `initial` state into it. Nine sections compose the home page, so nine elements
 * arrive transparent and blurred no matter what the visitor asked for — which is
 * exactly what the reduced-motion end-to-end invariant reported.
 *
 * A stylesheet rule is what closes that window, because CSS applies on the first
 * paint with no script involved. This file holds the three facts that rule depends
 * on: the wrapper carries the class the rule targets, `motion` really does inline a
 * state that needs overriding, and the override is strong enough to win against an
 * inline style.
 *
 * The end-to-end spec asserts the resulting computed styles in a real browser.
 * These assertions exist so the contract between the component and the stylesheet
 * cannot be broken without a failure that runs anywhere.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal } from "@/components/common/reveal";
import { REVEAL_MOTION } from "@/lib/motion";
import { reducedMotionDeclarations } from "./support/reduced-motion-css";

/** The class the stylesheet targets, and the wrapper it has to be on. */
const REVEAL_CLASS = "reveal";

const serverMarkup = renderToStaticMarkup(
  createElement(Reveal, null, createElement("p", null, "revealed content")),
);

describe("scroll reveal pre-hydration state", () => {
  it("emits the wrapper on the server, because the preference is unknowable there", () => {
    // If this ever stops being true the stylesheet rule is dead weight rather than
    // a guarantee, and the reasoning in `reveal.tsx` needs revisiting.
    expect(serverMarkup).toContain("<div");
    expect(serverMarkup).toContain("revealed content");
  });

  it("puts the class the stylesheet targets on that wrapper", () => {
    expect(serverMarkup).toContain(`class="${REVEAL_CLASS}"`);
  });

  it("inlines a transparent, blurred state that the stylesheet has to override", () => {
    // Documents the defect the rule answers: this markup is what a reduced-motion
    // visitor receives, and what they keep if the script never runs.
    expect(serverMarkup).toContain("opacity:0");
    expect(serverMarkup).toContain(`blur(${REVEAL_MOTION.blurPx}px)`);
  });

  it("returns the wrapper to rest under a reduced-motion preference", () => {
    const declarations = reducedMotionDeclarations(`.${REVEAL_CLASS}`);
    expect(declarations, "no .reveal rule inside a reduced-motion block").not.toBe("");
    // `!important` is not stylistic here. An inline style outranks every normal
    // author declaration, so a rule without it would lose to the markup above and
    // the content would stay invisible.
    expect(declarations).toMatch(/opacity:\s*1\s*!important/);
    expect(declarations).toMatch(/filter:\s*none\s*!important/);
    expect(declarations).toMatch(/transform:\s*none\s*!important/);
  });
});
