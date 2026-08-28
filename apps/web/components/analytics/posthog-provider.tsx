"use client";

import posthog from "posthog-js";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, type ReactNode } from "react";
import { sanitizeTelemetryProperties } from "@/lib/monitoring/redact";

export function PostHogProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  useEffect(() => {
    const key = process.env["NEXT_PUBLIC_POSTHOG_KEY"];
    const host = process.env["NEXT_PUBLIC_POSTHOG_HOST"];
    if (!key || !host) return;
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
  }, []);
  useReportWebVitals((metric) => {
    if (!posthog.__loaded) return;
    posthog.capture("web_vital", {
      metric_id: metric.id,
      metric_name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigation_type: metric.navigationType,
    });
  });
  useEffect(() => {
    if (posthog.__loaded) posthog.capture("$pageview", { $current_url: pathname });
  }, [pathname]);
  return children;
}
