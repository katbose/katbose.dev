import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expected = [
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CMS_URL",
  "WEBHOOK_SHARED_SECRET",
  "PREVIEW_URL_SECRET",
  "PREVIEW_INTERNAL_SECRET",
  "IP_PSEUDONYM_KEY",
  "IP_PSEUDONYM_EPOCH",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "SLACK_ALERTS_WEBHOOK_URL",
  "SLACK_CONTACT_WEBHOOK_URL",
  "CONTACT_FALLBACK_EMAIL",
  "NEXT_PUBLIC_CAL_LINK",
];
const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const keys = example
  .split(/\r?\n/)
  .filter((line) => /^[A-Z]/.test(line))
  .map((line) => line.split("=")[0]!);

describe("environment inventory", () => {
  it("matches the locked Phase 1 web inventory", () => {
    expect(keys.sort()).toEqual([...expected].sort());
  });
  it("never marks server secrets public", () => {
    expect(
      keys.filter((key) => key.startsWith("NEXT_PUBLIC_") && /SECRET|TOKEN|SERVICE_ROLE/.test(key)),
    ).toEqual([]);
  });
});
