/**
 * Sentry browser initialisation.
 *
 * Next.js loads this module before application code in the browser, which is
 * the supported replacement for the retired `sentry.client.config.ts` entry
 * point. Without it, only server exceptions are reported.
 *
 * Loading the SDK during the initial navigation delays text LCP on throttled
 * devices. A configured build therefore waits until the first interaction
 * (which finalises LCP) or a post-load fallback. The runtime stays absent when
 * no browser DSN is configured, and an SDK-chunk failure remains non-fatal.
 *
 * Performance is a Phase 1 gate (Lighthouse >= 95), so tracing, profiling and
 * session replay stay off. Only the default error handlers are kept — those are
 * what turn an unhandled rejection into a reported issue.
 */

import { createBrowserSentryOptions } from "@/lib/monitoring/browser-sentry-options";

const DEFERRED_SENTRY_DELAY_MS = 10_000;
const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];

if (dsn) {
  let fallbackTimer: number | undefined;
  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    window.removeEventListener("load", scheduleFallback);
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);

    void import("@/lib/monitoring/browser-sentry-runtime")
      .then(({ init }) => init(createBrowserSentryOptions(dsn)))
      .catch(() => {
        // Monitoring must never make the product unavailable. If its own chunk
        // cannot load, browser reporting degrades for this visit and the page runs.
      });
  };

  const scheduleFallback = () => {
    fallbackTimer = window.setTimeout(start, DEFERRED_SENTRY_DELAY_MS);
  };

  window.addEventListener("pointerdown", start, { once: true, passive: true });
  window.addEventListener("keydown", start, { once: true });
  if (document.readyState === "complete") scheduleFallback();
  else window.addEventListener("load", scheduleFallback, { once: true });
}
