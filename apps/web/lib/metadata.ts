import { SITE_IDENTITY } from "@katbose/shared";
import type { Metadata } from "next";
import { getRoute, type PublicPath } from "./routes";

export function createPageMetadata(path: PublicPath): Metadata {
  const route = getRoute(path);
  const title =
    path === "/"
      ? `${SITE_IDENTITY.name} — ${SITE_IDENTITY.role}`
      : `${route.label} — ${SITE_IDENTITY.name}`;
  const url = `${SITE_IDENTITY.siteUrl}${path}`;
  return {
    title,
    description: route.description,
    alternates: { canonical: path },
    robots: route.indexable ? undefined : { index: false, follow: false },
    openGraph: {
      title,
      description: route.description,
      type: "website",
      url,
      siteName: SITE_IDENTITY.name,
    },
    twitter: { card: "summary_large_image", title, description: route.description },
  };
}
