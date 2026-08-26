# 19 — Design Reference & Interaction Inventory

[← Back to PLAN.md](../PLAN.md)

---

## 19.1 Sources

| Source | Role | What is taken |
| --- | --- | --- |
| [justaditya.com](https://www.justaditya.com) (open-sourced as [Hackyfolio](https://github.com/PythonHacker24/yo-hackyfolio)) | **Primary reference (~99%)** | Overall look, single-column section-stack layout, section system, micro-interactions, human/agent mode toggle |
| [abhijithjinnu.in](https://www.abhijithjinnu.in) | Two nuances only | The multilingual "Hello" intro loader, and the `npx katbose` terminal card |

**Legal position — read before copying anything:** the Hackyfolio repository has **no LICENSE
file**. "Public on GitHub" is not a license grant; default copyright applies. The rule for this
project is therefore: **study the patterns, reimplement the code**. Section schemas, animation
timings and layout ideas are not copyrightable and are safe to reproduce; copying component files
verbatim is not. Every component in `apps/web` is written fresh against our own types, our own
design tokens and Base UI primitives. If the upstream repo later gains a permissive license, this
constraint can be revisited via the decision log.

**Re-verified 2026-08-26** (decision [#61](16-decision-log.md)): still no LICENSE file, and GitHub
reports no licence. The `open-source` topic tag and the site's "Open source" link are descriptions,
not grants. The upstream README *does* invite template use — clone, edit `portfolio.json`, deploy —
which covers using it as intended, but not lifting components into a different codebase. Measured
rendered values (typeface, palette, metrics) are facts and are adopted in
[20-design-system.md](20-design-system.md); source files are not. Separately, the author's own
content is out of scope entirely (decision #62).

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
| Section data | Inline in the JSON | Static sections (hero, contact) inline in the config; content sections declare a fetcher that reads Payload with ISR |
| Renderer | `registry.tsx` switch over a `Section` union | Same pattern: a discriminated union + exhaustive switch, so a missing case is a type error |

This keeps Hackyfolio's best property — add/reorder/remove sections without touching component
code — without introducing a second content source that would drift from the CMS
([02-content-model.md](02-content-model.md) field discipline still governs all content shapes).

### Agent mode (human/agent toggle)

Hackyfolio renders the same data as plain Markdown behind a toggle in the bottom bar. This slots
directly into the existing agent-readability goal ([13-seo-and-agent-readability.md](13-seo-and-agent-readability.md)):

- A `generateMarkdown` module renders the same section manifest + fetched CMS data as Markdown —
  one source, two views, no drift (same guarantee the nightly reconciliation gives the search
  index: derived data, never a second source of truth).
- The same generator output backs `llms.txt` (or an extended `/agent` view linked from it), so
  the file can never go stale relative to the page — closing the "keep it current" caveat in
  docs/13 §13.6.
- The toggle lives in the bottom bar, mirroring Hackyfolio's placement.

### Stack confirmation

Hackyfolio's stack is nearly identical to what was already decided, which is what makes the 99%
target realistic:

| Hackyfolio uses | katbose plan | Verdict |
| --- | --- | --- |
| Next.js (App Router), TypeScript | Same | ✔ aligned |
| Tailwind CSS 4 | Tailwind (version pinned at scaffold time) | ✔ aligned |
| framer-motion 12 | Framer Motion, "minimal usage" | ✔ see §19.5 — budget clarified |
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
| 1 | **Scroll reveal** — section drifts up ~16px while sharpening from a soft blur into focus | Every section | One shared `<Reveal>` wrapper (framer-motion `whileInView`, `filter: blur → 0`, once-only) | Render static, no transform/filter |
| 2 | **Count-up stats** — numbers roll from 0 when scrolled into view | Project stats grid | `useInView` + rAF counter, parses numeric part, keeps suffix (`K`, `%`) | Show final value immediately |
| 3 | **Expanding tech stack** — an auto-scrolling marquee of skill icons that expands into categorised groups | Tech stack section | CSS marquee (duplicated track) + `AnimatePresence` expand; pause on hover | Static wrapped grid, no marquee |
| 4 | **Collapsible "View More"** — cards clamp long bodies and unfold smoothly | Experience, story, publications | Shared `<Collapsible>` measuring content height, animating `height` | Instant open/close, no animation |
| 5 | **"Previously" accordion** — past roles as compact rows that expand one at a time | Experience | Single-open accordion on Base UI primitives + `AnimatePresence` | Instant expand |
| 6 | **Live local time** — hero shows a ticking clock in Asia/Kolkata | Hero | 1s interval, `Intl.DateTimeFormat` with fixed `Asia/Kolkata` zone; renders after hydration to avoid mismatch | Unchanged (not motion) |
| 7 | **Hero pronunciation line** — `/…/ • noun` dictionary-entry styling | Hero | Static markup | Unchanged |
| 8 | **Bottom bar** — fixed pill with nav, socials, mode toggle, subtle edge-shine sweep | Global | CSS keyframe shine; Hackyfolio itself disables it under reduced motion — keep that | Shine off (opacity 0) |
| 9 | **Hover lift on cards/links** — small translate + shadow/underline slide | All cards, essay links | Tailwind transitions, `transform-gpu`, ~150–200ms ease-out | No transform; keep focus-visible styles |
| 10 | **Human ⇄ agent crossfade** — content swaps to Markdown view with a fade | Mode toggle | `AnimatePresence` crossfade, state in URL (`?view=agent`) so it is shareable and crawlable | Instant swap |
| 11 | **Smooth in-page anchor scrolling** | Bottom bar nav | `scroll-behavior: smooth` via CSS only | Browser disables automatically with reduced motion |
| 12 | **Theme toggle** — two-state light ⇄ dark switch with a smooth colour-scheme transition | Top-right | `next-themes` (`defaultTheme="system"`) + CSS `transition: background-color, color` scoped to the toggle | Instant swap, no colour transition |

Rules that keep this within the performance budget ([13](13-seo-and-agent-readability.md) §13.2):

- Only `transform`, `opacity` and `filter` are animated — never layout properties.
- framer-motion is imported via `LazyMotion`/`domAnimation` so the full library never ships.
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

- Sequence: `Hello` → `నమస్కారం` (Telugu) → `नमस्ते` (Hindi) → `Bonjour` (French), ~450ms each,
  then the overlay slides up. Total ≤ 2s. Languages are configurable in one array.
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
| `Reveal`, `CountUp`, `Collapsible`, `RichText`, `SectionShell` | Reimplemented in `components/common/` (shared) and `features/home/` | §19.1 license rule, [12](12-accessibility.md) |
| Agent-mode Markdown generator | Feeds both the `?view=agent` toggle and `llms.txt` | [13](13-seo-and-agent-readability.md) |
| GitHub contributions graph | Client-fetch of the public contributions endpoint, ISR-cached server-side instead if it needs a token | [08](08-resilience.md) — must fail to a calm empty state |
| Bottom bar navigation | Replaces a traditional header as primary nav — must still satisfy skip-link, focus-visible and keyboard specs | [12](12-accessibility.md) |
| One long page | Home page only; dedicated routes stay | [PLAN.md](../PLAN.md) navigation table |
| framer-motion everywhere | Allowed, with the §19.3 budget rules; "minimal usage" in PLAN.md is reinterpreted as "minimal *bytes and main-thread cost*, not minimal delight" | [13](13-seo-and-agent-readability.md) §13.2 |

Points of friction found and resolved:

1. **Two sources of truth risk.** Hackyfolio's whole pitch is "edit one JSON file". Ours is
   "edit the CMS". Adopting the JSON file verbatim would recreate the drift problem docs/03
   solves for search. Resolution: the manifest orders sections; **content always comes from
   Payload**. The manifest contains no prose beyond the hero.
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
| Copying component files | No license in the upstream repo | §19.1 |

Dark mode and Cal.com scheduling were reconsidered from this table — both are adopted, in a
lighter form than Hackyfolio ships. See the two subsections under §19.2 above.

---

## 19.7 Verification gates added by this reference

These fold into the existing Phase 1 gate ([15-roadmap-and-checklist.md](15-roadmap-and-checklist.md)):

- [ ] All §19.3 interactions disabled correctly under `prefers-reduced-motion` (axe + manual pass)
- [ ] Lighthouse ≥ 95 measured with the intro loader and all interactions enabled; CLS = 0
- [ ] Agent view and `llms.txt` are both generated from the section manifest — grep proves no hand-written duplicate content
- [ ] Bottom-bar navigation passes the keyboard E2E specs (skip link first, focus visible, Escape behaviour on any expanded state)
- [ ] `katbose` published to npm (done 2026-08-24); `npx katbose` prints the card in a cold cache under 3s
- [ ] No file in `apps/web` is a copy of an upstream Hackyfolio file (license rule)
- [ ] Light and dark tokens both pass AA contrast (4.5:1 body / 3:1 large); `color-scheme` set so native controls flip too
- [ ] Top-right theme toggle defaults to system preference on a clean first visit, switches light ⇄ dark, persists a manual choice across reload, and causes no flash of the wrong theme
- [ ] `NEXT_PUBLIC_CAL_LINK` renders as a plain link on Home and `/contact`, distinct from the message form
