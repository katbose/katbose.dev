# 08 — Resilience & Fallbacks

[← Back to PLAN.md](../PLAN.md)

---

## 8.1 Principle

**Retry first, degrade gracefully second, never show a raw error.**

Every external dependency has a defined failure behaviour. Nothing in the design is allowed to
turn a third-party hiccup into a broken page.

| Dependency | Failure behaviour |
| --- | --- |
| Payload / Render (CMS) | ISR serves last-good content; only a never-cached page shows a fallback component |
| Payload site identity assets | Last-good metadata/Home output remains cached; otherwise bundled profile/favicon defaults render |
| Cloudflare AI Search | 2 retries with backoff, then an inline retry message — the feature stays visibly on |
| Supabase signed URLs | 5s timeout → one retry → `/resume-unavailable` with real next actions |
| Upstash | Fail open (resume) / fail closed (Ask AI, contact), plus a Slack alert |
| Content webhook | Retry → dead-letter queue → Slack → nightly reconciliation |
| Slack | Non-blocking; a failed notification never fails the user's request |

**Universal rule:** every outbound `fetch` sets an explicit `AbortSignal.timeout(...)`. An
unbounded fetch can hang a render, a build, or a serverless invocation until it is killed.

---

## 8.2 CMS down — ISR as the shield

Next.js ISR uses a stale-while-revalidate model: if a background revalidation fetch throws, the
**previously cached page is still served**. A failed revalidation does not invalidate the page.
The only genuinely exposed case is a page that has never been cached — a brand-new route on a
fresh deploy while the CMS is asleep.

```ts
// apps/web/app/blog/[slug]/page.tsx
export const revalidate = 3600;

async function getPost(slug: string) {
  const res = await fetch(
    `${process.env.CMS_URL}/api/blog-posts?where[slug][equals]=${encodeURIComponent(slug)}`,
    { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`CMS returned ${res.status}`);
  return res.json();
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const post = await getPost(slug);
    return <BlogPostView post={post} />;
  } catch {
    // Reached only when there is no cached version at all.
    return <CmsUnavailableFallback />;
  }
}
```

List pages return `null` instead of throwing, so an outage renders a calm fallback rather than
crashing the route:

```ts
// apps/web/app/blog/page.tsx
async function getPosts() {
  try {
    const res = await fetch(`${process.env.CMS_URL}/api/blog-posts`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("CMS unreachable");
    return res.json();
  } catch {
    return null;
  }
}

export default async function BlogIndex() {
  const posts = await getPosts();
  if (!posts) return <CmsUnavailableFallback />;
  if (posts.docs.length === 0) return <EmptyState message="No posts yet." />;
  return <BlogList posts={posts.docs} />;
}
```

```tsx
// apps/web/components/fallbacks/cms-unavailable-fallback.tsx
export function CmsUnavailableFallback() {
  return (
    <div className="py-20 text-center">
      <h2 className="text-xl font-medium">Content temporarily unavailable</h2>
      <p className="mt-2 text-muted-foreground">
        I&apos;m having trouble loading this right now. Please check back shortly.
      </p>
      <a href="/" className="mt-4 inline-block underline">← Back to home</a>
    </div>
  );
}
```

Note the distinction: `null` means "the source failed", `docs.length === 0` means "there is
genuinely nothing here". They deserve different messages.

**Build-time safety:** builds must not fail because Render is asleep. Content fetches during
`generateStaticParams` are wrapped so a failure yields a smaller static set rather than a broken
deploy, with the missing pages filled in on demand.

---

## 8.3 Resume download failure

Two tiers, defined in full in [04-resume-system.md](04-resume-system.md):

1. **Retry** — one more signed-URL attempt covers transient Supabase blips.
2. **Fallback page** — `/resume-unavailable` offers "View Resume Online" (rendered from CMS
   content, no Storage dependency) and "Contact Me".

A recruiter is never left on a blank page or a JSON error body.

---

## 8.4 Ask AI — resilience without a maintenance state

Ask AI is required to be **always visible and resilient, not always active**. Dependency failure,
fail-closed limiting or capacity exhaustion keeps the page, input and examples in place while an
honest inline unavailable, retry or capacity state explains that the backend cannot answer. There
is no page-level maintenance state and the UI never implies that an unavailable backend is active
(decision #86).

- 2 retries with 500ms / 1000ms backoff, 8s timeout
- Transport failures return **HTTP 200** with `{ success: false, message }`
- The client renders that as an inline notice beside the input; the form, page and example queries
  stay exactly where they were
- Only a true network failure (visitor offline) produces "check your connection"

```tsx
async function handleAsk(query: string) {
  setLoading(true);
  try {
    const res = await fetch("/api/ask-ai", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!data.success) {
      setAnswer(null);
      setNotice(data.message); // soft inline message, never a page-level error
      return;
    }
    setAnswer(data);
    setNotice(null);
  } catch {
    setNotice("Connection issue — please check your network and try again.");
  } finally {
    setLoading(false);
  }
}
```

Returning 200 for a handled backend failure is deliberate: it is a UX message, not an HTTP-level
error, and it keeps Sentry noise focused on genuine faults.

---

## 8.5 Error boundaries

```text
app/not-found.tsx      → 404, links to Home / Blog / Ask AI
app/error.tsx          → route-level boundary with a "Try again" reset button
app/global-error.tsx   → root crash fallback, minimal and dependency-free
```

`global-error.tsx` must not import anything that could itself be the cause of the crash — no
providers, no CMS data, no analytics wrappers.

---

## 8.6 Verification

Resilience that is never tested does not exist. Each of these is a checklist item in its phase:

| Test | How |
| --- | --- |
| CMS outage | Stop the Render service, load blog index and a cached post, confirm cached content and the fallback component |
| Signed URL failure | Point the storage path at a missing object, confirm the redirect to `/resume-unavailable` |
| AI Search outage | Set an invalid endpoint, confirm the inline retry notice and that the page still looks normal |
| Limiter outage | Set an invalid Upstash token, confirm resume downloads succeed and Ask AI / contact refuse |
| Webhook failure | Break the index endpoint, confirm a `dead_letter_queue` row, a Slack alert, and recovery on the nightly run |
