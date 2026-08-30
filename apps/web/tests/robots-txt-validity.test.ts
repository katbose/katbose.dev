import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateRobotsText } from "@/lib/agent-outputs";

/**
 * The Lighthouse `robots-txt` audit is excluded from the blocking SEO gate
 * (`lighthouserc.json`, decision #102) because its directive safelist predates
 * the Content Signals Policy and scores `Content-Signal` as an unknown
 * directive. This file is the replacement control: it applies the same
 * validation rules to `generateRobotsText()` on every `pnpm test`, with
 * `content-signal` added to the vocabulary and nothing else relaxed.
 */

/** Lighthouse 12's safelist, reproduced verbatim so drift is visible. */
const LIGHTHOUSE_DIRECTIVES = [
  "user-agent",
  "disallow",
  "allow",
  "sitemap",
  "crawl-delay",
  "clean-param",
  "host",
  "request-rate",
  "visit-time",
  "noindex",
] as const;

/**
 * `Content-Signal` is an RFC 9309 extension: crawlers must ignore directives
 * they do not recognise, so an unrecognised name is not malformed syntax.
 * Cloudflare documents that validators report it as unrecognised with no
 * observed effect on crawling or ranking.
 */
const EXTENSION_DIRECTIVES = ["content-signal"] as const;

const RECOGNISED_DIRECTIVES: ReadonlySet<string> = new Set([
  ...LIGHTHOUSE_DIRECTIVES,
  ...EXTENSION_DIRECTIVES,
]);

const GROUP_MEMBER_DIRECTIVES: ReadonlySet<string> = new Set(["allow", "disallow"]);
const SITEMAP_PROTOCOLS: ReadonlySet<string> = new Set(["https:", "http:", "ftp:"]);

interface RobotsError {
  readonly line: number;
  readonly content: string;
  readonly message: string;
}

/** Mirrors `lighthouse/core/audits/seo/robots-txt.js` line validation. */
function validateRobotsText(content: string): RobotsError[] {
  const errors: RobotsError[] = [];
  let inGroup = false;

  content.split(/\r\n|\r|\n/).forEach((rawLine, index) => {
    const hashIndex = rawLine.indexOf("#");
    const line = (hashIndex === -1 ? rawLine : rawLine.slice(0, hashIndex)).trim();
    if (line.length === 0) return;

    const fail = (message: string) => errors.push({ line: index + 1, content: line, message });

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      fail("Syntax not understood");
      return;
    }

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (!RECOGNISED_DIRECTIVES.has(directive)) {
      fail("Unknown directive");
      return;
    }

    if (directive === "sitemap") {
      let sitemapUrl: URL;
      try {
        sitemapUrl = new URL(value);
      } catch {
        fail("Invalid sitemap URL");
        return;
      }
      if (!SITEMAP_PROTOCOLS.has(sitemapUrl.protocol)) fail("Invalid sitemap URL protocol");
    }

    if (directive === "user-agent") {
      if (!value) fail("No user-agent specified");
      inGroup = true;
      return;
    }

    if (GROUP_MEMBER_DIRECTIVES.has(directive)) {
      if (!inGroup) fail("No user-agent specified");
      if (value !== "" && !value.startsWith("/") && !value.startsWith("*")) {
        fail('Pattern should either be empty, start with "/" or "*"');
      }
      const dollarIndex = value.indexOf("$");
      if (dollarIndex !== -1 && dollarIndex !== value.length - 1) {
        fail('"$" should only be used at the end of the pattern');
      }
    }
  });

  return errors;
}

function directiveNamesIn(content: string): string[] {
  return content
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const hashIndex = line.indexOf("#");
      return (hashIndex === -1 ? line : line.slice(0, hashIndex)).trim();
    })
    .filter((line) => line.includes(":"))
    .map((line) => line.slice(0, line.indexOf(":")).trim().toLowerCase());
}

interface LighthouseGateConfig {
  readonly ci: {
    readonly collect: { readonly settings: { readonly skipAudits?: readonly string[] } };
    readonly assert: { readonly assertions: Readonly<Record<string, unknown>> };
  };
}

function readGateConfig(): LighthouseGateConfig {
  const raw = readFileSync(new URL("../../../lighthouserc.json", import.meta.url), "utf8");
  return JSON.parse(raw) as LighthouseGateConfig;
}

describe("served robots.txt", () => {
  it("is valid under every rule the Lighthouse audit applies", () => {
    expect(validateRobotsText(generateRobotsText())).toEqual([]);
  });

  it("emits no unrecognised directive beyond the declared extension", () => {
    const unrecognised = directiveNamesIn(generateRobotsText()).filter(
      (directive) => !LIGHTHOUSE_DIRECTIVES.includes(directive as never),
    );
    // Any other name here means the Lighthouse exclusion no longer covers only
    // the extension it was justified by, so the gate would need revisiting.
    expect([...new Set(unrecognised)]).toEqual(["content-signal"]);
  });

  it("reports the malformed lines the audit would report", () => {
    const errors = validateRobotsText(
      [
        "User-Agent:",
        "Disallow: api/",
        "Allow: /a$b",
        "Sitemap: not-a-url",
        "Sitemap: ftps://katbose.dev/sitemap.xml",
        "Totally-Made-Up: 1",
        "no colon here",
      ].join("\n"),
    );
    expect(errors.map((error) => error.message)).toEqual([
      "No user-agent specified",
      'Pattern should either be empty, start with "/" or "*"',
      '"$" should only be used at the end of the pattern',
      "Invalid sitemap URL",
      "Invalid sitemap URL protocol",
      "Unknown directive",
      "Syntax not understood",
    ]);
  });

  it("still reports a group member that precedes any user-agent", () => {
    expect(validateRobotsText("Disallow: /\nUser-Agent: *")).toEqual([
      { line: 1, content: "Disallow: /", message: "No user-agent specified" },
    ]);
  });
});

describe("Lighthouse gate configuration", () => {
  it("excludes only the audit this file replaces", () => {
    expect(readGateConfig().ci.collect.settings.skipAudits).toEqual(["robots-txt"]);
  });

  it("keeps the Phase 1 category thresholds at 95", () => {
    const { assertions } = readGateConfig().ci.assert;
    for (const category of ["performance", "accessibility", "seo"]) {
      expect(assertions[`categories:${category}`]).toEqual(["error", { minScore: 0.95 }]);
    }
  });
});
