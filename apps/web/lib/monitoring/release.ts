/**
 * Deployment release identifier used to tie Sentry events to the exact commit.
 *
 * Without this, an uploaded source map cannot be matched to the bundle that
 * produced a stack trace, so every production error stays minified. The value
 * is resolved at build time and inlined by `next.config.ts` as
 * `NEXT_PUBLIC_RELEASE`, which is why both the browser and the server can read
 * it from the same place.
 */

/** Build environments that expose the deployed commit, in precedence order. */
const RELEASE_ENV_KEYS: readonly string[] = [
  // Inlined by next.config.ts; the only key available in the browser.
  "NEXT_PUBLIC_RELEASE",
  // Cloudflare Workers Builds, which performs the production deploy.
  "WORKERS_CI_COMMIT_SHA",
  // GitHub Actions, used by the quality and e2e workflows.
  "GITHUB_SHA",
];

/**
 * Returns the release identifier, or `undefined` when the build is not running
 * in a known CI environment. `undefined` is deliberate: an invented release
 * would silently orphan every source map.
 */
export function resolveRelease(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  for (const key of RELEASE_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}
