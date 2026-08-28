/**
 * Access guard for the Workers-runtime probe endpoints.
 *
 * The Spike A contract has to be proven by committed tests rather than a
 * throwaway scaffold, which means the probes ship inside the application. Two
 * of them must never be publicly reachable:
 *
 * - the Draft Mode probe sets `__prerender_bypass`, which opts the caller out of
 *   the ISR cache and, once Phase 2 lands, would expose unpublished content;
 * - the comparison probe is an unnecessary oracle.
 *
 * Reachability is therefore restricted to a loopback host. Production is served
 * exclusively through the `katbose.dev` custom domain — `workers_dev` and
 * preview URLs are disabled because `routes` is declared in `wrangler.jsonc` —
 * so no production request can satisfy this check, while the CI Workers preview
 * on 127.0.0.1 can. This needs no environment variable, so there is no way to
 * enable it in production by misconfiguration.
 */

/** Hosts that identify the local Workers preview server. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "localhost"]);

/** Strips the brackets `URL` puts around an IPv6 hostname. */
function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** True only when the request reached the Worker over a loopback host. */
export function isRuntimeProbeAllowed(request: Request): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(normalizeHostname(new URL(request.url).hostname));
  } catch {
    return false;
  }
}

/** Headers applied to every probe response so none can be indexed. */
export const PROBE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

/**
 * Response for a probe request that is not permitted.
 *
 * A 404 rather than a 403: outside the preview environment these endpoints
 * should be indistinguishable from routes that do not exist.
 */
export function probeUnavailable(): Response {
  return new Response(null, { status: 404, headers: PROBE_HEADERS });
}
