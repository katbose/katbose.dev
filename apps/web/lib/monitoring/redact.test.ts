import { describe, expect, it } from "vitest";
import { REDACTED_VALUE, redactUrl, sanitizeTelemetryProperties } from "@/lib/monitoring/redact";

const SITE = "https://katbose.dev";

/** Deterministic generator so the property checks stay reproducible in CI. */
function* candidateUrls(): Generator<string> {
  const keys = ["secret", "SECRET", "Token", "preview_secret", "cf-turnstile-response"];
  const positions = [
    (pair: string) => `${SITE}/preview?${pair}`,
    (pair: string) => `${SITE}/preview?slug=intro&${pair}`,
    (pair: string) => `${SITE}/preview?${pair}&slug=intro`,
    (pair: string) => `${SITE}/preview?a=1&${pair}&b=2#heading`,
    (pair: string) => `/preview?${pair}`,
  ];
  for (const key of keys) {
    for (const build of positions) yield build(`${key}=s3cr3t-value`);
  }
}

describe("redactUrl", () => {
  it("removes every sensitive value regardless of key case or position", () => {
    for (const url of candidateUrls()) {
      const redacted = redactUrl(url);
      expect(redacted).not.toContain("s3cr3t-value");
      expect(redacted).toContain(REDACTED_VALUE);
    }
  });

  it("is idempotent, so repeated sanitisation cannot corrupt a value", () => {
    for (const url of candidateUrls()) {
      const once = redactUrl(url);
      expect(redactUrl(once)).toBe(once);
      expect(redactUrl(redactUrl(once))).toBe(once);
    }
  });

  it("preserves unrelated parameters, path and fragment", () => {
    expect(redactUrl(`${SITE}/blog/post?utm_source=rss&secret=abc&page=2#notes`)).toBe(
      `${SITE}/blog/post?utm_source=rss&secret=${REDACTED_VALUE}&page=2#notes`,
    );
  });

  it("redacts multiple sensitive parameters in one pass", () => {
    expect(redactUrl(`${SITE}/x?secret=a&token=b`)).toBe(
      `${SITE}/x?secret=${REDACTED_VALUE}&token=${REDACTED_VALUE}`,
    );
  });

  it("leaves URLs without sensitive parameters untouched", () => {
    for (const url of [
      `${SITE}/`,
      `${SITE}/projects?page=2`,
      `${SITE}/blog?tag=typescript&sort=recent#top`,
      "/agent",
      "not a url at all",
    ]) {
      expect(redactUrl(url)).toBe(url);
    }
  });

  it("does not treat a different parameter as the secret because of a suffix match", () => {
    const url = `${SITE}/x?mysecret=keep&secretive=keep`;
    expect(redactUrl(url)).toBe(url);
  });

  it("redacts a percent-encoded sensitive key", () => {
    expect(redactUrl(`${SITE}/x?%73ecret=abc`)).toBe(`${SITE}/x?%73ecret=${REDACTED_VALUE}`);
  });

  it("handles an empty sensitive value without producing a malformed query", () => {
    expect(redactUrl(`${SITE}/x?secret=&page=1`)).toBe(`${SITE}/x?secret=${REDACTED_VALUE}&page=1`);
  });
});

describe("sanitizeTelemetryProperties", () => {
  it("redacts every string property and returns the same object reference", () => {
    const properties = {
      $current_url: `${SITE}/preview?secret=live`,
      $referrer: `${SITE}/blog?token=live`,
      custom_link: `${SITE}/x?preview_secret=live`,
      rating: 5,
      ok: true,
    };
    const result = sanitizeTelemetryProperties(properties);
    expect(result).toBe(properties);
    expect(result.$current_url).toBe(`${SITE}/preview?secret=${REDACTED_VALUE}`);
    expect(result.$referrer).toBe(`${SITE}/blog?token=${REDACTED_VALUE}`);
    expect(result.custom_link).toBe(`${SITE}/x?preview_secret=${REDACTED_VALUE}`);
    expect(result.rating).toBe(5);
    expect(result.ok).toBe(true);
  });

  it("never leaks a secret through any property value", () => {
    const sanitized = sanitizeTelemetryProperties({
      a: `${SITE}/?secret=leak`,
      b: `/next?cf-turnstile-response=leak`,
      c: "safe",
    });
    expect(JSON.stringify(sanitized)).not.toContain("leak");
  });

  it("tolerates a property bag with no string values", () => {
    expect(sanitizeTelemetryProperties({ count: 1, flag: false })).toEqual({
      count: 1,
      flag: false,
    });
  });
});
