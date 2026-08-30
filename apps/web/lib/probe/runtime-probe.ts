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
 * Reachability is therefore restricted to a loopback authority. Production is
 * served exclusively through the `katbose.dev` custom domain — `workers_dev` and
 * preview URLs are disabled because `routes` is declared in `wrangler.jsonc` —
 * so a request that reaches production presents `katbose.dev` in both the URL
 * and the `Host` header and can never satisfy this check. No environment
 * variable is involved, so there is no way to enable the probes in production by
 * misconfiguration.
 *
 * What the CI preview presents is measured rather than assumed, because the
 * first version of this guard refused its own probes. `opennextjs-cloudflare
 * preview` runs `wrangler dev`, whose origin defaults to "the host of the first
 * route of project" — so declaring the `katbose.dev` custom domain made
 * Miniflare rewrite both `request.url` and `Host` to `katbose.dev` inside the
 * Worker. `wrangler.jsonc` now pins `dev.host` to the loopback address the
 * preview actually serves on; see the comment there.
 */

/** Authorities only a local preview server can present. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * The shape of a `Host` header: `hostname[:port]`, with an IPv6 literal
 * bracketed.
 *
 * Matched against an explicit grammar rather than parsed with `URL`, so that a
 * value carrying userinfo or a path — `evil.example@127.0.0.1`, `127.0.0.1/x` —
 * cannot smuggle a loopback authority past the comparison.
 */
const HOST_HEADER_PATTERN = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d+)?$/;

/** Strips the brackets `URL` puts around an IPv6 hostname. */
function normalizeHostname(hostname: string): string {
  const lowered = hostname.toLowerCase();
  return lowered.startsWith("[") && lowered.endsWith("]") ? lowered.slice(1, -1) : lowered;
}

/** The hostname a `Host` header names, or undefined when it names none. */
function hostnameFromHostHeader(value: string | null): string | undefined {
  if (value === null) return undefined;
  const hostname = HOST_HEADER_PATTERN.exec(value.trim().toLowerCase())?.[1];
  return hostname === undefined ? undefined : normalizeHostname(hostname);
}

function isLoopbackHostname(hostname: string | undefined): boolean {
  return hostname !== undefined && LOOPBACK_HOSTNAMES.has(hostname);
}

/**
 * True only when the request reached the Worker over a loopback authority.
 *
 * Two positions are consulted because they fail differently and neither is
 * reachable from production. `request.url` is authoritative and is read first.
 * Under OpenNext that URL is rebuilt from the incoming `Host` header, and Next
 * substitutes a placeholder authority whenever the rebuild does not happen — a
 * change there would make the probes unreachable again without any test
 * noticing. Reading the header directly is the independent second path that
 * keeps that from happening silently.
 *
 * The two can only disagree when the URL is a placeholder, because in every
 * other case the URL is derived from the header. Neither path can be satisfied
 * from production: Cloudflare routes to this Worker only for the declared custom
 * domain, so the `Host` that arrives is the routed hostname.
 */
export function isRuntimeProbeAllowed(request: Request): boolean {
  try {
    // An unparseable URL is refused outright rather than falling through to the
    // header: a request that malformed is not the CI preview.
    if (isLoopbackHostname(normalizeHostname(new URL(request.url).hostname))) return true;
    return isLoopbackHostname(hostnameFromHostHeader(request.headers.get("host")));
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
