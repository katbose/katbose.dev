/**
 * Sentry server initialisation, loaded through `instrumentation.ts`.
 *
 * Redaction is shared with the browser entry point and PostHog so a secret
 * cannot be stripped on one surface and forwarded on another.
 */

import * as Sentry from "@sentry/nextjs";
import { redactUrl } from "@/lib/monitoring/redact";
import { resolveRelease } from "@/lib/monitoring/release";

const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    release: resolveRelease(),
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.url) event.request.url = redactUrl(event.request.url);
      return event;
    },
  });
}
