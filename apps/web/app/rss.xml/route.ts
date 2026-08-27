import { SITE_IDENTITY } from "@katbose/shared";
import { SITE_URL } from "@/lib/site-url";
function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(SITE_IDENTITY.name)} Blog</title><link>${SITE_URL}/blog</link><description>Technical writing by ${escapeXml(SITE_IDENTITY.name)}.</description></channel></rss>`;
  return new Response(xml, {
    headers: {
      "cache-control": "public, max-age=1800",
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });
}
