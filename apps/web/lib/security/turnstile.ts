import { z } from "zod";
import { SITE_URL } from "../site-url";

const TURNSTILE_ACTION = "contact";
const MAX_TOKEN_LENGTH = 2048;
const EXPECTED_HOSTNAME = new URL(SITE_URL).hostname;

const TurnstileResponseSchema = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret || token.trim().length === 0 || token.length > MAX_TOKEN_LENGTH) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;

    const parsed = TurnstileResponseSchema.safeParse(await response.json());
    return (
      parsed.success &&
      parsed.data.success &&
      parsed.data.action === TURNSTILE_ACTION &&
      parsed.data.hostname === EXPECTED_HOSTNAME
    );
  } catch {
    return false;
  }
}
