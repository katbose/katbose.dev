import * as Sentry from "@sentry/nextjs";

export function captureServerException(error: unknown, context: Record<string, unknown> = {}) {
  Sentry.withScope((scope) => {
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
