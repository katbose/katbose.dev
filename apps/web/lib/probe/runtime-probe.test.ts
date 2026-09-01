import { describe, expect, it } from "vitest";
import { isRuntimeProbeAllowed, PROBE_HEADERS, probeUnavailable } from "@/lib/probe/runtime-probe";

function requestTo(url: string): Request {
  return new Request(url);
}

/**
 * A literal rather than `new Request`: `Host` is a forbidden header name in the
 * Fetch spec, so a runtime that enforces that would silently drop the very value
 * under test. The guard reads only `url` and `headers`.
 */
function requestWithHost(url: string, host: string): Request {
  return { url, headers: new Headers({ host }) } as unknown as Request;
}

describe("isRuntimeProbeAllowed", () => {
  it("allows the authority the Workers preview presents", () => {
    for (const url of [
      // Measured under `wrangler dev` with `dev.host` pinned in wrangler.jsonc:
      // Miniflare rewrites the authority to the configured origin, which carries
      // no port.
      "http://127.0.0.1/api/probe/draft",
      // The client-facing form, and what a preview whose origin carries a port
      // presents instead.
      "http://127.0.0.1:8788/api/probe/draft",
      "http://localhost:8788/api/probe/draft",
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

  it("denies the authority an unpinned preview presents, so the guard stays absolute", () => {
    // `wrangler dev` defaults its origin to the first configured route, which
    // made the preview present the production host in both positions. The fix
    // for that belongs in wrangler.jsonc; this must never become an allow.
    expect(
      isRuntimeProbeAllowed(requestWithHost("http://katbose.dev/api/probe/draft", "katbose.dev")),
    ).toBe(false);
  });

  it("allows a loopback Host header when the URL carries a placeholder authority", () => {
    // Next substitutes `http://n` when it cannot rebuild an absolute URL from
    // the incoming request, which would otherwise make the probes unreachable
    // without any test noticing.
    for (const host of ["127.0.0.1:8788", "127.0.0.1", "localhost:3000", "[::1]:8788"]) {
      expect(isRuntimeProbeAllowed(requestWithHost("http://n/api/probe/draft", host))).toBe(true);
    }
  });

  it("denies a Host header that only looks like loopback", () => {
    for (const host of [
      "katbose.dev",
      "127.0.0.1.attacker.example",
      "attacker.example",
      // Userinfo and path components must not smuggle a loopback authority
      // through, which is why the header is matched rather than URL-parsed.
      "attacker.example@127.0.0.1",
      "127.0.0.1/attacker",
      "127.0.0.1 attacker.example",
      "",
    ]) {
      expect(isRuntimeProbeAllowed(requestWithHost("http://n/api/probe/draft", host))).toBe(false);
    }
  });

  it("fails closed for a request whose URL cannot be parsed", () => {
    expect(isRuntimeProbeAllowed({ url: "not-a-url" } as Request)).toBe(false);
    expect(isRuntimeProbeAllowed({ url: "" } as Request)).toBe(false);
    // Not even a loopback Host rescues an unparseable URL.
    expect(isRuntimeProbeAllowed(requestWithHost("not-a-url", "127.0.0.1:8788"))).toBe(false);
  });

  it("fails closed for a request whose headers cannot be read", () => {
    expect(isRuntimeProbeAllowed({ url: "https://katbose.dev/api/probe/draft" } as Request)).toBe(
      false,
    );
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
