import { generateHumansText } from "@/lib/agent-outputs";
export function GET() {
  return new Response(generateHumansText(), {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
