#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EXPECTED_TARBALL_SHA1, PACKAGE_SPEC, THRESHOLD_MS } from "./npx-cold-contract.mjs";

if (process.argv.length !== 3) {
  throw new Error("Usage: node scripts/benchmarks/assert-npx-cold-benchmark.mjs <report.json>");
}

const report = JSON.parse(await readFile(resolve(process.argv[2]), "utf8"));
const shapeMatches =
  report.schemaVersion === 1 &&
  report.status === "completed" &&
  report.package === PACKAGE_SPEC &&
  report.thresholdMs === THRESHOLD_MS &&
  report.expectedTarballSha1 === EXPECTED_TARBALL_SHA1;

if (!shapeMatches || report.passed !== true) {
  process.stderr.write(
    `Cold npx gate failed: package=${report.package ?? "unknown"} duration=${report.result?.durationMs ?? "not measured"}ms output-match=${report.result?.stdoutMatched ?? false} sha1-match=${report.integrity?.matched ?? false} collector-error=${report.error ?? "none"}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Cold npx gate passed for ${PACKAGE_SPEC} in ${report.result.durationMs} ms with registry SHA-1 ${report.integrity.actualSha1}.\n`,
  );
}
