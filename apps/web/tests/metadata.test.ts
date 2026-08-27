import { describe, expect, it } from "vitest";
import { createPageMetadata, OG_IMAGE } from "@/lib/metadata";
import { PUBLIC_ROUTES } from "@/lib/routes";

describe("page metadata", () => {
  it("advertises the Open Graph image on every public route", () => {
    // Regression guard. Next's opengraph-image file convention does not merge
    // an implicit image when a page sets `openGraph` itself, so for a long time
    // no page emitted og:image at all and social shares had no preview.
    for (const route of PUBLIC_ROUTES) {
      const meta = createPageMetadata(route.path);
      expect(meta.openGraph?.images, `${route.path} openGraph.images`).toEqual([OG_IMAGE]);
      expect(meta.twitter, `${route.path} twitter.images`).toMatchObject({
        images: [OG_IMAGE.url],
      });
    }
  });

  it("points at a committed static asset, not a generated route", () => {
    // The dynamic ImageResponse route was removed because @vercel/og's WASM
    // pushed the Worker past the 3 MiB free-plan script limit.
    expect(OG_IMAGE.url).toBe("/opengraph-image.png");
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
  });

  it("keeps non-indexable routes out of search results", () => {
    const hidden = PUBLIC_ROUTES.filter((route) => !route.indexable);
    expect(hidden.length).toBeGreaterThan(0);
    for (const route of hidden) {
      expect(createPageMetadata(route.path).robots, route.path).toMatchObject({
        index: false,
        follow: false,
      });
    }
  });
});
