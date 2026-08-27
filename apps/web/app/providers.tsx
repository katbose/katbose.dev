"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { PostHogProvider } from "@/components/analytics/posthog-provider";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <PostHogProvider>{children}</PostHogProvider>
    </ThemeProvider>
  );
}
