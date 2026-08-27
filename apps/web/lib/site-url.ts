import { SITE_IDENTITY } from "@katbose/shared";

/**
 * The one origin every absolute URL in the app is built from: canonicals,
 * `metadataBase`, the sitemap, robots, JSON-LD, RSS, /agent and /llms.txt.
 *
 * `SITE_IDENTITY.siteUrl` is the default rather than the only value because
 * packages/shared is also what the offline `npx katbose` card snapshots, and
 * that card has no runtime and cannot read environment variables. So the
 * constant has to keep working standalone.
 *
 * `NEXT_PUBLIC_SITE_URL` overrides it so a fork or a staging build advertises
 * its own origin. Without the override the only way to change origin is a code
 * edit, which is why the variable existed in the documented inventory while
 * nothing read it — this module is what makes it load-bearing.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this resolves once per build and
 * never per request.
 */
function resolveSiteUrl(): string {
  const configured = process.env["NEXT_PUBLIC_SITE_URL"]?.trim();
  if (!configured) {
    return SITE_IDENTITY.siteUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    // Fail the build rather than emit relative-looking canonicals: a bad value
    // here would tell search engines the wrong home for every page.
    throw new Error(`NEXT_PUBLIC_SITE_URL must be an absolute URL, received "${configured}".`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL must use https, received "${parsed.protocol}" in "${configured}".`,
    );
  }

  // Normalised to the bare origin because every caller appends a path that
  // already starts with "/". A trailing slash would yield "https://host//agent"
  // in canonicals and the sitemap, which search engines treat as a distinct URL.
  return parsed.origin;
}

export const SITE_URL = resolveSiteUrl();
