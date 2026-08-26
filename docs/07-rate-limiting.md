# 07 — Rate Limiting & Form Protection

[← Back to PLAN.md](../PLAN.md)

---

## 7.1 Two layers

| Layer | Tool | Role |
| --- | --- | --- |
| Edge | Cloudflare Rate Limiting Rules | Blocks obvious abuse before it reaches the origin. Cheap, coarse, no code. |
| Application | Upstash Redis (`@upstash/ratelimit`) | Precise per-route business rules with sliding windows. |

**Why not Postgres counters:** it means reimplementing sliding-window logic, running a cleanup
cron, and hitting the primary database on every single request check. Upstash does the same job in
a few lines, and its free tier (10k commands/day) is far beyond a portfolio's volume.

**Why not Cloudflare alone:** the free tier's rules cannot cleanly express combined tiers such as
"5/hour **and** 20/day, per HMAC IP pseudonym, with a separate global daily cap" without Workers.

Using both means the edge absorbs floods while the app enforces the actual policy.

---

## 7.2 Policy

| Route | Limit | Failure mode | Rationale |
| --- | --- | --- | --- |
| `/api/resume/download` | 5/hour, 20/day per HMAC IP pseudonym | **Fail open** | A recruiter must never be blocked because Upstash had a bad minute; Cloudflare still guards the edge |
| `/api/ask-ai` | 5/hour per HMAC IP pseudonym **+ 50/day global** | **Fail closed** | Protects LLM spend and the free tier; tight enough that no Turnstile escalation is needed ([03-search-and-ai.md](03-search-and-ai.md) §3.8) |
| `/api/contact` | 3/hour, 10/day per HMAC IP pseudonym | **Fail closed** | Spam protection outweighs brief inconvenience; Turnstile still passes real users |

Cloudflare edge rules complement these, e.g. ~30 req/min per IP on `/api/resume/download` and
~10 req/min per IP on `/api/ask-ai`.

Progressive friction on the resume route: **normal → immediate · heavy → Turnstile · extreme →
temporary block.**

---

## 7.3 Shared helper

Failure mode is an explicit argument at every call site, so the behaviour is deliberate and
greppable rather than buried in a default.

```ts
// apps/web/lib/rate-limit/check.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const limiters = {
  resumeHour: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 h") }),
  resumeDay: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 d") }),
  askAi: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 h") }),
  contactHour: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "1 h") }),
  contactDay: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 d") }),
} as const;

type FailureMode = "open" | "closed";

export async function checkRateLimit(
  key: keyof typeof limiters,
  identifier: string,
  failureMode: FailureMode,
): Promise<{ allowed: boolean; degraded: boolean }> {
  try {
    const result = await Promise.race([
      limiters[key].limit(identifier),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("upstash-timeout")), 2000)),
    ]);
    return { allowed: result.success, degraded: false };
  } catch (err) {
    console.error(`Rate limiter unavailable for ${key}:`, err);
    void notifyLimiterDown(key); // Slack, deduped per instance
    return { allowed: failureMode === "open", degraded: true };
  }
}
```

The 2-second timeout matters: without it, an Upstash outage turns into a hung request rather than
a fast degraded decision.

---

## 7.4 Global Ask AI cap

Per-IP limits stop one abuser. They do not stop a hundred visitors from draining the free tier on
the day a post goes viral.

```ts
// apps/web/lib/rate-limit/ask-ai-global.ts
const DAILY_GLOBAL_CAP = 50;

export async function checkGlobalAskAiCap() {
  const key = `ask-ai:global:${new Date().toISOString().slice(0, 10)}`;
  try {
    // One atomic operation: a successful INCR can never be left without an expiry.
    const count = await redis.eval<number>(
      `local count = redis.call("INCR", KEYS[1])
       if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
       return count`,
      [key],
      [String(60 * 60 * 26)], // survive DST edges
    );
    return { allowed: count <= DAILY_GLOBAL_CAP, count };
  } catch {
    return { allowed: false, count: -1 }; // fail closed
  }
}
```

The counter is deliberately atomic. A separate `INCR` followed by `EXPIRE` can leave an immortal
counter if the first command succeeds and the second fails, permanently capping Ask AI at zero
remaining questions.

At the cap the UI shows "Ask AI is at capacity for today — browse the blog or projects meanwhile".
The counter is also a clean usage metric for the dashboard.

---

## 7.5 Contact form protection

The contact form has no "normal usage" baseline to compare against, so **Turnstile is always on**
here — unlike the resume route, where it only escalates.

```text
Client: Turnstile widget (invisible) + hidden honeypot field
   │
   ▼
POST /api/contact
   1. verify Turnstile token server-side
   2. honeypot filled? → silently accept-and-discard, log as bot
   3. rate limit 3/hour + 10/day per HMAC IP pseudonym [FAIL CLOSED]
   4. Zod validation — required fields, max lengths, email shape
   5. insert into contact_submissions (service role, RLS-protected)
   6. POST to Slack #contact-form webhook
   7. respond 200
```

```ts
// apps/web/app/api/contact/route.ts (core)
const ContactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  message: z.string().min(10).max(5000),
  website: z.string().max(0).optional(), // honeypot: must stay empty
  turnstileToken: z.string().min(1),
});
```

**Honeypot detail:** a bot that fills the hidden `website` field gets a normal-looking 200
response. Telling it that it failed just teaches the operator to fix their script.

**Slack notification** — a **dedicated** webhook and channel, separate from `#katbose-alerts`, so
real leads are never buried in monitoring noise. It runs only after the submission has been
stored, has a short timeout, and is non-blocking:

```ts
try {
  await fetch(process.env.SLACK_CONTACT_WEBHOOK_URL!, {
    method: "POST",
    body: JSON.stringify({
      text: `:incoming_envelope: New contact form submission\n*Name:* ${name}\n*Email:* ${email}\n*Message:* ${message}`,
    }),
    signal: AbortSignal.timeout(3000),
  });
} catch (err) {
  console.error("Contact Slack notification failed (submission was saved):", err);
  void notifyContactNotificationFailure();
}
```

**Fail-closed UX:** if Turnstile, the limiter, validation or the database write fails, the form
shows "Something went wrong — please email me directly at …" with a real address. A Slack
failure does **not** fail the form: the message is already stored, and an alert is raised for the
owner.

**Notice under the form** (no cookie banner needed, see
[14-privacy-and-compliance.md](14-privacy-and-compliance.md)):

> By submitting, you agree this message may be stored so I can reply.

---

## 7.6 Turnstile

Chosen over reCAPTCHA because it is free, privacy-friendly, invisible in the common case, and
does not require a consent banner.

| Route | When shown |
| --- | --- |
| Contact form | Always (invisible widget) |
| Resume download | Only on suspicion — heavy usage from one HMAC IP pseudonym, bad User-Agent, Cloudflare bot signals ([04-resume-system.md](04-resume-system.md) §4.3.1) |

Ask AI deliberately has **no** Turnstile escalation — the 5/hour per-IP limit, 50/day global
cap, fail-closed limiter and Cloudflare billing alerts are the controls for that route; see
[03-search-and-ai.md](03-search-and-ai.md) §3.8.

Tokens are always verified **server-side** against Cloudflare's `siteverify` endpoint. A
client-side "success" callback proves nothing.

---

## 7.7 Alerting

Security-critical thresholds post directly to Slack from application code rather than relying on
analytics-tool alerting, which is slower and less reliable for this purpose:

- Rate limiter unreachable
- Abuse spike, e.g. 50+ blocked resume attempts in one hour
- Ask AI global cap reached
- Flagged (injection-suspect) AI queries over 10/day

---

## 7.8 Testing

Unit tests must cover the failure modes explicitly — mock Upstash as unreachable and assert that
resume allows the request while Ask AI and contact deny it. That behaviour is a deliberate
security decision and must not regress silently.
