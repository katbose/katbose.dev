import { NextResponse } from "next/server";

const SAFE_KEY = /^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/;

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const objectKey = key.join("/");
  const supabaseUrl = process.env["SUPABASE_URL"];
  if (!supabaseUrl || !SAFE_KEY.test(objectKey)) return new NextResponse(null, { status: 404 });
  const encodedKey = key.map(encodeURIComponent).join("/");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/public/media/${encodedKey}`, {
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg" },
  });
  if (!response.ok || !response.body) return new NextResponse(null, { status: 404 });
  return new NextResponse(response.body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    },
  });
}
