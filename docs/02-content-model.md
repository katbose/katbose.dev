# 02 — Content Model, CMS & Draft Preview

[← Back to PLAN.md](../PLAN.md)

---

## 2.1 Content types

| Type | Purpose | Polish level |
| --- | --- | --- |
| **Blog** | Long-form technical articles | High — edited, structured, illustrated |
| **TIE** (Things I Explore) | Short engineering-notebook entries | Low — deliberately raw |
| **Projects** | Case studies of things built | High |
| **Experience** | Professional timeline | Structured data, not prose |
| **Knowledge base** | Reference notes and cheat sheets | Lives in a **separate GitHub repo**, not here |

The Blog / TIE distinction is intentional and load-bearing: TIE removes the pressure to polish,
which is what keeps a personal site alive over years. Do not merge them.

**Blog examples:** Portfolio Architecture · Payload CMS vs Strapi · Cloudflare AI Search ·
Resume Download Security · Next.js deep dives.

**TIE examples:** How signed URLs work · Docker notes · PostgreSQL indexing · React Compiler
observations.

### 2.1.1 Deterministic local fixture content

Real content remains independent from the codebase, but every component and workflow needs
representative data while it is being built. `pnpm --filter cms seed:dev` creates exactly one
local fixture for each content surface:

This fixture set is **approved for the build**. It is scaffolding data only; real resume, project,
experience, blog and TIE content will be entered independently through Payload later.

| Fixture | Required fields exercised |
| --- | --- |
| Blog (`fixture-blog`) | Cover image, excerpt, headings, paragraph, list, code block, tags, related link and reading time |
| TIE (`fixture-tie`) | Short body, date, tag and related link |
| Project (`fixture-project`) | Overview, screenshot, architecture, challenges, lessons, tech stack, GitHub and demo links |
| Experience (`fixture-experience`) | Company, role, location, start/end dates, current flag and bullet highlights |
| Profile media (`fixture-profile.png`) | Synthetic square portrait with alt text, dimensions and an immutable object key |
| Favicon media (`fixture-favicon.png`) | Synthetic square 512×512 PNG with validated signature and an immutable object key |
| Resume (`fixture-resume.pdf`) | One obviously fake PDF uploaded through the Payload `resume-uploads` workflow to prove private Storage, version switching and download fallback |

Rules:

- Every slug/path starts with `fixture-` and every visible title starts with `[Fixture]`; no
  fixture pretends to be Kat's real work.
- The seed command requires `ALLOW_DEV_SEED=true` **and throws in production**. CI runs it only
  against local Supabase/Payload.
- Seed requests set `skipSearchSync: true`; fixtures never enter the production AI Search index,
  PostHog, Slack or contact/download logs.
- The seed is idempotent: rerunning it upserts the same fixtures, and `seed:clear` removes only
  `fixture-*` data.
- Real content is entered later through Payload. In particular, the real resume replaces the
  dummy PDF through the same CMS workflow; Kat's portrait and favicon replace their synthetic
  fixtures through the identity-asset fields below. No personal data is committed to Git.

### 2.1.2 Payload-managed site identity assets

Two Payload globals own identity assets; the Home manifest never stores their URLs:

| Global | Field | Contract |
| --- | --- | --- |
| `Profile` | `profileImage` | Required upload relation to `media`; signature-verified PNG, JPEG or WebP; maximum 2 MiB; minimum 512×512; focal point/crop enabled |
| `Profile` | `profileImageAlt` | Required meaningful text describing Kat's portrait; never inferred from the filename |
| `SiteSettings` | `favicon` | Required upload relation to `media`; signature-verified square PNG only; maximum 512 KiB; minimum 512×512; SVG and renamed non-images rejected |

Implementation rules:

- Only authenticated Payload admins may update either global. Public reads expose only the
  published relation and safe media metadata; browser code never receives a CMS credential or
  initializes Supabase.
- Upload hooks verify MIME, magic bytes, dimensions and limits before persistence. Objects use
  collision-safe immutable UUID keys with overwrite disabled; replacing an asset creates a new key.
- The favicon upload generates immutable 32, 48, 180, 192 and 512 pixel PNG variants at publish
  time. Next.js metadata references their same-origin paths; no runtime icon or image CDN is added.
- A signed Payload `afterChange` event revalidates Home for `Profile` changes and root metadata/icon
  output for `SiteSettings` changes. Identity assets set `skipSearchSync: true` and never enter AI
  Search, agent Markdown or `llms.txt`.
- Phase 1 ships a project-owned default portrait and favicon with reserved dimensions. Last-good
  ISR/metadata wins during CMS failure; if no published relation exists, the bundled defaults render
  instead of a broken image or missing browser icon.
- The portrait uses the approved same-zone responsive media path. Favicon metadata uses immutable
  same-origin variant URLs so a replacement naturally bypasses aggressive browser caches.

---

## 2.2 Blog feature set

- Payload Lexical authoring as the canonical rich-text source
- Derived Markdown/MDX rendering and portable export
- Reading time
- Table of contents
- Syntax highlighting with copy-code buttons
- Tags
- Related posts
- RSS feed
- Dynamic Open Graph images

---

## 2.3 Project entry shape

Every project page includes: Overview · Screenshots · Architecture · Challenges ·
Lessons learned · Tech stack · GitHub link · Live demo link.

"Challenges" and "Lessons learned" are required fields, not optional — they are the part that
distinguishes a portfolio from a list of links.

---

## 2.4 Resume page

More than a download button. The page renders: Experience · Skills · Education · Certifications ·
Last updated date · **View Resume** (online, server-rendered) · **Download Resume** (PDF, secured).

The online view is rendered from CMS content and does **not** depend on Supabase Storage, which is
what makes it a valid fallback when the download system fails
([04-resume-system.md](04-resume-system.md)).

Uploading a new resume file is a CMS task too — an admin-only `resume-uploads` collection, not a
manual Supabase upload. See [04-resume-system.md §4.4.1](04-resume-system.md).

---

## 2.5 Why Payload, not Strapi

| Criterion | Payload | Strapi |
| --- | --- | --- |
| Next.js integration | First-class, can run in the same TS project | Separate service, REST-first |
| TypeScript support | Config-as-code, generated types | Weaker, more runtime-shaped |
| Developer experience | Code-defined collections, versioned in Git | More admin-UI-driven |
| Draft/preview | Built-in versions + drafts, native preview hook | Available but clunkier |

**Decision: Payload**, hosted separately on Render. Revisit only if the Postgres-adapter/schema
validation in [01-architecture.md](01-architecture.md) fails.

---

## 2.6 Collection access control

Payload's own auth is the real gatekeeper on data mutations — Cloudflare Access is an extra layer,
not the only layer.

```ts
// apps/cms/src/collections/BlogPosts.ts
import type { CollectionConfig } from "payload";

export const BlogPosts: CollectionConfig = {
  slug: "blog-posts",
  versions: { drafts: true },
  access: {
    // A public `read: () => true` would let a caller add `?draft=true` and retrieve a draft.
    // Guests can retrieve only published documents; Payload users retain full access.
    read: ({ req }) =>
      req.user ? true : { _status: { equals: "published" } },
    readVersions: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    /* title, slug, excerpt, content (rich text), tags, publishedAt, coverImage, ... */
  ],
};
```

Apply the same guest-published / authenticated-all `access` block to `tie`, `projects`,
`experience` and `media`. `readVersions` is explicitly authenticated-only for every
version-enabled collection. The `Profile` and `SiteSettings` globals allow published public reads
but authenticated-admin updates only; neither accepts a browser-provided storage URL or object key.

**Hardening checklist for the CMS**

- [ ] Exactly one admin user; public registration disabled
- [ ] Strong password; 2FA plugin if available for the installed Payload version
- [ ] GraphQL playground disabled in production (`graphQL.disablePlaygroundInProduction`)
- [ ] `cors` limited to `https://katbose.dev` and the explicit local development origin only
- [ ] Admin panel additionally fronted by Cloudflare Access ([05-security.md](05-security.md))

---

## 2.7 Field discipline (portability)

Use standard rich text and conventional field types. Avoid exotic custom blocks and deeply nested
bespoke structures.

Reason: the weekly export in [10-backups-and-portability.md](10-backups-and-portability.md)
serialises rich text to Markdown. Every custom block is a special case in that serialiser and a
future migration cost. Content portability is a design constraint on the schema, not an
afterthought.

---

## 2.8 Draft preview — what it is and why it is required

Payload keeps an unpublished **draft** version of a document alongside the **published** one.
Without preview, the only way to check formatting on the real site is to publish, look, and
unpublish if it is wrong — a bad workflow for a blog written regularly.

Preview mode lets the live Next.js site render the *draft* version for an authenticated editor,
while the public still sees the published version.

**Flow**

```text
Payload admin → "Preview" button
  → GET katbose.dev/api/preview?secret=…&slug=…&collection=…
      → constant-time check of PREVIEW_URL_SECRET
      → enable Next.js Draft Mode and set a signed HTTP-only preview-scope cookie
         ({ collection, slug, issuedAt, expiresAt })
      → 307 redirect to the CLEAN url (/blog/my-post) — secret never appears again
  → page Server Component verifies signature, collection, slug and `expiresAt` before any draft read
      → expired/invalid scope calls a same-origin preview-exit Route Handler, which disables Draft
         Mode, deletes both cookies and redirects to the clean published URL
      → valid scope makes a server-only request to CMS /api/internal/preview-document, signed with
         PREVIEW_INTERNAL_SECRET and a short-lived HMAC timestamp
      → CMS verifies the request and uses Payload's Local API to read that one draft

No middleware is used. Cookie `maxAge` limits storage, while the Server Component's explicit expiry
check is authoritative and prevents an expired cookie from authorizing a draft even before cleanup.
```

The public Payload REST API never serves a draft. The generic public route does not receive a
server credential, so `?draft=true` cannot be used as a preview transport. A preview session is
scoped to the selected document: knowing a valid preview link does not grant access to other
guessable unpublished slugs.

---

## 2.9 Preview is a content-leak vector — the controls

| Risk | Control |
| --- | --- |
| Weak or guessable secret | 256-bit secret from `openssl rand -hex 32` |
| Timing attack on the comparison | `crypto.timingSafeEqual`, never `===` |
| Secret committed to Git | `.gitignore` + `gitleaks` on every push and PR |
| Secret lingering in the address bar / shared links | Validate once, then redirect to a clean URL |
| Draft session left open indefinitely | Signed 15-minute scope checked at every draft-aware Server Component read boundary; expired scope exits through the same-origin preview-exit Route Handler |
| Secret captured by monitoring tools | Redaction in Sentry `beforeSend` and PostHog `sanitize_properties` |
| Preview URLs written to logs | Never log full request URLs on the preview route |
| Public `?draft=true` request | Guest `read` access is constrained to `_status = published`; `readVersions` requires a Payload user |
| Preview link used to browse other drafts | Signed cookie contains one collection + slug; mismatches fetch published content only |
| Browser tries to call the CMS preview route | CMS preview route accepts only an HMAC-authenticated server-to-server request |

### Preview route

```ts
// apps/web/app/api/preview/route.ts (shape)
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { secretMatches } from "@/lib/security/secret-matches";
import type { NextRequest } from "next/server";

const DRAFT_TTL_SECONDS = 15 * 60;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const slug = params.get("slug");
  const collection = params.get("collection");

  if (
    !secretMatches(params.get("secret"), process.env.PREVIEW_URL_SECRET!) ||
    !slug ||
    !collection
  ) {
    return new Response("Invalid preview request", { status: 401 });
  }

  (await draftMode()).enable();
  (await cookies()).set("__preview_scope", signPreviewScope({
    collection,
    slug,
    issuedAt: Date.now(),
    expiresAt: Date.now() + DRAFT_TTL_SECONDS * 1000,
  }), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: DRAFT_TTL_SECONDS,
  });

  redirect(collection === "blog-posts" ? `/blog/${slug}` : `/tie/${slug}`);
}
```

### Expiry enforcement without middleware

```ts
// Server Component guard (shape)
const scope = await getVerifiedPreviewScope();
if (scope && Date.now() >= scope.expiresAt) {
  redirect(`/api/preview/exit?returnTo=${encodeURIComponent(cleanPublishedPath)}`);
}
```

The same-origin `/api/preview/exit` Route Handler validates `returnTo` against an internal relative
path allowlist, calls `(await draftMode()).disable()`, deletes `__preview_scope`, and redirects to
the clean published route. Every draft-aware Server Component performs the expiry/scope check
before the internal CMS call; cookie `maxAge` alone is never treated as authorization.

### Payload preview button

```ts
// apps/cms/src/collections/BlogPosts.ts (admin section)
admin: {
  preview: (doc) =>
    `${process.env.PUBLIC_SITE_URL}/api/preview` +
    `?secret=${process.env.PREVIEW_URL_SECRET}` +
    `&slug=${doc.slug}&collection=blog-posts`,
},
```

`PREVIEW_URL_SECRET` unavoidably appears in that one-time link. `PREVIEW_INTERNAL_SECRET` never
appears in a URL, browser cookie or Payload preview button: it is held only by the web Worker and
CMS. The short life, clean redirect, scope, redaction and no-logging rules exist to contain the
one browser-visible secret.

---

## 2.10 Draft-aware fetching

Content fetchers read from the public published endpoint by default. Draft Mode alone is not
enough: draft fetching is allowed only when the signed scope matches the requested document.

```ts
// apps/web/lib/payload/get-doc.ts
import { draftMode } from "next/headers";

export async function getDoc(collection: string, slug: string) {
  const scope = await getVerifiedPreviewScope();
  const previewingThisDocument =
    scope?.collection === collection && scope.slug === slug;

  const url = previewingThisDocument
    ? `${process.env.CMS_URL}/api/internal/preview-document`
    : `${process.env.CMS_URL}/api/${collection}` +
      `?where[slug][equals]=${encodeURIComponent(slug)}`;

  const res = await fetch(url, {
    method: previewingThisDocument ? "POST" : "GET",
    headers: previewingThisDocument
      ? createPreviewRequestHeaders({ collection, slug, scope })
      : undefined,
    body: previewingThisDocument ? JSON.stringify({ collection, slug }) : undefined,
    next: previewingThisDocument ? { revalidate: 0 } : { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`CMS returned ${res.status}`);
  return res.json();
}
```

`/api/internal/preview-document` verifies the HMAC timestamp and scope, then uses Payload's Local
API with draft access for that document. It is not part of the public CMS REST surface. Draft
requests must never be cached (`revalidate: 0`), otherwise unpublished content can leak into the
public ISR cache.

**Preview acceptance tests**

- [ ] An anonymous `GET /api/blog-posts?draft=true` returns only published content.
- [ ] An anonymous versions request is rejected.
- [ ] A valid preview renders its selected draft; another draft slug remains published or 404.
- [ ] A tampered, expired or reused scope cookie cannot retrieve a draft.
- [ ] The CMS rejects the internal preview endpoint without a valid, fresh HMAC signature.

---

## 2.11 Final ownership and validation lock

- A Payload `Profile` global owns hero/profile/contact/social/skills fields, the profile-image
  relation and its required alt text, plus story and education prose. A `SiteSettings` global owns
  the favicon relation. Collections own Projects, Experience, Blog and TIE. The Home manifest
  stores order, stable IDs, section types, source selectors and display configuration only—never
  prose or asset URLs.
- Lexical JSON is canonical rich text. Shared exhaustive Zod discriminated unions validate every
  supported node/block before rendering or Markdown export; unknown nodes fail tests and are never
  silently ignored. Strict TypeScript and no application `any` apply.
- Slugs are normalized lowercase ASCII, length-bounded and checked against reserved routes;
  traversal, separators, control characters and collisions are rejected. Published slug changes
  require a redirect.
- URL fields allow only `https:` URLs or explicit internal relative routes. Credentials, control
  characters, protocol-relative URLs and unapproved schemes are rejected.
- Media and rich-text field sizes are bounded. Raw HTML is disabled and link targets are validated
  again at render/export boundaries.
