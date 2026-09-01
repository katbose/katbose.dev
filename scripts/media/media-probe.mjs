#!/usr/bin/env node
/**
 * Registered-zone image delivery probe (docs/15 Spike A image gate).
 *
 * Verifies the four behaviours the Phase 1 gate requires, against the real
 * production zone:
 *
 *   1. the same-zone origin proxy serves the immutable Supabase original;
 *   2. `/cdn-cgi/image` returns a transformed variant;
 *   3. the second identical transform is a Cloudflare cache hit;
 *   4. when the transform cannot be performed, `onerror=redirect` still
 *      delivers the original bytes.
 *
 * Credential-free by construction: every request is an unauthenticated public
 * GET, so this can run from any machine and nothing sensitive enters a report.
 *
 * Check 4 needs a deliberately untransformable object, because a transform
 * failure cannot be forced reliably from outside the zone. Without one the probe
 * reports the check as NOT VERIFIED and exits non-zero rather than implying the
 * gate passed.
 *
 * Usage:
 *   node scripts/media/media-probe.mjs --key profile/portrait.png \
 *     --fallback-key fixtures/untransformable.svg
 */

import { createHash } from "node:crypto";

/** Transform options the production image loader emits (lib/media/image-loader.ts). */
export const TRANSFORM_OPTIONS = "width=640,quality=80,fit=scale-down,format=auto,onerror=redirect";

/** Width requested by {@link TRANSFORM_OPTIONS}, asserted when the variant is a PNG. */
export const TRANSFORM_WIDTH = 640;

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Absolute URL of the same-zone origin proxy for a media key. */
export function buildOriginalUrl(baseUrl, key) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`/media/original/${path}`, baseUrl).toString();
}

/** Absolute URL of a Cloudflare transform of the same media key. */
export function buildTransformUrl(baseUrl, key, options = TRANSFORM_OPTIONS) {
  const original = new URL(buildOriginalUrl(baseUrl, key));
  return new URL(`/cdn-cgi/image/${options}${original.pathname}`, baseUrl).toString();
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** True when the payload carries the PNG magic number. */
export function isPng(bytes) {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Reads the pixel dimensions from a PNG IHDR chunk.
 *
 * Returns null for any other format: Cloudflare answers `format=auto` with WebP
 * or AVIF depending on the client, and guessing at those headers would make the
 * probe fail for the wrong reason.
 */
export function readPngDimensions(bytes) {
  if (!isPng(bytes) || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function getImage(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, { headers, redirect: "follow" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    cacheStatus: response.headers.get("cf-cache-status") ?? "",
    bytes,
    digest: sha256(bytes),
  };
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

/**
 * Runs every check and returns a structured result.
 *
 * `fetchImpl` is injected so the probe's own logic is unit-testable without a
 * network or a production fixture.
 */
export async function runProbe({ baseUrl, key, fallbackKey }, fetchImpl = fetch) {
  const checks = [];

  const original = await getImage(fetchImpl, buildOriginalUrl(baseUrl, key));
  checks.push(
    check(
      "origin proxy serves the immutable original",
      original.status === 200 &&
        original.contentType.startsWith("image/") &&
        original.cacheControl.includes("immutable") &&
        original.bytes.length > 0,
      `status=${original.status} type=${original.contentType} sha256=${original.digest}`,
    ),
  );

  const transformUrl = buildTransformUrl(baseUrl, key);
  const transformed = await getImage(fetchImpl, transformUrl);
  const dimensions = readPngDimensions(transformed.bytes);
  checks.push(
    check(
      "transform returns a resized variant",
      transformed.status === 200 &&
        transformed.contentType.startsWith("image/") &&
        transformed.digest !== original.digest &&
        (dimensions === null || dimensions.width === TRANSFORM_WIDTH),
      `status=${transformed.status} type=${transformed.contentType}` +
        (dimensions ? ` width=${dimensions.width}` : " width=not-a-png"),
    ),
  );

  // The first transform populates the edge cache; the second must be served
  // from it. A MISS on both means the transform is being recomputed per request.
  const repeated = await getImage(fetchImpl, transformUrl);
  checks.push(
    check(
      "repeated transform is served from the edge cache",
      repeated.status === 200 && repeated.cacheStatus.toUpperCase() === "HIT",
      `cf-cache-status=${repeated.cacheStatus || "absent"}`,
    ),
  );

  if (!fallbackKey) {
    checks.push(
      check(
        "forced transform failure falls back to the original",
        false,
        "NOT VERIFIED — pass --fallback-key with a deliberately untransformable object",
      ),
    );
    return { checks, passed: false };
  }

  const fallbackOriginal = await getImage(fetchImpl, buildOriginalUrl(baseUrl, fallbackKey));
  const fallbackTransform = await getImage(fetchImpl, buildTransformUrl(baseUrl, fallbackKey));
  checks.push(
    check(
      "forced transform failure falls back to the original",
      fallbackTransform.status === 200 &&
        fallbackOriginal.status === 200 &&
        fallbackTransform.digest === fallbackOriginal.digest,
      `status=${fallbackTransform.status} matches-original=${
        fallbackTransform.digest === fallbackOriginal.digest
      }`,
    ),
  );

  return { checks, passed: checks.every((entry) => entry.passed) };
}

/** Minimal `--flag value` parser; avoids a dependency for four options. */
export function parseArgs(argv) {
  const options = { baseUrl: "https://katbose.dev", key: undefined, fallbackKey: undefined };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--key") options.key = value;
    else if (flag === "--fallback-key") options.fallbackKey = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.key) throw new Error("--key is required");
  return options;
}

export function formatReport({ checks, passed }) {
  const lines = checks.map(
    (entry) => `${entry.passed ? "PASS" : "FAIL"}  ${entry.name}\n      ${entry.detail}`,
  );
  lines.push(passed ? "\nMedia delivery gate satisfied." : "\nMedia delivery gate NOT satisfied.");
  return lines.join("\n");
}

// Executed only when run directly, so the helpers stay importable by tests.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  try {
    const result = await runProbe(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${formatReport(result)}\n`);
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
