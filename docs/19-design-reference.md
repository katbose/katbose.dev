# 19 — Design Reference & Interaction Inventory

[← Back to PLAN.md](../PLAN.md)

---

## 19.1 Sources

| Source | Role | What is taken |
| --- | --- | --- |
| [justaditya.com](https://www.justaditya.com) and its [Hackyfolio source repository](https://github.com/PythonHacker24/yo-hackyfolio) | **Primary anatomy reference** | Single-column section stack, section anatomy and observed micro-interactions |
| [abhijithjinnu.in](https://www.abhijithjinnu.in) | Two nuances only | The multilingual "Hello" intro loader and the `npx katbose` terminal-card idea |

The author granted express permission to use the repository for this portfolio (decision #63), but
this project applies a narrower **inspiration-only** rule: inspect anatomy and observable facts;
copy no upstream file, code, prose or personal content. Base UI is the sole primitive library.
Project architecture, tokens, WCAG 2.2 AA and performance budgets are normative; observed source
facts inform anatomy, and every deliberate difference is documented. The author is credited in the
README. Permission is scoped to this portfolio and does not make the source repository generally
licensed or authorize republication.

---

## 19.2 What is adopted from Hackyfolio

### The layout

A single-column, generously-spaced section stack: hero → experience (featured + "Previously"
list) → tech stack → story card → project spotlight → thinking/essays → education → GitHub
contributions → recommendations → contact. A fixed bottom bar carries navigation, socials and the
human/agent mode toggle. The separate light ⇄ dark toggle sits in the **top-right**, matching
justaditya.com.

For katbose.dev this becomes the **Home page**. The dedicated routes
(`/projects`, `/blog`, `/tie`, `/resume`, `/ask-ai`, `/contact`) remain exactly as planned in
[PLAN.md](../PLAN.md) — Hackyfolio is a one-page site, ours is not, and the resume/Ask AI systems
(docs [03](03-search-and-ai.md), [04](04-resume-system.md)) don't fit a single page. The home
section stack previews each area and links out.

### The section system (adapted, not copied)

Hackyfolio's core idea — an ordered array of `{ type, title, data }` rendered by a
registry-driven `SectionRenderer`, where reordering the array reorders the page — is adopted as
a **presentation pattern**, with one deliberate change:

| | Hackyfolio | katbose.dev |
| --- | --- | --- |
| Content source of truth | `app/data/portfolio.json`, hand-edited | **Payload CMS** (decision #1) — projects, experience, blog, TIE are collections, not JSON |
| Section ordering | Same JSON file | `apps/web/features/home/home.config.ts` — a typed, ordered manifest of section entries |
| Section data | Manifest metadata only | `Profile` global and collections supply all prose, including hero, story and education |
| Renderer | `registry.tsx` switch over a `Section` union | Same pattern: a discriminated union + exhaustive switch, so a missing case is a type error |

This keeps Hackyfolio's best property — add/reorder/remove sections without touching component
code — without introducing a second content source that would drift from the CMS
([02-content-model.md](02-content-model.md) field discipline still governs all content shapes).

### Hero portrait and site icon (decision #87)

The live reference places a profile portrait in the hero identity area. That anatomy is adopted,
but neither its image nor unmeasured dimensions are copied. KatBose's portrait is uploaded through the
Payload `Profile` global and rendered by a project-owned `<ProfilePortrait>` component. A separate
Payload `SiteSettings` global owns the favicon; favicon placement is a project requirement rather
than a visual fact inferred from page content.

Both fields relate to the existing `media` collection and follow the immutable Supabase-original →
same-zone Cloudflare delivery path. Phase 1 ships project-owned fallback assets and reserves the
portrait's dimensions; Phase 2 supplies the actual Payload controls and signed revalidation. The
browser never contacts Payload or Supabase directly, and Aditya's portrait/favicon never enters
this repository.

### Agent mode (human/agent toggle)

Hackyfolio renders the same data as plain Markdown behind a toggle in the bottom bar. This slots
directly into the existing agent-readability goal ([13-seo-and-agent-readability.md](13-seo-and-agent-readability.md)):

- `generateMarkdown` renders the same validated manifest + Payload data at canonical `/agent`—one
  source, two presentations, no drift.
- The typed route manifest also generates `/llms.txt`, navigation and sitemap metadata. The
  repository-root `llms.txt` is a checked-in export verified against the canonical generator; it is
  never a second authored source (decision #89).
- The bottom-bar control links/transitions to `/agent`; a query-string view is not canonical.

### Stack confirmation

The reference is structurally close to the chosen stack, but parity is never a percentage target:
observed facts inform anatomy while project constraints remain normative.

| Hackyfolio uses | katbose plan | Verdict |
| --- | --- | --- |
| Next.js (App Router), TypeScript | Same | ✔ aligned |
| Tailwind CSS 4 | Tailwind (version pinned at scaffold time) | ✔ aligned |
| framer-motion 12 | Motion (`motion`, formerly Framer Motion), budget-controlled | ✔ same library family; current package naming locked by #90 |
| Hackyfolio typography and light/dark palette | DM Sans and the Tailwind `gray` ramp, measured and recreated in project-owned tokens (decisions #57, #60) | ✔ resolved — [20](20-design-system.md) §20.4, §20.5 |
| lucide-react icons | lucide-react for UI icons; brand marks come from build-time `simple-icons` (decision #58) | ✔ resolved — [20](20-design-system.md) §20.11 |
| next-themes (dark/light) | Adopted directly — see below | ✔ same toggle UX as justaditya.com |
| @vercel/analytics | **Retired** (decision #5) — PostHog | ✖ do not copy |
| @react-three/fiber + drei | Not in plan; JS budget is strict | ✖ see §19.6 |
| @calcom/embed-react | Adopt the *outcome*, not the package — see below | ✔ plain link-out, no embed SDK |

### Dark mode — light/dark toggle via next-themes (decision #46)

The brief is the same toggle justaditya.com uses, not silent system-preference following alone.
`next-themes` is adopted directly as a dependency — it is a separately-licensed, widely-used
open-source package, not a Hackyfolio-authored file, so this does not touch the no-copying rule
in §19.1.

- **Default: `system`.** On first visit, with nothing in storage yet, the site follows
  `prefers-color-scheme` exactly as before — most visitors never touch the toggle and never
  cause a write to storage.
- **Toggle:** a two-state light ⇄ dark switch in the **top-right**, matching justaditya.com. It
  displays the current resolved theme and switches directly to the opposite one; there is no
  visible third "system" position.
- **First visit:** `defaultTheme="system"` means an empty browser profile resolves from the
  operating-system preference — light-system visitors see light, dark-system visitors see dark.
  After the first manual click, that explicit light/dark choice takes precedence and persists.
- **Persistence:** a manual choice is written to `localStorage` only when the visitor uses the
  toggle. This is disclosed in [14-privacy-and-compliance.md](14-privacy-and-compliance.md)
  §14.2 as strictly necessary/functional storage — it stores an explicit user choice, not
  tracking, and nothing server-side ever reads it.
- **No flash of the wrong theme.** `next-themes` injects a small blocking script before
  hydration that reads the stored preference (or system) and sets it on `<html>`
  synchronously — plain client-side JavaScript, nothing server-only, so it does not touch the
  OpenNext/Workers constraints in [01-architecture.md](01-architecture.md) §1.2.
- **Contrast:** unchanged — both palettes are design tokens, both checked against the same AA
  rule ([12-accessibility.md](12-accessibility.md)).
- Set the `color-scheme` meta/CSS property so it tracks the active theme and native form
  controls/scrollbars match.
- **Reduced motion:** the toggle's icon swap and colour transition follow the same
  `prefers-reduced-motion` rule as every other interaction (§19.3, row 12).

### Scheduling — Cal.com as a link, not an embed (decision #47)

A plain outbound button/link to a Cal.com booking page (`https://cal.com/katbose/meet`),
opened like any other external link — not the `@calcom/embed-react` modal/iframe SDK Hackyfolio
ships.

- **Distinct from Contact, not a replacement.** The `/contact` page keeps its Turnstile-protected
  form → Slack (decision #16) for written messages. The Cal.com link is an additional CTA for
  booking a live call — different intent, same page (and referenced from the Home contact
  section).
- **Placement:** Home contact CTA and the `/contact` page, next to the message form.
- **New public var:** `NEXT_PUBLIC_CAL_LINK` in [17-env-vars.md](17-env-vars.md) §17.2.
- **Upgrade path:** an inline/modal embed is possible later, but it adds a third-party script, a
  CSP `frame-src` exception ([05](05-security.md) §5.7) and a new processor in the privacy policy
  ([14](14-privacy-and-compliance.md)) — that trade goes through the decision log first, per #47.

---

## 19.3 Micro-interaction catalogue

Every interaction below ships with a `prefers-reduced-motion` fallback (mandatory per
[12-accessibility.md](12-accessibility.md)) — the fallback column is not optional polish.

| # | Interaction | Where | Implementation sketch | Reduced-motion fallback |
| --- | --- | --- | --- | --- |
| 1 | **Scroll reveal** — y 32px, scale .985 and blur 12px resolve to rest | Every section | Shared `<Reveal>`; 900–1100ms, `viewport: { once: true, amount: 0.15 }` | Render static, no transform/filter |
| 2 | **Count-up stats** — numbers roll from 0 over 1800ms when scrolled into view | Project stats grid | `useInView` + rAF counter, parses numeric part, keeps suffix (`K`, `%`) | Show final value immediately |
| 3 | **Expanding tech stack** — an auto-scrolling marquee of skill icons that expands into categorised groups | Tech stack section | CSS marquee (duplicated track) + `AnimatePresence` expand; pause on hover | Static wrapped grid, no marquee |
| 4 | **Collapsible "View More"** — cards clamp long bodies and unfold smoothly | Experience, story, publications | Shared `<Collapsible>` measuring content height, animating `height` | Instant open/close, no animation |
| 5 | **"Previously" accordion** — past roles as compact rows that expand one at a time | Experience | Single-open accordion on Base UI primitives + `AnimatePresence` | Instant expand |
| 6 | **Live local time** — hero shows a ticking clock in Asia/Kolkata | Hero | 1s interval, `Intl.DateTimeFormat` with fixed `Asia/Kolkata` zone; renders after hydration to avoid mismatch | Unchanged (not motion) |
| 7 | **Hero pronunciation line** — `/…/ • noun` dictionary-entry styling | Hero | Static markup | Unchanged |
| 8 | **Bottom bar** — fixed pill with nav, socials, mode toggle, subtle edge-shine sweep | Global | CSS keyframe shine; Hackyfolio itself disables it under reduced motion — keep that | Shine off (opacity 0) |
| 9 | **Hover lift on cards/links** — 2px translate plus shadow/underline slide | All cards, essay links | Transform/underline transition, ~150–200ms ease-out | No transform; keep focus-visible styles |
| 10 | **Human ⇄ agent crossfade** — 350ms transition to the canonical agent view | Mode toggle | Link/state transition to `/agent`; `/agent` remains directly shareable and crawlable | Instant swap |
| 11 | **Smooth in-page anchor scrolling** | Bottom bar nav | `scroll-behavior: smooth` via CSS only | Browser disables automatically with reduced motion |
| 12 | **Theme toggle** — two-state light ⇄ dark switch with a smooth colour-scheme transition | Top-right | `next-themes` (`defaultTheme="system"`) + CSS `transition: background-color, color` scoped to the toggle | Instant swap, no colour transition |

Rules that keep this within the performance budget ([13](13-seo-and-agent-readability.md) §13.2):

- Only `transform`, `opacity` and `filter` are animated — never layout properties.
- Motion is imported from `motion/react` via `LazyMotion`/`domAnimation` so the full library never ships.
- Reveal animations run **once** (`viewport: { once: true }`) — no scroll-linked re-triggering.
- Anything below the fold animates on intersection; nothing animates during initial paint except
  the intro loader (§19.4), which is bounded.
- Lighthouse ≥ 95 (Phase 1 gate) is measured **with** all interactions enabled.

---

## 19.4 The two abhijithjinnu.in nuances

### 19.4.1 Intro loader — "Hello" in four languages

A first-visit overlay that cycles a greeting through four languages, then lifts to reveal the
page.

**Spec**

- Sequence: `Hello` → `నమస్కారం` (Telugu) → `नमस्ते` (Hindi) → `Bonjour` (French). The complete
  greeting sequence **including exit** is timed as one ≤2-second budget; it is not four 450ms dwells
  plus an unbounded exit. Languages are configurable in one array.
- **Once per session:** a `sessionStorage` flag skips it on subsequent navigations. It never
  plays on internal route changes — only a hard landing.
- **Reduced motion:** skipped entirely (`prefers-reduced-motion` shows the page immediately).
- **Bots and agents:** the overlay is a client component rendered *above* fully-painted content —
  the HTML underneath is complete, so crawlers, `llms.txt` consumers and users with JS disabled
  see the real page. It must never gate content rendering.
- **Performance guard:** because the overlay is the largest initial paint, verify in the Phase 1
  Lighthouse gate that LCP is still measured on the revealed hero (or accept the overlay as LCP
  and keep it under the 2.5s target). CLS must be 0 — the overlay is `position: fixed`, the page
  never reflows.
- **Accessibility:** overlay has `aria-hidden="true"`; focus is never trapped in it; a visitor
  can scroll/interact the moment it lifts.

### 19.4.2 `npx katbose` — the terminal card

Running `npx katbose` in any terminal prints a compact ANSI business card: name, role, links
(site, GitHub, LinkedIn, email), and a pointer to `katbose.dev/ask-ai`.

**Spec**

- Lives in the monorepo as `packages/katbose-card`, published to npm as **`katbose`**. The
  package was created and published (user-confirmed 2026-08-24); keep the repository source and
  published package synchronized as the card evolves.
  **Parity status (2026-08-28):** `katbose@0.0.2` was manually published from the corrected
  workspace package and tagged `katbose-v0.0.2`; the downloaded 626-byte registry tarball exactly
  matches the workspace tarball at SHA-1 `73f90d862686bdc5792c29440edc3d642eba73ba`.
  `apps/web/tests/katbose-card.test.ts` fails if the card's printed identity values, package
  metadata, dependency-free guarantee or size budget drift. A cold-cache run on 2026-08-29
  printed the correct card but took 15,507.9 ms, so the under-three-second gate remains open.
- Zero runtime dependencies if possible (hand-rolled ANSI codes; `picocolors` at most). A
  business card that pulls 40 packages is the wrong statement.
- Content is a **build-time snapshot** (name, links, tagline baked into the published version) —
  no network call at runtime. Contact details change rarely; publishing a patch version is the
  update path. This keeps `npx katbose` instant and offline-safe.
- `bin` entry + `files` whitelist; total package < 15 kB.
- Publishing is manual (`npm publish` from a tagged commit) — no CI credentials for npm are
  added; that would expand the secret inventory ([17-env-vars.md](17-env-vars.md)) for a
  quarterly-at-most task.

---

## 19.5 Compatibility with the katbose architecture

Verdict up front: **compatible.** Hackyfolio is a presentation layer; every katbose backend
decision (Payload, Supabase, Workers, AI Search, rate limiting) sits beneath or beside it
untouched. The table maps each Hackyfolio concept to its home in this architecture:

| Hackyfolio concept | katbose implementation | Existing doc it must obey |
| --- | --- | --- |
| `portfolio.json` | Payload collections + typed `home.config.ts` manifest | [02](02-content-model.md), [06](06-data-model.md) |
| `SectionRenderer` registry | Same pattern in `apps/web/features/home/` | [01](01-architecture.md) §1.6 layout |
| `Reveal`, `CountUp`, `Collapsible`, `RichText`, `SectionShell` | Project-owned components in `components/common/` and `features/home/` | §19.1 inspiration-only rule, [12](12-accessibility.md) |
| Agent Markdown generator | Feeds canonical `/agent`; the typed route manifest also generates `/llms.txt` | [13](13-seo-and-agent-readability.md) |
| GitHub contributions graph | Deferred in Phase 1; if enabled later, server fetch only with timeout, ISR cache and calm fallback | [08](08-resilience.md) |
| Bottom bar navigation | Replaces a traditional header as primary nav — must still satisfy skip-link, focus-visible and keyboard specs | [12](12-accessibility.md) |
| One long page | Home page only; dedicated routes stay | [PLAN.md](../PLAN.md) navigation table |
| Motion everywhere | Allowed, with the §19.3 budget rules; "minimal usage" in PLAN.md means minimal *bytes and main-thread cost*, not minimal delight | [13](13-seo-and-agent-readability.md) §13.2 |

Points of friction found and resolved:

1. **Two sources of truth risk.** Hackyfolio's whole pitch is "edit one JSON file". Ours is
   "edit the CMS". Adopting the JSON file verbatim would recreate the drift problem docs/03
   solves for search. Resolution: the manifest orders/configures sections; **all profile, story,
   education and collection prose comes from Payload**.
2. **Bottom bar vs accessibility gates.** A fixed bottom pill as sole navigation is unusual for
   screen readers. Resolution: it is a `<nav>` landmark, first tab stop after the skip link, and
   the keyboard E2E specs in [11](11-testing-and-ci.md) §11.4 are extended to cover it.
3. **Hero clock hydration.** A ticking clock renders differently on server and client.
   Resolution: render a placeholder server-side, start the clock in `useEffect` — no hydration
   mismatch, no CLS (fixed-width tabular numerals).
4. **Workers runtime.** All interactions are client-side and framework-level — nothing here
   touches the OpenNext/Workers constraints ([01](01-architecture.md) §1.2). The intro loader,
   marquee and reveals are plain client components; no Node APIs involved.

---

## 19.6 Deliberately not adopted

| Hackyfolio feature | Why not | Ref |
| --- | --- | --- |
| `@vercel/analytics` | Retired vendor; PostHog is the single analytics tool | Decision #5 |
| `@react-three/fiber` + `drei` (3D) | Breaks the third-party JS budget and the <1s load target for decorative value | [13](13-seo-and-agent-readability.md) §13.2 |
| QR-code share widget | Nice-to-have; adds a dependency for marginal value. Post-launch candidate | — |
| Vercel deploy path in Hackyfolio docs | We deploy to Cloudflare Workers via OpenNext from `main` | Decisions #37/#38 |
| Copying upstream files or content | Inspiration-only project rule; Base UI and project-owned code/tokens are normative | §19.1 |

Dark mode and Cal.com scheduling were reconsidered from this table — both are adopted, in a
lighter form than Hackyfolio ships. See the two subsections under §19.2 above.

### 19.6.1 Upstream provenance comparison packet

This machine-assisted packet was prepared on 2026-08-29 against the immutable
[`PythonHacker24/yo-hackyfolio` revision `b37b169f7cdf6686f9c03bfa7b7019e8954686fb`](https://github.com/PythonHacker24/yo-hackyfolio/commit/b37b169f7cdf6686f9c03bfa7b7019e8954686fb).
No upstream source was copied into the workspace while preparing it.

- **Architecture and data:** upstream is one client page driven by `portfolio.json`, local state,
  `AnimatePresence`, a QR modal and a water shader. KatBose's Home is a Server Component driven by
  a Zod-validated typed manifest, with a separate canonical `/agent`, JSON-LD, `SITE_IDENTITY` and
  Phase 2 Payload source boundaries.
- **Renderer pattern:** both implementations dispatch discriminated section types through a
  renderer or registry. Their schemas, component boundaries, routing, content and accessibility
  implementation differ; the shared idea is a general architecture pattern, not copied source.
- **Motion and icons:** upstream `Reveal` statically imports `framer-motion`, and tech icons load
  from `cdn.simpleicons.org`. The local implementation uses `motion/react`, `LazyMotion`, project
  motion tokens, pre-hydration reduced-motion CSS and tests, plus build-time `simple-icons` paths.
- **Navigation and content:** upstream navigation includes QR and social actions, the water shader
  and an in-page mode switch. Local `BottomBar` uses routes, `ModeSwitchLink` and `MobileMenu`.
  No upstream personal content was identified in `apps/web/lib/fallback-content.ts`.

The reviewed implementation scope contained no machine-identified copied upstream file. This is
preparatory evidence only: Requirement 7.8 remains open until a named human reviewer records a
dated confirmation against the pinned revision.

---

## 19.7 Verification gates added by this reference

These fold into the existing Phase 1 gate ([15-roadmap-and-checklist.md](15-roadmap-and-checklist.md)):

- [ ] All §19.3 interactions disabled correctly under `prefers-reduced-motion` (axe + manual pass)
- [ ] Lighthouse ≥ 95 measured with the intro loader and all interactions enabled; CLS = 0. `e2e/layout-stability.spec.ts` treats `< 0.001` as zero: a real browser reports sub-pixel values around 1e-5 from font-metric rounding that no visitor can perceive and no markup change can remove, while a genuine unreserved image scores far above the bound (decision [#100](16-decision-log.md))
- [ ] Hero portrait reserves 80→96px 1:1 geometry, uses KatBose's Payload alt text or the bundled
      fallback, and never references the upstream portrait; favicon metadata has the same no-copy rule
- [ ] Canonical `/agent` and generated `/llms.txt` derive from the typed route manifest—grep proves no handwritten runtime duplicate
- [ ] Bottom-bar navigation passes the keyboard E2E specs (skip link first, focus visible, Escape behaviour on any expanded state)
- [ ] `katbose` published to npm (done 2026-08-24); `npx katbose` prints the card in a cold cache under 3s
- [ ] No file in `apps/web` is a copy of an upstream Hackyfolio file (architecture/quality/inspiration-only rule)
- [ ] Light and dark tokens both pass AA contrast (4.5:1 body / 3:1 large); `color-scheme` set so native controls flip too
- [ ] Top-right theme toggle defaults to system preference on a clean first visit, switches light ⇄ dark, persists a manual choice across reload, and causes no flash of the wrong theme
- [ ] `NEXT_PUBLIC_CAL_LINK` renders as a plain link on Home and `/contact`, distinct from the message form
