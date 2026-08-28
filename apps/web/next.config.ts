import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { join } from "node:path";

/** Returns the origin of an absolute URL, or null when it is unset or invalid. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const posthogOrigin = originOf(process.env["NEXT_PUBLIC_POSTHOG_HOST"]);
// A Sentry DSN is `https://<key>@<ingest-host>/<project>`, so its origin is the
// exact host the browser SDK posts to. Deriving it keeps connect-src as tight
// as possible instead of allowing every Sentry domain.
const sentryOrigin = originOf(process.env["NEXT_PUBLIC_SENTRY_DSN"]);

const connectSources = ["'self'", posthogOrigin, sentryOrigin].filter(
  (source): source is string => source !== null,
);

/**
 * Commit that produced this build. Inlined below so the browser bundle and the
 * server runtime report the same Sentry release and share one source map.
 */
const release = process.env["WORKERS_CI_COMMIT_SHA"] ?? process.env["GITHUB_SHA"];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src ${connectSources.join(" ")}`,
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src https://challenges.cloudflare.com",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: join(process.cwd(), "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  ...(release ? { env: { NEXT_PUBLIC_RELEASE: release } } : {}),
  images: {
    loader: "custom",
    loaderFile: "./lib/media/image-loader.ts",
  },
  transpilePackages: ["@katbose/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

/**
 * Source-map upload and release association are only wired when all three build
 * credentials are present. Without the wrapper the build stays byte-identical
 * to an unconfigured build, so CI and local runs never depend on Sentry being
 * reachable — but a production build that has the credentials produces
 * de-minified stack traces.
 */
const sentryBuildCredentials = {
  authToken: process.env["SENTRY_AUTH_TOKEN"],
  org: process.env["SENTRY_ORG"],
  project: process.env["SENTRY_PROJECT"],
};

const config: NextConfig =
  sentryBuildCredentials.authToken && sentryBuildCredentials.org && sentryBuildCredentials.project
    ? withSentryConfig(nextConfig, {
        authToken: sentryBuildCredentials.authToken,
        org: sentryBuildCredentials.org,
        project: sentryBuildCredentials.project,
        ...(release ? { release: { name: release } } : {}),
        // Client chunks are served from Cloudflare assets, so uploading the
        // wider set is what actually resolves browser frames.
        widenClientFileUpload: true,
        // Source maps are uploaded to Sentry, never published beside the bundle.
        sourcemaps: { deleteSourcemapsAfterUpload: true },
        // Telemetry tooling must never break a production deploy. An upload
        // failure degrades stack traces to minified; it does not stop the
        // release. Without this handler the plugin fails the build instead.
        errorHandler: (error) => {
          process.stderr.write(`Sentry source-map upload failed: ${error.message}\n`);
        },
        disableLogger: true,
        silent: true,
      })
    : nextConfig;

export default config;

initOpenNextCloudflareForDev();
