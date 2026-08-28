# Phase 1 Completion Design

## Overview

This design covers the nine pending issues recorded in the Pending Issue Register in `requirements.md` — P1-01 through P1-09. It is the design of record for work that is already implemented and committed, not a plan for work to be started.

The two halves of Phase 1 closure are treated separately throughout. Repository behaviour is validated by the commands listed in the Testing Strategy section; anything that requires a production observation or a human review is explicitly unverified here and stays open until that evidence exists.

| Issue | Designed in                         | State                                                     |
| ----- | ----------------------------------- | --------------------------------------------------------- |
| P1-01 | Workers runtime probes              | Implemented; Linux CI run unverified                      |
| P1-02 | Contact route decision table        | Implemented and validated                                 |
| P1-03 | Observability components            | Implemented; production telemetry proof unverified        |
| P1-04 | Ownership Split                     | Operator-owned; unverified                                |
| P1-05 | Ownership Split                     | Operator-owned; unverified                                |
| P1-06 | Motion and accessibility components | Implemented; browser specs unverified until Linux CI      |
| P1-07 | Media probe                         | Probe implemented; production fixture or deferral pending |
| P1-08 | Lighthouse gate                     | Gate implemented; passing run unverified                  |
| P1-09 | Ownership Split                     | Documentation reconciled; deferral approvals pending      |

### Design principles

**(a) A control must be provable by a committed test.** The original Spike A proof came from a scaffold that was never committed, so the claims it produced could not be re-run and could not fail when the runtime or a dependency changed. Every control in this design is exercised by a test or probe that lives in the repository.

**(b) Telemetry must never break the product.** Analytics and error monitoring are diagnostic surfaces. They run off the response path, they degrade quietly when unconfigured, and a vendor outage or an upload failure cannot fail a build, a deploy, or a user-visible response.

**(c) Diagnostics must be unreachable in production by construction, not configuration.** A probe endpoint that is disabled by an environment variable is one misconfiguration away from being public. The guard used here cannot be satisfied by a production request at all.

**(d) Verification must not spend the performance budget.** Lighthouse scores of at least 95 for Performance, Accessibility and SEO are a Phase 1 gate, so no probe, no instrumentation and no decorative motion may be paid for out of first paint.

## Architecture

Three groups of components make up this work, and they are deliberately independent of one another. The observability surfaces sit off the response path and share one redaction rule. The runtime probes sit inside the deployed application but behind a guard no production request can satisfy. The gates are scripts that drive the built Worker from outside and hold no production responsibility at all. Nothing in the second or third group can affect a user-visible response, and nothing in the first group can fail one.

### Observability components (P1-03)

| Component                     | Responsibility                                               |
| ----------------------------- | ------------------------------------------------------------ |
| `lib/monitoring/redact.ts`    | The single redaction rule shared by every telemetry surface  |
| `lib/monitoring/release.ts`   | Resolves the deployed commit as the release identifier       |
| `lib/monitoring/analytics.ts` | Server-side PostHog capture                                  |
| `instrumentation-client.ts`   | Sentry browser initialisation                                |
| `sentry.server.config.ts`     | Sentry server initialisation                                 |
| `next.config.ts`              | CSP origins, release inlining, conditional source-map upload |

The redaction rule is the only shared dependency: PostHog's `sanitize_properties` hook, both Sentry `beforeSend` handlers, and server-side capture all route through it. Release identity is the second cross-cutting concern — the browser bundle and the server runtime must report the same value for a source map to resolve.

### Runtime probes (P1-01)

The gate needs proof of three integration behaviours that no unit test can establish: the R2 incremental cache, Draft Mode cookies, and `node:crypto` under `nodejs_compat`. Those only exist in the built application running under `workerd`, so the probes ship inside the application.

Another throwaway scaffold was rejected — that is precisely what left the contract unguarded. `@cloudflare/vitest-pool-workers` was rejected because it cannot cover ISR, which is an OpenNext integration that only exists in the built application.

| Probe         | Route                      | Capability                  | Access                                    |
| ------------- | -------------------------- | --------------------------- | ----------------------------------------- |
| ISR           | `/probe/isr` page          | None                        | `noindex`, absent from the route manifest |
| Draft Mode    | `/api/probe/draft`         | Issues `__prerender_bypass` | Loopback only                             |
| Constant time | `/api/probe/constant-time` | Comparison oracle           | Loopback only                             |

The Draft Mode cookie opts its holder out of the ISR cache, and once Phase 2 lands it would expose unpublished content. That is why the route is guarded rather than merely unadvertised.

### Gates

`pnpm lighthouse` and the media probe both drive the deployed or preview Worker over ordinary HTTP. Neither imports application code, so neither can perturb what it measures. Both own their own process lifecycle and exit status, which is what makes them usable as CI gates.

## Components and Interfaces

### One redaction rule

PostHog's `sanitize_properties` hook and both Sentry `beforeSend` handlers call the same implementation. A per-surface regex was rejected: three copies of a redaction rule is exactly how one of them silently stops matching while the other two keep passing their tests.

The rule rewrites `key=value` query pairs in place rather than parsing the input as a URL, because analytics properties carry relative paths and arbitrary text as often as they carry absolute URLs, and a parser would have to reject or reformat the rest. Two properties follow from that narrow contract:

- **Idempotence.** Sanitised output is a fixed point, so repeated passes over the same property cannot corrupt it.
- **Precision.** Only recognised sensitive values change. Paths, fragments, parameter ordering and unrelated parameters survive byte-for-byte, which keeps the retained analytics useful.

### Server-side analytics capture

Server events are posted with `fetch` to PostHog's documented capture endpoint. `posthog-node` was rejected: the Worker already had to withdraw dynamic Open Graph rendering to stay under the free-plan 3 MiB script limit, so adding an analytics SDK to the server bundle for a single event is the wrong trade.

Emitting the event from the browser was also rejected. A closed tab loses the event, and the documentation assigns `contact_submitted` to the contact route rather than to the page. The event carries the limiter pseudonym as its `distinct_id` and the message length as its only property.

Capture resolves without sending when PostHog is unconfigured, so local and CI runs stay silent instead of failing.

### Release identity and source maps

The release identifier is derived from `WORKERS_CI_COMMIT_SHA` or `GITHUB_SHA` and inlined as `NEXT_PUBLIC_RELEASE`, so the browser bundle and the server runtime report the same release and resolve against the same source map. It is derived, never configured: a hand-set release is a release that eventually disagrees with the bundle it is supposed to describe.

`withSentryConfig` is applied only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are all present. An unconfigured build is therefore byte-identical to a build with no Sentry wrapper at all, which keeps local and CI builds independent of Sentry being reachable. When the credentials are present, an `errorHandler` makes an upload failure degrade stack traces to minified rather than fail the release.

### Content Security Policy

The Sentry ingest origin is derived from the DSN and added to `connect-src`, matching how the PostHog host is treated. Deriving the exact origin keeps the policy tighter than a vendor wildcard would.

### The probe guard

Reachability is restricted by a loopback hostname check. Production is served exclusively through the `katbose.dev` custom domain — `workers_dev` and preview URLs are off as a consequence of declaring `routes` in `wrangler.jsonc` — so no production request can satisfy the check, while the CI Workers preview on `127.0.0.1` can.

An environment-variable flag was rejected on two counts: it can be enabled in production by misconfiguration, and it would need plumbing through Wrangler preview to be usable in CI at all.

Both guarded routes declare `dynamic = "force-dynamic"` so the guard is never evaluated at build time, and they answer 404 rather than 403 so they are indistinguishable from routes that do not exist.

### Constant-time comparison

The comparison probe exercises `lib/security/constant-time.ts`, which Phase 2's preview gate will use in production. Length is compared first because `timingSafeEqual` throws on mismatched lengths; every secret compared through this helper has a length fixed by its own generation rule, so the length carries no information while the byte comparison stays constant time. The probe reports a thrown exception as `threw: true`, which is how the guarded failure mode is asserted rather than assumed.

### ISR probe sequence

The probe serves the page, confirms the response is reused, waits past the 2 s window, confirms the stale entry is served immediately, polls until the background rebuild yields a new value, and confirms the new value is itself cached. The build output records `/probe/isr` at `Revalidate 2s`.

### Mode crossfade

`ModeSwitchLink` arms a self-clearing `data-mode-crossfade` attribute on the document element when the link is clicked, and CSS animates the incoming `main`.

Animating on mount was rejected: a fade from transparent on first paint delays largest contentful paint and spends the Lighthouse budget on decoration. Setting the attribute in an effect after navigation was also rejected, because the effect runs after the new content paints, so content would flash and then fade.

Arming on click sets the attribute before the incoming route paints, costs a cold visit nothing, applies only between `/` and `/agent`, and returns early under a reduced-motion preference.

### Panel animation

Base UI publishes the measured height as `--collapsible-panel-height` and `--accordion-panel-height`, and marks the transition boundaries with `data-starting-style` and `data-ending-style`. Both variable names were read from the installed package rather than assumed.

Padding moved to an inner element, because padding on the animating element keeps a closed panel visibly taller than zero. Animating `max-height` to a guessed value was rejected: it either clips tall content or animates through empty space.

### Token integrity

`theme.css` is the specification. Two values must also exist in JavaScript — `motion` takes numeric props, and the crossfade needs a timer. `lib/motion.ts` declares each pairing in `MIRRORED_MOTION_TOKENS`, and `tests/motion-tokens.test.ts` fails when a constant drifts from its token or when a token loses its last consumer.

That test closed two real defects: `--dur-crossfade` was declared and unused while the catalogue claimed the crossfade existed, and the scroll reveal was using values that no longer matched its tokens.

Reading the tokens with `getComputedStyle` during render was rejected, because `Reveal` also renders on the server, where diverging values cause a hydration mismatch.

### Lighthouse gate

`pnpm lighthouse` builds the Worker, then a Node script owns the preview server lifecycle and runs Lighthouse CI. Thresholds live in `lighthouserc.json`, so the gate itself is declarative.

Lighthouse CI's own `startServerCommand` was rejected: it detects readiness by matching a string in server log output, which couples the gate to Wrangler console text. Polling the URL is deterministic, and the script guarantees teardown on every exit path, including a failed audit.

Assertions use pessimistic aggregation, so the worst of three runs must pass rather than the median. `/contact` is excluded from the blocking gate because it embeds the third-party Turnstile widget, and gating a first-party budget on an uncontrolled script would fail the pipeline for reasons nobody can fix. Exact CLS of 0 is asserted in Playwright, where it is deterministic, and bounded at 0.01 under Lighthouse's simulated throttling.

### Media probe

The probe performs four checks over unauthenticated public GETs: the immutable original through the same-zone proxy, a transformed variant, a cache hit on repetition, and the forced `onerror=redirect` fallback.

A transform failure cannot be forced reliably from outside the zone, so the fallback check requires an explicitly supplied untransformable object. Without one the probe reports NOT VERIFIED and exits non-zero, because a check that quietly passes would misrepresent the gate.

The probe's logic is unit tested against a stubbed transport. An untested script that only runs during an incident is how the backup scripts accumulated five fatal defects.

## Data Models

### Contact route decision table (P1-02)

| Condition              | Status       | Rate limit consulted | Row written | Notified        |
| ---------------------- | ------------ | -------------------- | ----------- | --------------- |
| Body not a JSON object | 400          | No                   | No          | No              |
| Turnstile rejects      | 403          | No                   | No          | No              |
| Honeypot filled        | 200 accepted | No                   | No          | No              |
| Trusted address absent | 503          | No                   | No          | No              |
| Limit exhausted        | 429          | Yes                  | No          | No              |
| Limiter degraded       | 503          | Yes                  | No          | No              |
| Schema invalid         | 400          | Yes                  | No          | No              |
| Accepted               | 200          | Yes                  | Exactly one | After the write |
| Write fails            | 503          | Yes                  | Attempted   | No              |
| Notification fails     | 200 accepted | Yes                  | One         | Reported        |

### Server analytics event

```ts
interface ServerEvent {
  readonly event: string; // catalogue name from docs/09-observability.md §9.2
  readonly distinctId: string; // already pseudonymised; never a raw IP or email
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
}
```

Property values are restricted to `string | number | boolean` so they survive JSON transport without ambiguity. Every property bag passes through the shared redaction rule before transmission.

The one Phase 1 instance:

| Field        | Value                                                               |
| ------------ | ------------------------------------------------------------------- |
| `event`      | `contact_submitted`                                                 |
| `distinctId` | The limiter pseudonym, epoch-prefixed                               |
| `properties` | `{ message_length }` — length only, never the name, address or body |

### Mirrored motion token

```ts
type MotionTokenUnit = "time" | "length" | "ratio";

interface MirroredMotionToken {
  readonly value: number; // the JavaScript value used at runtime
  readonly unit: MotionTokenUnit; // how to normalise the CSS declaration before comparing
}

const MIRRORED_MOTION_TOKENS: Readonly<Record<string, MirroredMotionToken>>;
```

The key is the CSS custom property name. Listing a token here asserts two things at once: that it exists in `theme.css` with an equal value, and that it counts as consumed even when no stylesheet references it with `var()`.

### Media probe check result

```ts
interface CheckResult {
  readonly name: string; // the behaviour being asserted
  readonly passed: boolean;
  readonly detail: string; // evidence, or the reason it was not verified
}

interface ProbeReport {
  readonly checks: readonly CheckResult[];
  readonly passed: boolean; // true only when every check passed
}
```

An unverifiable check is represented as `passed: false` with a `detail` that says NOT VERIFIED, so the report can never present a missing fixture as a satisfied gate.

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

These six candidates come from the Correctness Properties section of `requirements.md`. Three are executable today over generated or enumerated inputs. Three have committed example-based coverage of the same behaviour but are not yet universally quantified, and they stay candidates rather than being represented as proven — principle (a) applies to properties as much as to controls.

### Property 1: Turnstile acceptance equivalence

_For any_ generated provider response, verification succeeds if and only if the response is successful, the action is exactly `contact`, the hostname is canonical, the token length is valid and the provider response is valid; every other generated alternative fails closed.

Status: candidate. `lib/security/security.test.ts` proves the missing-secret branch fails closed, and `tests/contact-route.test.ts` proves the route stops at 403 on rejection and 503 when verification throws. The full biconditional over generated action, hostname and token-length permutations is not yet executable.

**Validates: Requirements 3.2**

### Property 2: Contact side-effect ordering

_For any_ combination of dependency outcomes, an invalid or degraded branch performs no write and no notification, at most one write occurs, notification occurs only after a successful write, and a notification failure cannot change an already accepted response.

Status: executable now in `apps/web/tests/contact-route.test.ts`. The suite enumerates every row of the decision table and records the side-effect sequence, so ordering is asserted rather than inferred.

**Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.8**

### Property 3: URL-redaction idempotence

_For any_ URL-shaped analytics property, sanitising twice yields the same result as sanitising once, every sensitive value is removed regardless of key case or parameter position, and unrelated parameters, path and fragment are preserved.

Status: executable now in `apps/web/lib/monitoring/redact.test.ts`, over a deterministic generator that crosses five sensitive key spellings with five parameter positions. Idempotence is asserted to two passes, and precision is asserted against suffix-match near misses and percent-encoded keys.

**Validates: Requirements 5.2, 5.7**

### Property 4: Pseudonym safety

_For any_ address, the same address, key and epoch yield the same fixed-length pseudonym; changing the key or the epoch changes the pseudonym; and the output never contains the source address.

Status: candidate. `lib/security/security.test.ts` proves determinism, key sensitivity and absence of the raw address for one address, and `tests/contact-route.test.ts` pins the emitted shape to `1:` followed by 64 hex characters. Quantifying over generated addresses and epochs remains outstanding.

**Validates: Requirements 3.9, 5.3**

### Property 5: Image-width monotonicity

_For any_ requested width, the selected width is an allowed variant, never decreases when the request increases, rounds up while an allowed larger variant exists, and clamps at the maximum.

Status: candidate. `apps/web/lib/media/image-loader.test.ts` covers round-up and clamping at two boundary examples, plus the transform URL shape and bundled-asset passthrough. Monotonicity across generated widths is not yet asserted.

**Validates: Requirements 7.6, 8.3**

### Property 6: Route-manifest consistency

_For any_ public route manifest, paths are unique, every indexable route appears exactly once in each generated agent and sitemap output, and non-indexable routes do not appear.

Status: partly executable now. `apps/web/lib/routes.test.ts` asserts path uniqueness, complete metadata, and that every indexable route reaches `llms.txt`; `apps/web/tests/agent-output-parity.test.ts` asserts the committed files still match their generators. Exactly-once counting and the exclusion of non-indexable routes remain candidates.

**Validates: Requirements 7.6**

## Error Handling

### Fail-closed ordering on the contact route

Turnstile is verified first so an unverified caller can never reach the limiter, the database or Slack, and cannot use the route to probe their state. The honeypot is answered with the same body a genuine submission receives, so a bot learns nothing about which field exposed it. Both limiter rejection paths share one response body, so a rate limit is indistinguishable from an outage.

Every degraded dependency fails closed rather than open: an absent trusted address, an unavailable limiter, unconfigured pseudonymisation and a thrown Turnstile verification all return 503 without writing or notifying.

### The malformed-body defect

A malformed request body threw inside `request.json()`, fell through to the generic handler, returned 503 and reported a server error to Sentry. `readJsonObject` now returns 400 and files no report, which is both the correct status and the reason bot traffic no longer fills the alerts channel. A parse failure is a client error; routing it to Sentry turns ordinary hostile traffic into operator noise and buries the reports that matter.

### Side-effect isolation

Post-acceptance work runs under `Promise.allSettled`. Notification and analytics are independent, so a Slack outage must not suppress the analytics event, and neither may surface as an unhandled rejection. The submission is already durable at this point, so each failure is reported under its own operation label — `contact-slack` and `contact-analytics` — and never retried into a duplicate row.

### Non-fatal source-map upload

When Sentry credentials are present, an `errorHandler` downgrades an upload failure to minified stack traces instead of failing the release. A vendor upload is a diagnostic convenience; it is not a reason to block a deploy.

### Probe guard failure mode

Both guarded probe routes answer 404 when the loopback check fails, not 403. A 403 confirms the route exists; a 404 is indistinguishable from a route that does not. The guard is evaluated per request because `dynamic = "force-dynamic"` keeps it out of the build.

### Unverifiable media checks

Without an explicitly supplied untransformable object the media probe reports the fallback check as NOT VERIFIED and exits non-zero. Exiting zero on an unrun check would let the gate appear satisfied by absence, which is the failure mode this whole design exists to remove.

## Testing Strategy

Property-based testing applies unevenly across this work, so it is used where a universal statement is meaningful and avoided where it is not. The redaction rule is a pure function over strings and is exercised across a deterministic generated input space. The contact route is enumerated as a decision table, because its correctness is about ordering and side effects rather than about input variation. The runtime probes, the Lighthouse gate and the media probe are integration checks against a built Worker or a live zone: they assert behaviour that does not vary meaningfully with input and would cost real vendor calls to repeat, so each runs a small number of representative times. The three candidates listed in Correctness Properties are the places where generative coverage would add value and does not exist yet.

### Contact route test seam

The suite uses Vitest module mocking, capturing `after` to drive the post-response work. Refactoring the route for dependency injection was rejected: it adds production plumbing that exists purely for tests, and the module boundary is already the seam. No real Turnstile, Upstash, Supabase, Slack, PostHog or Sentry call is made.

### Browser coverage

| Behaviour                | Assertion                                                                  |
| ------------------------ | -------------------------------------------------------------------------- |
| Reduced motion           | Every catalogue interaction, including the `::before` shine pseudo-element |
| Reduced-motion invariant | No element inside `main` is left mid-animation                             |
| Focus trap               | Cycles forward and backward without escaping the open mobile menu          |
| Focus visibility         | A solid outline of at least 2 px on each control reached by Tab            |
| Layout stability         | `PerformanceObserver` reports exactly 0 layout shift on a fresh session    |
| Profile fallback         | The portrait keeps a 1:1 box with image loading blocked                    |

Cumulative layout shift is measured on a fresh context so the intro loader actually runs, with the portrait request aborted so the reserved geometry is proven independently of the loaded image.

### Validation

Passing locally:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm test` — 21 files, 137 tests
- `pnpm --filter web build:next`, both with and without Sentry credentials

**Known limitation.** OpenNext bundling fails on Windows and OneDrive because of the documented pnpm-symlink issue, so the Playwright specs and the Lighthouse gate are unproven until Linux CI runs them. The ISR staleness timing and the Lighthouse thresholds are the two most likely to need tuning on the first run: the ISR probe depends on a 2 s revalidation window that a cold R2 round trip can outlast, and the Lighthouse thresholds were set from the declared budget rather than from an observed run. The corresponding roadmap items stay open until that evidence exists.

## Ownership Split

| Requirement                  | Repository                      | Operator                                                |
| ---------------------------- | ------------------------------- | ------------------------------------------------------- |
| 2 — Spike A probes           | Committed                       | None                                                    |
| 3 — Contact tests            | Complete                        | None                                                    |
| 4 — Contact production proof | None                            | Fresh token, replay, 429, 503, row, Slack               |
| 5 — Monitoring               | Complete                        | De-minified event under the release, and alert delivery |
| 6 — Vendor inventory         | Secret scanning                 | Upstash, Sentry, both Slack channels                    |
| 7 — Design gates             | Behaviour and coverage complete | Provenance review and cold-cache package timing         |
| 8 — Media fallback           | Probe committed                 | Production fixture or an approved deferral              |
| 9 — Lighthouse gate          | Committed                       | None beyond a green run                                 |
| 10 — Documentation           | Reconciled                      | Approval of any deferral                                |

## Future-Proofing

| Mechanism              | Later value                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| Shared redaction       | Phase 2 preview secrets and Phase 3 query logs inherit one tested rule     |
| `constantTimeEquals`   | The comparison Phase 2's preview gate and Phase 3's webhook secret require |
| Runtime probes         | Draft Mode and ISR regressions surface before Phase 2 builds on them       |
| Token integrity test   | Any future orphaned or drifted design token fails the build                |
| Decision-table pattern | The template for the Ask AI and resume routes                              |
| Media probe            | Re-runnable at any time once a fixture exists, with no credentials         |
| Lighthouse gate        | Every later phase inherits an enforced performance budget                  |
