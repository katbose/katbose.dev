import type { ImageLoaderProps } from "next/image";

export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

export function closestImageWidth(requested: number): number {
  return IMAGE_WIDTHS.find((width) => width >= requested) ?? IMAGE_WIDTHS.at(-1)!;
}

export default function cloudflareImageLoader({ src, width }: ImageLoaderProps): string {
  if (!src.startsWith("/media/original/")) return src;
  const safeWidth = closestImageWidth(width);
  const options = `width=${safeWidth},quality=80,fit=scale-down,format=auto,onerror=redirect`;
  return `/cdn-cgi/image/${options}${src}`;
}
