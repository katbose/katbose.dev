"use client";

import { useLayoutEffect, useRef, useState } from "react";

function readNumberToken(node: HTMLElement, token: string, fallback: number) {
  const value = Number.parseFloat(getComputedStyle(node).getPropertyValue(token));
  return Number.isFinite(value) ? value : fallback;
}

export function CountUp({ value, suffix = "" }: Readonly<{ value: number; suffix?: string }>) {
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(value);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(value);
      return;
    }
    const node = ref.current;
    if (!node) return;

    setCount(0);
    let frame: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const started = performance.now();
        const duration = readNumberToken(node, "--dur-count", 1800);
        const update = (now: number) => {
          const progress = Math.min((now - started) / duration, 1);
          setCount(Math.round(value * progress));
          if (progress < 1) frame = requestAnimationFrame(update);
        };
        frame = requestAnimationFrame(update);
      },
      { threshold: readNumberToken(node, "--reveal-amount", 0.15) },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span aria-label={`${value}${suffix}`} className="count-up" ref={ref}>
      {count}
      {suffix}
    </span>
  );
}
