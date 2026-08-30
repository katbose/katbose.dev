"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { sanitizeTelemetryProperties } from "@/lib/monitoring/redact";

type PostHogClient = (typeof import("posthog-js"))["default"];

type WebVitalPayload = Readonly<{
  metric_id: string;
  metric_name: string;
  value: number;
  delta: number;
  rating: string;
  navigation_type: string;
}>;

const DEFERRED_POSTHOG_DELAY_MS = 10_000;
const key = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
const host = process.env["NEXT_PUBLIC_POSTHOG_HOST"];

export function PostHogProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const clientRef = useRef<PostHogClient | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingMetricsRef = useRef<WebVitalPayload[]>([]);
  const pendingPathnameRef = useRef(pathname);

  const loadPostHog = useCallback(() => {
    if (!key || !host || loadPromiseRef.current) return;

    loadPromiseRef.current = import("posthog-js")
      .then(({ default: posthog }) => {
        if (!posthog.__loaded) {
          posthog.init(key, {
            api_host: host,
            persistence: "memory",
            capture_pageview: false,
            disable_session_recording: true,
            // Required by docs/09-observability.md §9.2: no captured property may
            // carry a preview secret or bot token to the vendor.
            sanitize_properties: sanitizeTelemetryProperties,
          });
        }

        clientRef.current = posthog;
        posthog.capture("$pageview", { $current_url: pendingPathnameRef.current });
        for (const metric of pendingMetricsRef.current) posthog.capture("web_vital", metric);
        pendingMetricsRef.current = [];
      })
      .catch(() => {
        // Analytics must never make the product unavailable.
      });
  }, []);

  useEffect(() => {
    if (!key || !host) return;

    const start = () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      loadPostHog();
    };
    const fallbackTimer = window.setTimeout(start, DEFERRED_POSTHOG_DELAY_MS);
    window.addEventListener("pointerdown", start, { once: true, passive: true });
    window.addEventListener("keydown", start, { once: true });

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [loadPostHog]);

  useReportWebVitals((metric) => {
    if (!key || !host) return;
    const payload: WebVitalPayload = {
      metric_id: metric.id,
      metric_name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigation_type: metric.navigationType,
    };
    const client = clientRef.current;
    if (client) client.capture("web_vital", payload);
    else pendingMetricsRef.current.push(payload);
  });

  useEffect(() => {
    pendingPathnameRef.current = pathname;
    const client = clientRef.current;
    if (client) client.capture("$pageview", { $current_url: pathname });
  }, [pathname]);

  return children;
}
