"use client";

import { LazyMotion, domAnimation, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { EASE_OUT, REVEAL_MOTION } from "@/lib/motion";

/**
 * Scroll reveal from the interaction catalogue (docs/19-design-reference.md §19.3).
 *
 * Under a reduced-motion preference the children are rendered directly, with no
 * `motion` wrapper and therefore no transform, filter or opacity animation at
 * all — the content is simply present.
 *
 * That branch only exists on the client. `useReducedMotion` reads `matchMedia`,
 * so it returns `null` during the server render and the wrapper is always
 * emitted, with `motion` inlining the hidden `initial` state — opacity 0 and a
 * blur — into the server HTML. Every visitor therefore receives markup that is
 * mid-reveal, and a visitor who asked for reduced motion sees it until the
 * script resolves the preference, or forever if the script never runs.
 *
 * The `reveal` class is the hook that closes that window: `globals.css`
 * neutralises the inlined state under `prefers-reduced-motion: reduce`, which
 * the browser applies on the first paint with no script involved. The class is
 * load-bearing rather than cosmetic, so `tests/reveal-reduced-motion.test.ts`
 * asserts it is present and that the rule still overrides the inline style.
 *
 * Resolving the preference during render was rejected: the server cannot know
 * it, and returning a different tree there would be a hydration mismatch rather
 * than a fix.
 *
 * The motion values come from `lib/motion`, which is checked against the design
 * tokens in `theme.css` by `tests/motion-tokens.test.ts`.
 */
export function Reveal({ children }: Readonly<{ children: ReactNode }>) {
  const reduced = useReducedMotion();
  if (reduced) return children;
  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className="reveal"
        initial={{
          opacity: 0,
          y: REVEAL_MOTION.shiftPx,
          scale: REVEAL_MOTION.scale,
          filter: `blur(${REVEAL_MOTION.blurPx}px)`,
        }}
        transition={{ duration: REVEAL_MOTION.durationMs / 1000, ease: EASE_OUT }}
        viewport={{ once: true, amount: REVEAL_MOTION.viewportAmount }}
        whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
