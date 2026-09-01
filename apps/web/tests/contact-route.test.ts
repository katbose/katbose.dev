/**
 * Decision-table verification for the contact route handler.
 *
 * The existing Playwright spec intercepts `/api/contact`, so the real handler
 * was never executed by any test. These cases run the actual handler with each
 * dependency outcome injected, and assert both the response and the side
 * effects — the parts a bot-protection regression would silently change.
 *
 * No real Turnstile, Upstash, Supabase, Slack, PostHog or Sentry call is made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { afterCallbacks } = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => void | Promise<void>>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // `after` normally defers to the platform. Capturing the callback lets the
    // test drive post-response work deterministically.
    after: (callback: () => void | Promise<void>) => {
      afterCallbacks.push(callback);
    },
  };
});

vi.mock("@/lib/security/turnstile", () => ({ verifyTurnstileToken: vi.fn() }));
vi.mock("@/lib/rate-limit/contact", () => ({ checkContactRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/monitoring/slack", () => ({ notifyContact: vi.fn() }));
vi.mock("@/lib/monitoring/analytics", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureServerException: vi.fn() }));

const { POST } = await import("@/app/api/contact/route");
const { verifyTurnstileToken } = await import("@/lib/security/turnstile");
const { checkContactRateLimit } = await import("@/lib/rate-limit/contact");
const { createServiceClient } = await import("@/lib/supabase/service");
const { notifyContact } = await import("@/lib/monitoring/slack");
const { captureServerEvent } = await import("@/lib/monitoring/analytics");
const { captureServerException } = await import("@/lib/monitoring/sentry");

const ENDPOINT = "https://katbose.dev/api/contact";
const CLIENT_IP = "203.0.113.7";

const VALID_SUBMISSION = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "I would like to talk about a analytical engine collaboration.",
  turnstileToken: "fresh-token",
} as const;

/** Records the observable order of side effects across mocked dependencies. */
let sequence: string[];
/** Rows handed to the mocked Supabase insert. */
let insertedRows: unknown[];

function request(
  body: unknown,
  headers: Readonly<Record<string, string>> = { "cf-connecting-ip": CLIENT_IP },
): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Runs the callbacks the handler scheduled with `after`. */
async function flushAfter(): Promise<void> {
  const pending = afterCallbacks.splice(0, afterCallbacks.length);
  for (const callback of pending) await callback();
}

function stubInsert(result: { error: unknown }): void {
  vi.mocked(createServiceClient).mockReturnValue({
    from: (table: string) => ({
      insert: (row: unknown) => {
        sequence.push(`insert:${table}`);
        insertedRows.push(row);
        return Promise.resolve(result);
      },
    }),
  } as unknown as ReturnType<typeof createServiceClient>);
}

beforeEach(() => {
  sequence = [];
  insertedRows = [];
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  vi.stubEnv("IP_PSEUDONYM_KEY", "test-fixture-hmac-key-not-a-real-secret");
  vi.stubEnv("IP_PSEUDONYM_EPOCH", "1");
  vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
  vi.mocked(checkContactRateLimit).mockResolvedValue({ allowed: true, degraded: false });
  vi.mocked(notifyContact).mockImplementation(async () => {
    sequence.push("slack");
  });
  vi.mocked(captureServerEvent).mockImplementation(async () => {
    sequence.push("analytics");
  });
  stubInsert({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("contact route — rejected requests", () => {
  it("returns 400 for a malformed JSON body without touching any dependency", async () => {
    const response = await POST(request("{not-json"));
    expect(response.status).toBe(400);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(sequence).toEqual([]);
  });

  it("returns 400 for a JSON body that is not an object", async () => {
    for (const body of ["null", '"a string"', "42", "true", "[]", '[{"name":"a"}]']) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("returns 403 and stops before the limiter when Turnstile rejects", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false);
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(403);
    expect(checkContactRateLimit).not.toHaveBeenCalled();
    expect(sequence).toEqual([]);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("passes the trusted client address to Turnstile verification", async () => {
    await POST(request(VALID_SUBMISSION));
    expect(verifyTurnstileToken).toHaveBeenCalledWith(VALID_SUBMISSION.turnstileToken, CLIENT_IP);
  });

  it("treats a missing token as a failed bot check", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false);
    const { turnstileToken: _omitted, ...withoutToken } = VALID_SUBMISSION;
    const response = await POST(request(withoutToken));
    expect(response.status).toBe(403);
    expect(verifyTurnstileToken).toHaveBeenCalledWith("", CLIENT_IP);
  });

  it("returns 429 when a healthy limiter reports the limit is exhausted", async () => {
    vi.mocked(checkContactRateLimit).mockResolvedValue({ allowed: false, degraded: false });
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(429);
    expect(sequence).toEqual([]);
  });

  it("fails closed with 503 when the limiter is degraded", async () => {
    vi.mocked(checkContactRateLimit).mockResolvedValue({ allowed: false, degraded: true });
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(503);
    expect(sequence).toEqual([]);
  });

  it("returns 400 for each field-level schema violation", async () => {
    const invalidBodies = [
      { ...VALID_SUBMISSION, name: "   " },
      { ...VALID_SUBMISSION, email: "not-an-email" },
      { ...VALID_SUBMISSION, message: "too short" },
      { ...VALID_SUBMISSION, name: "n".repeat(101) },
      { ...VALID_SUBMISSION, message: "m".repeat(5001) },
    ];
    for (const body of invalidBodies) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(sequence).toEqual([]);
    expect(afterCallbacks).toHaveLength(0);
  });
});

describe("contact route — honeypot", () => {
  it("accepts a filled honeypot silently and performs no side effect", async () => {
    const response = await POST(request({ ...VALID_SUBMISSION, website: "http://spam.example" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(checkContactRateLimit).not.toHaveBeenCalled();
    expect(sequence).toEqual([]);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("returns the same body a genuine submission receives", async () => {
    const trapped = await POST(request({ ...VALID_SUBMISSION, website: "spam" }));
    const genuine = await POST(request(VALID_SUBMISSION));
    expect(await trapped.json()).toEqual(await genuine.json());
    expect(trapped.status).toBe(genuine.status);
  });

  it("still accepts a submission whose honeypot is present but empty", async () => {
    const response = await POST(request({ ...VALID_SUBMISSION, website: "" }));
    expect(response.status).toBe(200);
    expect(insertedRows).toHaveLength(1);
  });
});

describe("contact route — trusted address derivation", () => {
  it("fails closed when the trusted Cloudflare address is absent", async () => {
    const response = await POST(request(VALID_SUBMISSION, {}));
    expect(response.status).toBe(503);
    expect(checkContactRateLimit).not.toHaveBeenCalled();
    expect(sequence).toEqual([]);
  });

  it("ignores a forwarded address supplied by the client", async () => {
    const response = await POST(
      request(VALID_SUBMISSION, {
        "x-forwarded-for": "198.51.100.9",
        "x-real-ip": "198.51.100.9",
      }),
    );
    expect(response.status).toBe(503);
    expect(sequence).toEqual([]);
  });

  it("fails closed when pseudonymisation is unconfigured", async () => {
    vi.stubEnv("IP_PSEUDONYM_KEY", "");
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(503);
    expect(checkContactRateLimit).not.toHaveBeenCalled();
  });

  it("derives the limiter identity from the epoch and never leaks the address", async () => {
    await POST(request(VALID_SUBMISSION));
    const identifier = vi.mocked(checkContactRateLimit).mock.calls[0]?.[0];
    expect(identifier).toMatch(/^1:[0-9a-f]{64}$/);
    expect(identifier).not.toContain(CLIENT_IP);
  });
});

describe("contact route — accepted submission", () => {
  it("persists exactly one normalized row and reports acceptance", async () => {
    const response = await POST(
      request({ ...VALID_SUBMISSION, name: "  Ada Lovelace  ", message: `  ${"a".repeat(20)}  ` }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(insertedRows).toEqual([
      { name: "Ada Lovelace", email: VALID_SUBMISSION.email, message: "a".repeat(20) },
    ]);
  });

  it("never writes the bot token or honeypot to the database", async () => {
    await POST(request({ ...VALID_SUBMISSION, website: "" }));
    expect(JSON.stringify(insertedRows)).not.toContain(VALID_SUBMISSION.turnstileToken);
    expect(Object.keys(insertedRows[0] as object).sort()).toEqual(["email", "message", "name"]);
  });

  it("persists before notifying and notifies only once", async () => {
    await POST(request(VALID_SUBMISSION));
    expect(sequence).toEqual(["insert:contact_submissions"]);
    await flushAfter();
    expect(sequence[0]).toBe("insert:contact_submissions");
    expect(sequence.filter((step) => step === "slack")).toHaveLength(1);
    expect(sequence.filter((step) => step === "analytics")).toHaveLength(1);
  });

  it("emits one privacy-safe contact_submitted event", async () => {
    await POST(request(VALID_SUBMISSION));
    await flushAfter();
    expect(captureServerEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(captureServerEvent).mock.calls[0]?.[0];
    expect(event?.event).toBe("contact_submitted");
    expect(event?.distinctId).toMatch(/^1:[0-9a-f]{64}$/);
    expect(event?.properties).toEqual({ message_length: VALID_SUBMISSION.message.length });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(VALID_SUBMISSION.email);
    expect(serialized).not.toContain(VALID_SUBMISSION.name);
    expect(serialized).not.toContain(VALID_SUBMISSION.message);
    expect(serialized).not.toContain(CLIENT_IP);
  });
});

describe("contact route — failure isolation", () => {
  it("returns 503 and never notifies when persistence fails", async () => {
    stubInsert({ error: new Error("insert-failed") });
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(503);
    expect(afterCallbacks).toHaveLength(0);
    await flushAfter();
    expect(notifyContact).not.toHaveBeenCalled();
    expect(captureServerEvent).not.toHaveBeenCalled();
    expect(captureServerException).toHaveBeenCalledWith(expect.anything(), {
      operation: "contact-submit",
    });
  });

  it("keeps the accepted response and the analytics event when Slack fails", async () => {
    vi.mocked(notifyContact).mockRejectedValue(new Error("slack-down"));
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(200);
    await flushAfter();
    expect(captureServerEvent).toHaveBeenCalledTimes(1);
    expect(captureServerException).toHaveBeenCalledWith(expect.anything(), {
      operation: "contact-slack",
    });
  });

  it("keeps the accepted response and the Slack message when analytics fails", async () => {
    vi.mocked(captureServerEvent).mockRejectedValue(new Error("posthog-down"));
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(200);
    await flushAfter();
    expect(notifyContact).toHaveBeenCalledTimes(1);
    expect(captureServerException).toHaveBeenCalledWith(expect.anything(), {
      operation: "contact-analytics",
    });
  });

  it("does not reject when both side effects fail", async () => {
    vi.mocked(notifyContact).mockRejectedValue(new Error("slack-down"));
    vi.mocked(captureServerEvent).mockRejectedValue(new Error("posthog-down"));
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(200);
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(captureServerException).toHaveBeenCalledTimes(2);
  });

  it("fails closed with 503 when Turnstile verification throws", async () => {
    vi.mocked(verifyTurnstileToken).mockRejectedValue(new Error("network"));
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(503);
    expect(sequence).toEqual([]);
  });

  it("fails closed with 503 when the Supabase client cannot be created", async () => {
    vi.mocked(createServiceClient).mockImplementation(() => {
      throw new Error("missing-config");
    });
    const response = await POST(request(VALID_SUBMISSION));
    expect(response.status).toBe(503);
    expect(notifyContact).not.toHaveBeenCalled();
  });

  it("never reveals which control rejected the request", async () => {
    vi.mocked(checkContactRateLimit).mockResolvedValue({ allowed: false, degraded: false });
    const limited = await POST(request(VALID_SUBMISSION));
    vi.mocked(checkContactRateLimit).mockResolvedValue({ allowed: false, degraded: true });
    const degraded = await POST(request(VALID_SUBMISSION));
    expect(await limited.json()).toEqual(await degraded.json());
  });
});
