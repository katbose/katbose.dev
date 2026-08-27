"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({ children }: Readonly<{ children: ReactNode }>) {
  const reduced = useReducedMotion();
  if (reduced) return children;
  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        initial={{ opacity: 0, y: 32, scale: 0.985, filter: "blur(12px)" }}
        transition={{ duration: 0.95, ease: [0.2, 0, 0, 1] }}
        viewport={{ once: true, amount: 0.15 }}
        whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
