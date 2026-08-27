import { SITE_IDENTITY } from "@katbose/shared";
import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/routes";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.filter((route) => route.indexable).map((route) => ({
    url: `${SITE_IDENTITY.siteUrl}${route.path}`,
    changeFrequency: route.path === "/" ? "weekly" : "monthly",
    priority: route.path === "/" ? 1 : 0.5,
  }));
}
