/**
 * Tests for the registered-zone media probe.
 *
 * The probe cannot run for real until production has a media fixture, so
 * without these tests it would sit in the repository untested and unverifiable —
 * exactly the situation that let five defects into the backup scripts. A stubbed
 * fetch exercises every branch, including the failure detail strings an operator
 * will read during the gate.
 */

// @ts-expect-error — the probe is plain ESM JavaScript with no type declarations.
import * as probe from "../../../scripts/media/media-probe.mjs";
import { describe, expect, it } from "vitest";

const BASE_URL = "https://katbose.dev";
const KEY = "profile/portrait-v1.png";

/** Builds a valid PNG header with the given dimensions. */
function pngBytes(width: number, height: number, filler = 0): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[32] = filler;
  return bytes;
}

interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  bytes?: Uint8Array;
}

/** Deterministic fetch stub keyed by URL substring. */
function stubFetch(routes: Array<[string, StubResponse]>) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const seen = calls.filter((entry) => entry === url).length;
    const match = routes.find(([pattern]) => url.includes(pattern));
    const stub = match?.[1] ?? {};
    const headers = new Headers(stub.headers ?? {});
    // The edge reports a hit only once the entry is populated.
    if (headers.get("cf-cache-status") === "MISS" && seen > 1)
      headers.set("cf-cache-status", "HIT");
    const body = stub.bytes ?? new Uint8Array();
    return {
      status: stub.status ?? 200,
      headers,
      arrayBuffer: async () =>
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    } as unknown as Response;
  };
  return { fetchImpl, calls };
}

const ORIGINAL_BYTES = pngBytes(1024, 1024, 1);
const TRANSFORMED_BYTES = pngBytes(640, 640, 2);

const HEALTHY_ROUTES: Array<[string, StubResponse]> = [
  [
    "/cdn-cgi/image/",
    {
      headers: { "content-type": "image/png", "cf-cache-status": "MISS" },
      bytes: TRANSFORMED_BYTES,
    },
  ],
  [
    "/media/original/",
    {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000, immutable",
      },
      bytes: ORIGINAL_BYTES,
    },
  ],
];

function checkByName(
  result: { checks: Array<{ name: string; passed: boolean; detail: string }> },
  fragment: string,
) {
  const found = result.checks.find((entry) => entry.name.includes(fragment));
  expect(found, `no check matching "${fragment}"`).toBeDefined();
  return found!;
}

describe("URL construction", () => {
  it("builds the same-zone origin proxy URL", () => {
    expect(probe.buildOriginalUrl(BASE_URL, KEY)).toBe(`${BASE_URL}/media/original/${KEY}`);
  });

  it("encodes each key segment without encoding the separators", () => {
    expect(probe.buildOriginalUrl(BASE_URL, "a b/c+d.png")).toBe(
      `${BASE_URL}/media/original/a%20b/c%2Bd.png`,
    );
  });

  it("builds a transform URL that matches the production loader options", () => {
    const url = probe.buildTransformUrl(BASE_URL, KEY);
    expect(url).toBe(`${BASE_URL}/cdn-cgi/image/${probe.TRANSFORM_OPTIONS}/media/original/${KEY}`);
    expect(url).toContain("onerror=redirect");
    expect(url).toContain(`width=${probe.TRANSFORM_WIDTH}`);
  });
});

describe("PNG inspection", () => {
  it("reads the dimensions from an IHDR chunk", () => {
    expect(probe.readPngDimensions(pngBytes(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("returns null for a non-PNG payload so other formats do not fail the probe", () => {
    expect(probe.readPngDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(probe.readPngDimensions(new Uint8Array())).toBeNull();
  });

  it("returns null for a truncated PNG", () => {
    expect(probe.readPngDimensions(pngBytes(1, 1).slice(0, 20))).toBeNull();
  });
});

describe("runProbe", () => {
  it("passes every check when delivery and fallback are healthy", async () => {
    const fallbackBytes = pngBytes(2048, 2048, 9);
    const { fetchImpl } = stubFetch([
      [
        "/cdn-cgi/image/width=640,quality=80,fit=scale-down,format=auto,onerror=redirect/media/original/fixtures/untransformable",
        { headers: { "content-type": "image/png" }, bytes: fallbackBytes },
      ],
      [
        "/media/original/fixtures/untransformable",
        {
          headers: {
            "content-type": "image/png",
            "cache-control": "public, max-age=31536000, immutable",
          },
          bytes: fallbackBytes,
        },
      ],
      ...HEALTHY_ROUTES,
    ]);

    const result = await probe.runProbe(
      { baseUrl: BASE_URL, key: KEY, fallbackKey: "fixtures/untransformable.svg" },
      fetchImpl,
    );
    expect(result.checks.map((entry: { passed: boolean }) => entry.passed)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(result.passed).toBe(true);
  });

  it("fails and says so when no fallback fixture is supplied", async () => {
    const { fetchImpl } = stubFetch(HEALTHY_ROUTES);
    const result = await probe.runProbe({ baseUrl: BASE_URL, key: KEY }, fetchImpl);
    expect(result.passed).toBe(false);
    expect(checkByName(result, "forced transform failure").detail).toContain("NOT VERIFIED");
  });

  it("fails when the original is not immutable", async () => {
    const { fetchImpl } = stubFetch([
      HEALTHY_ROUTES[0]!,
      [
        "/media/original/",
        {
          headers: { "content-type": "image/png", "cache-control": "no-store" },
          bytes: ORIGINAL_BYTES,
        },
      ],
    ]);
    const result = await probe.runProbe({ baseUrl: BASE_URL, key: KEY }, fetchImpl);
    expect(checkByName(result, "origin proxy").passed).toBe(false);
  });

  it("fails when the transform returns the original bytes unchanged", async () => {
    const { fetchImpl } = stubFetch([
      [
        "/cdn-cgi/image/",
        {
          headers: { "content-type": "image/png", "cf-cache-status": "MISS" },
          bytes: ORIGINAL_BYTES,
        },
      ],
      HEALTHY_ROUTES[1]!,
    ]);
    const result = await probe.runProbe({ baseUrl: BASE_URL, key: KEY }, fetchImpl);
    expect(checkByName(result, "transform returns").passed).toBe(false);
  });

  it("fails when the transform width does not match the request", async () => {
    const { fetchImpl } = stubFetch([
      [
        "/cdn-cgi/image/",
        {
          headers: { "content-type": "image/png", "cf-cache-status": "MISS" },
          bytes: pngBytes(1280, 1280, 3),
        },
      ],
      HEALTHY_ROUTES[1]!,
    ]);
    const result = await probe.runProbe({ baseUrl: BASE_URL, key: KEY }, fetchImpl);
    expect(checkByName(result, "transform returns").passed).toBe(false);
  });

  it("fails when the repeated transform never reports a cache hit", async () => {
    const { fetchImpl } = stubFetch([
      [
        "/cdn-cgi/image/",
        {
          headers: { "content-type": "image/png", "cf-cache-status": "DYNAMIC" },
          bytes: TRANSFORMED_BYTES,
        },
      ],
      HEALTHY_ROUTES[1]!,
    ]);
    const result = await probe.runProbe({ baseUrl: BASE_URL, key: KEY }, fetchImpl);
    expect(checkByName(result, "edge cache").passed).toBe(false);
    expect(checkByName(result, "edge cache").detail).toContain("DYNAMIC");
  });

  it("fails when the fallback response is not the original image", async () => {
    const { fetchImpl } = stubFetch([
      [
        "/cdn-cgi/image/width=640,quality=80,fit=scale-down,format=auto,onerror=redirect/media/original/fixtures/untransformable",
        { status: 415, headers: { "content-type": "text/plain" }, bytes: new Uint8Array([1, 2]) },
      ],
      [
        "/media/original/fixtures/untransformable",
        {
          headers: {
            "content-type": "image/svg+xml",
            "cache-control": "public, max-age=31536000, immutable",
          },
          bytes: pngBytes(8, 8, 7),
        },
      ],
      ...HEALTHY_ROUTES,
    ]);
    const result = await probe.runProbe(
      { baseUrl: BASE_URL, key: KEY, fallbackKey: "fixtures/untransformable.svg" },
      fetchImpl,
    );
    expect(result.passed).toBe(false);
    expect(checkByName(result, "forced transform failure").passed).toBe(false);
  });
});

describe("parseArgs", () => {
  it("defaults to the production origin and requires a key", () => {
    expect(probe.parseArgs(["--key", KEY])).toEqual({
      baseUrl: "https://katbose.dev",
      key: KEY,
      fallbackKey: undefined,
    });
    expect(() => probe.parseArgs([])).toThrow(/--key is required/);
  });

  it("accepts an override origin and a fallback key", () => {
    expect(
      probe.parseArgs([
        "--base-url",
        "https://staging.example",
        "--key",
        KEY,
        "--fallback-key",
        "f.svg",
      ]),
    ).toEqual({ baseUrl: "https://staging.example", key: KEY, fallbackKey: "f.svg" });
  });

  it("rejects an unknown flag and a flag with no value", () => {
    expect(() => probe.parseArgs(["--nope", "x"])).toThrow(/Unknown option/);
    expect(() => probe.parseArgs(["--key"])).toThrow(/Missing value/);
  });
});

describe("formatReport", () => {
  it("marks the overall outcome and lists each check", () => {
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
