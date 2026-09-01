#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { arch, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { EXPECTED_TARBALL_SHA1, PACKAGE_SPEC, THRESHOLD_MS } from "./npx-cold-contract.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LOCAL_CARD = join(REPOSITORY_ROOT, "packages", "katbose-card", "src", "index.js");
const GIT_CONFIG = join(REPOSITORY_ROOT, ".git", "config");
const TARBALL_URL = "https://registry.npmjs.org/katbose/-/katbose-0.0.2.tgz";
const TARBALL_FILENAME = "katbose-0.0.2.tgz";
const MAX_CAPTURE_BYTES = 1024 * 1024;
const BENCHMARK_TIMEOUT_MS = 120_000;
const AUXILIARY_TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) {
    throw new Error("Usage: node scripts/benchmarks/npx-cold-benchmark.mjs --output <directory>");
  }
  return { outputDirectory: resolve(argv[1]) };
}

function executable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function sha(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function captureChunk(chunks, state, chunk) {
  if (state.bytes >= MAX_CAPTURE_BYTES) {
    state.truncated = true;
    return;
  }

  const buffer = Buffer.from(chunk);
  const remaining = MAX_CAPTURE_BYTES - state.bytes;
  chunks.push(buffer.subarray(0, remaining));
  state.bytes += Math.min(buffer.byteLength, remaining);
  if (buffer.byteLength > remaining) state.truncated = true;
}

function signalProcessTree(child, signal) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    if (signal === "SIGKILL") {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.unref();
    }
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    // The process group already exited.
  }
}

function runCommand(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolveResult) => {
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0, truncated: false };
    const stderrState = { bytes: 0, truncated: false };
    let settled = false;
    let spawnError = "";
    let timedOut = false;
    let forceTimer;

    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      signalProcessTree(child, "SIGTERM");
      forceTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), 5_000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => captureChunk(stdout, stdoutState, chunk));
    child.stderr.on("data", (chunk) => captureChunk(stderr, stderrState, chunk));
    child.on("error", (error) => {
      spawnError = error instanceof Error ? error.message : String(error);
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      signalProcessTree(child, "SIGTERM");
      resolveResult({
        exitCode,
        signal,
        spawnError,
        timedOut,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        stdoutTruncated: stdoutState.truncated,
        stderrTruncated: stderrState.truncated,
      });
    });
  });
}

function isolatedEnvironment({ homeDirectory, cacheDirectory, temporaryDirectory }) {
  const environment = {
    CI: "true",
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    LANG: process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
    NO_COLOR: "1",
    PATH: process.env.PATH ?? "",
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory,
    TMPDIR: temporaryDirectory,
    npm_config_audit: "false",
    npm_config_cache: cacheDirectory,
    npm_config_fund: "false",
    npm_config_globalconfig: join(homeDirectory, "global.npmrc"),
    npm_config_ignore_scripts: "true",
    npm_config_loglevel: "warn",
    npm_config_progress: "false",
    npm_config_registry: "https://registry.npmjs.org/",
    npm_config_update_notifier: "false",
    npm_config_userconfig: join(homeDirectory, ".npmrc"),
  };

  for (const name of ["ComSpec", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function versionFrom(result) {
  return result.exitCode === 0 ? result.stdout.toString("utf8").trim() : null;
}

async function listFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function contentPathFromIntegrity(cacheDirectory, integrity) {
  const token = integrity.split(/\s+/).find((value) => value.startsWith("sha512-"));
  if (!token) throw new Error("The timed tarball cache entry has no SHA-512 integrity value.");
  const digest = Buffer.from(token.slice("sha512-".length), "base64").toString("hex");
  if (!/^[a-f0-9]{128}$/.test(digest)) {
    throw new Error("The timed tarball cache entry has an invalid SHA-512 digest.");
  }
  return join(
    cacheDirectory,
    "_cacache",
    "content-v2",
    "sha512",
    digest.slice(0, 2),
    digest.slice(2, 4),
    digest.slice(4),
  );
}

async function readTimedTarball(cacheDirectory) {
  const indexFiles = await listFiles(join(cacheDirectory, "_cacache", "index-v5"));
  const matches = [];

  for (const indexFile of indexFiles) {
    const lines = (await readFile(indexFile, "utf8")).split("\n");
    for (const line of lines) {
      const separator = line.indexOf("\t");
      if (separator === -1) continue;
      try {
        const entry = JSON.parse(line.slice(separator + 1));
        const cacheUrl = entry.metadata?.url ?? "";
        if (
          entry.key === `make-fetch-happen:request-cache:${TARBALL_URL}` ||
          cacheUrl === TARBALL_URL
        ) {
          matches.push({ key: entry.key, integrity: entry.integrity });
        }
      } catch {
        // Ignore interrupted or unrelated cache index records.
      }
    }
  }

  const unique = [
    ...new Map(matches.map((entry) => [`${entry.key}\n${entry.integrity}`, entry])).values(),
  ];
  if (unique.length !== 1) {
    throw new Error(`Expected one timed tarball cache entry, found ${unique.length}.`);
  }

  const [entry] = unique;
  const body = await readFile(contentPathFromIntegrity(cacheDirectory, entry.integrity));
  return { body, cacheKey: entry.key, cacheIntegrity: entry.integrity };
}

function markdownReport(report) {
  const verdict = report.passed ? "PASS" : "FAIL";
  return `# Cold npx benchmark\n\n- Verdict: **${verdict}**\n- Attempted: ${report.attemptedAt}\n- Package: \`${report.package}\`\n- Command: \`${report.command}\`\n- Duration: ${report.result.durationMs ?? "not measured"} ms (limit ${report.thresholdMs} ms)\n- Exit code: ${report.result.exitCode ?? "not available"}\n- Timed out: ${report.result.timedOut}\n- Card output matched: ${report.result.stdoutMatched}\n- Timed payload SHA-1: \`${report.integrity.actualSha1 ?? "not available"}\`\n- Expected SHA-1: \`${report.expectedTarballSha1}\`\n- SHA-1 matched: ${report.integrity.matched}\n- Environment: ${report.environment.runnerOs ?? report.environment.platform} ${report.environment.arch}, Node ${report.environment.node}, npm ${report.environment.npm ?? "unknown"}\n${report.error ? `- Collector error: ${report.error}\n` : ""}`;
}

const { outputDirectory } = parseArgs(process.argv.slice(2));
const attemptedAt = new Date().toISOString();
await mkdir(outputDirectory, { recursive: true });

const reportPath = join(outputDirectory, "report.json");
await writeFile(
  reportPath,
  `${JSON.stringify({ schemaVersion: 1, status: "started", attemptedAt, package: PACKAGE_SPEC }, null, 2)}\n`,
  "utf8",
);

const temporaryRoot = await mkdtemp(join(tmpdir(), "katbose-npx-benchmark-"));
const homeDirectory = join(temporaryRoot, "home");
const workDirectory = join(temporaryRoot, "work");
const benchmarkCache = join(temporaryRoot, "benchmark-cache");
const auxiliaryCache = join(temporaryRoot, "auxiliary-cache");
const registryDirectory = join(outputDirectory, "registry");
await Promise.all([
  mkdir(homeDirectory),
  mkdir(workDirectory),
  mkdir(benchmarkCache),
  mkdir(auxiliaryCache),
  mkdir(registryDirectory, { recursive: true }),
]);
await Promise.all([
  writeFile(join(homeDirectory, ".npmrc"), "", "utf8"),
  writeFile(join(homeDirectory, "global.npmrc"), "", "utf8"),
]);

const benchmarkEnvironment = isolatedEnvironment({
  homeDirectory,
  cacheDirectory: benchmarkCache,
  temporaryDirectory: temporaryRoot,
});
const auxiliaryEnvironment = isolatedEnvironment({
  homeDirectory,
  cacheDirectory: auxiliaryCache,
  temporaryDirectory: temporaryRoot,
});
const credentialEnvironmentKeys = Object.keys(benchmarkEnvironment).filter((name) =>
  /(?:token|password|_auth|username)/i.test(name),
);

let benchmark = {
  exitCode: null,
  signal: null,
  spawnError: "not run",
  timedOut: false,
  stdout: Buffer.alloc(0),
  stderr: Buffer.alloc(0),
  stdoutTruncated: false,
  stderrTruncated: false,
};
let rawDurationMs = null;
let expectedCard = Buffer.alloc(0);
let actualTarballSha1 = null;
let tarballBytes = null;
let cacheKey = null;
let cacheIntegrity = null;
let collectorError = "";
let npmVersion = null;
let npxVersion = null;
let cacheWasEmpty = false;
let temporaryDataRemoved = false;
let checkoutReadOnly = false;
let checkoutCredentialAbsent = false;
let npmConfigsRemainEmpty = false;

try {
  cacheWasEmpty = (await readdir(benchmarkCache)).length === 0;
  if (!cacheWasEmpty) throw new Error("Benchmark cache was not empty before npx execution.");

  const repositoryMode = (await stat(REPOSITORY_ROOT)).mode;
  checkoutReadOnly = (repositoryMode & 0o222) === 0;
  const gitConfig = await readFile(GIT_CONFIG, "utf8");
  checkoutCredentialAbsent = !/extraheader|credential\.helper/i.test(gitConfig);

  const localCard = await runCommand(process.execPath, [LOCAL_CARD], {
    cwd: REPOSITORY_ROOT,
    env: auxiliaryEnvironment,
    timeoutMs: AUXILIARY_TIMEOUT_MS,
  });
  if (localCard.exitCode !== 0 || localCard.timedOut) {
    throw new Error("Unable to render the committed card snapshot before the benchmark.");
  }
  expectedCard = localCard.stdout;

  const start = performance.now();
  benchmark = await runCommand(
    executable("npx"),
    ["--yes", "--cache", benchmarkCache, `--package=${PACKAGE_SPEC}`, "--", "katbose"],
    { cwd: workDirectory, env: benchmarkEnvironment, timeoutMs: BENCHMARK_TIMEOUT_MS },
  );
  rawDurationMs = performance.now() - start;

  const [userConfig, globalConfig] = await Promise.all([
    readFile(join(homeDirectory, ".npmrc")),
    readFile(join(homeDirectory, "global.npmrc")),
  ]);
  npmConfigsRemainEmpty = userConfig.byteLength === 0 && globalConfig.byteLength === 0;
  if (!npmConfigsRemainEmpty) {
    throw new Error("npm modified an isolated configuration file during the benchmark.");
  }

  const timedTarball = await readTimedTarball(benchmarkCache);
  actualTarballSha1 = sha("sha1", timedTarball.body);
  tarballBytes = timedTarball.body.byteLength;
  cacheKey = timedTarball.cacheKey;
  cacheIntegrity = timedTarball.cacheIntegrity;
  await writeFile(join(registryDirectory, TARBALL_FILENAME), timedTarball.body);

  const npmVersionResult = await runCommand(executable("npm"), ["--version"], {
    cwd: workDirectory,
    env: auxiliaryEnvironment,
    timeoutMs: AUXILIARY_TIMEOUT_MS,
  });
  const npxVersionResult = await runCommand(executable("npx"), ["--version"], {
    cwd: workDirectory,
    env: auxiliaryEnvironment,
    timeoutMs: AUXILIARY_TIMEOUT_MS,
  });
  npmVersion = versionFrom(npmVersionResult);
  npxVersion = versionFrom(npxVersionResult);
} catch (error) {
  collectorError = error instanceof Error ? error.message : String(error);
} finally {
  try {
    await rm(temporaryRoot, { recursive: true, force: true });
    temporaryDataRemoved = true;
  } catch (error) {
    const cleanupError = error instanceof Error ? error.message : String(error);
    collectorError = collectorError
      ? `${collectorError}; cleanup failed: ${cleanupError}`
      : cleanupError;
  }
}

const durationMs = rawDurationMs === null ? null : Number(rawDurationMs.toFixed(1));
const stdoutMatched =
  benchmark.exitCode === 0 &&
  !benchmark.stdoutTruncated &&
  expectedCard.byteLength > 0 &&
  benchmark.stdout.equals(expectedCard);
const durationPassed = rawDurationMs !== null && rawDurationMs <= THRESHOLD_MS;
const integrityMatched = actualTarballSha1 === EXPECTED_TARBALL_SHA1;
const credentialIsolationPassed =
  credentialEnvironmentKeys.length === 0 && checkoutCredentialAbsent && npmConfigsRemainEmpty;
const passed =
  !collectorError &&
  cacheWasEmpty &&
  temporaryDataRemoved &&
  checkoutReadOnly &&
  credentialIsolationPassed &&
  benchmark.exitCode === 0 &&
  !benchmark.timedOut &&
  !benchmark.stderrTruncated &&
  stdoutMatched &&
  durationPassed &&
  integrityMatched;

const report = {
  schemaVersion: 1,
  status: "completed",
  attemptedAt,
  package: PACKAGE_SPEC,
  command: `npx --yes --cache <unique-empty-cache> --package=${PACKAGE_SPEC} -- katbose`,
  thresholdMs: THRESHOLD_MS,
  expectedTarballSha1: EXPECTED_TARBALL_SHA1,
  environment: {
    runnerOs: process.env.RUNNER_OS ?? null,
    runnerArch: process.env.RUNNER_ARCH ?? null,
    platform: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
    npm: npmVersion,
    npx: npxVersion,
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    gitRevision: process.env.GITHUB_SHA ?? null,
  },
  isolation: {
    freshRunnerExpected: Boolean(process.env.GITHUB_ACTIONS),
    cacheWasEmpty,
    emptyUserConfig: npmConfigsRemainEmpty,
    emptyGlobalConfig: npmConfigsRemainEmpty,
    credentialEnvironmentKeys,
    checkoutCredentialAbsent,
    checkoutReadOnly,
    temporaryDataRemoved,
  },
  result: {
    durationMs,
    rawDurationMs,
    durationPassed,
    timeoutMs: BENCHMARK_TIMEOUT_MS,
    timedOut: benchmark.timedOut,
    exitCode: benchmark.exitCode,
    signal: benchmark.signal,
    spawnError: benchmark.spawnError || null,
    stdoutBytes: benchmark.stdout.byteLength,
    stdoutSha256: sha("sha256", benchmark.stdout),
    stdoutMatched,
    stdoutTruncated: benchmark.stdoutTruncated,
    stderrBytes: benchmark.stderr.byteLength,
    stderrTruncated: benchmark.stderrTruncated,
  },
  integrity: {
    source: "timed-npx-cache",
    cacheKey,
    cacheIntegrity,
    tarballFilename: actualTarballSha1 ? TARBALL_FILENAME : null,
    tarballBytes,
    actualSha1: actualTarballSha1,
    matched: integrityMatched,
  },
  error: collectorError || null,
  passed: Boolean(passed),
};

await Promise.all([
  writeFile(join(outputDirectory, "stdout.txt"), benchmark.stdout),
  writeFile(join(outputDirectory, "stderr.txt"), benchmark.stderr),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(join(outputDirectory, "report.md"), markdownReport(report), "utf8"),
]);

process.stdout.write(
  `Cold npx benchmark ${report.passed ? "passed" : "failed"}: ${durationMs ?? "not measured"} ms; evidence=${reportPath}\n`,
);
