/**
 * Guards the motion layer against two silent regressions.
 *
 * 1. A token declared in `theme.css` that nothing consumes. `--dur-crossfade`
 *    sat unused while the design catalogue claimed the human/agent crossfade was
 *    implemented, so the specification and the product disagreed with no failing
 *    test anywhere.
 * 2. A JavaScript motion value drifting away from its token. `lib/motion.ts` has
 *    to duplicate a few numbers because `motion` takes props rather than CSS
 *    variables, and the reveal previously used values that no longer matched
 *    `theme.css`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIRRORED_MOTION_TOKENS, ROOT_FONT_SIZE_PX, type MotionTokenUnit } from "@/lib/motion";

const APP_DIR = new URL("../app/", import.meta.url);
const THEME_CSS = readFileSync(new URL("theme.css", APP_DIR), "utf8");
const GLOBALS_CSS = readFileSync(new URL("globals.css", APP_DIR), "utf8");

/**
 * Tokens intentionally declared ahead of a consumer.
 *
 * `--dur-fast` is the documented scale step between `--dur-base` and an instant
 * change (docs/20-design-system.md). It is reserved rather than orphaned, and is
 * listed here so the exemption is visible instead of implied.
 */
const RESERVED_TOKENS: ReadonlySet<string> = new Set(["--dur-fast"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const target = join(directory, name);
    if (statSync(target).isDirectory()) return sourceFiles(target);
    return /\.(css|ts|tsx)$/.test(name) ? [target] : [];
  });
}

/** Every motion-related custom property declared on the theme roots. */
function declaredMotionTokens(): string[] {
  return [...THEME_CSS.matchAll(/^\s*(--(?:dur|delay|reveal)-[a-z-]+)\s*:/gm)].map(
    (match) => match[1] as string,
  );
}

/** Raw declared value of a single token. */
function tokenValue(token: string): string {
  const match = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(THEME_CSS);
  expect(match, `${token} is not declared in theme.css`).not.toBeNull();
  return (match?.[1] ?? "").trim();
}

/** Normalises a declared token value to milliseconds, pixels or a plain ratio. */
function normalizedTokenValue(token: string, unit: MotionTokenUnit): number {
  const raw = tokenValue(token);
  if (unit === "ratio") {
    const value = Number(raw);
    expect(Number.isFinite(value), `${token} is not a plain number: ${raw}`).toBe(true);
    return value;
  }
  const pattern = unit === "time" ? /^([\d.]+)(ms|s)$/ : /^([\d.]+)(px|rem)$/;
  const match = pattern.exec(raw);
  expect(match, `${token} is not a ${unit} value: ${raw}`).not.toBeNull();
  const amount = Number(match?.[1]);
  const suffix = match?.[2];
  if (suffix === "s") return amount * 1000;
  if (suffix === "rem") return amount * ROOT_FONT_SIZE_PX;
  return amount;
}

const consumerSources = ["app", "components", "features", "lib"]
  .flatMap((directory) => sourceFiles(directory))
  .filter((file) => !file.endsWith("theme.css"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

describe("motion tokens", () => {
  it("declares the motion tokens the catalogue relies on", () => {
    expect(declaredMotionTokens()).toEqual(
      expect.arrayContaining([
        "--dur-base",
        "--dur-crossfade",
        "--dur-intro",
        "--dur-count",
        "--dur-reveal",
        "--dur-marquee",
        "--dur-shine",
        "--delay-shine",
        "--reveal-amount",
      ]),
    );
  });

  it("has a consumer for every declared motion token", () => {
    const orphaned = declaredMotionTokens().filter((token) => {
      if (RESERVED_TOKENS.has(token)) return false;
      if (token in MIRRORED_MOTION_TOKENS) return false;
      // Referenced as a CSS `var()`, or read from computed styles in TypeScript.
      return !consumerSources.includes(`var(${token})`) && !consumerSources.includes(`"${token}"`);
    });
    expect(orphaned).toEqual([]);
  });

  it("keeps every mirrored JavaScript constant equal to its token", () => {
    for (const [token, mirrored] of Object.entries(MIRRORED_MOTION_TOKENS)) {
      expect(mirrored.value, `${token} drifted from lib/motion.ts`).toBe(
        normalizedTokenValue(token, mirrored.unit),
      );
    }
  });

  it("applies the crossfade to the mode regions", () => {
    expect(GLOBALS_CSS).toContain("[data-mode-crossfade]");
    expect(GLOBALS_CSS).toContain("var(--dur-crossfade)");
  });

  it("disables the crossfade and panel transitions under reduced motion", () => {
    const reducedMotionCss = GLOBALS_CSS.split("@media (prefers-reduced-motion: reduce)")
      .slice(1)
      .join("\n");
    expect(reducedMotionCss).toContain("[data-mode-crossfade]");
    expect(reducedMotionCss).toContain(".collapsible-panel");
    expect(reducedMotionCss).toContain(".accordion-panel");
  });
});
