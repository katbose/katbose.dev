/**
 * Motion constants that cannot be expressed as a CSS `var()`.
 *
 * The design tokens in `app/theme.css` are the specification. Three places need
 * the same numbers in JavaScript instead:
 *
 * - the scroll reveal is driven by `motion`, which takes numeric props rather
 *   than CSS custom properties;
 * - the mode crossfade has to know when to remove its attribute;
 * - the intro loader needs a cleanup fallback after its CSS sequence ends.
 *
 * Reading the tokens from `getComputedStyle` during render is not an option for
 * the reveal — the component also renders on the server, and diverging values
 * would produce a hydration mismatch. So these numbers mirror the tokens on
 * purpose, and {@link MIRRORED_MOTION_TOKENS} declares each pairing so
 * `tests/motion-tokens.test.ts` can fail the build if either side drifts.
 */

/** Root font size the rem-based tokens are expressed against. */
export const ROOT_FONT_SIZE_PX = 16;

/**
 * Scroll-reveal motion, mirroring `--dur-reveal`, `--reveal-shift`,
 * `--reveal-scale`, `--reveal-blur` and `--reveal-amount`.
 */
export const REVEAL_MOTION = {
  durationMs: 950,
  shiftPx: 32,
  scale: 0.985,
  blurPx: 12,
  viewportAmount: 0.15,
} as const;

/** Mirrors `--ease-out`, as the cubic-bezier control points `motion` expects. */
export const EASE_OUT: readonly [number, number, number, number] = [0.2, 0, 0, 1];

/** Mirrors `--dur-crossfade`. */
export const CROSSFADE_DURATION_MS = 350;

/** Mirrors `--dur-intro`, including the greeting cycle and overlay exit. */
export const INTRO_DURATION_MS = 1000;

/** How a token's declared value should be interpreted when comparing. */
export type MotionTokenUnit = "time" | "length" | "ratio";

export interface MirroredMotionToken {
  /** The JavaScript value used at runtime. */
  readonly value: number;
  /** How to normalise the CSS declaration before comparing. */
  readonly unit: MotionTokenUnit;
}

/**
 * Every CSS motion token that a JavaScript constant duplicates.
 *
 * This is the contract the token test walks: a token listed here must exist in
 * `theme.css` with an equal value, and listing it is what marks the token as
 * consumed even though no stylesheet references it with `var()`.
 */
export const MIRRORED_MOTION_TOKENS: Readonly<Record<string, MirroredMotionToken>> = {
  "--dur-crossfade": { value: CROSSFADE_DURATION_MS, unit: "time" },
  "--dur-intro": { value: INTRO_DURATION_MS, unit: "time" },
  "--dur-reveal": { value: REVEAL_MOTION.durationMs, unit: "time" },
  "--reveal-shift": { value: REVEAL_MOTION.shiftPx, unit: "length" },
  "--reveal-blur": { value: REVEAL_MOTION.blurPx, unit: "length" },
  "--reveal-scale": { value: REVEAL_MOTION.scale, unit: "ratio" },
  "--reveal-amount": { value: REVEAL_MOTION.viewportAmount, unit: "ratio" },
};
