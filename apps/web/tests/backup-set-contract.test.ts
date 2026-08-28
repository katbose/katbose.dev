import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/backups/backup-set.mjs is the shared create/restore contract for
// weekly encrypted backup sets. Nothing else in the repository executes it, so
// without this file a fatal defect in it ships with a green pipeline.
// See docs/10-backups-and-portability.md §10.2.
function backupScript(name: string) {
  return fileURLToPath(new URL(`../../../scripts/backups/${name}`, import.meta.url));
}

const contractScript = backupScript("backup-set.mjs");

// create-weekly-backup.sh derives CREATED_AT from `date -u +%Y-%m-%dT%H:%M:%SZ`,
// which has whole-second precision. JavaScript's canonical ISO form always
// carries milliseconds, so a contract that accepts only Date#toISOString output
// rejects every real backup after the database and Storage export but before
// publication. Both spellings are pinned here.
const CREATOR_DATE_FORMAT = "%Y-%m-%dT%H:%M:%SZ";
const CREATOR_TIMESTAMP = "2026-08-28T03:00:00Z";
const CANONICAL_TIMESTAMP = "2026-08-28T03:00:00.000Z";

const SET_ID = "weekly-20260828T030000Z-4242-1";
const GIT_SHA = "a".repeat(40);
const OTHER_GIT_SHA = "b".repeat(40);
const PROJECT_REF = "ersangtaqrggqldfdbxq";
const BUCKET = "resume";
const OBJECT_BODY = "%PDF-1.7 fixture";

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface Manifest {
  setId: string;
  createdAt: string;
  gitSha: string;
  storage: { buckets: { name: string; objects: number }[]; objects: number; bytes: number };
  files: { path: string; bytes: number; sha256: string }[];
}

interface Marker {
  setId: string;
  createdAt: string;
  gitSha: string;
  object: string;
  bytes: number;
  sha256: string;
}

let temporaryRoot: string;
let sequence = 0;

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "katbose-backup-contract-"));
});

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

function runContract(...args: string[]): CommandResult {
  const result = spawnSync(process.execPath, [contractScript, ...args], { encoding: "utf8" });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Stages a minimal plaintext set that satisfies every structural rule. */
function stageSet(): string {
  const root = join(temporaryRoot, `set-${++sequence}`);
  mkdirSync(join(root, "storage", BUCKET), { recursive: true });
  mkdirSync(join(root, "migrations"), { recursive: true });
  writeFileSync(join(root, "application.dump"), "PGDMP custom-format fixture");
  writeFileSync(join(root, "migrations", "0001_initial.sql"), "select 1;\n");
  writeFileSync(join(root, "storage", BUCKET, "resume.pdf"), OBJECT_BODY);
  writeJson(join(root, "database-tables.json"), {
    version: 1,
    schema: "public",
    tables: [
      { name: "contact_submissions", rows: 245 },
      { name: "download_logs", rows: 0 },
    ],
  });
  writeJson(join(root, "storage-buckets.json"), {
    version: 1,
    buckets: [
      {
        id: BUCKET,
        name: BUCKET,
        public: false,
        fileSizeLimit: null,
        allowedMimeTypes: null,
        objects: 1,
        bytes: Buffer.byteLength(OBJECT_BODY),
      },
    ],
  });
  return root;
}

/** Stages a stand-in for the age ciphertext, named as the marker requires. */
function stageEncryptedPayload(): string {
  const path = join(temporaryRoot, `payload-${++sequence}`, `${SET_ID}.tar.zst.age`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "age-ciphertext fixture");
  return path;
}

function createSetWithManifest(timestamp = CREATOR_TIMESTAMP) {
  const setDirectory = stageSet();
  const result = runContract("create", setDirectory, SET_ID, timestamp, GIT_SHA, PROJECT_REF);
  return { setDirectory, result };
}

function createMarker(timestamp = CREATOR_TIMESTAMP, gitSha = GIT_SHA) {
  const encryptedPath = stageEncryptedPayload();
  const markerPath = join(dirname(encryptedPath), "complete.json");
  const result = runContract("create-marker", encryptedPath, SET_ID, timestamp, gitSha, markerPath);
  return { encryptedPath, markerPath, result };
}

describe("backup-set contract", () => {
  it("accepts the whole-second timestamp that create-weekly-backup.sh emits", () => {
    const { setDirectory, result } = createSetWithManifest(CREATOR_TIMESTAMP);

    expect(result.stderr, "the creator's own timestamp format must be accepted").toBe("");
    expect(result.status).toBe(0);
    expect(readJson<Manifest>(join(setDirectory, "manifest.json")).setId).toBe(SET_ID);
  });

  it("pins the creator's date format so the two cannot drift apart", () => {
    const creator = readFileSync(backupScript("create-weekly-backup.sh"), "utf8");
    const format = creator.match(/CREATED_AT="\$\(date -u \+(\S+)\)"/)?.[1];

    expect(format, "create-weekly-backup.sh must still derive CREATED_AT from date -u").toBe(
      CREATOR_DATE_FORMAT,
    );
    // The pinned literal must be what that format actually produces.
    expect(CREATOR_TIMESTAMP).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("normalises persisted timestamps to a single canonical representation", () => {
    const { setDirectory } = createSetWithManifest(CREATOR_TIMESTAMP);
    const { markerPath } = createMarker(CREATOR_TIMESTAMP);

    // Retention orders sets by this string, so one instant must never be
    // stored in two spellings that sort differently.
    expect(readJson<Manifest>(join(setDirectory, "manifest.json")).createdAt).toBe(
      CANONICAL_TIMESTAMP,
    );
    expect(readJson<Marker>(markerPath).createdAt).toBe(CANONICAL_TIMESTAMP);
  });

  it("rejects a timestamp that is neither canonical nor whole-second", () => {
    const { result } = createSetWithManifest("2026-08-28T03:00:00.00Z");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid ISO timestamp");
  });

  it("verifies a freshly created set against its own manifest", () => {
    const { setDirectory } = createSetWithManifest();
    const verified = runContract("verify", setDirectory);

    expect(verified.stderr).toBe("");
    expect(verified.status).toBe(0);
  });

  it("detects a tampered payload whose recorded checksum no longer matches", () => {
    const { setDirectory } = createSetWithManifest();
    writeFileSync(join(setDirectory, "storage", BUCKET, "resume.pdf"), "swapped body");

    const verified = runContract("verify", setDirectory);

    expect(verified.status).toBe(1);
    expect(verified.stderr).toMatch(/integrity verification|differs from its source/);
  });

  it("reports a contract error rather than crashing when storage metadata is absent", () => {
    const { setDirectory } = createSetWithManifest();
    const manifestPath = join(setDirectory, "manifest.json");
    const manifest = readJson<Record<string, unknown>>(manifestPath);
    delete manifest["storage"];
    writeJson(manifestPath, manifest);

    const verified = runContract("verify", setDirectory);

    expect(verified.status).toBe(1);
    expect(verified.stderr).toContain("Manifest storage metadata is missing");
    expect(verified.stderr, "a malformed manifest must not surface a raw crash").not.toContain(
      "TypeError",
    );
  });

  it("accepts a completion marker that matches its manifest", () => {
    const { setDirectory } = createSetWithManifest();
    const { encryptedPath, markerPath, result } = createMarker();

    expect(result.status).toBe(0);
    expect(runContract("verify-marker", encryptedPath, markerPath).status).toBe(0);

    const paired = runContract("verify-pair", setDirectory, markerPath);

    expect(paired.stderr).toBe("");
    expect(paired.status).toBe(0);
  });

  it("refuses a completion marker produced by a different commit", () => {
    const { setDirectory } = createSetWithManifest();
    const { markerPath } = createMarker(CREATOR_TIMESTAMP, OTHER_GIT_SHA);

    const paired = runContract("verify-pair", setDirectory, markerPath);

    expect(paired.status).toBe(1);
    expect(paired.stderr).toContain("Completion marker metadata differs from the backup manifest");
  });

  it("keeps the newest complete sets and prunes only older ones", () => {
    const markersRoot = join(temporaryRoot, `markers-${++sequence}`);
    const setIds = [
      "weekly-20260802T030000Z-1-1",
      "weekly-20260809T030000Z-2-1",
      "weekly-20260816T030000Z-3-1",
      "weekly-20260823T030000Z-4-1",
    ];
    setIds.forEach((setId, index) => {
      mkdirSync(join(markersRoot, setId), { recursive: true });
      writeJson(join(markersRoot, setId, "complete.json"), {
        version: 1,
        setId,
        createdAt: `2026-08-0${index + 2}T03:00:00Z`,
        gitSha: GIT_SHA,
        object: `${setId}.tar.zst.age`,
        bytes: 1,
        sha256: "c".repeat(64),
      });
    });

    const retained = runContract("retention", markersRoot, "2", setIds[3]!);

    expect(retained.stderr).toBe("");
    expect(retained.stdout.trim().split("\n")).toEqual([setIds[0], setIds[1]]);
  });

  it("fails closed when the current set has no verified marker", () => {
    const markersRoot = join(temporaryRoot, `markers-${++sequence}`);
    mkdirSync(markersRoot, { recursive: true });

    const retained = runContract("retention", markersRoot, "4", SET_ID);

    expect(retained.status).toBe(1);
    expect(retained.stdout).toBe("");
    expect(retained.stderr).toContain("Current set has no verified completion marker");
  });
});

describe("PostgreSQL connection handling", () => {
  // libpq treats PGDATABASE from the environment as a literal database name, so
  // exporting a connection URI there silently falls back to the local socket.
  // Both shell clients must decompose the URI through the shared helper.
  it.each([["create-weekly-backup.sh"], ["restore-weekly-backup.sh"]])(
    "%s decomposes its connection URL instead of exporting a URI",
    (script) => {
      const source = readFileSync(backupScript(script), "utf8");

      expect(source).toContain("pg-connection-env.sh");
      expect(source).toContain("export_pg_environment");
      expect(source, "a URI in PGDATABASE never reaches the configured host").not.toMatch(
        /export PGDATABASE="\$(SUPABASE_DB_URL|SCRATCH_DB_URL)"/,
      );
    },
  );

  it("passes --dbname to pg_restore so it connects instead of emitting a script", () => {
    const source = readFileSync(backupScript("restore-weekly-backup.sh"), "utf8");

    expect(source).toMatch(/--dbname="\$PGDATABASE"/);
  });
});

describe("external tool invocations", () => {
  // zstd names its output file with -o only. --output is silently wrong until
  // the moment a real backup is compressed.
  it.each([
    ["create-weekly-backup.sh"],
    ["restore-weekly-backup.sh"],
    ["restore-weekly-backup.ps1"],
  ])("%s does not pass --output to zstd", (script) => {
    // Comments are stripped so prose about the flag cannot trip the check, and
    // each form is matched per invocation so `age --output` stays allowed.
    const source = readFileSync(backupScript(script), "utf8").replace(/^[ \t]*#.*$/gm, "");
    const shellInvocation = /zstd[^\n]*--output/.test(source);
    const powershellInvocation = /"zstd"\s*@\([^)]*--output[^)]*\)/.test(source);

    expect(shellInvocation || powershellInvocation, "zstd accepts -o, never --output").toBe(false);
    expect(source, "the script should still invoke zstd").toMatch(/zstd/);
  });
});

describe("restore scripts", () => {
  // A restore that validates the manifest and the marker separately can accept
  // a set assembled from two different runs. Both clients must cross-check them.
  it.each([["restore-weekly-backup.sh"], ["restore-weekly-backup.ps1"]])(
    "%s cross-checks the completion marker against the manifest",
    (script) => {
      const source = readFileSync(backupScript(script), "utf8");

      expect(source).toContain("verify-pair");
      expect(source, "verify-pair supersedes the manifest-only check").not.toMatch(
        /verify"?,? "?\$?\{?(EXTRACTED_SET|extractedSet)/,
      );
    },
  );
});
