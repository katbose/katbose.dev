# 14 — Privacy & Compliance

[← Back to PLAN.md](../PLAN.md)

---

## 14.1 Why this matters here

The site stores **HMAC IP pseudonyms with non-secret key epochs, country, referrer, browser, device,
contact submissions and AI queries**. Under GDPR, a pseudonymized IP combined with other
identifiers can still be personal data.
Recruiters in the EU will visit this site, so the obligations are real even though it is a
personal project.

The approach: collect the minimum, hash what is unavoidable, retain briefly, and disclose plainly.

---

## 14.2 No cookie banner — and why that is defensible

**Decision: no cookie consent banner.**

| Cookie / storage | Purpose | Consent needed? |
| --- | --- | --- |
| PostHog | Analytics in **memory-only mode** (`persistence: "memory"`, no persistent browser storage) | No |
| `__prerender_bypass`, `__preview_scope` | Draft preview session, admin only, 15-minute life | No — strictly necessary |
| Cloudflare Access | Authentication for admin surfaces | No — strictly necessary |
| Turnstile | Bot detection, privacy-preserving by design | No |
| Theme preference (`localStorage`, written only after a manual toggle) | Remembers an explicit light/dark choice ([19-design-reference.md](19-design-reference.md)) | No — strictly necessary/functional |

Strictly necessary and functional cookies are exempt from consent requirements. Because no
tracking cookies are set at all, a banner would be theatre — and banners are exactly the kind of
friction the "recruiter experience first" principle rejects.

**Constraint this creates:** PostHog **session replay and person identification must stay disabled**. Enabling either changes
the analysis above and would require updating this document and the privacy policy first.

---

## 14.3 Data inventory

| Data | Where | Why | Retention |
| --- | --- | --- | --- |
| HMAC IP pseudonym + epoch | `download_logs`, `ai_query_logs`, Upstash keys | Rate limiting, abuse detection | Daily purge at 90 days; epochs never correlated |
| User-Agent hash, browser, device | `download_logs` | Download analytics | 90 days |
| Country, referrer | `download_logs` | Analytics | 90 days |
| Resume version served | `download_logs` | Which version a recruiter received | 90 days |
| Contact name, email, message | `contact_submissions` | To reply | Until manually cleared |
| AI queries + sources | `ai_query_logs` | Quality review, injection detection | 90 days |
| Product events | PostHog | Analytics | PostHog default |
| Error reports | Sentry | Debugging | Sentry default |

**Never stored:** raw IP addresses, any IP-derived value on `contact_submissions`, full user-agent
strings alongside an identifiable IP, session recordings, or any credential.

---

## 14.4 Retention & purge

```sql
delete from download_logs     where created_at < now() - interval '90 days';
delete from ai_query_logs     where created_at < now() - interval '90 days';
delete from dead_letter_queue where resolved and resolved_at < now() - interval '90 days';
```

Runs **daily** (or more frequently) and independently enforces the 90-day ceiling. Quarterly HMAC
key rotation is a separate operation: old epochs may coexist until their rows age out, but epochs
are never correlated or backfilled. Rotation must never delay deletion.

---

## 14.5 Privacy policy page

`/privacy` — one page, plain language, linked from the footer and from the contact form. Contents:

1. **Who** — Kat Bose, im@katbose.dev
2. **What is collected** — the inventory in §14.3, in ordinary words
3. **Why** — abuse prevention, analytics, replying to messages
4. **How long** — 90 days for logs; contact messages kept until cleared
5. **Cookies** — none used for tracking; analytics is cookieless; functional cookies listed
6. **Processors** — Cloudflare (hosting + edge), Render, Supabase, Upstash, PostHog, Sentry, Slack
7. **Rights** — access, correction, deletion, with an email address to request them
8. **Changes** — a "last updated" date

Written to be read, not to be defended: a short honest page is worth more than a template.

---

## 14.6 Consent-adjacent notices

- **Contact form:** *By submitting, you agree this message may be stored so I can reply.*
- **Ask AI:** *AI-generated answer based on portfolio content — may be imperfect. Check the cited
  sources.* Plus a note that queries are logged to improve the search.
- **Resume download:** no notice required — no personal data is collected from the visitor beyond
  the hashed technical metadata already disclosed in the policy.

---

## 14.7 Internationalisation — explicitly out of scope

**i18n** (internationalisation, "i" + 18 letters + "n") is the practice of building an application
so it can support multiple languages and locales: locale-prefixed routing (`/en/blog`, `/hi/blog`),
translated UI strings, and locale-aware dates and number formats.

**Decision: not needed. English only.**

This is recorded explicitly so nobody — including a future me or an AI assistant — retrofits
locale routing "just in case". If it is ever genuinely required, it is a deliberate project with
its own plan, not a quiet addition.

---

## 14.8 Compliance checklist

- [ ] Privacy policy published and linked in the footer
- [ ] PostHog confirmed running cookieless; session replay disabled
- [ ] Retention purge scheduled and verified once
- [ ] HMAC pseudonym key/epoch rotation reminder in the calendar (quarterly; independent of purge)
- [ ] No raw IPs anywhere in the schema or logs
- [ ] Sentry and PostHog URL redaction confirmed for `?secret=`
- [ ] Contact form notice present
- [ ] Ask AI disclaimer present under every answer
- [ ] Processor list in the policy matches the services actually in use
