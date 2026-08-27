"use client";

import posthog from "posthog-js";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, type ReactNode } from "react";

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
