/**
 * Constant-time comparison probe — part of the committed Spike A contract.
 *
 * Proves that `timingSafeEqual` from `node:crypto` is genuinely available in
 * `workerd` under `nodejs_compat`, and that the shared helper rejects a
 * length mismatch instead of throwing. A thrown comparison would surface as a
 * 500 on Phase 2's preview route, which is why the failure mode is asserted
 * rather than assumed.
 *
 * Unreachable outside the loopback preview host; see `lib/probe/runtime-probe`.
 */

import { isRuntimeProbeAllowed, PROBE_HEADERS, probeUnavailable } from "@/lib/probe/runtime-probe";
import { constantTimeEquals } from "@/lib/security/constant-time";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isRuntimeProbeAllowed(request)) return probeUnavailable();

  let expected = "";
  let provided = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") {
      const fields = body as Record<string, unknown>;
      if (typeof fields["expected"] === "string") expected = fields["expected"];
      if (typeof fields["provided"] === "string") provided = fields["provided"];
    }
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400, headers: PROBE_HEADERS });
  }

  // Reported rather than thrown: the probe asserts that a mismatched length is
  // a clean `false`, so any exception must be observable as `threw: true`.
  try {
    return Response.json(
      { equal: constantTimeEquals(expected, provided), threw: false },
      { headers: PROBE_HEADERS },
    );
  } catch {
    return Response.json({ equal: false, threw: true }, { headers: PROBE_HEADERS });
  }
}
