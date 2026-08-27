import type { MetadataRoute } from "next";
import { ROBOTS_RULES } from "@/lib/agent-outputs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: ROBOTS_RULES.map((rule) => ({
      userAgent: rule.userAgent,
      allow: rule.allow,
      disallow: "disallow" in rule ? [...rule.disallow] : undefined,
    })),
    sitemap: "https://katbose.dev/sitemap.xml",
  };
}
