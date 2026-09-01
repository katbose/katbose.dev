/**
 * Draft Mode probe — part of the committed Spike A contract.
 *
 * Proves in `workerd` that `__prerender_bypass` can be issued, round-tripped
 * and revoked, and that a forged cookie value is rejected. Phase 2's preview
 * system depends on exactly this behaviour.
 *
 * Unreachable outside the loopback preview host; see `lib/probe/runtime-probe`.
 */

import { draftMode } from "next/headers";
import { isRuntimeProbeAllowed, PROBE_HEADERS, probeUnavailable } from "@/lib/probe/runtime-probe";

// The guard reads the incoming request, so this route must never be evaluated
// at build time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isRuntimeProbeAllowed(request)) return probeUnavailable();

  const draft = await draftMode();
  const action = new URL(request.url).searchParams.get("action");
  if (action === "enable") draft.enable();
  else if (action === "disable") draft.disable();

  return Response.json({ enabled: draft.isEnabled }, { headers: PROBE_HEADERS });
}
