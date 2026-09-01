import * as Sentry from "@sentry/vercel-edge";

export function captureServerException(error: unknown, context: Record<string, unknown> = {}) {
  Sentry.withScope((scope) => {
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
