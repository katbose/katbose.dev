import { ContactSchema } from "@katbose/shared";
import { after, NextResponse } from "next/server";
import { checkContactRateLimit } from "@/lib/rate-limit/contact";
import { captureServerException } from "@/lib/monitoring/sentry";
import { notifyContact } from "@/lib/monitoring/slack";
import { getRequestPseudonym } from "@/lib/security/ip";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object")
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const fields = raw as Record<string, unknown>;
    const token = typeof fields["turnstileToken"] === "string" ? fields["turnstileToken"] : "";
    if (!(await verifyTurnstileToken(token, request.headers.get("cf-connecting-ip")))) {
      return NextResponse.json({ error: "Bot check failed." }, { status: 403 });
    }
    if (typeof fields["website"] === "string" && fields["website"].length > 0) {
      return NextResponse.json({ accepted: true });
    }
    const limit = await checkContactRateLimit(getRequestPseudonym(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Contact is temporarily unavailable." },
        { status: limit.degraded ? 503 : 429 },
      );
    }
    const parsed = ContactSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid contact details." }, { status: 400 });
    }
    const input = parsed.data;
    const { error } = await createServiceClient().from("contact_submissions").insert({
      name: input.name,
      email: input.email,
      message: input.message,
    });
    if (error) throw error;
    after(async () => {
      try {
        await notifyContact(input);
      } catch (error) {
        captureServerException(error, { operation: "contact-slack" });
      }
    });
    return NextResponse.json({ accepted: true });
  } catch (error) {
    captureServerException(error, { operation: "contact-submit" });
    return NextResponse.json({ error: "Contact is temporarily unavailable." }, { status: 503 });
  }
}
