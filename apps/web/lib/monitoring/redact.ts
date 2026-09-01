/**
 * Single redaction implementation shared by every telemetry surface.
 *
 * Both PostHog (`sanitize_properties`) and Sentry (`beforeSend`) must strip the
 * same secrets, so the rule lives here once. Two independent copies of a
 * redaction regex is how one of them silently stops matching.
 *
 * The contract is intentionally narrow: rewrite the *value* of a sensitive
 * query parameter and change nothing else. Paths, fragments, ordering and
 * unrelated parameters survive byte-for-byte, which keeps analytics useful.
 */

export const REDACTED_VALUE = "[REDACTED]";

/**
 * Lowercased query-parameter names whose values must never reach a vendor.
 * A Set keeps membership testing O(1) as the list grows.
 */
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set([
  "cf-turnstile-response",
  "email",
  "preview_secret",
  "secret",
  "token",
  "turnstiletoken",
]);

/**
 * Matches one `?key=value` or `&key=value` pair. The value class excludes `#`
 * so a URL fragment is never swallowed into the captured value.
 */
const QUERY_PAIR_PATTERN = /([?&])([^=&#]+)=([^&#]*)/g;

function isSensitiveKey(rawKey: string): boolean {
  let key = rawKey;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    // A malformed escape sequence is not a reason to skip redaction; fall back
    // to the raw key so `%zzsecret` style input is still evaluated.
  }
  return SENSITIVE_QUERY_KEYS.has(key.toLowerCase());
}

/**
 * Replaces every sensitive query value in `value` with {@link REDACTED_VALUE}.
 *
 * Safe on absolute URLs, relative URLs and arbitrary text. Idempotent: the
 * output of `redactUrl` is a fixed point, so repeated sanitisation passes over
 * the same property cannot corrupt it.
 */
export function redactUrl(value: string): string {
  // Cheap bail-out: without a `=` there is no `key=value` pair to rewrite, and
  // this runs on every captured analytics property.
  if (!value.includes("=")) return value;
  return value.replace(QUERY_PAIR_PATTERN, (match, separator: string, key: string) =>
    isSensitiveKey(key) ? `${separator}${key}=${REDACTED_VALUE}` : match,
  );
}

/**
 * Sanitises a mutable analytics property bag in place.
 *
 * PostHog's `sanitize_properties` hook receives the outgoing properties and
 * expects the same object back, so in-place mutation is the contract here
 * rather than a shortcut. Every string value is swept — not just the known
 * `$current_url` family — because a hand-written property can carry a URL too,
 * and {@link redactUrl} only rewrites recognised sensitive keys.
 *
 * Scope is deliberately one level deep. PostHog autocapture and session replay
 * are both disabled, so nested property objects are only ever ones this
 * codebase constructs.
 */
export function sanitizeTelemetryProperties<T extends Record<string, unknown>>(properties: T): T {
  const bag = properties as Record<string, unknown>;
  for (const key of Object.keys(bag)) {
    const value = bag[key];
    if (typeof value === "string") bag[key] = redactUrl(value);
  }
  return properties;
}
