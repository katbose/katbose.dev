import * as Sentry from "@sentry/nextjs";

const dsn = process.env["SENTRY_DSN"];
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.url)
        event.request.url = event.request.url.replace(/([?&]secret=)[^&]+/gi, "$1[REDACTED]");
      return event;
    },
  });
}
