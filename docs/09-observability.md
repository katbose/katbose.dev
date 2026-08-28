# 09 — Observability, Alerting & Private Dashboard

[← Back to PLAN.md](../PLAN.md)

---

## 9.1 Stack

| Concern | Tool | Free tier |
| --- | --- | --- |
| Product analytics | **PostHog** (cookieless) | ~1M events/month |
| Error monitoring | **Sentry** (`@sentry/nextjs`) | ~5k errors/month |
| Alerting | **Slack** incoming webhooks + Sentry email | Free |

**Retired options:** Umami, OpenPanel, Vercel Analytics, Grafana. Three overlapping analytics
tools plus a dashboarding layer contradicted the "one responsibility per vendor" constraint for a
personal site. PostHog wins because it covers pageviews, funnels and event analytics in one place —
which is what the resume-download funnel and Ask AI usage questions actually need.

---

## 9.2 PostHog

```bash
pnpm add posthog-js posthog-node
```

- Client provider in `app/providers.tsx`; server client for route handlers
- **Memory-only mode** — `persistence: "memory"`; no persistent browser storage is used for
  analytics ([14-privacy-and-compliance.md](14-privacy-and-compliance.md))
- **No session replay** and no person identification unless the privacy policy and consent analysis
  are deliberately revisited first
- `sanitize_properties` redacts `?secret=` from any captured URL

**As implemented:** redaction lives in `apps/web/lib/monitoring/redact.ts` and is shared by the
PostHog `sanitize_properties` hook and both Sentry `beforeSend` handlers, so a secret cannot be
stripped on one surface and forwarded on another. It sweeps every string property rather than only
`$current_url`, and it is idempotent. `posthog-node` is **not** installed: server events go to the
documented capture endpoint with a plain `fetch`, keeping the analytics SDK out of the Worker
script budget (decision [#97](16-decision-log.md)).

```ts
// apps/web/lib/monitoring/posthog-config.ts
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  persistence: "memory",
  disable_session_recording: true,
  sanitize_properties: (properties) => {
    if (typeof properties.$current_url === "string") {
      properties.$current_url = properties.$current_url.replace(/([?&]secret=)[^&]+/, "$1[REDACTED]");
    }
    return properties;
  },
});
```

**Events to capture**

| Event | Where |
| --- | --- |
| `pageview` | Automatic |
| `resume_download_clicked` / `resume_download_succeeded` / `resume_download_blocked` | Resume page + route handler |
| `ask_ai_query_submitted` / `ask_ai_answered` / `ask_ai_no_answer` | Ask AI route |
| `project_github_clicked` / `project_demo_clicked` | Project pages |
| `contact_submitted` | Contact route |
| `blog_post_read` (scroll depth threshold) | Blog pages |

---

## 9.3 Sentry

```bash
pnpm add @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Covers both client and server (route handler) errors. Configure:

- `tracesSampleRate` low — this is a portfolio, not a high-traffic app
- `beforeSend` redaction for the preview secret
- Source maps uploaded at build time
- Release tagging tied to the deployment SHA

```ts
// apps/web/lib/monitoring/sentry-config.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/([?&]secret=)[^&]+/, "$1[REDACTED]");
    }
    return event;
  },
});
```

Sentry fills the gap v1.0 had entirely: nothing else in the stack catches runtime errors in
production.

---

## 9.4 Slack channels

Two channels, deliberately separate:

| Channel | Receives |
| --- | --- |
| `#contact-form` | Contact form submissions only — leads must never be buried |
| `#katbose-alerts` | Sentry new-issue and error-spike rules, content sync failures, DLQ writes, rate-limiter outages, abuse spikes, flagged AI queries, nightly reconciliation summary, backup failures and stale-backup warnings |

Setup: Sentry → Settings → Integrations → Slack → connect workspace → alert rules ("new issue",
"error rate spike") routed to `#katbose-alerts`. Sentry email alerts stay enabled as a backstop.

**Security-critical alerts are posted directly from application code** via Slack Incoming Webhooks
rather than through analytics-tool alerting — more reliable and immediate for abuse thresholds and
dead-letter events.

---

## 9.5 Alert catalogue

| Alert | Trigger | Channel |
| --- | --- | --- |
| New Sentry issue | First occurrence | `#katbose-alerts` + email |
| Error rate spike | Sentry rule | `#katbose-alerts` |
| Content sync failed | DLQ row written | `#katbose-alerts` |
| Sync unrecoverable | DLQ row hits 5 attempts | `#katbose-alerts` (manual action needed) |
| Nightly reconciliation summary | Any recovered / failing / gap-filled / stale count > 0 | `#katbose-alerts` |
| Rate limiter unreachable | Upstash timeout or error | `#katbose-alerts` |
| Resume abuse spike | 50+ blocked attempts in one hour | `#katbose-alerts` |
| Ask AI global cap reached | Daily counter hits 50 | `#katbose-alerts` |
| Flagged AI queries spike | > 10 flagged in a day | `#katbose-alerts` |
| Weekly backup failed | Scheduled workflow fails or publishes no verified completion marker | GitHub Actions email immediately; `#katbose-alerts` when the Phase 5 external freshness monitor exists |
| Backup stale | Newest valid R2 completion marker is older than 8 days | `#katbose-alerts` (Phase 5 external monitor; it must not depend on the workflow it watches) |
| New contact submission | Every submission | `#contact-form` |

Alert dispatch is always non-blocking — a failed Slack call must never fail a user's request.
For a contact form, the submission is written first; a later Slack failure is an owner alert, not
a visitor-facing error.

---

## 9.6 Private dashboard

`dashboard.katbose.dev`, behind Cloudflare Access, reads from Supabase with server-side queries
only. It is intentionally a **Phase 5** service: until the operational data justifies it, PostHog,
Sentry and Slack are the dashboard. This avoids spending Render free-service hours on an unused
application. When it is introduced, it is a plain Next.js app — no Grafana, no extra
infrastructure.

| Group | Widgets |
| --- | --- |
| **Resume** | Downloads over time, blocked requests, Turnstile challenges, breakdown by resume version |
| **Projects** | Most viewed, GitHub clicks, demo clicks |
| **Blog** | Most read articles, popular tags |
| **TIE** | Most viewed notes |
| **Ask AI** | Most searched topics, failed / no-answer queries, **flagged (injection-suspect) queries**, daily usage vs the 50/day cap |
| **Visitors** | Countries, referrers, devices |
| **Site health** | Lighthouse score, SEO score, latest deployment, uptime, broken links, **dead-letter queue depth**, last successful reconciliation, newest complete backup age and last restore-drill result |

The flagged-query panel and DLQ depth are the two widgets that exist for operational reasons
rather than vanity — check them weekly.

---

## 9.7 Weekly review ritual

Ten minutes, once a week:

1. `#katbose-alerts` — anything unresolved?
2. GitHub Actions + private R2 — did the newest weekly run succeed, and is a valid completion marker less than 8 days old?
3. Dashboard → DLQ depth should be 0, last reconciliation should be today
4. Dashboard → flagged AI queries — any real probing?
5. Sentry → unresolved issues
6. PostHog → resume funnel and Ask AI usage trend

Quarterly, add: rotate `IP_PSEUDONYM_KEY`, increment `IP_PSEUDONYM_EPOCH`, verify no cross-epoch
correlation, and confirm the latest backup restores. The independent daily job—not this ritual—
enforces the 90-day telemetry purge ([10-backups-and-portability.md](10-backups-and-portability.md)).
