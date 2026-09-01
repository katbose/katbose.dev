import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const CLOUDFLARE_MAX_IMAGE_DIMENSION = 12_000;
export const DEFAULT_FIXTURE_MANIFEST = fileURLToPath(
  new URL("./fixtures/manifest.json", import.meta.url),
);

const EXPECTED_DIMENSIONS = Object.freeze({
  supported: Object.freeze({ width: 1024, height: 1024 }),
  forcedFallback: Object.freeze({ width: 12_001, height: 16 }),
});
const REQUIRED_ROLES = Object.freeze(["supported", "forcedFallback"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function validateDescriptor(role, value) {
  assertObject(value, `fixtures.${role}`);
  const expected = EXPECTED_DIMENSIONS[role];

  if (typeof value.file !== "string" || value.file !== basename(value.file)) {
    throw new Error(`fixtures.${role}.file must be a single local filename.`);
  }
  if (
    typeof value.objectKey !== "string" ||
    !value.objectKey.endsWith(".png") ||
    value.objectKey.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`fixtures.${role}.objectKey must be a safe extension-bearing PNG key.`);
  }
  if (value.mimeType !== "image/png") {
    throw new Error(`fixtures.${role}.mimeType must be image/png.`);
  }
  if (value.width !== expected.width || value.height !== expected.height) {
    throw new Error(
      `fixtures.${role} must be ${expected.width}x${expected.height}, received ${value.width}x${value.height}.`,
    );
  }
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0) {
    throw new Error(`fixtures.${role}.bytes must be a positive integer.`);
  }
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error(`fixtures.${role}.sha256 must be a lowercase SHA-256 digest.`);
  }

  return {
    file: value.file,
    objectKey: value.objectKey,
    mimeType: value.mimeType,
    width: value.width,
    height: value.height,
    bytes: value.bytes,
    sha256: value.sha256,
  };
}

export async function decodeImage(bytes) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const metadata = await sharp(input, { failOn: "error" }).metadata();
  const { data, info } = await sharp(input, { failOn: "error" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (
    !metadata.format ||
    metadata.width !== info.width ||
    metadata.height !== info.height ||
    !Number.isSafeInteger(info.channels) ||
    info.channels <= 0
  ) {
    throw new Error("Decoded image metadata is incomplete or inconsistent.");
  }

  const expectedDecodedBytes = info.width * info.height * info.channels;
  if (data.byteLength !== expectedDecodedBytes) {
    throw new Error(
      `Full decode produced ${data.byteLength} bytes; expected ${expectedDecodedBytes}.`,
    );
  }

  return {
    format: metadata.format,
    width: info.width,
    height: info.height,
    channels: info.channels,
    decodedBytes: data.byteLength,
  };
}

export async function loadFixtureManifest(manifestPath = DEFAULT_FIXTURE_MANIFEST) {
  const absolutePath = resolve(manifestPath);
  const parsed = JSON.parse(await readFile(absolutePath, "utf8"));
  assertObject(parsed, "fixture manifest");
  assertObject(parsed.fixtures, "fixture manifest fixtures");

  if (parsed.version !== 1) throw new Error("Fixture manifest version must be 1.");

  const roles = Object.keys(parsed.fixtures).sort();
  if (roles.join(",") !== [...REQUIRED_ROLES].sort().join(",")) {
    throw new Error(`Fixture manifest must contain exactly: ${REQUIRED_ROLES.join(", ")}.`);
  }

  const supported = validateDescriptor("supported", parsed.fixtures.supported);
  const forcedFallback = validateDescriptor("forcedFallback", parsed.fixtures.forcedFallback);
  if (supported.file === forcedFallback.file || supported.objectKey === forcedFallback.objectKey) {
    throw new Error("Fixture filenames and object keys must be unique.");
  }
  if (forcedFallback.width <= CLOUDFLARE_MAX_IMAGE_DIMENSION) {
    throw new Error("The forced-fallback fixture must exceed Cloudflare's dimension bound.");
  }

  return {
    path: absolutePath,
    version: 1,
    fixtures: { supported, forcedFallback },
  };
}

export async function loadAndVerifyFixtures(manifestPath = DEFAULT_FIXTURE_MANIFEST) {
  const manifest = await loadFixtureManifest(manifestPath);
  const directory = dirname(manifest.path);
  const fixtures = {};

  for (const role of REQUIRED_ROLES) {
    const descriptor = manifest.fixtures[role];
    const filePath = resolve(directory, descriptor.file);
    if (dirname(filePath) !== directory) {
      throw new Error(`Fixture ${role} resolves outside the manifest directory.`);
    }

    const body = await readFile(filePath);
    const digest = sha256(body);
    if (body.byteLength !== descriptor.bytes) {
      throw new Error(
        `Fixture ${role} has ${body.byteLength} bytes; manifest records ${descriptor.bytes}.`,
      );
    }
    if (digest !== descriptor.sha256) {
      throw new Error(`Fixture ${role} SHA-256 does not match the manifest.`);
    }

    let decoded;
    try {
      decoded = await decodeImage(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Fixture ${role} failed a full image decode: ${message}`, { cause: error });
    }

    if (
      decoded.format !== "png" ||
      decoded.width !== descriptor.width ||
      decoded.height !== descriptor.height
    ) {
      throw new Error(
        `Fixture ${role} decoded as ${decoded.format} ${decoded.width}x${decoded.height}; expected PNG ${descriptor.width}x${descriptor.height}.`,
      );
    }

    fixtures[role] = { descriptor, filePath, body, decoded };
  }

  return { manifest, fixtures };
}
