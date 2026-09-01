"use client";

import { useEffect, useState } from "react";
import { INTRO_DURATION_MS } from "@/lib/motion";

const GREETINGS = ["Hello", "నమస్కారం", "नमस्ते", "Bonjour"] as const;
const CLEANUP_BUFFER_MS = 250;

export function IntroLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || sessionStorage.getItem("katbose-intro-seen")) return;

    sessionStorage.setItem("katbose-intro-seen", "true");
    setVisible(true);

    // CSS makes the page visible at INTRO_DURATION_MS even if main-thread work
    // delays this cleanup. The timer is only a missed-animation-event fallback.
    const fallback = window.setTimeout(
      () => setVisible(false),
      INTRO_DURATION_MS + CLEANUP_BUFFER_MS,
    );
    return () => window.clearTimeout(fallback);
  }, []);

  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className="intro-loader"
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) setVisible(false);
      }}
    >
      {GREETINGS.map((greeting) => (
        <span className="intro-greeting" key={greeting}>
          {greeting}
        </span>
      ))}
    </div>
  );
}
