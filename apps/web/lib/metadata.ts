import { SITE_IDENTITY } from "@katbose/shared";
import type { Metadata } from "next";
import { getRoute, type PublicPath } from "./routes";
import { SITE_URL } from "./site-url";

// Referenced explicitly rather than relying on Next's opengraph-image file
// convention: because every page sets `openGraph` here, the convention's
// implicit image was never merged and no page ever emitted og:image. Resolved
// against `metadataBase` in app/layout.tsx.
export const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: `${SITE_IDENTITY.name} — ${SITE_IDENTITY.role}`,
} as const;

export function createPageMetadata(path: PublicPath): Metadata {
  const route = getRoute(path);
  const title =
    path === "/"
      ? `${SITE_IDENTITY.name} — ${SITE_IDENTITY.role}`
      : `${route.label} — ${SITE_IDENTITY.name}`;
  const url = `${SITE_URL}${path}`;
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
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: route.description,
      images: [OG_IMAGE.url],
    },
  };
}
