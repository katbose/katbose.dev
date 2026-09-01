import type { BrowserOptions } from "@sentry/nextjs";
import { redactUrl } from "./redact";
import { resolveRelease } from "./release";

/**
 * Builds the browser-only Sentry options without importing the runtime SDK.
 * Keeping this module runtime-independent lets `instrumentation-client.ts`
 * defer the large SDK chunk until a browser DSN is actually configured.
 */
export function createBrowserSentryOptions(dsn: string): BrowserOptions {
  return {
    dsn,
    release: resolveRelease(),
    // No `tracesSampleRate`, profiling integration, or replay integration: error
    // monitoring must not compete with Largest Contentful Paint.
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
  };
}
