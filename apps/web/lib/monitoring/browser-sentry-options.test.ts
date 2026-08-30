import { describe, expect, it } from "vitest";
import { createBrowserSentryOptions } from "./browser-sentry-options";

describe("createBrowserSentryOptions", () => {
  it("keeps tracing, profiling, replay, and client reports disabled", () => {
    const options = createBrowserSentryOptions("https://public@example.invalid/1");

    expect(options.dsn).toBe("https://public@example.invalid/1");
    expect(options.sendClientReports).toBe(false);
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("profilesSampleRate");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
    expect(options).not.toHaveProperty("integrations");
  });

  it("redacts sensitive event and breadcrumb URLs without replacing their objects", () => {
    const options = createBrowserSentryOptions("https://public@example.invalid/1");
    const event = {
      event_id: "00000000000000000000000000000000",
      type: undefined,
      request: {
        url: "https://katbose.dev/preview?secret=private-value&view=full",
        headers: {
          Referer: "https://katbose.dev/contact?token=private-value&step=done",
        },
      },
    };
    const breadcrumb = {
      data: {
        from: "/preview?secret=private-value&view=full",
        to: "/contact?token=private-value&step=done",
        url: "/resume?preview_secret=private-value&download=yes",
      },
    };

    const sentEvent = options.beforeSend?.(event, {});
    const sentBreadcrumb = options.beforeBreadcrumb?.(breadcrumb, {});

    expect(sentEvent).toBe(event);
    expect(event.request.url).toBe("https://katbose.dev/preview?secret=[REDACTED]&view=full");
    expect(event.request.headers.Referer).toBe(
      "https://katbose.dev/contact?token=[REDACTED]&step=done",
    );
    expect(sentBreadcrumb).toBe(breadcrumb);
    expect(breadcrumb.data).toEqual({
      from: "/preview?secret=[REDACTED]&view=full",
      to: "/contact?token=[REDACTED]&step=done",
      url: "/resume?preview_secret=[REDACTED]&download=yes",
    });
  });
});
