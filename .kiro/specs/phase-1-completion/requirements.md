# Requirements Document

## Introduction

This specification defines the work still required to close Phase 1 — Foundation after auditing the repository, automated tests, workflows, authoritative documentation, and recorded production evidence on 2026-08-29.

The specification deliberately separates missing repository behavior from missing production proof. A checklist statement is not completion evidence by itself. Implementation must not begin until these requirements are reviewed and approved.

## Glossary

| Term                    | Meaning                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate                    | A Phase 1 item that separates a demo from a production system. A gate is not closed by an implementation alone; it needs retained evidence. |
| P1-nn                   | An identifier for one pending Phase 1 issue, listed in the Pending Issue Register below.                                                    |
| Operator-owned          | Work only KatBose can perform, because it needs vendor console access, production credentials, or human judgement.                          |
| Fail closed             | Refusing a request when a security control cannot be evaluated, rather than allowing it through unchecked.                                  |
| ISR                     | Incremental Static Regeneration: a page is served from cache, then rebuilt in the background after its revalidation window expires.         |
| Stale-while-revalidate  | Serving the expired cache entry immediately while the rebuild happens out of band, so no visitor waits for it.                              |
| LCP                     | Largest Contentful Paint: when the largest visible element finishes rendering. Phase 1 budgets 2.5 seconds.                                 |
| CLS                     | Cumulative Layout Shift: the total unexpected movement of visible content. Phase 1 requires zero.                                           |
| Pessimistic aggregation | Judging a repeated measurement by its worst run rather than its median, so a single failing run cannot be averaged away.                    |
| NOT VERIFIED            | A check that could not be executed. It is reported as a failure, never as a pass, so an unrun check can never look like a satisfied gate.   |

## Audit Baseline

### Classification

| Class | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| A     | Repository implementation or automated-test gap          |
| B     | Production or manual verification gap                    |
| C     | External prerequisite currently blocks verification      |
| D     | Documentation is stale or overstates the evidence        |
| E     | Complete with repository or recorded production evidence |

### Pending Issue Register

The issues are ordered so each can be completed independently where dependencies permit.

| ID    | Pending issue                                                       | Class     | Depends on                                                 |
| ----- | ------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| P1-01 | Complete the committed Workers-runtime Spike A contract             | A         | Existing OpenNext build and R2 incremental-cache binding   |
| P1-02 | Add deterministic contact-route decision-table coverage             | A         | Existing contact route and dependency seams                |
| P1-03 | Complete the documented PostHog and Sentry contract                 | A, then B | Monitoring scope confirmed by these requirements           |
| P1-04 | Verify only the vendor resources needed by Phase 1                  | B         | P1-03 for final Sentry proof                               |
| P1-05 | Prove the contact path end to end in production                     | B         | P1-02 and P1-04                                            |
| P1-06 | Close the remaining design-reference evidence and behavior gaps     | A, then B | Existing page and interaction implementation               |
| P1-07 | Prove the registered-zone media fallback or formally defer the gate | C, then B | A production `media` fixture or an approved scope decision |
| P1-08 | Add and pass the reproducible Lighthouse gate                       | A, then B | All Phase 1 UI and third-party scripts stable              |
| P1-09 | Reconcile stale roadmap and operational documentation               | D         | Evidence from P1-01 through P1-08                          |

### Already Complete and Not to Be Rebuilt

The audit found sufficient evidence for the monorepo scaffold, OpenNext deployment, core pages and utility pages, route-manifest generators, baseline SEO and security headers, theme behavior, database migrations and role tests, protected CI, privacy page, production apex deployment, and the basic contact protection control flow.

PostHog production `$pageview` and `web_vital` ingestion are already recorded as verified. The image loader, same-zone origin proxy, fixed transform variants, immutable cache headers, and transform/cache-hit behavior are implemented. Requirements below target only the missing behavior or missing evidence.

### Out of Scope

- Reimplementing or extending the completed weekly backup and restore system.
- Payload CMS, Render, Cloudflare Access for the CMS, AI Search, or other Phase 2+ resources.
- Dynamic per-post Open Graph images; Phase 1 uses the committed static PNG because of the Worker script-size decision.
- Redesigning completed pages or replacing established architecture without evidence of a Phase 1 defect.

## Requirements

### Requirement 1: Evidence-Based Phase 1 Closure

**User Story:** As the project owner, I want every Phase 1 item closed with reproducible evidence so that checklist status reflects the deployed system rather than an assumption.

#### Acceptance Criteria

1. THE Phase 1 completion process SHALL classify each open item as repository work, production verification, external blocker, documentation-only correction, or complete evidence.
2. WHEN an item is claimed complete, THE process SHALL retain the command or procedure, execution date, target environment, result, and artifact or durable reference needed to reproduce the claim.
3. WHEN repository evidence contradicts a checked roadmap item, THE process SHALL reopen or narrow that item before Phase 1 is declared complete.
4. IF an external prerequisite prevents verification, THEN THE process SHALL keep the affected gate open and identify the prerequisite explicitly.
5. THE retained evidence SHALL exclude credentials, tokens, private keys, raw IP addresses, contact-message content, and other sensitive values.
6. THE process SHALL NOT treat Phase 2+ resources or backup enhancements as prerequisites for Phase 1 unless an approved decision explicitly moves them into Phase 1.

### Requirement 2: Committed Workers-Runtime Spike A Contract

**User Story:** As a maintainer, I want the historical Spike A claims represented by committed tests so that future runtime or dependency changes cannot silently break them.

#### Acceptance Criteria

1. WHEN `test:spike:workers` runs, THE complete probe suite SHALL execute against the built OpenNext Worker under `workerd`, not `next dev`.
2. WHEN the ISR probe runs against the configured R2 incremental cache, THE suite SHALL demonstrate the initial response, a stale response after expiry, background revalidation, and a subsequent response containing the revalidated value.
3. WHEN the Worker runtime restarts with the same R2 cache binding, THE ISR probe SHALL demonstrate that the expected cache state remains usable.
4. WHEN Draft Mode is enabled, THE suite SHALL demonstrate the `__prerender_bypass` cookie round trip, draft-only behavior, explicit disablement, and expiry rejection.
5. WHEN the crypto probe compares equal values, changed equal-length values, and unequal-length values, THE suite SHALL demonstrate acceptance only for the equal pair and safe rejection without an exception for both mismatch cases.
6. WHEN the Open Graph probe runs, THE suite SHALL verify the committed static PNG response, PNG content type, and page metadata reference.
7. THE Spike A contract SHALL be part of the normative Linux CI path and SHALL fail the check when any probe fails.
8. THE Spike A documentation and test names SHALL describe the static Open Graph asset and SHALL NOT claim that Phase 1 dynamically generates it.

### Requirement 3: Deterministic Contact-Route Verification

**User Story:** As a maintainer, I want automated coverage of every contact-route decision so that bot protection, rate limiting, persistence, and notification side effects remain fail-safe.

#### Acceptance Criteria

1. WHEN a request body is malformed JSON or fails the contact schema, THE route SHALL return HTTP 400 and SHALL NOT persist or notify.
2. WHEN the Turnstile token is missing, invalid, has an unexpected action, or has a non-canonical hostname, THE route SHALL return HTTP 403 and SHALL NOT rate-limit, persist, or notify.
3. WHEN a valid Turnstile request contains a non-empty honeypot, THE route SHALL return the generic accepted response and SHALL NOT rate-limit, persist, or notify.
4. WHEN the healthy limiter reports an exhausted limit, THE route SHALL return HTTP 429 and SHALL NOT persist or notify.
5. WHEN the limiter is unavailable or degraded, THE route SHALL fail closed with HTTP 503 and SHALL NOT persist or notify.
6. WHEN all validation and limiting checks pass, THE route SHALL insert exactly one normalized submission before scheduling any Slack notification.
7. IF persistence fails, THEN THE route SHALL return HTTP 503, capture the server exception, and SHALL NOT notify Slack.
8. IF Slack notification fails after successful persistence, THEN THE route SHALL preserve the accepted response and SHALL capture the notification failure.
9. THE route SHALL derive the network pseudonym only from the trusted `cf-connecting-ip` header and SHALL NOT trust forwarded client-supplied alternatives.
10. THE automated suite SHALL cover these outcomes without calling real Turnstile, Upstash, Supabase, Slack, PostHog, or Sentry services.

### Requirement 4: Production Contact Protection Proof

**User Story:** As the project owner, I want a controlled production proof of the contact flow so that repository tests are backed by evidence from the real vendor integrations.

#### Acceptance Criteria

1. WHEN a labelled synthetic message is submitted with a fresh production Turnstile token, THE deployed route SHALL return HTTP 200, create exactly one matching Supabase row, and deliver exactly one message to `#contact-form`.
2. WHEN the exact successful token is replayed, THE deployed route SHALL return HTTP 403 and SHALL NOT create another row or Slack message.
3. WHEN an isolated production test identity exceeds the three-per-hour limit, THE next request SHALL return HTTP 429 and SHALL NOT create a row or Slack message.
4. WHEN Upstash is deliberately made unavailable through a controlled and reversible test, THE deployed route SHALL return HTTP 503 and SHALL NOT create a row or Slack message.
5. WHEN the proof completes, THE operator SHALL restore every changed production setting and remove or clearly mark synthetic contact data.
6. THE retained proof SHALL identify requests and side effects by non-sensitive correlation labels and SHALL NOT expose tokens, webhook URLs, raw IP addresses, email addresses, or message content.

### Requirement 5: Complete Analytics and Error Monitoring

**User Story:** As the operator, I want privacy-preserving analytics and actionable error telemetry so that production failures can be diagnosed without collecting unnecessary personal data.

#### Acceptance Criteria

1. WHILE PostHog browser analytics is enabled, THE client SHALL use the EU host, memory-only persistence, disabled session recording, explicit pageview capture, and explicit web-vital capture.
2. WHEN an analytics property contains a URL, THE PostHog sanitization path SHALL remove every `secret` query-parameter value without changing unrelated path or query data.
3. WHEN a contact submission is successfully persisted, THE system SHALL emit at most one `contact_submitted` event without including the sender's name, email address, message, Turnstile token, or raw IP address.
4. IF a contact submission is rejected or persistence fails, THEN THE system SHALL NOT emit `contact_submitted`.
5. THE Sentry implementation SHALL capture both browser and server failures, upload usable source maps, and associate events with the deployed release identifier.
6. WHEN one controlled browser error and one controlled route-handler error are generated for the same deployment, THE Sentry project SHALL show de-minified stack traces under the same release.
7. WHEN monitoring captures URLs or request context, THE system SHALL redact preview secrets, Turnstile tokens, contact fields, webhook URLs, and other documented sensitive values before transmission.
8. WHEN a new Sentry issue or configured error spike is generated, THE alert path SHALL deliver to `#katbose-alerts`.
9. THE monitoring implementation SHALL NOT expose server-only secret identifiers or values in built client assets.

### Requirement 6: Phase 1 Vendor and Account Verification

**User Story:** As the project owner, I want a minimal verified vendor inventory so that Phase 1 operations do not depend on an unconfirmed account or hidden credential.

#### Acceptance Criteria

1. THE Phase 1 inventory SHALL record a dated, non-secret confirmation for the production Cloudflare Worker and zone, Images transform capability, Turnstile widget and binding, Supabase project, npm package, Upstash limiter, PostHog EU project, Sentry project, `#contact-form`, and `#katbose-alerts`.
2. WHEN Upstash is verified, THE evidence SHALL demonstrate one successful limiter operation and the documented fail-closed behavior.
3. WHEN Sentry is verified, THE evidence SHALL satisfy Requirement 5's browser, server, release, source-map, and alert criteria.
4. WHEN Slack is verified, THE evidence SHALL demonstrate delivery through both the contact and alerts paths without exposing either webhook URL.
5. THE inventory SHALL identify ownership and a recovery path without storing passwords, recovery codes, tokens, or private keys in Git.
6. THE Phase 1 inventory SHALL NOT require Cloudflare Access for the CMS, Render, AI Search, or another later-phase service.
7. WHEN configuration or documentation changes are committed, THE required gitleaks check SHALL continue to pass.

### Requirement 7: Design-Reference Completion

**User Story:** As a visitor, I want motion, keyboard interaction, and layout behavior to remain accessible and stable so that the design works across user preferences and input methods.

#### Acceptance Criteria

1. WHEN a visitor switches between human and agent modes, THE affected content SHALL use the documented crossfade duration rather than an abrupt state change.
2. WHEN a visitor opens or closes a disclosure or accordion covered by the interaction catalogue, THE component SHALL use the documented smooth transition without breaking keyboard semantics.
3. WHILE reduced motion is requested, THE intro, reveal, count-up, marquee, hover, shine, crossfade, disclosure, and theme-transition behaviors SHALL remove non-essential motion while preserving final content and controls.
4. WHEN keyboard focus enters the open mobile menu, THE focus trap SHALL cycle in both directions, Escape SHALL close the menu and restore the trigger, and every focused control SHALL have a visible focus indicator.
5. WHEN a fresh session displays the intro loader and the profile fallback, THE measured cumulative layout shift SHALL remain exactly zero.
6. THE canonical `/agent`, generated `/llms.txt`, sitemap inputs, and other agent outputs SHALL continue to derive from the shared typed public-route manifest.
7. WHEN `npx katbose` is run from a documented cold-cache environment, THE package SHALL display the card within three seconds and the retained evidence SHALL identify the package version and environment.
8. BEFORE closing the no-copied-upstream-files gate, THE project SHALL retain a dated human review that identifies the compared upstream revision and confirms that no upstream source file was copied into the implementation.

### Requirement 8: Registered-Zone Media Fallback Proof

**User Story:** As a visitor, I want images to remain visible when Cloudflare transformation fails so that an optimization outage does not remove content.

#### Acceptance Criteria

1. IF the registered-zone image gate remains in Phase 1, THEN the production environment SHALL provide an approved synthetic immutable object in the public `media` origin for repeatable verification.
2. WHEN the original proxy is requested for the fixture, THE response SHALL return HTTP 200, the expected image content type, immutable cache headers, and the recorded fixture hash.
3. WHEN a supported Cloudflare transform is requested, THE response SHALL decode as an image with the expected transformed dimensions or format.
4. WHEN the same transform is requested again after cache population, THE response SHALL provide recorded evidence of a Cloudflare cache hit.
5. WHEN transform failure is forced while `onerror=redirect` is enabled, THE response SHALL still decode to the original fixture image and match its expected content hash.
6. IF no production media fixture is available, THEN the gate SHALL remain explicitly blocked and SHALL NOT be represented as complete.
7. IF the gate is formally moved to Phase 2, THEN an approved decision and corresponding roadmap change SHALL be recorded before Phase 1 is closed.
8. THE repeatable probe SHALL accept configuration without embedding Supabase or Cloudflare credentials in source or artifacts.

### Requirement 9: Reproducible Lighthouse Gate

**User Story:** As a visitor, I want the production portfolio to meet its stated quality threshold so that it remains fast, accessible, and discoverable.

#### Acceptance Criteria

1. THE repository SHALL provide a reproducible non-interactive Lighthouse command for the production Worker or a production-equivalent OpenNext Workers preview.
2. WHEN the gate runs, THE browser profile SHALL be clean, the intro-loader path SHALL be exercised, and the viewport and throttling profile SHALL be documented.
3. WHEN three mobile gate runs are retained, EACH run SHALL score at least 95 for Performance, Accessibility, and SEO.
4. WHEN the gate runs, THE measured Largest Contentful Paint SHALL be no greater than 2.5 seconds and cumulative layout shift SHALL remain zero.
5. THE gate SHALL retain machine-readable and human-readable reports as CI artifacts without including secrets or personal data.
6. WHEN any Phase 1 UI behavior, font, image, analytics script, error-monitoring script, or security header changes after a passing audit, THE Lighthouse gate SHALL run again before closure.
7. IF any required category or web-vital threshold fails, THEN Phase 1 SHALL remain open.

### Requirement 10: Documentation and Status Integrity

**User Story:** As a maintainer, I want the roadmap and operational documentation to match verified behavior so that the next phase starts from a trustworthy baseline.

#### Acceptance Criteria

1. WHEN P1-01 is documented, THE roadmap and testing guide SHALL describe the committed static Open Graph PNG rather than a dynamic Phase 1 image route.
2. WHEN deployment status is documented, THE testing guide SHALL reflect the recorded protected-main Workers Builds deployment evidence.
3. WHEN npm package status is documented, THE environment inventory SHALL reflect the recorded `katbose@0.0.2` registry parity evidence.
4. UNTIL Requirement 5 is satisfied, THE roadmap SHALL NOT represent the complete Sentry and PostHog contract as fully wired.
5. WHEN a pending issue is completed, THE corresponding roadmap checkbox SHALL be updated only after its acceptance evidence has been retained.
6. THE final Phase 1 documentation SHALL distinguish automated proof, production proof, a blocked prerequisite, and an accepted deferral.
7. THE Phase 1 closure update SHALL NOT reopen or expand the completed backup implementation merely to satisfy Foundation scope.

## Correctness Properties for the Design Phase

These are candidates for property-based or generative tests. The design phase shall select the appropriate framework and map each retained property to executable coverage.

1. **Turnstile acceptance equivalence:** Verification succeeds if and only if the response is successful, the action is exactly `contact`, the hostname is canonical, the token length is valid, and the provider response is valid; every generated alternative fails closed.
2. **Contact side-effect ordering:** Across generated dependency outcomes, an invalid or degraded branch performs no write or notification; at most one write occurs; notification occurs only after a successful write; notification failure cannot change an already accepted response.
3. **URL-redaction idempotence:** Sanitizing a URL twice yields the same result as sanitizing it once, removes every `secret` value regardless of parameter position, and preserves unrelated properties.
4. **Pseudonym safety:** The same IP/key/epoch yields the same fixed-length pseudonym; changing the key or epoch changes the pseudonym; output never contains the source IP.
5. **Image-width monotonicity:** For every requested width, the selected width is an allowed variant, never decreases when the request increases, rounds up while an allowed larger variant exists, and clamps at the maximum.
6. **Route-manifest consistency:** Public route paths are unique; every indexable route appears exactly once in generated agent and sitemap outputs; non-indexable routes do not appear.

## Evidence Matrix

| Requirement | Automated evidence                                     | Production/manual evidence                                 |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| 1           | Spec and checklist validation                          | Dated evidence references                                  |
| 2           | Workers-runtime Spike A suite in CI                    | None beyond the production-equivalent runtime              |
| 3           | Contact route decision-table and property tests        | None                                                       |
| 4           | No real-vendor calls in CI                             | Fresh token, replay, limiter, row, and Slack proof         |
| 5           | Unit/integration tests, build and source-map checks    | PostHog events, Sentry stacks, release, and alert delivery |
| 6           | gitleaks and client-bundle secret scan                 | Dated resource inventory and controlled service probes     |
| 7           | Reduced-motion, keyboard, route, and CLS tests         | Cold-cache package timing and provenance review            |
| 8           | Probe contract validation                              | Original, transform, cache-hit, and forced-fallback proof  |
| 9           | Non-interactive Lighthouse command and threshold check | Retained production or production-equivalent reports       |
| 10          | Documentation consistency review                       | Approval of any explicit deferral                          |

## Exit Condition

Phase 1 is complete only when every P1 issue is either:

- satisfied with the evidence required above, or
- explicitly removed from Phase 1 by an approved decision that updates the authoritative roadmap.

A blocked item, an undocumented manual observation, or an unchecked production integration cannot satisfy the exit condition.
