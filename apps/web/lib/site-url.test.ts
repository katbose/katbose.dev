import { SITE_IDENTITY } from "@katbose/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

// SITE_URL is resolved once at module load, mirroring how NEXT_PUBLIC_* is
// inlined at build time. So each case has to re-import the module rather than
// mutate a live value.
async function loadSiteUrl(value?: string) {
  vi.resetModules();
  if (value === undefined) {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
  }
  return (await import("./site-url")).SITE_URL;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("SITE_URL", () => {
  it("falls back to the canonical identity when unset", async () => {
    await expect(loadSiteUrl()).resolves.toBe(SITE_IDENTITY.siteUrl);
  });

  it("honours a configured origin", async () => {
    await expect(loadSiteUrl("https://staging.katbose.dev")).resolves.toBe(
      "https://staging.katbose.dev",
    );
  });

  it("normalises a trailing slash away so paths do not double up", async () => {
    const url = await loadSiteUrl("https://staging.katbose.dev/");
    expect(url).toBe("https://staging.katbose.dev");
    expect(`${url}/agent`).toBe("https://staging.katbose.dev/agent");
  });

  it("rejects a non-absolute value instead of emitting a broken canonical", async () => {
    await expect(loadSiteUrl("katbose.dev")).rejects.toThrow(/must be an absolute URL/);
  });

  it("rejects plain http", async () => {
    await expect(loadSiteUrl("http://katbose.dev")).rejects.toThrow(/must use https/);
  });
});

describe("derived outputs", () => {
  it("serves /robots.txt with a sitemap derived from SITE_URL, not a hardcoded host", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.katbose.dev");
    const { GET } = await import("../app/robots.txt/route");
    const body = await GET().text();
    expect(body).toContain("Sitemap: https://staging.katbose.dev/sitemap.xml");
    expect(body).not.toContain("https://katbose.dev/sitemap.xml");
  });

  it("builds agent-facing links from SITE_URL", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.katbose.dev");
    const { generateLlmsText, generateRobotsText } = await import("./agent-outputs");
    expect(generateLlmsText()).toContain("https://staging.katbose.dev/");
    expect(generateLlmsText()).not.toContain("https://katbose.dev/");
    expect(generateRobotsText()).toContain("Sitemap: https://staging.katbose.dev/sitemap.xml");
  });
});
