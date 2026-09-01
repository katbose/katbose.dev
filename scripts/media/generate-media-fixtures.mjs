#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUTPUT_DIRECTORY = fileURLToPath(new URL("./fixtures/", import.meta.url));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const DEFINITIONS = Object.freeze({
  supported: Object.freeze({
    file: "supported-1024.png",
    objectKey: "phase-1-gate/supported-1024-v1.png",
    width: 1024,
    height: 1024,
    seed: 17,
  }),
  forcedFallback: Object.freeze({
    file: "over-limit-12001x16.png",
    objectKey: "phase-1-gate/over-limit-12001x16-v1.png",
    width: 12_001,
    height: 16,
    seed: 43,
  }),
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.byteLength);
  return chunk;
}

function createPng({ width, height, seed }) {
  const rowBytes = 1 + width * 3;
  const pixels = Buffer.allocUnsafe(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowBytes;
    pixels[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3;
      const alternate = ((x >>> 6) + (y >>> 4) + seed) % 2 === 0;
      pixels[pixelOffset] = alternate ? (seed * 5 + y) % 256 : (seed * 3 + x) % 256;
      pixels[pixelOffset + 1] = alternate ? (seed * 7 + x) % 256 : (seed * 11 + y) % 256;
      pixels[pixelOffset + 2] = (seed * 13 + x + y) % 256;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const manifestFixtures = {};

for (const [role, definition] of Object.entries(DEFINITIONS)) {
  const body = createPng(definition);
  await writeFile(new URL(`./fixtures/${definition.file}`, import.meta.url), body);
  manifestFixtures[role] = {
    file: definition.file,
    objectKey: definition.objectKey,
    mimeType: "image/png",
    width: definition.width,
    height: definition.height,
    bytes: body.byteLength,
    sha256: sha256(body),
  };
}

const manifest = `${JSON.stringify({ version: 1, fixtures: manifestFixtures }, null, 2)}\n`;
await writeFile(new URL("./fixtures/manifest.json", import.meta.url), manifest, "utf8");

for (const fixture of Object.values(manifestFixtures)) {
  process.stdout.write(
    `generated ${fixture.file}: ${fixture.width}x${fixture.height}, ${fixture.bytes} bytes, sha256=${fixture.sha256}\n`,
  );
}
