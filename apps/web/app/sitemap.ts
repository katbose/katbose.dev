import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/routes";
import { SITE_URL } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.filter((route) => route.indexable).map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.path === "/" ? "weekly" : "monthly",
    priority: route.path === "/" ? 1 : 0.5,
  }));
}
