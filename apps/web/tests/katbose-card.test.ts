import { readFileSync } from "node:fs";
import { SITE_IDENTITY } from "@katbose/shared";
import { describe, expect, it } from "vitest";

const cardUrl = new URL("../../../packages/katbose-card/src/index.js", import.meta.url);
const manifestUrl = new URL("../../../packages/katbose-card/package.json", import.meta.url);

const card = readFileSync(cardUrl, "utf8");
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {
  name: string;
  version: string;
  bin: Record<string, string>;
  files: string[];
  author: string;
  homepage: string;
  repository: { url: string };
  dependencies?: Record<string, string>;
};

describe("npx katbose card", () => {
  it("prints identity values that match the shared site identity", () => {
    // The card is a build-time snapshot with zero runtime dependencies
    // (19-design-reference.md 19.4.2), so these values are literals rather than
    // imports. This test is what stops them drifting from SITE_IDENTITY.
    for (const value of [
      SITE_IDENTITY.siteUrl,
      SITE_IDENTITY.email,
      SITE_IDENTITY.githubUrl,
      SITE_IDENTITY.linkedInUrl,
      SITE_IDENTITY.name,
      SITE_IDENTITY.role,
    ]) {
      expect(card).toContain(value);
    }
  });

  it("keeps package metadata consistent with the canonical identity", () => {
    expect(manifest.name).toBe("katbose");
    expect(manifest.author).toContain(SITE_IDENTITY.email);
    expect(manifest.homepage).toBe(SITE_IDENTITY.siteUrl);
    expect(manifest.repository.url).toContain("github.com/katbose/katbose.dev");
  });

  it("stays an executable, dependency-free, whitelisted package", () => {
    expect(card.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(manifest.bin["katbose"]).toBe("src/index.js");
    expect(manifest.files).toEqual(["src/index.js"]);
    expect(manifest.dependencies).toBeUndefined();
  });

  it("makes no runtime network or filesystem call", () => {
    expect(card).not.toMatch(/\bfetch\s*\(|node:https?|require\s*\(|node:fs\b/);
  });

  it("stays inside the 15 kB package budget", () => {
    expect(Buffer.byteLength(card, "utf8")).toBeLessThan(15 * 1024);
  });
});
