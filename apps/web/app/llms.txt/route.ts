import { generateLlmsText } from "@/lib/agent-outputs";

export function GET() {
  return new Response(generateLlmsText(), {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
