"use client";

import { useEffect, useState } from "react";

const GREETINGS = ["Hello", "నమస్కారం", "नमस्ते", "Bonjour"] as const;

export function IntroLoader() {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("katbose-intro-seen")) return;
    sessionStorage.setItem("katbose-intro-seen", "true");
    setIndex(0);
    const timers = GREETINGS.map((_, greetingIndex) =>
      window.setTimeout(() => setIndex(greetingIndex), greetingIndex * 350),
    );
    timers.push(window.setTimeout(() => setIndex(null), 1750));
    return () => timers.forEach(window.clearTimeout);
  }, []);
  if (index === null) return null;
  return (
    <div aria-hidden="true" className="intro-loader">
      {GREETINGS[index]}
    </div>
  );
}
