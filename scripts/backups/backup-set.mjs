#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

const MANIFEST_VERSION = 1;
const MARKER_VERSION = 1;
const SET_ID_PATTERN = /^weekly-\d{8}T\d{6}Z-\d+-\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SAFE_TABLE_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

function fail(message) {
  throw new Error(message);
}

function requireSetId(value) {
  if (!SET_ID_PATTERN.test(value)) {
    fail(`Invalid backup set ID: ${value}`);
  }
  return value;
}

// Accepts either whole-second precision, which is what `date -u
// +%Y-%m-%dT%H:%M:%SZ` in create-weekly-backup.sh emits, or the canonical
// millisecond form. Always returns the canonical form so every persisted and
// compared timestamp has exactly one representation: retention orders sets by
// this string, so two spellings of one instant must never coexist.
function requireTimestamp(value) {
  if (typeof value !== "string") {
    fail(`Invalid ISO timestamp: ${String(value)}`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    fail(`Invalid ISO timestamp: ${value}`);
  }
  const canonical = parsed.toISOString();
  if (value !== canonical && value !== canonical.replace(".000Z", "Z")) {
    fail(`Invalid ISO timestamp: ${value}`);
  }
  return canonical;
}

function requireSha256(value) {
  if (!SHA256_PATTERN.test(value)) {
    fail(`Invalid SHA-256 value: ${value}`);
  }
  return value;
}

function requireSupabaseProjectRef(value) {
  if (typeof value !== "string" || !SUPABASE_PROJECT_REF_PATTERN.test(value)) {
    fail(`Invalid Supabase project reference: ${String(value)}`);
  }
  return value;
}

function requireSafeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    // oxlint-disable-next-line no-control-regex -- Backup paths must reject C0 control characters and DEL.
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    fail(`Unsafe ${label}: ${String(value)}`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function toPortableRelativePath(root, path) {
  const value = relative(root, path).split(sep).join("/");
  if (!value || value.startsWith("../") || value.includes("/../") || value.startsWith("/")) {
    fail(`Unsafe backup path: ${value || path}`);
  }
  return value;
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function walkFiles(root) {
  const files = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`Backup sets cannot contain symbolic links: ${toPortableRelativePath(root, path)}`);
      }
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        fail(`Backup sets cannot contain special files: ${toPortableRelativePath(root, path)}`);
      }
    }
  }

  await walk(root);
  return files;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function validateDatabaseStats(value) {
  if (
    !value ||
    value.version !== 1 ||
    value.schema !== "public" ||
    !Array.isArray(value.tables) ||
    value.tables.length === 0
  ) {
    fail("database-tables.json has an unsupported shape");
  }

  const names = new Set();
  const tables = value.tables.map((table) => {
    if (!table || typeof table.name !== "string" || !SAFE_TABLE_PATTERN.test(table.name)) {
      fail(`Unsafe application table name: ${String(table?.name)}`);
    }
    if (names.has(table.name)) {
      fail(`Duplicate application table: ${table.name}`);
    }
    names.add(table.name);
    return {
      name: table.name,
      rows: requireNonNegativeInteger(table.rows, `${table.name}.rows`),
    };
  });

  tables.sort((left, right) => left.name.localeCompare(right.name));
  return tables;
}

function validateBucketStats(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.buckets)) {
    fail("storage-buckets.json has an unsupported shape");
  }
  if (value.buckets.length === 0) {
    fail("At least one Supabase Storage bucket must be backed up");
  }

  const names = new Set();
  const buckets = value.buckets.map((bucket) => {
    if (!bucket || typeof bucket.name !== "string" || !SAFE_BUCKET_PATTERN.test(bucket.name)) {
      fail(`Unsafe Supabase Storage bucket name: ${String(bucket?.name)}`);
    }
    if (bucket.id !== bucket.name) {
      fail(`Supabase Storage bucket ID and name must match: ${bucket.name}`);
    }
    if (typeof bucket.public !== "boolean") {
      fail(`Supabase Storage bucket public flag is missing: ${bucket.name}`);
    }
    if (
      bucket.fileSizeLimit !== null &&
      (!Number.isSafeInteger(bucket.fileSizeLimit) || bucket.fileSizeLimit < 0)
    ) {
      fail(`Invalid Supabase Storage file-size limit: ${bucket.name}`);
    }
    if (
      bucket.allowedMimeTypes !== null &&
      (!Array.isArray(bucket.allowedMimeTypes) ||
        bucket.allowedMimeTypes.some((type) => typeof type !== "string" || type.length === 0))
    ) {
      fail(`Invalid Supabase Storage MIME-type policy: ${bucket.name}`);
    }
    if (names.has(bucket.name)) {
      fail(`Duplicate Supabase Storage bucket: ${bucket.name}`);
    }
    names.add(bucket.name);
    return {
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
      objects: requireNonNegativeInteger(bucket.objects, `${bucket.name}.objects`),
      bytes: requireNonNegativeInteger(bucket.bytes, `${bucket.name}.bytes`),
    };
  });

  buckets.sort((left, right) => left.name.localeCompare(right.name));
  return buckets;
}

async function inspectSet(setDirectory) {
  const root = resolve(setDirectory);
  const databasePath = resolve(root, "application.dump");
  const databaseInfo = await stat(databasePath).catch(() => null);
  if (!databaseInfo?.isFile() || databaseInfo.size === 0) {
    fail("application.dump is missing or empty");
  }

  const databaseTables = validateDatabaseStats(
    await readJson(resolve(root, "database-tables.json")).catch(() => null),
  );
  const bucketStats = validateBucketStats(
    await readJson(resolve(root, "storage-buckets.json")).catch(() => null),
  );
  const files = (await walkFiles(root)).filter(
    (path) => toPortableRelativePath(root, path) !== "manifest.json",
  );
  const records = [];

  for (const path of files) {
    const info = await stat(path);
    records.push({
      path: toPortableRelativePath(root, path),
      bytes: requireNonNegativeInteger(info.size, "file size"),
      sha256: await hashFile(path),
    });
  }
  records.sort((left, right) => left.path.localeCompare(right.path));

  const actualBuckets = [];
  for (const expected of bucketStats) {
    const bucketRoot = resolve(root, "storage", expected.name);
    const rootInfo = await lstat(bucketRoot).catch(() => null);
    if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
      fail(`Storage bucket directory is missing: ${expected.name}`);
    }
    const bucketPrefix = `storage/${expected.name}/`;
    const bucketFiles = records.filter((file) => file.path.startsWith(bucketPrefix));
    const actual = {
      id: expected.id,
      name: expected.name,
      public: expected.public,
      fileSizeLimit: expected.fileSizeLimit,
      allowedMimeTypes: expected.allowedMimeTypes,
      objects: bucketFiles.length,
      bytes: bucketFiles.reduce((total, file) => total + file.bytes, 0),
    };
    if (actual.objects !== expected.objects || actual.bytes !== expected.bytes) {
      fail(
        `Storage bucket ${expected.name} differs from its source: expected ${expected.objects} objects/${expected.bytes} bytes, got ${actual.objects} objects/${actual.bytes} bytes`,
      );
    }
    actualBuckets.push(actual);
  }

  const knownBucketPrefixes = new Set(bucketStats.map((bucket) => `storage/${bucket.name}/`));
  const unknownStorageFile = records.find(
    (file) =>
      file.path.startsWith("storage/") &&
      ![...knownBucketPrefixes].some((prefix) => file.path.startsWith(prefix)),
  );
  if (unknownStorageFile) {
    fail(`Storage file is not assigned to a declared bucket: ${unknownStorageFile.path}`);
  }

  const migrationFiles = records.filter(
    (file) => file.path.startsWith("migrations/") && file.path.endsWith(".sql"),
  );
  if (migrationFiles.length === 0) {
    fail("Backup set contains no Supabase migration SQL files");
  }

  return {
    root,
    files: records,
    databaseBytes: databaseInfo.size,
    databaseTables,
    buckets: actualBuckets,
  };
}

async function createManifest(setDirectory, setId, createdAt, gitSha, supabaseProjectRef) {
  const inspected = await inspectSet(setDirectory);
  const manifest = {
    version: MANIFEST_VERSION,
    setId: requireSetId(setId),
    createdAt: requireTimestamp(createdAt),
    gitSha,
    source: {
      supabaseProjectRef: requireSupabaseProjectRef(supabaseProjectRef),
    },
    database: {
      format: "postgresql-custom",
      postgresMajor: 17,
      schemas: ["public"],
      path: "application.dump",
      bytes: inspected.databaseBytes,
      tables: inspected.databaseTables,
    },
    storage: {
      buckets: inspected.buckets,
      objects: inspected.buckets.reduce((total, bucket) => total + bucket.objects, 0),
      bytes: inspected.buckets.reduce((total, bucket) => total + bucket.bytes, 0),
    },
    files: inspected.files,
  };
  const destination = resolve(inspected.root, "manifest.json");
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
  return manifest;
}

function validateManifestShape(manifest) {
  if (!manifest || manifest.version !== MANIFEST_VERSION) {
    fail("Unsupported backup manifest version");
  }
  requireSetId(manifest.setId);
  manifest.createdAt = requireTimestamp(manifest.createdAt);
  if (typeof manifest.gitSha !== "string" || !/^[a-f0-9]{40}$/.test(manifest.gitSha)) {
    fail("Manifest gitSha must be a full Git commit SHA");
  }
  requireSupabaseProjectRef(manifest.source?.supabaseProjectRef);
  if (
    !manifest.database ||
    manifest.database.format !== "postgresql-custom" ||
    manifest.database.postgresMajor !== 17 ||
    !Array.isArray(manifest.database.schemas) ||
    manifest.database.schemas.length !== 1 ||
    manifest.database.schemas[0] !== "public" ||
    manifest.database.path !== "application.dump"
  ) {
    fail("Unsupported database backup metadata");
  }
  requireNonNegativeInteger(manifest.database.bytes, "database.bytes");
  manifest.database.tables = validateDatabaseStats({
    version: 1,
    schema: "public",
    tables: manifest.database.tables,
  });
  if (!manifest.storage || typeof manifest.storage !== "object") {
    fail("Manifest storage metadata is missing");
  }
  manifest.storage.buckets = validateBucketStats({
    version: 1,
    buckets: manifest.storage.buckets,
  });
  requireNonNegativeInteger(manifest.storage.objects, "storage.objects");
  requireNonNegativeInteger(manifest.storage.bytes, "storage.bytes");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail("Manifest files must be a non-empty array");
  }

  const paths = new Set();
  for (const file of manifest.files) {
    if (!file) {
      fail("Manifest contains an empty file record");
    }
    requireSafeRelativePath(file.path, "manifest file path");
    if (paths.has(file.path)) {
      fail(`Duplicate manifest file path: ${file.path}`);
    }
    paths.add(file.path);
    requireNonNegativeInteger(file.bytes, `${file.path}.bytes`);
    requireSha256(file.sha256);
  }
  return manifest;
}

async function verifyManifest(setDirectory) {
  const root = resolve(setDirectory);
  const manifest = validateManifestShape(await readJson(resolve(root, "manifest.json")));
  const inspected = await inspectSet(root);
  const expected = new Map(manifest.files.map((file) => [file.path, file]));

  if (expected.size !== inspected.files.length) {
    fail(`Manifest lists ${expected.size} files but the set contains ${inspected.files.length}`);
  }
  for (const actual of inspected.files) {
    const recorded = expected.get(actual.path);
    if (!recorded) {
      fail(`Backup set contains an unrecorded file: ${actual.path}`);
    }
    if (recorded.bytes !== actual.bytes || recorded.sha256 !== actual.sha256) {
      fail(`Backup file failed integrity verification: ${actual.path}`);
    }
  }

  const actualObjects = inspected.buckets.reduce((total, bucket) => total + bucket.objects, 0);
  const actualStorageBytes = inspected.buckets.reduce((total, bucket) => total + bucket.bytes, 0);
  if (
    manifest.database.bytes !== inspected.databaseBytes ||
    JSON.stringify(manifest.database.tables) !== JSON.stringify(inspected.databaseTables) ||
    JSON.stringify(manifest.storage.buckets) !== JSON.stringify(inspected.buckets) ||
    manifest.storage.objects !== actualObjects ||
    manifest.storage.bytes !== actualStorageBytes
  ) {
    fail("Backup manifest summary differs from the extracted set");
  }
  return manifest;
}

async function verifySetAgainstMarker(setDirectory, markerPath) {
  const manifest = await verifyManifest(setDirectory);
  const marker = validateMarker(await readJson(resolve(markerPath)));
  if (
    marker.setId !== manifest.setId ||
    marker.createdAt !== manifest.createdAt ||
    marker.gitSha !== manifest.gitSha
  ) {
    fail("Completion marker metadata differs from the backup manifest");
  }
  return { manifest, marker };
}

function validateMarker(marker) {
  if (!marker || marker.version !== MARKER_VERSION) {
    fail("Unsupported completion marker version");
  }
  requireSetId(marker.setId);
  marker.createdAt = requireTimestamp(marker.createdAt);
  if (typeof marker.gitSha !== "string" || !/^[a-f0-9]{40}$/.test(marker.gitSha)) {
    fail("Completion marker gitSha must be a full Git commit SHA");
  }
  if (marker.object !== `${marker.setId}.tar.zst.age`) {
    fail("Completion marker object does not match its set ID");
  }
  requireNonNegativeInteger(marker.bytes, "marker.bytes");
  requireSha256(marker.sha256);
  return marker;
}

async function createMarker(encryptedPath, setId, createdAt, gitSha, outputPath) {
  const info = await stat(encryptedPath);
  if (!info.isFile() || info.size === 0) {
    fail("Encrypted backup payload is missing or empty");
  }
  const marker = validateMarker({
    version: MARKER_VERSION,
    setId: requireSetId(setId),
    createdAt: requireTimestamp(createdAt),
    gitSha,
    object: `${setId}.tar.zst.age`,
    bytes: info.size,
    sha256: await hashFile(encryptedPath),
  });
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  return marker;
}

async function verifyMarker(encryptedPath, markerPath) {
  const marker = validateMarker(await readJson(resolve(markerPath)));
  const info = await stat(encryptedPath);
  if (basename(encryptedPath) !== marker.object) {
    fail(`Encrypted payload name does not match marker object: ${marker.object}`);
  }
  if (info.size !== marker.bytes || (await hashFile(encryptedPath)) !== marker.sha256) {
    fail("Encrypted backup payload failed completion-marker verification");
  }
  return marker;
}

async function verifyMarkerStream(markerPath) {
  const marker = validateMarker(await readJson(resolve(markerPath)));
  const hash = createHash("sha256");
  let bytes = 0;

  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    hash.update(chunk);
  }

  if (bytes !== marker.bytes || hash.digest("hex") !== marker.sha256) {
    fail("Remote encrypted payload failed completion-marker verification");
  }
  return marker;
}

async function selectPrunableSets(markersDirectory, retainCount, currentSetId) {
  requireNonNegativeInteger(retainCount, "retainCount");
  if (retainCount < 1) {
    fail("retainCount must be at least 1");
  }
  requireSetId(currentSetId);

  const root = resolve(markersDirectory);
  const directories = await readdir(root, { withFileTypes: true }).catch(() => []);
  const markers = [];
  for (const entry of directories) {
    if (!entry.isDirectory()) {
      fail(`Unexpected file in completion-marker directory: ${entry.name}`);
    }
    requireSetId(entry.name);
    const marker = validateMarker(await readJson(resolve(root, entry.name, "complete.json")));
    if (marker.setId !== entry.name) {
      fail(`Completion marker directory and set ID differ: ${entry.name}`);
    }
    markers.push(marker);
  }

  if (!markers.some((marker) => marker.setId === currentSetId)) {
    fail(`Current set has no verified completion marker: ${currentSetId}`);
  }
  markers.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.setId.localeCompare(right.setId),
  );
  return markers.slice(0, Math.max(0, markers.length - retainCount)).map((marker) => marker.setId);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let result;

  switch (command) {
    case "create": {
      if (args.length !== 5) {
        fail("Usage: backup-set.mjs create SET_DIR SET_ID CREATED_AT GIT_SHA SUPABASE_PROJECT_REF");
      }
      result = await createManifest(...args);
      break;
    }
    case "verify": {
      if (args.length !== 1) fail("Usage: backup-set.mjs verify SET_DIR");
      result = await verifyManifest(args[0]);
      break;
    }
    case "verify-pair": {
      if (args.length !== 2) {
        fail("Usage: backup-set.mjs verify-pair SET_DIR MARKER");
      }
      result = await verifySetAgainstMarker(...args);
      break;
    }
    case "create-marker": {
      if (args.length !== 5) {
        fail("Usage: backup-set.mjs create-marker ENCRYPTED SET_ID CREATED_AT GIT_SHA OUTPUT");
      }
      result = await createMarker(...args);
      break;
    }
    case "verify-marker": {
      if (args.length !== 2) fail("Usage: backup-set.mjs verify-marker ENCRYPTED MARKER");
      result = await verifyMarker(...args);
      break;
    }
    case "verify-marker-stream": {
      if (args.length !== 1) fail("Usage: backup-set.mjs verify-marker-stream MARKER");
      result = await verifyMarkerStream(args[0]);
      break;
    }
    case "retention": {
      if (args.length !== 3) {
        fail("Usage: backup-set.mjs retention MARKERS_DIR RETAIN_COUNT CURRENT_SET_ID");
      }
      const retainCount = Number.parseInt(args[1], 10);
      result = await selectPrunableSets(args[0], retainCount, args[2]);
      process.stdout.write(result.length === 0 ? "" : `${result.join("\n")}\n`);
      return;
    }
    default:
      fail(
        "Expected one of: create, verify, verify-pair, create-marker, verify-marker, verify-marker-stream, retention",
      );
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`backup-set: ${message}\n`);
  process.exitCode = 1;
});
