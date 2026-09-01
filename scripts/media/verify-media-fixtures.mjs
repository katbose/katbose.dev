#!/usr/bin/env node

import { loadAndVerifyFixtures } from "./media-fixtures.mjs";

try {
  const { fixtures } = await loadAndVerifyFixtures();
  for (const { descriptor, decoded } of Object.values(fixtures)) {
    process.stdout.write(
      `verified ${descriptor.objectKey}: ${decoded.format} ${decoded.width}x${decoded.height}, ${descriptor.bytes} bytes, sha256=${descriptor.sha256}\n`,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
