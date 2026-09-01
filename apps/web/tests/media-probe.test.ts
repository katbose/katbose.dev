// @ts-expect-error — the probe is plain ESM JavaScript with no type declarations.
import * as probe from "../../../scripts/media/media-probe.mjs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const BASE_URL = "https://katbose.dev";
const verified = await probe.loadAndVerifyFixtures();
const descriptors = verified.manifest.fixtures;
const supportedBody = new Uint8Array(verified.fixtures.supported.body);
const fallbackBody = new Uint8Array(verified.fixtures.forcedFallback.body);
const transformedBody = new Uint8Array(
  await sharp(supportedBody).resize(640, 640, { fit: "fill" }).png().toBuffer(),
);
const alternateTransformedBody = new Uint8Array(
  await sharp(supportedBody)
    .resize(640, 640, { fit: "fill" })
    .png({ compressionLevel: 1 })
    .toBuffer(),
);

const supportedOriginalUrl = probe.buildOriginalUrl(BASE_URL, descriptors.supported.objectKey);
const supportedTransformUrl = probe.buildTransformUrl(BASE_URL, descriptors.supported.objectKey);
const fallbackOriginalUrl = probe.buildOriginalUrl(BASE_URL, descriptors.forcedFallback.objectKey);
const fallbackTransformUrl = probe.buildTransformUrl(
  BASE_URL,
  descriptors.forcedFallback.objectKey,
);

interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  bytes?: Uint8Array;
}

type StubResponseFactory = StubResponse | ((seen: number) => StubResponse);
type StubRoute = [url: string, response: StubResponseFactory];

function stubFetch(routes: StubRoute[]) {
  const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const seen = new Map<string, number>();
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const url = String(input);
    const count = (seen.get(url) ?? 0) + 1;
    seen.set(url, count);
    calls.push({ url, redirect: init?.redirect });

    const route = routes.find(([candidate]) => candidate === url);
    if (!route) throw new Error(`Unexpected test request: ${url}`);
    const stub = typeof route[1] === "function" ? route[1](count) : route[1];
    const headers = new Headers(stub.headers ?? {});
    if (headers.get("cf-cache-status") === "MISS" && count > 1) {
      headers.set("cf-cache-status", "HIT");
    }
    const body = Uint8Array.from(stub.bytes ?? new Uint8Array());

    return {
      status: stub.status ?? 200,
      headers,
      arrayBuffer: async () => body.buffer as ArrayBuffer,
    } as Response;
  };
  return { fetchImpl, calls };
}

interface HealthyOverrides {
  supportedOriginal?: StubResponseFactory;
  supportedTransform?: StubResponseFactory;
  fallbackOriginal?: StubResponseFactory;
  fallbackTransform?: StubResponseFactory;
}

function healthyRoutes(overrides: HealthyOverrides = {}): StubRoute[] {
  return [
    [
      supportedOriginalUrl,
      overrides.supportedOriginal ?? {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=31536000, immutable",
        },
        bytes: supportedBody,
      },
    ],
    [
      supportedTransformUrl,
      overrides.supportedTransform ?? {
        headers: { "content-type": "image/png", "cf-cache-status": "MISS" },
        bytes: transformedBody,
      },
    ],
    [
      fallbackOriginalUrl,
      overrides.fallbackOriginal ?? {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=31536000, immutable",
        },
        bytes: fallbackBody,
      },
    ],
    [
      fallbackTransformUrl,
      overrides.fallbackTransform ?? {
        status: 302,
        headers: { location: fallbackOriginalUrl },
      },
    ],
  ];
}

function checkByName(
  result: { checks: Array<{ name: string; passed: boolean; detail: string }> },
  fragment: string,
) {
  const found = result.checks.find((entry) => entry.name.includes(fragment));
  expect(found, `no check matching "${fragment}"`).toBeDefined();
  return found!;
}

describe("committed media fixtures", () => {
  it("match their literal manifest identity and fully decode", () => {
    expect(verified.fixtures.supported.decoded).toMatchObject({
      format: "png",
      width: 1024,
      height: 1024,
    });
    expect(verified.fixtures.forcedFallback.decoded).toMatchObject({
      format: "png",
      width: 12_001,
      height: 16,
    });
    expect(descriptors.forcedFallback.width).toBeGreaterThan(probe.CLOUDFLARE_MAX_IMAGE_DIMENSION);
    expect(supportedBody.byteLength).toBe(descriptors.supported.bytes);
    expect(fallbackBody.byteLength).toBe(descriptors.forcedFallback.bytes);
    expect(probe.sha256(supportedBody)).toBe(descriptors.supported.sha256);
    expect(probe.sha256(fallbackBody)).toBe(descriptors.forcedFallback.sha256);
  });
});

describe("URL construction", () => {
  it("builds and segment-encodes the same-zone origin URL", () => {
    expect(probe.buildOriginalUrl(BASE_URL, "a b/c+d.png")).toBe(
      `${BASE_URL}/media/original/a%20b/c%2Bd.png`,
    );
  });

  it("builds the production transform URL including redirect fallback", () => {
    expect(supportedTransformUrl).toBe(
      `${BASE_URL}/cdn-cgi/image/${probe.TRANSFORM_OPTIONS}/media/original/${descriptors.supported.objectKey}`,
    );
    expect(supportedTransformUrl).toContain("onerror=redirect");
    expect(supportedTransformUrl).toContain(`width=${probe.TRANSFORM_WIDTH}`);
  });
});

describe("runProbe", () => {
  it("passes exact identity, full decode, cache and manual redirect checks", async () => {
    const { fetchImpl, calls } = stubFetch(healthyRoutes());
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);

    expect(result.checks).toHaveLength(6);
    expect(result.checks.every((entry: { passed: boolean }) => entry.passed)).toBe(true);
    expect(result.passed).toBe(true);
    expect(calls.find((call) => call.url === fallbackTransformUrl)?.redirect).toBe("manual");
    expect(calls.filter((call) => call.url === fallbackOriginalUrl)).toHaveLength(2);
  });

  it("rejects lookalike and contradictory cache directives", async () => {
    for (const cacheControl of [
      "x-public, s-max-age=315360000, x-immutable",
      "public, private, max-age=31536000, immutable",
    ]) {
      const { fetchImpl } = stubFetch(
        healthyRoutes({
          supportedOriginal: {
            headers: { "content-type": "image/png", "cache-control": cacheControl },
            bytes: supportedBody,
          },
        }),
      );
      const result = await probe.runProbe(
        { baseUrl: BASE_URL, fixtures: { supported: descriptors.supported } },
        fetchImpl,
      );
      expect(checkByName(result, "supported original").passed).toBe(false);
    }
  });

  it("reports NOT VERIFIED when no forced-fallback fixture is supplied", async () => {
    const { fetchImpl } = stubFetch(healthyRoutes());
    const result = await probe.runProbe(
      { baseUrl: BASE_URL, fixtures: { supported: descriptors.supported } },
      fetchImpl,
    );

    expect(result.passed).toBe(false);
    expect(checkByName(result, "forced transform failure").detail).toContain("NOT VERIFIED");
  });

  it("fails when the original does not match the manifest", async () => {
    const { fetchImpl } = stubFetch(
      healthyRoutes({
        supportedOriginal: {
          headers: {
            "content-type": "image/png",
            "cache-control": "public, max-age=31536000, immutable",
          },
          bytes: fallbackBody,
        },
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "supported original").passed).toBe(false);
  });

  it("fails when the transformed response cannot be fully decoded", async () => {
    const { fetchImpl } = stubFetch(
      healthyRoutes({
        supportedTransform: {
          headers: { "content-type": "image/png", "cf-cache-status": "MISS" },
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        },
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "fully decoded").passed).toBe(false);
    expect(checkByName(result, "fully decoded").detail).toContain("decode=failed");
  });

  it("fails when the transformed dimensions do not match 640x640", async () => {
    const { fetchImpl } = stubFetch(
      healthyRoutes({
        supportedTransform: {
          headers: { "content-type": "image/png", "cf-cache-status": "MISS" },
          bytes: supportedBody,
        },
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "fully decoded").passed).toBe(false);
    expect(checkByName(result, "fully decoded").detail).toContain("1024x1024");
  });

  it("fails when the repeated transform never reports a cache hit", async () => {
    const { fetchImpl } = stubFetch(
      healthyRoutes({
        supportedTransform: {
          headers: { "content-type": "image/png", "cf-cache-status": "DYNAMIC" },
          bytes: transformedBody,
        },
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "edge cache").passed).toBe(false);
    expect(checkByName(result, "edge cache").detail).toContain("DYNAMIC");
  });

  it("fails when the repeated transform body changes", async () => {
    expect(probe.sha256(alternateTransformedBody)).not.toBe(probe.sha256(transformedBody));
    const { fetchImpl } = stubFetch(
      healthyRoutes({
        supportedTransform: (seen) => ({
          headers: { "content-type": "image/png", "cf-cache-status": seen === 1 ? "MISS" : "HIT" },
          bytes: seen === 1 ? transformedBody : alternateTransformedBody,
        }),
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "edge cache").passed).toBe(false);
  });

  it("refuses to fetch an unexpected redirect target", async () => {
    const external = "https://example.test/untrusted.png";
    const { fetchImpl, calls } = stubFetch(
      healthyRoutes({
        fallbackTransform: { status: 302, headers: { location: external } },
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "same-zone redirect").passed).toBe(false);
    expect(checkByName(result, "redirect target decodes").detail).toContain("NOT VERIFIED");
    expect(calls.some((call) => call.url === external)).toBe(false);
  });

  it("fails when the redirect target body differs from the fallback manifest", async () => {
    const { fetchImpl } = stubFetch(
      healthyRoutes({
        fallbackOriginal: (seen) => ({
          headers: {
            "content-type": "image/png",
            "cache-control": "public, max-age=31536000, immutable",
          },
          bytes: seen === 1 ? fallbackBody : supportedBody,
        }),
      }),
    );
    const result = await probe.runProbe({ baseUrl: BASE_URL, fixtures: descriptors }, fetchImpl);
    expect(checkByName(result, "over-limit original").passed).toBe(true);
    expect(checkByName(result, "redirect target decodes").passed).toBe(false);
  });
});

describe("parseArgs", () => {
  it("defaults to the production origin and committed manifest", () => {
    expect(probe.parseArgs([])).toEqual({
      baseUrl: "https://katbose.dev",
      manifest: probe.DEFAULT_FIXTURE_MANIFEST,
    });
  });

  it("accepts origin and manifest overrides", () => {
    expect(
      probe.parseArgs(["--base-url", "https://staging.example", "--manifest", "fixtures.json"]),
    ).toEqual({ baseUrl: "https://staging.example", manifest: "fixtures.json" });
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => probe.parseArgs(["--nope", "x"])).toThrow(/Unknown option/);
    expect(() => probe.parseArgs(["--manifest"])).toThrow(/Missing value/);
  });
});

describe("formatReport", () => {
  it("marks the overall outcome and lists every check", () => {
    const report = probe.formatReport({
      checks: [
        { name: "a", passed: true, detail: "ok" },
        { name: "b", passed: false, detail: "bad" },
      ],
      passed: false,
    });
    expect(report).toContain("PASS  a");
    expect(report).toContain("FAIL  b");
    expect(report).toContain("NOT satisfied");
  });
});
