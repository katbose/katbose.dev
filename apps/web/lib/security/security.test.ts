import { afterEach, describe, expect, it } from "vitest";
import { checkContactRateLimit } from "../rate-limit/contact";
import { pseudonymizeIp } from "./ip";
import { verifyTurnstileToken } from "./turnstile";

afterEach(() => {
  delete process.env["UPSTASH_REDIS_REST_URL"];
  delete process.env["UPSTASH_REDIS_REST_TOKEN"];
  delete process.env["TURNSTILE_SECRET_KEY"];
});

describe("security failure modes", () => {
  it("creates deterministic non-raw HMAC pseudonyms", () => {
    const first = pseudonymizeIp("203.0.113.1", "test-key");
    expect(first).toBe(pseudonymizeIp("203.0.113.1", "test-key"));
    expect(first).not.toContain("203.0.113.1");
  });
  it("fails contact limiting closed without configuration", async () => {
    await expect(checkContactRateLimit("epoch:id")).resolves.toEqual({
      allowed: false,
      degraded: true,
    });
  });
  it("fails Turnstile closed without a secret", async () => {
    await expect(verifyTurnstileToken("token", null)).resolves.toBe(false);
  });
});
