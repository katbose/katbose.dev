import { describe, expect, it } from "vitest";
import cloudflareImageLoader, { closestImageWidth } from "./image-loader";

describe("Cloudflare image loader", () => {
  it("bounds requested widths", () => {
    expect(closestImageWidth(500)).toBe(640);
    expect(closestImageWidth(2400)).toBe(1920);
  });
  it("uses same-zone transforms and redirect fallback", () => {
    expect(
      cloudflareImageLoader({ src: "/media/original/id/photo.webp", width: 500, quality: 80 }),
    ).toBe(
      "/cdn-cgi/image/width=640,quality=80,fit=scale-down,format=auto,onerror=redirect/media/original/id/photo.webp",
    );
  });
  it("leaves bundled assets on the Worker asset path", () => {
    expect(cloudflareImageLoader({ src: "/profile-fallback.svg", width: 96, quality: 80 })).toBe(
      "/profile-fallback.svg",
    );
  });
});
