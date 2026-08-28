"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT, REVEAL_MOTION } from "@/lib/motion";

/**
 * Scroll reveal from the interaction catalogue (docs/19-design-reference.md §19.3).
 *
 * Under a reduced-motion preference the children are rendered directly, with no
 * `motion` wrapper and therefore no transform, filter or opacity animation at
 * all — the content is simply present.
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
