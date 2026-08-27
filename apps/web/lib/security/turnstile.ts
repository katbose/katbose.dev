import { z } from "zod";

const TurnstileResponseSchema = z.object({ success: z.boolean() });

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    return TurnstileResponseSchema.parse(await response.json()).success;
  } catch {
    return false;
  }
}
