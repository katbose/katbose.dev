/**
 * Sentry browser initialisation.
 *
 * Next.js loads this module before application code in the browser, which is
 * the supported replacement for the retired `sentry.client.config.ts` entry
 * point. Without it, only server exceptions were ever reported and every
 * client-side failure went unseen in production.
 *
 * Performance is a Phase 1 gate (Lighthouse >= 95), so tracing, profiling and
 * session replay are all left off. Only the default error handlers are kept —
 * those are what turn an unhandled rejection into a reported issue.
 */

import * as Sentry from "@sentry/nextjs";
import { redactUrl } from "@/lib/monitoring/redact";
import { resolveRelease } from "@/lib/monitoring/release";

const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    release: resolveRelease(),
    // No `tracesSampleRate`: browser tracing stays disabled so the analytics
    // and monitoring budget does not compete with Largest Contentful Paint.
    sendClientReports: false,
    beforeSend(event) {
      if (event.request?.url) event.request.url = redactUrl(event.request.url);
      if (event.request?.headers?.["Referer"]) {
        event.request.headers["Referer"] = redactUrl(event.request.headers["Referer"]);
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Navigation and fetch breadcrumbs carry full URLs, so they need the same
      // treatment as the event itself.
      const data = breadcrumb.data;
      if (data) {
        for (const key of ["from", "to", "url"]) {
          const value = data[key];
          if (typeof value === "string") data[key] = redactUrl(value);
        }
      }
      return breadcrumb;
    },
  });
}
