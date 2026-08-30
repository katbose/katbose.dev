/**
 * Shared reader for the reduced-motion contracts that live in `globals.css`.
 *
 * Several catalogue behaviours (docs/19-design-reference.md §19.3) are suppressed
 * by a stylesheet rule rather than by a component, because CSS applies on the
 * first paint with no script involved. The browser specs assert the resulting
 * computed styles, but they only run in the Playwright job. Reading the
 * stylesheet here lets the same contracts fail during `pnpm test`.
 *
 * Brace matching is why this is shared rather than inlined per test: a
 * reduced-motion block contains nested rules, so it cannot be extracted with one
 * regular expression, and two copies of that walk is one copy too many.
 */

import { readFileSync } from "node:fs";

export const GLOBALS_CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** A `prefers-reduced-motion: reduce` block located in the stylesheet source. */
export interface ReducedMotionBlock {
  /** Offset of the `@media` at-rule itself, for source-order comparisons. */
  readonly start: number;
  /** Everything between the block's braces. */
  readonly body: string;
}

/** Stylesheet with comments removed, so brace matching cannot be misled by prose. */
export function withoutComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

/** Every `prefers-reduced-motion: reduce` block in the stylesheet, in source order. */
export function reducedMotionBlocks(css: string): ReducedMotionBlock[] {
  const blocks: ReducedMotionBlock[] = [];
  const opener = /@media \(prefers-reduced-motion: reduce\) \{/g;
  for (let match = opener.exec(css); match !== null; match = opener.exec(css)) {
    const start = match.index + match[0].length;
    let index = start;
    let depth = 1;
    while (depth > 0 && index < css.length) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push({ start: match.index, body: css.slice(start, index - 1) });
  }
  return blocks;
}

/** Escapes a CSS selector so it can be matched literally inside a rule pattern. */
export function selectorPattern(selector: string): string {
  return selector.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/**
 * Declarations every reduced-motion block applies to one exact selector.
 *
 * A rule whose selector merely contains the given one — `.marquee .reveal`, say —
 * is deliberately not matched, because a contract about an element is not
 * satisfied by a rule that only applies in one context.
 */
export function reducedMotionDeclarations(selector: string, css = GLOBALS_CSS): string {
  const pattern = new RegExp(
    String.raw`(?:^|[,{}\s])${selectorPattern(selector)}\s*\{([^}]*)\}`,
    "g",
  );
  return reducedMotionBlocks(withoutComments(css))
    .flatMap((block) => [...block.body.matchAll(pattern)])
    .map((match) => match[1] ?? "")
    .join("\n");
}
