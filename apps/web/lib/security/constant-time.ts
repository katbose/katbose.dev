/**
 * Constant-time string comparison for secret material.
 *
 * `===` on a secret leaks its contents through response timing: it returns at
 * the first differing byte, so an attacker can recover a token one character at
 * a time. Every shared-secret check in this codebase must route through here.
 *
 * This also pins a Workers-runtime capability. `node:crypto` is only available
 * because `nodejs_compat` is enabled in `wrangler.jsonc`, so the Spike A probe
 * exercises this function inside `workerd` rather than trusting that a Node
 * built-in happens to be polyfilled.
 */

import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

/**
 * Returns true when both strings are byte-identical.
 *
 * Length is compared first, in ordinary short-circuiting fashion, because
 * `timingSafeEqual` throws on mismatched lengths. That is deliberate and safe:
 * every secret compared here has a length fixed by its own generation rule, so
 * the length carries no information an attacker does not already have. The
 * byte comparison itself — the part that would leak the secret's contents — is
 * constant time.
 */
export function constantTimeEquals(expected: string, provided: string): boolean {
  const expectedBytes = encoder.encode(expected);
  const providedBytes = encoder.encode(provided);
  if (expectedBytes.byteLength !== providedBytes.byteLength) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}
