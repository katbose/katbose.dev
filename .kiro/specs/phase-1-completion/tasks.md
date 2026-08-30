# Implementation Plan: Phase 1 Completion

## Overview

This plan covers the nine pending issues in the Pending Issue Register in `requirements.md` (P1-01 through P1-09), designed in `design.md`.

Most of the repository work is already built and pushed as PR #20 on branch `feat/phase-1-completion`. This document is therefore a record as much as a plan: tasks 1 to 16 are checked because CI has proven them, and tasks 17 to 28 are unchecked because they are either failing in CI or waiting on evidence only KatBose can produce.

### Evidence basis for the checked/unchecked split

CI run `33209313396` on PR #20, dated 2026-08-29:

| Job                           | Result | Consequence for this plan                                                                                   |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `quality`                     | pass   | Typecheck, lint, format, 137 unit tests and the OpenNext build green on Linux — the basis for tasks 1 to 16 |
| `database`                    | pass   | Migration and role coverage unaffected by this work                                                         |
| `e2e`                         | fail   | Tasks 17, 18 and 19                                                                                         |
| `lighthouse`                  | fail   | Tasks 21 and 22                                                                                             |
| `gitleaks`                    | fail   | Task 20                                                                                                     |
| `Workers Builds: katbose-web` | fail   | Task 27 — pre-existing, not caused by this work                                                             |

A checked box below means a committed implementation with a green Linux CI result. It does not mean the corresponding Phase 1 gate is closed: gates that need a production observation or a human review stay open until tasks 23 through 27 retain that evidence, and the roadmap is only ticked in task 28.

### Operator-owned work

Tasks 23 through 27 are marked **Operator-owned**. They need vendor console access, production credentials or human judgement, so they cannot be completed by a coding agent. They are listed here because Phase 1 cannot close without them, not because they are implementation work.

## Tasks

### Completed — committed and proven by CI run `33209313396`

- [x] 1. Shared telemetry redaction module
  - `apps/web/lib/monitoring/redact.ts` is the single rule used by PostHog `sanitize_properties` and both Sentry `beforeSend` handlers
  - `redact.test.ts` asserts idempotence to two passes and precision against suffix-match near misses and percent-encoded keys, over a generator crossing five sensitive key spellings with five parameter positions
  - **Property 3: URL-redaction idempotence** — executable
  - _Requirements: 5.2, 5.7_

- [x] 2. Server-side PostHog capture and the `contact_submitted` event
  - `apps/web/lib/monitoring/analytics.ts` posts to the documented capture endpoint with `fetch` rather than adding `posthog-node` to the Worker bundle
  - The event carries the limiter pseudonym as `distinct_id` and `message_length` as its only property; no name, address, body, token or raw IP
  - Emitted at most once, only after a successful write; capture resolves without sending when PostHog is unconfigured
  - _Requirements: 5.3, 5.4_

- [x] 3. Sentry browser and server initialisation, release derivation and source-map upload
  - `instrumentation-client.ts` and `sentry.server.config.ts` both route through the shared redaction rule
  - `lib/monitoring/release.ts` derives the release from `WORKERS_CI_COMMIT_SHA` or `GITHUB_SHA` and inlines it as `NEXT_PUBLIC_RELEASE`, so the browser bundle and the server runtime report the same value
  - `withSentryConfig` applies only when the auth token, org and project are all present, and an `errorHandler` downgrades an upload failure to minified traces instead of failing the release
  - Tracing, profiling and session replay left off to protect the performance budget; no server-only secret reaches the client bundle
  - _Requirements: 5.1, 5.5, 5.9_

- [x] 4. Sentry ingest origin added to the Content Security Policy
  - The exact origin is derived from the DSN and added to `connect-src` in `next.config.ts`, matching how the PostHog host is handled, rather than a vendor wildcard
  - _Requirements: 5.9_

- [x] 5. Contact route decision-table suite
  - `apps/web/tests/contact-route.test.ts` drives the real handler across 26 cases covering every row of the decision table in `design.md`
  - Side-effect sequence is recorded, so write-before-notify ordering and the at-most-one-write bound are asserted rather than inferred
  - Vitest module mocking is the seam; no real Turnstile, Upstash, Supabase, Slack, PostHog or Sentry call is made
  - **Property 2: Contact side-effect ordering** — executable
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 6. Malformed-body defect fix
  - A malformed body threw inside `request.json()`, fell through to the generic handler, returned 503 and filed a Sentry report
  - `readJsonObject` now returns 400 and files no report, so ordinary hostile traffic no longer fills the alerts channel
  - _Requirements: 3.1_

- [x] 7. Loopback-guarded runtime probe routes and the constant-time helper
  - `apps/web/lib/probe/runtime-probe.ts` guards `/api/probe/draft` and `/api/probe/constant-time`, both `dynamic = "force-dynamic"`, both answering 404 rather than 403 so they are indistinguishable from routes that do not exist
  - `apps/web/lib/security/constant-time.ts` compares length first because `timingSafeEqual` throws on mismatched lengths, with unit coverage in `constant-time.test.ts`
  - `/probe/isr` is `noindex` and absent from the public route manifest
  - _Requirements: 2.1, 2.5_

- [x] 8. Committed Spike A assertions
  - `e2e/workers-spike.spec.ts` asserts the ISR sequence against the R2 incremental cache, the `__prerender_bypass` round trip, the constant-time comparison oracle including the `threw: true` guarded failure, and the committed static Open Graph PNG
  - Test names and documentation describe the static PNG; no dynamic Phase 1 image route is claimed
  - The suite runs against the built OpenNext Worker under `workerd`, never `next dev`
  - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.8_

- [x] 9. Mode crossfade and panel height animation
  - `ModeSwitchLink` arms a self-clearing `data-mode-crossfade` attribute on click, before the incoming route paints, so a cold visit pays nothing and reduced motion returns early
  - Disclosure and accordion animate the Base UI measured-height variables with padding moved to an inner element, so a closed panel is genuinely zero height and keyboard semantics are untouched
  - _Requirements: 7.1, 7.2_

- [x] 10. Motion token integrity
  - The scroll reveal is wired to its own tokens after the audit found it using drifted values
  - `MIRRORED_MOTION_TOKENS` in `lib/motion.ts` pairs each JavaScript constant with its CSS custom property, and `tests/motion-tokens.test.ts` fails on drift or on a token losing its last consumer — which is how the unused `--dur-crossfade` was caught
  - _Requirements: 7.3_

- [x] 11. Reduced-motion, keyboard and layout-stability specs
  - `e2e/reduced-motion.spec.ts` covers every interaction in the catalogue rather than the two it covered before, and emulates the preference per test because the fixture option did not reach the page in CI
  - `e2e/keyboard.spec.ts` asserts focus-trap cycling in both directions, Escape restoring the trigger, and a visible outline of at least 2 px on each control reached by Tab
  - `e2e/layout-stability.spec.ts` observes layout shift on a fresh context so the intro loader actually runs, with the portrait request aborted so the reserved geometry is proven independently of the image
  - _Requirements: 7.3, 7.4, 7.5_

- [x] 12. Layout shift bounded and the design reference corrected
  - Playwright asserts below 0.001 in a real browser: a genuine unreserved element scores far above that, while sub-pixel font-metric rounding reports around 1e-5 and cannot be removed by any markup change. Lighthouse bounds it at 0.01 under simulated throttling
  - `docs/19-design-reference.md` updated so the documented expectation matches what the test enforces
  - _Requirements: 7.5_

- [x] 13. Reproducible Lighthouse gate
  - `pnpm lighthouse` builds the Worker, then `scripts/lighthouse/run-lighthouse-gate.mjs` owns the preview server lifecycle and polls the URL for readiness instead of matching Wrangler console text, guaranteeing teardown on every exit path
  - Thresholds are declarative in `lighthouserc.json` with pessimistic aggregation, so the worst of three runs must pass; `/contact` is excluded from the blocking gate because it embeds the third-party Turnstile widget
  - Collect and assert are separate stages and the CI upload step is `if: always()`, so reports publish as artifacts even when assertions fail — which is how tasks 21 and 22 have evidence to read
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 14. Credential-free media delivery probe
  - `scripts/media/media-probe.mjs` checks the immutable original through the same-zone proxy, a transformed variant, a cache hit on repetition and the forced `onerror=redirect` fallback, over unauthenticated public GETs with no Supabase or Cloudflare credentials in source or artifacts
  - Reports the fallback check as NOT VERIFIED and exits non-zero without an explicitly supplied untransformable object, so a missing fixture can never look like a satisfied gate
  - `apps/web/tests/media-probe.test.ts` exercises the probe logic against a stubbed transport
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

- [x] 15. Documentation reconciliation
  - `docs/09-observability.md`, `docs/11-testing-and-ci.md`, `docs/15-roadmap-and-checklist.md`, `docs/17-env-vars.md` and `docs/19-design-reference.md` updated: static Open Graph PNG rather than a dynamic route, recorded protected-main Workers Builds deployment evidence, `katbose@0.0.2` registry parity, and the Sentry and PostHog contract not represented as fully wired until production evidence exists
  - Decisions 97 to 101 recorded in `docs/16-decision-log.md`
  - Automated proof, production proof, blocked prerequisites and accepted deferrals are distinguished throughout
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 16. Low-entropy test fixtures
  - Committed test values replaced with self-describing placeholders such as `test-fixture-value-not-a-real-secret`, so no committed test resembles credential material
  - _Requirements: 6.7_

### Remaining — repository work

- [x] 17. Repair the runtime probe guard so the probes are reachable in the CI Workers preview
  - Evidence: both `/api/probe/draft` and `/api/probe/constant-time` returned a non-OK response in CI, failing six Spike A assertions. The loopback allow-list assumed `new URL(request.url).hostname` is `127.0.0.1` or `localhost` inside the Worker, and that assumption is wrong under `opennextjs-cloudflare preview`
  - Determine the hostname and `Host` header the Worker actually observes under preview, rather than guessing a second form
  - Make `isRuntimeProbeAllowed` accept the observed preview form while still refusing every `katbose.dev` host
  - Keep the deny decision failing closed for an unparseable URL
  - Extend `apps/web/lib/probe/runtime-probe.test.ts` with the observed preview form so the guard cannot regress into unreachability again
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.7_

- [x] 18. Fix the reduced-motion reveal assertion and the underlying hydration window
  - Evidence: nine elements inside `main` were partially transparent. `useReducedMotion` resolves after mount, so the server-rendered motion wrapper can begin a fade before the preference is known
  - Settle the page before asserting, so the check is not racing hydration
  - Determine whether the reveal genuinely animates under reduced motion during hydration and, if it does, prevent the wrapper from starting an animation before the preference resolves
  - Keep the assertion limited to partial opacity and blur; `transform` is used for static layout in several places and would report false positives
  - _Requirements: 7.3_

- [x] 19. Fix the bottom-bar shine pseudo-element assertion
  - Evidence: computed `animationName` came back as an empty string rather than `none`, so the assertion is reading a pseudo-element that is not generated as expected
  - Confirm how `.bottom-bar::before` resolves under reduced motion in the CI browser
  - Assert the property that actually proves the shine is suppressed, rather than one that happens to be empty
  - _Requirements: 7.3_

- [~] 20. Clear the gitleaks failure on the pull request
  - Evidence: the action scans the whole commit range, and the first commit still contains the retired high-entropy fixtures even though the tree no longer does
  - Squash the branch so the value never appears in any commit. This needs a force-push to `feat/phase-1-completion`, so it requires explicit approval from KatBose before it is run
  - Re-run and confirm gitleaks passes
  - Do not add a path-based allowlist: the repository configuration deliberately allowlists a placeholder value pattern instead, so a real secret pasted into a test is still caught
  - _Requirements: 6.7_

- [x] 21. Diagnose and resolve the Lighthouse SEO score
  - Evidence: a consistent 0.92 across all three audited pages, which is one failing binary audit rather than run-to-run noise. The most likely cause is the `canonical` audit reporting another hostname, because the absolute canonical points at `katbose.dev` while the audit runs against `127.0.0.1`
  - Read the published `.lighthouseci` report to identify the failing audit rather than assuming the cause
  - Decide between auditing the production origin and aligning the audited origin with the canonical
  - Record the decision in `docs/16-decision-log.md`
  - _Requirements: 9.1, 9.3_

- [x] 22. Open a measured performance workstream for the Lighthouse Performance score
  - Evidence: 0.82, 0.83 and 0.84 on the home page with LCP between 4.3 and 4.5 seconds, 0.92 to 0.94 on `/projects`, and 0.89 to 0.96 on `/agent`, all under simulated mobile throttling
  - Attribute the home-page largest contentful paint between the intro overlay, font loading and client scripts, from measurement rather than from inspection
  - Establish whether the newly added Sentry browser bundle contributes, and whether it should load conditionally
  - Re-measure after each change so every improvement is attributable
  - Keep the `lighthouse` job advisory until it passes; it is deliberately not a required status check
  - _Requirements: 9.3, 9.4, 9.6, 9.7_

### Remaining — operator-owned

- [-] 23. Verify the Phase 1 vendor inventory — **Operator-owned**
  - Exercise the Upstash limiter through one successful operation and record the documented fail-closed path
  - Generate one controlled browser error and one controlled route-handler error for the same deployment, and confirm de-minified frames under the same release in Sentry
  - Confirm delivery to `#contact-form` and `#katbose-alerts` without exposing either webhook URL
  - Record a dated, non-secret inventory covering the production Worker and zone, Images transform capability, Turnstile widget and binding, Supabase project, npm package, Upstash limiter, PostHog EU project, Sentry project and both Slack channels, with ownership and a recovery path but no passwords, recovery codes, tokens or private keys in Git
  - _Requirements: 5.6, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [-] 24. Perform the production contact proof — **Operator-owned**, depends on task 23
  - Submit one labelled synthetic message with a fresh production Turnstile token; confirm HTTP 200, exactly one Supabase row and exactly one `#contact-form` message
  - Replay the exact successful token; confirm HTTP 403 with no extra row and no extra Slack message
  - Exceed the three-per-hour limit from an isolated production test identity; confirm HTTP 429 with no row and no notification
  - Make Upstash unavailable through a controlled, reversible change; confirm HTTP 503 with no row and no notification
  - Restore every changed production setting and remove or clearly mark the synthetic contact data
  - Identify requests and side effects by non-sensitive correlation labels only; no tokens, webhook URLs, raw IP addresses, email addresses or message content in the retained proof
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [-] 25. Resolve the registered-zone media gate — **Operator-owned**
  - Either create the production `media` fixture plus a deliberately untransformable object and run `scripts/media/media-probe.mjs` to completion, recording the original, transform, cache-hit and forced-fallback results
  - Or record an approved decision moving the gate to Phase 2 and update `docs/15-roadmap-and-checklist.md` accordingly
  - Leave the gate explicitly blocked if neither is done; it must not be represented as complete
  - _Requirements: 8.1, 8.7_

- [-] 26. Close the remaining design-reference evidence — **Operator-owned**
  - Record a cold-cache `npx katbose` timing under three seconds, identifying the package version and the environment
  - Benchmark evidence (2026-08-29 16:05:55 +05:30): `npx.cmd --yes --cache <unique-empty-temp-cache> --package=katbose@0.0.2 -- katbose` ran on Windows 10.0.26200 X64 with Node v24.17.0 and npm 11.13.0. It exited 0 and printed the correct card, but took 15,507.9 ms; the temporary cache was removed. Requirement 7.7 remains unmet
  - Complete and date the upstream-provenance review, naming the compared upstream revision and the reviewer, confirming no upstream source file was copied into the implementation
  - A machine-assisted comparison packet is retained in `docs/19-design-reference.md` against immutable upstream revision `b37b169f7cdf6686f9c03bfa7b7019e8954686fb`. It found no copied source in the reviewed implementation scope, but Requirement 7.8 remains open until a named human reviewer dates and confirms that conclusion
  - _Requirements: 7.7, 7.8_

- [x] 27. Fix the Workers Builds pull-request preview — **Operator-owned**, pre-existing
  - Not caused by this work; the failure predates the branch
  - Change the Cloudflare dashboard build command for `katbose-web` so it does not run `wrangler versions upload` at the repository root, where there is no `wrangler.jsonc`
  - _Requirements: 6.1_

- [~] 28. Close Phase 1 in the roadmap once every gate has retained evidence
  - Tick each `docs/15-roadmap-and-checklist.md` box only after its acceptance evidence exists and is referenced
  - Keep any blocked item explicitly blocked, naming the prerequisite
  - Record any approved deferral as a decision, and distinguish automated proof, production proof, a blocked prerequisite and an accepted deferral
  - Do not reopen or expand the completed backup implementation to satisfy Foundation scope
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.5, 10.6_

## Notes

- Tasks 1 to 16 are checked because CI run `33209313396` proved them on Linux. A checked task means committed, working code — not a closed Phase 1 gate. Gates close in task 28, and only against retained evidence.
- Tasks 23 to 27 are **Operator-owned**: they need vendor console access, production credentials or human judgement, so a coding agent cannot complete them. They are tracked here because the exit condition in `requirements.md` depends on them.
- No sub-task is marked optional with `*`. Every test in this spec is the evidence for a gate rather than supplementary coverage, so skipping one would leave a gate unproven rather than merely less tested.
- Two correctness properties from `design.md` are executable and are annotated on the tasks that carry them: Property 2 on task 5 and Property 3 on task 1. Properties 1, 4, 5 and 6 remain candidates with example-based coverage, as recorded in `design.md`; they are not Phase 1 gates and no task claims them.
- Task 20 rewrites branch history and therefore needs explicit approval before the force-push.
- The `lighthouse` job stays advisory until task 22 passes. It is deliberately not a required status check, so it cannot block unrelated work while the performance workstream runs.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["17", "18", "21", "23", "27"] },
    { "id": 1, "tasks": ["19", "22", "24", "25", "26"] },
    { "id": 2, "tasks": ["20"] },
    { "id": 3, "tasks": ["28"] }
  ]
}
```
