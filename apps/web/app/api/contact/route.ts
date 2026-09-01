import { ContactSchema } from "@katbose/shared";
import { after, NextResponse } from "next/server";
import { checkContactRateLimit } from "@/lib/rate-limit/contact";
import { captureServerEvent } from "@/lib/monitoring/analytics";
import { captureServerException } from "@/lib/monitoring/sentry";
import { notifyContact } from "@/lib/monitoring/slack";
import { getRequestPseudonym } from "@/lib/security/ip";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Contact submission endpoint.
 *
 * The order of checks is the security contract, not an implementation detail:
 *
 * 1. Turnstile first, so an unverified caller can never reach the limiter, the
 *    database or Slack — and cannot use this route to probe their state.
 * 2. Honeypot second, answered with the same generic acceptance a real
 *    submission gets, so a bot learns nothing from the response.
 * 3. Rate limit third, failing closed when the limiter is unreachable.
 * 4. Schema validation, then exactly one insert.
 * 5. Notifications last and off the response path.
 *
 * Every rejection path is silent about which control rejected it.
 */

/** Shared body for any state where the submission cannot be accepted. */
const UNAVAILABLE_BODY = { error: "Contact is temporarily unavailable." } as const;

/**
 * Reads the request body as a JSON object, or returns null.
 *
 * A body that is not a JSON object is a client error, so it must not reach the
 * generic 503 handler: that would both mislabel the failure and fill the alerts
 * channel with reports about malformed bot traffic.
 */
async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const fields = await readJsonObject(request);
    if (!fields) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const token = typeof fields["turnstileToken"] === "string" ? fields["turnstileToken"] : "";
    if (!(await verifyTurnstileToken(token, request.headers.get("cf-connecting-ip")))) {
      return NextResponse.json({ error: "Bot check failed." }, { status: 403 });
    }

    // A filled honeypot is accepted and discarded. Returning an error here would
    // tell an automated client exactly which field exposed it.
    if (typeof fields["website"] === "string" && fields["website"].length > 0) {
      return NextResponse.json({ accepted: true });
    }

    // Only the Cloudflare-provided address is trusted; a forwarded header is
    // attacker-controlled and must never seed the limiter or analytics identity.
    const pseudonym = getRequestPseudonym(request);
    if (!pseudonym) {
      // Without pseudonymisation the per-visitor limit cannot be enforced, so
      // the route fails closed rather than accepting unlimited submissions.
      return NextResponse.json(UNAVAILABLE_BODY, { status: 503 });
    }

    const limit = await checkContactRateLimit(pseudonym);
    if (!limit.allowed) {
      return NextResponse.json(UNAVAILABLE_BODY, { status: limit.degraded ? 503 : 429 });
    }

    const parsed = ContactSchema.safeParse(fields);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid contact details." }, { status: 400 });
    }
    const input = parsed.data;

    const { error } = await createServiceClient().from("contact_submissions").insert({
      name: input.name,
      email: input.email,
      message: input.message,
    });
    // A failed insert must not notify: a Slack message with no stored row is a
    // lead that cannot be recovered or audited.
    if (error) throw error;

    after(() => deliverSideEffects(input, pseudonym));

    return NextResponse.json({ accepted: true });
  } catch (error) {
    captureServerException(error, { operation: "contact-submit" });
    return NextResponse.json(UNAVAILABLE_BODY, { status: 503 });
  }
}

/**
 * Runs the post-acceptance side effects after the response has been sent.
 *
 * `allSettled` is deliberate: notification and analytics are independent, so a
 * Slack outage must not suppress the analytics event and neither may surface as
 * an unhandled rejection. The submission is already durable at this point, so
 * failures here are reported and never retried into a duplicate row.
 */
async function deliverSideEffects(
  input: Readonly<{ name: string; email: string; message: string }>,
  distinctId: string,
): Promise<void> {
  const [notification, analytics] = await Promise.allSettled([
    notifyContact(input),
    captureServerEvent({
      event: "contact_submitted",
      distinctId,
      // Length only. The name, address and body stay out of analytics entirely.
      properties: { message_length: input.message.length },
    }),
  ]);
  if (notification.status === "rejected") {
    captureServerException(notification.reason, { operation: "contact-slack" });
  }
  if (analytics.status === "rejected") {
    captureServerException(analytics.reason, { operation: "contact-analytics" });
  }
}
