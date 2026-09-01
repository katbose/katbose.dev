/**
 * Server-side PostHog capture over plain `fetch`.
 *
 * `posthog-node` is deliberately not used. The Worker script already had to
 * drop dynamic Open Graph rendering to stay under the free-plan 3 MiB limit
 * (docs/15 Spike A), so adding an analytics SDK to the server bundle for a
 * single event is the wrong trade. The capture endpoint is a stable public
 * HTTP API and needs no client library.
 *
 * Every caller is responsible for passing non-identifying properties only.
 * `distinctId` must already be pseudonymised.
 */

import { sanitizeTelemetryProperties } from "./redact";

/** Documented ingestion path for a single event. */
const CAPTURE_PATH = "/i/v0/e/";

/** Analytics must never delay or fail a user-visible response. */
const CAPTURE_TIMEOUT_MS = 2_000;

/** Property values that survive JSON transport without ambiguity. */
export type AnalyticsPropertyValue = string | number | boolean;

export interface ServerEvent {
  /** Event name from the catalogue in docs/09-observability.md §9.2. */
  readonly event: string;
  /** Pseudonymous actor identifier. Never a raw IP address or email. */
  readonly distinctId: string;
  /** Non-identifying event context. */
  readonly properties?: Readonly<Record<string, AnalyticsPropertyValue>>;
}

/**
 * Sends one event to PostHog.
 *
 * Resolves without sending when analytics is not configured, so local and CI
 * runs stay silent instead of failing. Rejections propagate to the caller,
 * which is expected to run this off the response path and record the failure.
 */
export async function captureServerEvent({
  event,
  distinctId,
  properties = {},
}: ServerEvent): Promise<void> {
  const apiKey = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
  const host = process.env["NEXT_PUBLIC_POSTHOG_HOST"];
  if (!apiKey || !host) return;

  const endpoint = new URL(CAPTURE_PATH, host);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      distinct_id: distinctId,
      properties: sanitizeTelemetryProperties({ ...properties }),
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`posthog-capture-failed-${response.status}`);
}
