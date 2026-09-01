#!/usr/bin/env node
/**
 * Credential-free registered-zone media delivery probe.
 *
 * The committed manifest identifies two immutable public fixtures exactly: a
 * supported square PNG and a valid PNG whose 12,001-pixel width exceeds
 * Cloudflare Image Resizing's dimension bound. The latter forces the real
 * `onerror=redirect` path without relying on corrupt image bytes.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CLOUDFLARE_MAX_IMAGE_DIMENSION,
  DEFAULT_FIXTURE_MANIFEST,
  decodeImage,
  loadAndVerifyFixtures,
  sha256,
} from "./media-fixtures.mjs";

export { CLOUDFLARE_MAX_IMAGE_DIMENSION, DEFAULT_FIXTURE_MANIFEST, loadAndVerifyFixtures, sha256 };

/** Transform options emitted by the production image loader. */
export const TRANSFORM_OPTIONS = "width=640,quality=80,fit=scale-down,format=auto,onerror=redirect";
export const TRANSFORM_WIDTH = 640;

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

function normalizeContentType(value) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function hasImmutableOneYearCache(value) {
  const directives = new Map();
  for (const rawDirective of value.split(",")) {
    const directive = rawDirective.trim().toLowerCase();
    if (!directive) return false;

    const separator = directive.indexOf("=");
    const name = (separator === -1 ? directive : directive.slice(0, separator)).trim();
    const directiveValue = separator === -1 ? null : directive.slice(separator + 1).trim();
    if (!name || directives.has(name)) return false;
    directives.set(name, directiveValue);
  }

  return (
    directives.get("public") === null &&
    directives.get("immutable") === null &&
    directives.get("max-age") === "31536000" &&
    !directives.has("private") &&
    !directives.has("no-cache") &&
    !directives.has("no-store")
  );
}

async function getImage(fetchImpl, url, { redirect = "follow" } = {}) {
  const response = await fetchImpl(url, {
    headers: { accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8" },
    redirect,
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    cacheStatus: response.headers.get("cf-cache-status") ?? "",
    location: response.headers.get("location") ?? "",
    bytes,
    digest: sha256(bytes),
  };
}

async function inspectImage(bytes) {
  try {
    return { ok: true, decoded: await decodeImage(bytes), error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, decoded: null, error: message.replaceAll(/\s+/g, " ").slice(0, 240) };
  }
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

function matchesFixture(response, inspection, fixture) {
  return (
    response.status === 200 &&
    normalizeContentType(response.contentType) === fixture.mimeType &&
    response.bytes.byteLength === fixture.bytes &&
    response.digest === fixture.sha256 &&
    inspection.ok &&
    inspection.decoded.format === "png" &&
    inspection.decoded.width === fixture.width &&
    inspection.decoded.height === fixture.height
  );
}

function imageDetail(response, inspection) {
  const decoded = inspection.ok
    ? `${inspection.decoded.format} ${inspection.decoded.width}x${inspection.decoded.height} (${inspection.decoded.decodedBytes} decoded bytes)`
    : `failed: ${inspection.error}`;
  return `status=${response.status} type=${response.contentType || "absent"} bytes=${response.bytes.byteLength} sha256=${response.digest} decode=${decoded}`;
}

/**
 * Runs every production check against descriptors from the committed manifest.
 * `fetchImpl` is injected so transport and redirect handling remain unit-testable.
 */
export async function runProbe({ baseUrl, fixtures }, fetchImpl = fetch) {
  const checks = [];
  const supported = fixtures?.supported;
  if (!supported) throw new Error("A supported fixture descriptor is required.");

  const originalUrl = buildOriginalUrl(baseUrl, supported.objectKey);
  const original = await getImage(fetchImpl, originalUrl);
  const originalInspection = await inspectImage(original.bytes);
  checks.push(
    check(
      "supported original matches the immutable manifest fixture",
      matchesFixture(original, originalInspection, supported) &&
        hasImmutableOneYearCache(original.cacheControl),
      `${imageDetail(original, originalInspection)} cache-control=${original.cacheControl || "absent"}`,
    ),
  );

  const transformUrl = buildTransformUrl(baseUrl, supported.objectKey);
  const transformed = await getImage(fetchImpl, transformUrl);
  const transformedInspection = await inspectImage(transformed.bytes);
  checks.push(
    check(
      "transform returns a fully decoded 640x640 variant",
      transformed.status === 200 &&
        normalizeContentType(transformed.contentType).startsWith("image/") &&
        transformed.digest !== original.digest &&
        transformedInspection.ok &&
        transformedInspection.decoded.width === TRANSFORM_WIDTH &&
        transformedInspection.decoded.height === TRANSFORM_WIDTH,
      imageDetail(transformed, transformedInspection),
    ),
  );

  const repeated = await getImage(fetchImpl, transformUrl);
  const repeatedInspection = await inspectImage(repeated.bytes);
  checks.push(
    check(
      "repeated transform is identical and served from the edge cache",
      repeated.status === 200 &&
        repeated.digest === transformed.digest &&
        repeatedInspection.ok &&
        repeatedInspection.decoded.width === TRANSFORM_WIDTH &&
        repeatedInspection.decoded.height === TRANSFORM_WIDTH &&
        repeated.cacheStatus.toUpperCase() === "HIT",
      `${imageDetail(repeated, repeatedInspection)} cf-cache-status=${repeated.cacheStatus || "absent"}`,
    ),
  );

  const forcedFallback = fixtures?.forcedFallback;
  if (!forcedFallback) {
    checks.push(
      check(
        "forced transform failure redirects to the original fixture",
        false,
        "NOT VERIFIED — the manifest did not supply the forced-fallback fixture",
      ),
    );
    return { checks, passed: false };
  }

  const fallbackOriginalUrl = buildOriginalUrl(baseUrl, forcedFallback.objectKey);
  const fallbackOriginal = await getImage(fetchImpl, fallbackOriginalUrl);
  const fallbackOriginalInspection = await inspectImage(fallbackOriginal.bytes);
  checks.push(
    check(
      "over-limit original matches the immutable manifest fixture",
      matchesFixture(fallbackOriginal, fallbackOriginalInspection, forcedFallback) &&
        hasImmutableOneYearCache(fallbackOriginal.cacheControl),
      `${imageDetail(fallbackOriginal, fallbackOriginalInspection)} cache-control=${fallbackOriginal.cacheControl || "absent"}`,
    ),
  );

  const fallbackTransformUrl = buildTransformUrl(baseUrl, forcedFallback.objectKey);
  const redirectResponse = await getImage(fetchImpl, fallbackTransformUrl, { redirect: "manual" });
  let resolvedLocation = "";
  try {
    if (redirectResponse.location) {
      resolvedLocation = new URL(redirectResponse.location, fallbackTransformUrl).toString();
    }
  } catch {
    resolvedLocation = "";
  }
  const locationMatches = resolvedLocation === fallbackOriginalUrl;
  checks.push(
    check(
      "forced transform failure returns the exact same-zone redirect",
      redirectResponse.status === 302 && locationMatches,
      `status=${redirectResponse.status} location=${redirectResponse.location || "absent"} expected=${fallbackOriginalUrl}`,
    ),
  );

  if (!locationMatches) {
    checks.push(
      check(
        "redirect target decodes to the exact fallback fixture",
        false,
        "NOT VERIFIED — an unexpected redirect target was not fetched",
      ),
    );
    return { checks, passed: false };
  }

  const redirectedBody = await getImage(fetchImpl, resolvedLocation, { redirect: "manual" });
  const redirectedInspection = await inspectImage(redirectedBody.bytes);
  checks.push(
    check(
      "redirect target decodes to the exact fallback fixture",
      matchesFixture(redirectedBody, redirectedInspection, forcedFallback),
      imageDetail(redirectedBody, redirectedInspection),
    ),
  );

  return { checks, passed: checks.every((entry) => entry.passed) };
}

/** Minimal `--flag value` parser for credential-free probe configuration. */
export function parseArgs(argv) {
  const options = {
    baseUrl: "https://katbose.dev",
    manifest: DEFAULT_FIXTURE_MANIFEST,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--manifest") options.manifest = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  return options;
}

export function formatReport({ checks, passed }) {
  const lines = checks.map(
    (entry) => `${entry.passed ? "PASS" : "FAIL"}  ${entry.name}\n      ${entry.detail}`,
  );
  lines.push(passed ? "\nMedia delivery gate satisfied." : "\nMedia delivery gate NOT satisfied.");
  return lines.join("\n");
}

const isDirect =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const verified = await loadAndVerifyFixtures(options.manifest);
    const result = await runProbe(
      { baseUrl: options.baseUrl, fixtures: verified.manifest.fixtures },
      fetch,
    );
    process.stdout.write(`${formatReport(result)}\n`);
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
