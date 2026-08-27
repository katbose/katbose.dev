import { generateRobotsText } from "@/lib/agent-outputs";

// A route handler rather than Next's `app/robots.ts` convention for two reasons:
// MetadataRoute.Robots cannot express the `Content-Signal` directive, and the
// convention meant the served file and the committed root robots.txt came from
// two different generators that agreed only by coincidence. Now both render
// generateRobotsText(), and tests/agent-output-parity.test.ts locks them together.
export function GET() {
  return new Response(generateRobotsText(), {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
