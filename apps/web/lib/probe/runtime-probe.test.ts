import { describe, expect, it } from "vitest";
import { isRuntimeProbeAllowed, PROBE_HEADERS, probeUnavailable } from "@/lib/probe/runtime-probe";

function requestTo(url: string): Request {
  return new Request(url);
}

describe("isRuntimeProbeAllowed", () => {
  it("allows the loopback hosts used by the Workers preview server", () => {
    for (const url of [
      "http://127.0.0.1:8788/api/probe/draft",
      "http://localhost:3000/api/probe/draft",
      "http://[::1]:8788/api/probe/draft",
    ]) {
      expect(isRuntimeProbeAllowed(requestTo(url))).toBe(true);
    }
  });

  it("denies every production and public hostname", () => {
    for (const url of [
      "https://katbose.dev/api/probe/draft",
      "https://www.katbose.dev/api/probe/draft",
      "https://cms.katbose.dev/api/probe/draft",
      "https://katbose-web.workers.dev/api/probe/draft",
      "https://127.0.0.1.attacker.example/api/probe/draft",
      "https://attacker.example/?host=127.0.0.1",
    ]) {
      expect(isRuntimeProbeAllowed(requestTo(url))).toBe(false);
    }
  });

  it("fails closed for a request whose URL cannot be parsed", () => {
    expect(isRuntimeProbeAllowed({ url: "not-a-url" } as Request)).toBe(false);
    expect(isRuntimeProbeAllowed({ url: "" } as Request)).toBe(false);
  });
});

describe("probeUnavailable", () => {
  it("is an unindexable, uncacheable 404 with no body", async () => {
    const response = probeUnavailable();
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe(PROBE_HEADERS["x-robots-tag"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("");
  });
});
