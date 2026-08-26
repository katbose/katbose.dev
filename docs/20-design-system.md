# 20 — Design System & Design Tokens

[← Back to PLAN.md](../PLAN.md)

---

## 20.1 Scope

[19-design-reference.md](19-design-reference.md) decides *what* the site should look like and
which reference patterns are adopted. This document decides *how* that look is expressed: the
token set, the type and space scales, the motion vocabulary, the component inventory and the
measurable parity checklist that the Phase 1 design pass is graded against.

Read 19 first. This document never restates a decision from 19; it only gives it concrete values.

---

## 20.2 Rules that govern this document

1. **Tokens live in code, not here.** The single source of truth is
   `apps/web/app/theme.css` (CSS custom properties) consumed by the Tailwind theme. This document
   names tokens and explains intent; it must not become a second copy of the values that then
   drifts. Where a number appears below it is because that number *is* the specification (a
   contrast ratio, a duration budget, a breakpoint) — the implementation is expected to match it
   exactly and CI asserts the contrast ones.
2. **No hardcoded colour outside `theme.css`.** A raw hex in a component is a lint failure. This is
   what makes the AA contrast gate in [12-accessibility.md](12-accessibility.md) §12.3 enforceable
   "through design tokens rather than checked ad hoc".
3. **Reimplementation, not copying.** Per 19 §19.1 the upstream Hackyfolio repository carries no
   licence. Layout, spacing rhythm, type scale, palette direction, animation timings and section
   anatomy are ideas and are reproduced freely. Component files, CSS files and the upstream
   `portfolio.json` are not copied. The Phase 1 gate tests for this.
4. **Payload remains the content source of truth.** The section manifest orders sections and holds
   only hero-level static copy (19 §19.5, friction 1). It is not a content file.
5. **Every visual decision has an accessibility consequence.** Contrast, focus, motion and zoom
   requirements from [12-accessibility.md](12-accessibility.md) are constraints on this system, not
   a later review step.

---

## 20.3 Token architecture

Two tiers, deliberately. A flat semantic-only set makes theming easy but hides palette
inconsistency; a primitive-only set pushes colour decisions into components.

```
tier 1 — primitives   --gray-500, --gray-950                (raw values, theme-independent)
tier 2 — semantic      --color-text-secondary, --color-focus (roles, remapped per theme)
```

Components consume **tier 2 only**. Tier 1 is referenced exclusively inside `theme.css`.
The light and dark themes differ only in the tier-2 mapping — no component branches on theme.

---

## 20.4 Colour

### 20.4.1 Neutral ramp (tier 1)

The reference was measured (see §20.18) and resolves to **Tailwind's default `gray` ramp**. We adopt
it directly: it is the reference's actual palette, it ships with Tailwind so it needs no config, and
every pairing we use is contrast-verified in §20.4.2.

| Token | Value | Measured | | Token | Value | Measured |
| --- | --- | --- | --- | --- | --- | --- |
| `--gray-0` | `#FFFFFF` | ✔ page bg | | `--gray-500` | `#6A7282` | ✔ secondary/control text |
| `--gray-50` | `#F9FAFB` | | | `--gray-600` | `#4A5565` | ✔ link |
| `--gray-100` | `#F3F4F6` | | | `--gray-700` | `#364153` | ✔ strongest accent |
| `--gray-200` | `#E5E7EB` | ✔ hairline border | | `--gray-800` | `#1E2939` | |
| `--gray-300` | `#D1D5DB` | | | `--gray-900` | `#101828` | |
| `--gray-400` | `#9CA3AF` | | | `--gray-950` | `#030712` | |
| | | | | `--gray-1000` | `#000000` | ✔ body text |

**There is no accent hue.** The measurement returned `#364153` as the "accent" — that is `gray-700`,
not a colour. The reference is monochrome end to end: links are distinguished by an **underline**,
not by hue. We match this, which has three happy consequences:

- Colour is never the only signal for a link, satisfying 12 §12.3 by construction rather than by
  remembering to add an underline.
- The focus ring can use `--color-text`, giving 21:1 in light and 19.27:1 in dark — far beyond the
  3:1 minimum, and it survives forced-colours mode.
- One less hue to maintain across two themes.

### 20.4.2 Semantic mapping and measured contrast

Ratios below are computed, not estimated. AA needs **4.5:1** for body text, **3:1** for large text
and for non-text UI boundaries and state indicators (WCAG 1.4.11).

| Semantic token | Light | Ratio vs `bg` | Dark | Ratio vs `bg` | Requirement |
| --- | --- | --- | --- | --- | --- |
| `--color-bg` | `--gray-0` | — | `--gray-950` | — | — |
| `--color-bg-subtle` | `--gray-50` | — | `--gray-900` | — | — |
| `--color-surface` | `--gray-0` | — | `--gray-900` | — | — |
| `--color-text` | `--gray-1000` | **21.00** | `--gray-50` | **19.27** | ≥ 4.5 ✔ |
| `--color-text-secondary` | `--gray-600` | **7.56** | `--gray-300` | **13.66** | ≥ 4.5 ✔ |
| `--color-text-tertiary` | `--gray-500` | **4.84** | `--gray-400` | **7.93** | ≥ 4.5 ✔ |
| `--color-link` | `--gray-600` + underline | **7.56** | `--gray-300` + underline | **13.66** | ≥ 4.5 ✔ |
| `--color-focus` | `--gray-1000` | **21.00** | `--gray-50` | **19.27** | ≥ 3 ✔ |
| `--color-border` | `--gray-200` | 1.24 | `--gray-800` | 1.37 | decorative only |
| `--color-border-strong` | `--gray-500` | **4.84** | `--gray-500` | **4.16** | ≥ 3 ✔ |

Secondary and tertiary text on `--color-bg-subtle` are also verified in dark: **12.04** and **6.99**.
This is the pairing 12 §12.5 calls out as the most likely real-world failure.

Two cautions that came out of the measurement:

- **`--gray-500` (`#6A7282`) sits at 4.84:1 — a 0.34 margin over AA.** The reference uses it for
  control and secondary label text at 12px. It passes, but it is the palette's thinnest margin, so
  it must never be darkened toward the background or used at reduced opacity. Opacity on text is
  banned for this reason; use a lighter ramp step instead.
- **The measured hairline border (`#E5E7EB`) is 1.24:1** — well under the 3:1 that WCAG 1.4.11
  requires of a control boundary. This independently confirms the `--color-border` /
  `--color-border-strong` split: match the reference's hairline for decorative separators, and step
  up to `--gray-500` for anything focusable.

Two rules follow from the table and are not negotiable:

- `--color-border` is **decorative**. It may separate content visually but may never be the only
  indicator of a control's boundary or state. Form controls, toggles and any focusable surface use
  `--color-border-strong`.
- Colour is never the sole signal (12 §12.3). Links carry an underline, active nav carries a
  non-colour marker, and validation states carry text.

### 20.4.3 `color-scheme`

`color-scheme` tracks the resolved theme so native scrollbars, form controls and the caret flip
with it (19 §19.2). Set on `:root` from the same attribute `next-themes` writes.

---

## 20.5 Typography

### 20.5.1 Families

Measured: the reference uses **DM Sans** for every text role — headings, body, the pronunciation
line and the clock. No second family is present. DM Sans is SIL OFL 1.1, so adopting it carries no
licensing question (a typeface *name* is trademarked, the outlines here are openly licensed; we ship
the Google-hosted OFL release).

| Token | Family | Weights | Role |
| --- | --- | --- | --- |
| `--font-sans` | DM Sans | 400, 500, 600, 700 | everything |
| `--font-mono` | JetBrains Mono | 400 | code blocks and the `npx katbose` card only |

Notes:

- Four sans weights, because the measurement shows all four in use (400 body, 500 controls,
  600 h3/h4, 700 h1/h2). That is the whole budget; Latin subset only, self-hosted through
  `next/font/google` with `display: swap` (13 §13.2).
- **The reference has no monospace family.** Its pronunciation line and live clock are DM Sans. We
  match that, and keep `--font-mono` scoped strictly to syntax-highlighted code and the terminal
  card — surfaces the reference does not have and where a mono face is functional, not decorative.
- Tabular numerals come from `font-variant-numeric`, not from switching family, so the clock and
  count-ups stay in DM Sans without width jitter.

This closes open decision #57.

### 20.5.2 Scale

Measured from the reference at desktop width, converted to `rem` at a 16px root. Line heights are
unitless so they survive zoom to 200% (12 §12.3).

| Token | Size | Line height | Weight | Tracking | Role | Measured |
| --- | --- | --- | --- | --- | --- | --- |
| `--text-xs` | 0.75rem / 12px | 1.5 | 400–500 | `0` | controls, meta, tags | ✔ |
| `--text-sm` | 0.875rem / 14px | 1.625 | 400 | `0` | **body** | ✔ 14 / 22.75 |
| `--text-base` | 1rem / 16px | 1.6 | 400 | `0` | long-form prose (Blog, TIE) | ours |
| `--text-lg` | 1.3125rem / 21px | 1.19 | 600 | `0` | card titles (h4) | ✔ 21 / 25 |
| `--text-2xl` | 2rem / 32px | 1.19 | 600 | `0` | sub-headings (h3) | ✔ 32 / 38 |
| `--text-3xl` | 3rem / 48px | 1.21 | 700 | `+0.029em` | section headings (h2) | ✔ 48 / 58, `+1.4px` |
| `--text-4xl` | 4.5rem / 72px | 1.0 | 700 | `-0.025em` | hero name (h1) | ✔ 72 / 72, `-1.8px` |

Two deliberate departures from the measurement:

- **Body stays 14px for parity, but long-form prose gets `--text-base` (16px).** The reference is a
  single page of short blocks, where 14px reads fine. Your Blog is long-form MDX
  ([02-content-model.md](02-content-model.md) §2.2), and 14px over several thousand words fights the
  "excellent typography" principle. Chrome and cards match the reference at 14px; article bodies
  step up.
- **`--text-3xl` carries positive tracking (`+1.4px` measured).** That is the uppercase section
  heading — letter-spacing opens up capitals, which is correct for uppercase and wrong for
  lowercase. It is scoped to the uppercase treatment only.

Rules:

- **Uppercase section headings** are a visual treatment only — applied with `text-transform`, never
  by typing capitals into the CMS, so screen readers and the agent-mode Markdown read normal case.
  The measurement confirms this: the page's rendered `## EXPERIENCE` is the string "Experience"
  transformed in CSS.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) on the hero clock and every count-up
  stat. This is what keeps the ticking clock and rolling numbers at CLS 0 (19 §19.5, friction 3).
- **Measure** is capped by `--measure` (§20.6), not by font size.
- One `<h1>` per page, no skipped levels (12 §12.3). Heading *level* is semantic; heading *size* is
  a token. They are chosen independently.

---

## 20.6 Space and layout

4px base unit. Only these steps exist; an arbitrary value in a component is a review failure.

The measurement returned the reference's five load-bearing steps — **8 · 16 · 24 · 48 · 96** — which
map exactly onto a 4px scale. Those five are marked ✔ and carry the layout; the rest are available
for local detail.

| Token | Value | Measured | | Token | Value | Measured |
| --- | --- | --- | --- | --- | --- | --- |
| `--space-1` | 4px | | | `--space-8` | 32px | ✔ card padding |
| `--space-2` | 8px | ✔ xs | | `--space-10` | 40px | |
| `--space-3` | 12px | | | `--space-12` | 48px | ✔ lg |
| `--space-4` | 16px | ✔ sm | | `--space-16` | 64px | |
| `--space-5` | 20px | | | `--space-20` | 80px | |
| `--space-6` | 24px | ✔ md | | `--space-24` | 96px | ✔ xl |

Layout tokens — the single-column stack from 19 §19.2:

| Token | Value | Role |
| --- | --- | --- |
| `--measure` | 42rem / 672px | prose max width |
| `--container` | 48rem / 768px | section content width incl. cards |
| `--gutter` | `--space-5` mobile → `--space-8` ≥ md | horizontal page padding |
| `--section-gap` | `--space-16` mobile → `--space-24` ≥ md | vertical rhythm between sections |
| `--bottombar-h` | 56px | fixed bottom bar height |
| `--bottombar-inset` | `--space-4` | gap from viewport edge |

The page reserves `--bottombar-h + --bottombar-inset` of bottom padding plus
`env(safe-area-inset-bottom)` so the fixed bar never covers the last line of content — including on
iOS, and including at 200% zoom.

---

## 20.7 Radius, border, elevation

| Token | Value | Role | Measured |
| --- | --- | --- | --- |
| `--radius-sm` | 6px | tags, small controls | |
| `--radius-md` | 12px | cards | ✔ |
| `--radius-lg` | 16px | dialogs | |
| `--radius-pill` | 9999px | buttons, bottom bar, toggle track | ✔ |
| `--border-w` | 1px | hairline, all bordered surfaces | ✔ |
| `--shadow-sm` | `0 1px 3px rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | pill buttons | ✔ |
| `--shadow-md` | `0 4px 16px rgb(0 0 0 / 0.08)` | hover lift | ours |

Measured component metrics, matched exactly:

| Surface | Spec |
| --- | --- |
| Pill button | `--radius-pill`, `1px` border `--color-border`, `8px 12px` padding, `--text-xs` at weight 500, min `139 × 34px`, `--shadow-sm`, transparent background |
| Card | `--radius-md`, `1px` border `--color-border`, `--space-8` (32px) padding, no shadow |
| Link | `--color-link`, underlined, no border, no padding |

The reference's cards carry **no shadow** — depth comes from the hairline border alone. That is the
whole elevation story in light mode, and it is why `--shadow-sm` is scoped to pill buttons.

Elevation in dark mode is expressed with `--color-bg-subtle` / `--color-surface`, not shadow —
shadows read as grey haze on near-black. Both shadow tokens resolve to `none` in dark.

---

## 20.8 Motion

Durations and easings are tokens so the whole catalogue can be tuned centrally and so the
reduced-motion override has exactly one place to apply.

| Token | Value | Role |
| --- | --- | --- |
| `--dur-fast` | 120ms | colour/opacity state change |
| `--dur-base` | 180ms | hover lift, underline slide |
| `--dur-slow` | 240ms | collapse/expand, crossfade |
| `--dur-reveal` | 320ms | scroll reveal |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | entrances, expansion |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | reversible transitions |
| `--reveal-shift` | 16px | scroll-reveal translate distance (19 §19.3, row 1) |
| `--intro-step` | 450ms | intro-loader per-language dwell (19 §19.4.1) |

Budget rules, inherited from 19 §19.3 and 13 §13.2:

- Only `transform`, `opacity` and `filter` animate. Never a layout property. The one exception is
  the `<Collapsible>` height animation, which is measured and runs on a contained element.
- Framer Motion is imported through `LazyMotion` + `domAnimation`; the full library never ships.
- Reveals run once (`viewport: { once: true }`). Nothing is scroll-linked.
- Nothing animates during initial paint except the intro loader, which is bounded at ≤ 2s total
  (4 × `--intro-step` + exit).

### 20.8.1 The reduced-motion contract

One global rule plus per-component fallbacks. Under `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The global rule is a safety net, not the implementation. Each of the twelve interactions in
19 §19.3 still ships its documented fallback, because several need to change *behaviour* rather
than just duration — the intro loader is skipped entirely, the marquee becomes a static wrapped
grid, count-ups render their final value, and the bottom-bar shine is set to `opacity: 0`. A
duration override alone would leave a marquee mid-scroll and a stat frozen at zero.

---

## 20.9 Focus and interactive states

| State | Treatment |
| --- | --- |
| `:focus-visible` | `outline: 2px solid var(--color-focus); outline-offset: 2px` |
| `:focus` (mouse) | no ring — `:focus-visible` only |
| Hover, cards/links | `translateY(-1px)` + `--shadow-md`, or underline slide; `--dur-base` |
| Active/pressed | `translateY(0)`, no shadow |
| Disabled | `--color-text-tertiary`, `cursor: not-allowed`, plus text or `aria-disabled` — never colour alone |
| Selection | `::selection` uses `--color-focus` at 18% alpha with `--color-text` foreground |

`outline: none` without an equal-or-better replacement is forbidden (12 §12.3). The ring uses
`outline`, not `box-shadow`, so it survives Windows High Contrast and forced-colours mode.

**Skip link** is the first focusable element in the layout, visually hidden until focused, and
lands on `<main id="content">`. The bottom bar `<nav>` is the next tab stop (19 §19.5, friction 2).

---

## 20.10 Breakpoints

| Token | Min width | Notes |
| --- | --- | --- |
| `sm` | 640px | |
| `md` | 768px | `--gutter` and `--section-gap` step up here |
| `lg` | 1024px | |
| `xl` | 1280px | |

Mobile-first. The layout is a single column at every width; breakpoints adjust rhythm, type and the
bottom bar's density — they never introduce a second column of primary content.

---

## 20.11 Icons

| Need | Source | Delivery |
| --- | --- | --- |
| UI icons (chevron, arrow, mail, sun/moon, menu) | `lucide-react` | tree-shaken per-icon import |
| Brand marks (Go, React, Postgres, Cloudflare…) | `simple-icons` | build-time inline SVG, self-hosted |

Rules:

- **No runtime icon CDN.** The reference loads brand marks from `cdn.simpleicons.org` at request
  time. Adopting that would add a third-party origin, a CSP exception and per-image latency against
  the third-party budget in 13 §13.2, which admits only PostHog, Sentry and Turnstile. We import
  the SVG path data at build time and inline it.
- Icons inherit `currentColor` and are sized in `em`, so they track type scale and theme with no
  extra tokens.
- Decorative icons get `aria-hidden="true"`; an icon-only control gets an accessible name.
- Brand marks are trademarks. They identify technologies factually in the tech-stack section; they
  are never used to imply endorsement.

`simple-icons` is a new dependency and therefore needs a decision-log entry — open decision #58.

---

## 20.12 Component inventory

What comes from Base UI (`@base-ui/react`, v1.x), what we build, and what each must satisfy.

| Component | Source | Notes |
| --- | --- | --- |
| Accordion — "Previously" roles, publication abstracts | Base UI `Accordion` | single-open; `<h3>` headers built in |
| Collapsible — "View More" bodies | Base UI `Collapsible` | height measured; instant under reduced motion |
| Switch — human ⇄ agent mode | Base UI `Switch` | mirrors `?view=agent` in the URL |
| Dialog — mobile menu, any overlay | Base UI `Dialog` | focus trap, Escape, focus restore for free (12 §12.3) |
| Tabs — tech-stack categories | Base UI `Tabs` | only if grouped; otherwise `Collapsible` |
| Scroll Area — code blocks, wide tables | Base UI `ScrollArea` | must stay keyboard-scrollable |
| Tooltip | Base UI `Tooltip` | never the only route to information |
| `<ThemeToggle>` | ours | `next-themes`, top-right, two-state (decision #51) |
| `<Reveal>` | ours | one wrapper, `whileInView`, once-only |
| `<CountUp>` | ours | `useInView` + rAF; tabular numerals |
| `<Marquee>` | ours | CSS-only duplicated track; pause on hover |
| `<SectionShell>` | ours | eyebrow label, heading, spacing rhythm |
| `<BottomBar>` | ours | `<nav>` landmark, pill, socials, mode toggle |
| `<IntroLoader>` | ours | `aria-hidden`, `position: fixed`, never gates content |
| `<LocalClock>` | ours | placeholder server-side, starts in `useEffect`, `Asia/Kolkata` (decision #53) |
| `<RichText>` | ours | renders the Payload body contract; sanitised |
| `<CmsUnavailableFallback>`, `<EmptyState>` | ours | calm degradation ([08-resilience.md](08-resilience.md)) |

No component library beyond Base UI is required, and none should be added. Every interactive
primitive the reference layout uses is covered above.

**How the reference is used here (decision #63 — inspiration only).** Upstream is read for layout,
section anatomy, interaction detail and measured values. It is not a source of code. Concretely:

| Upstream approach | Ours | Why |
| --- | --- | --- |
| Hand-rolled height-measuring collapsible and accordion | Base UI `Collapsible` / `Accordion` | ARIA wiring, focus handling and Escape behaviour come free and are what the AA gate checks |
| Animated theme toggler using the View Transitions API | `next-themes` toggle, plain CSS transition | needs a reduced-motion guard and an unsupported-browser path; not worth the surface (§20.8.1) |
| `portfolio.json` as content source | Payload collections, manifest orders only | decision #1; avoids the two-sources drift in 19 §19.5 |
| Essays as TypeScript modules | Payload Blog/TIE + MDX | [02-content-model.md](02-content-model.md) §2.2 |
| `middleware.ts` | route handlers and Server Components | decision #64 — middleware is unvalidated on the OpenNext adapter |
| Theme from a query parameter | `next-themes` only | decision #65 — query-varying output breaks ISR cache correctness |
| Decorative image effects | omitted | outside the JS budget in 13 §13.2 |

What genuinely transfers is the **architecture**, which is why §20.13 exists: the ordered manifest,
the registry with an exhaustive switch, one data type per section, the rich-text block shape, and a
single Markdown generator feeding both views. Those are ideas, and they are good ones.

---

## 20.13 Section manifest contract

The pattern is settled in 19 §19.2: an ordered manifest plus a registry with an exhaustive switch,
so a missing renderer is a type error. This is the shape it takes.

```ts
// apps/web/features/home/sections.ts
export type Block = string | { list: readonly string[] };

/** Static sections carry their own data; content sections declare a Payload fetcher. */
export type SectionSpec =
  | { type: "hero"; data: HeroData }
  | { type: "experience"; title: string; source: "experience" }
  | { type: "techStack"; title: string; data: TechStackData }
  | { type: "story"; title: string; data: { body: readonly Block[] } }
  | { type: "projectSpotlight"; title: string; source: "projects"; limit: 1 }
  | { type: "thinking"; title: string; source: "blog"; limit: 3 }
  | { type: "notes"; title: string; source: "tie"; limit: 3 }
  | { type: "education"; title: string; data: EducationData }
  | { type: "github"; title: string; data: { username: string } }
  | { type: "contact"; title: string; data: ContactData };
```

Contract rules:

1. **Ordering is the manifest's only job.** Reordering the array reorders the page.
2. **`source` means Payload.** A content section never inlines prose. Only `hero`, `techStack`,
   `story`, `education` and `contact` hold literal copy, and only because that copy is
   site-chrome rather than publishable content (19 §19.5, friction 1).
3. **One renderer per `type`,** resolved through a registry whose switch is exhaustive over the
   union — a new variant without a renderer fails `tsc`.
4. **One generator, two views.** `generateMarkdown(manifest, data)` renders the same manifest and
   the same fetched content as Markdown. It backs both `?view=agent` and `llms.txt`, so the two can
   never drift (19 §19.2, 13 §13.6). The Phase 1 gate greps for hand-written duplicate content.
5. **Every section degrades.** A section whose fetcher returns empty renders `<EmptyState>`; a
   section whose fetcher throws on an uncached route renders `<CmsUnavailableFallback>`. A failing
   section never takes down the page (08).
6. **`github` fails calm.** The contributions graph is a public-endpoint fetch with a timeout; on
   failure it renders an empty state, never an error (19 §19.5).

---

## 20.14 Reference section mapping

The live reference currently renders a longer stack than 19 §19.2 records. Mapping each one:

| Reference section | katbose.dev | Rationale |
| --- | --- | --- |
| `hero` | **Adopt** — hero | pronunciation line, live clock, intro lines |
| `experience` | **Adopt** — experience | featured role + "Previously" accordion, from Payload |
| `techStack` | **Adopt** — techStack | self-hosted brand marks (§20.11) |
| `expandableCard` | **Adopt** — story | the "in between these experiences" card |
| `project` | **Adopt** — projectSpotlight | one featured case study + stats grid, links to `/projects` |
| `thinking` (essays) | **Adopt** — thinking | maps to Blog; TIE gets its own `notes` section |
| `education` | **Adopt** — education | |
| `github` | **Adopt** — github | calm empty state required |
| `recommendations` | **Decision required** | needs a new Payload collection and real quotes with consent |
| `publications` | **Decision required** | needs a new Payload collection; keep only if there is real work to list |
| `youtube` | **Decision required** | no channel in the current plan; embeds would add a third-party origin |
| `podcast` | **Decision required** | same as above |
| — | **Add** — notes (TIE) | the Blog/TIE split is load-bearing (02 §2.1) and has no reference equivalent |
| — | **Add** — Ask AI entry point | Ask AI replaces search; the reference has no analogue |

Proposed default for the four undecided: **defer all four past Phase 1.** Each either needs a new
content collection or a new third-party embed, and neither belongs in a foundation phase whose gate
is security, accessibility and performance. The manifest is ordered data, so adding a section later
is a config change plus one renderer. Open decision #59.

---

## 20.15 Visual parity checklist

Parity is graded on measurables, not on "looks the same". Checked once the Home stack is built:

- [ ] Single column throughout; content width equals `--container`, prose equals `--measure`
- [ ] Vertical rhythm between sections equals `--section-gap` at both mobile and ≥ md
- [ ] Section headings render at `--text-3xl`, weight 700, uppercase, `+0.029em` tracking
- [ ] Hero name at `--text-4xl`, weight 700, `-0.025em`, line-height 1.0
- [ ] Body copy at `--text-sm` (14px / 1.625); article bodies at `--text-base`
- [ ] Cards: `--radius-md`, hairline border, `--space-8` padding, no shadow
- [ ] Pill buttons: `--radius-pill`, min `139 × 34px`, `--shadow-sm`, transparent fill
- [ ] Every text role renders in DM Sans; mono appears only in code blocks and the terminal card
- [ ] Live clock shows `Asia/Kolkata`, tabular numerals, no width jitter across a full minute
- [ ] Theme toggle sits top-right; bottom bar is a fixed pill containing nav, socials and mode toggle
- [ ] Scroll reveal translates `--reveal-shift` with a blur→0 transition over `--dur-reveal`, once
- [ ] Hover lift on cards/links equals 1px over `--dur-base`
- [ ] Intro loader cycles four greetings at `--intro-step`, total ≤ 2s, once per session
- [ ] Both themes resolve every semantic token; no component references a primitive or a raw hex

---

## 20.16 Verification gates

These extend the Phase 1 gate in [15-roadmap-and-checklist.md](15-roadmap-and-checklist.md) and the
design gates in 19 §19.7. They are additive, not a replacement.

- [ ] **Contrast is asserted in CI from the tokens themselves** — a unit test parses `theme.css`,
      computes every text-on-background and boundary pairing in §20.4.2, and fails below 4.5:1
      (text) or 3:1 (boundaries/focus). A palette edit cannot silently break AA.
- [ ] **No raw colour outside `theme.css`** — lint rule; zero violations
- [ ] **No arbitrary spacing** — spacing comes from the scale in §20.6
- [ ] **Reduced motion** — each of the twelve interactions verified against its documented fallback,
      not merely sped up (§20.8.1)
- [ ] **CLS 0 with the intro loader mounted**, and 0 across a full minute of clock ticks
- [ ] **Font budget** — three sans weights, one mono, Latin subset, self-hosted, `display: swap`
- [ ] **Forced-colours pass** — focus ring and active states survive Windows High Contrast
- [ ] **200% zoom** — no clipping, and the bottom bar never covers content (§20.6)
- [ ] **Keyboard order** — skip link first, bottom-bar `<nav>` second, focus visible throughout
- [ ] **Agent parity** — `?view=agent` and `llms.txt` both generated from the manifest; grep proves
      no hand-written duplicate
- [ ] **Licence hygiene** — no file in `apps/web` is a copy of an upstream Hackyfolio file

---

## 20.17 Decisions this document depends on

Every decision this document depends on is closed and recorded in
[16-decision-log.md](16-decision-log.md) §16.14. Nothing here is pending.

| # | Decision | Where it applies |
| --- | --- | --- |
| 57 | DM Sans for every text role; JetBrains Mono for code and the terminal card only | §20.5.1 |
| 58 | `simple-icons` inlined at build time; no runtime icon CDN | §20.11 |
| 59 | `recommendations`, `publications`, `youtube`, `podcast` deferred past Phase 1 | §20.14 |
| 60 | Dark palette is project-defined and contrast-verified, not measured | §20.4.2, §20.18 |
| ~~61~~ | ~~Upstream source is not used~~ — superseded on licensing by #63 | §20.2.3, §20.18.1 |
| 62 | Reference author's content never enters the repository, fixtures included | §20.18.1 |
| 63 | Permission granted, but scope of use is **inspiration only**; Base UI and our architecture stand | §20.2.3, §20.12, §20.18.1 |
| 64 | No Next.js middleware — route handlers and Server Components instead | §20.13 |
| 65 | Theme never resolves from a query parameter; `next-themes` only | §20.4.3, §20.9 |

Two of these are worth re-reading before the design pass rather than at review time: **#60**, because
a dark-mode measurement would refine the palette and is cheap to run; and **#63**, because it is what
keeps this document a specification rather than a description of someone else's site.

---

## 20.18 Measurement provenance and its limits

The values marked ✔ throughout this document come from a computed-style measurement of
justaditya.com (light mode, desktop) run on 2026-08-26. Recorded so a future reader knows which
numbers are observed and which are ours.

**What was measured:** font families and per-role size/weight/line-height/tracking; the light
palette; the five spacing steps; border radii and widths; the pill-button and card metrics; the
`shadow-sm` value.

**What was *not* measured, and remains ours to specify:**

| Gap | Consequence |
| --- | --- |
| Dark palette | The run captured `mode: light` only. §20.4.2's dark column is contrast-verified but is our mapping, not parity. Open decision #60. |
| Motion durations and easings | Computed styles do not expose Framer Motion's JS-driven timings. §20.8 remains our specification, derived from the interaction catalogue in 19 §19.3. |
| Scroll behaviour | Reveal thresholds, `once` semantics and marquee speed are runtime behaviour, not CSS. Ours. |
| Responsive steps | Measured at desktop width only. `--gutter` and `--section-gap` breakpoint behaviour is ours. |
| Focus treatment | Not captured. §20.9 is ours, and is stricter than most sites ship. |

### 20.18.1 The boundary this document holds

Measuring how a page renders yields **facts** — a typeface name, a hex value, a pixel metric. Facts
are not authorship, and reproducing them is how any design system gets built against a visual
reference. That is the whole basis on which §20.4–§20.7 are legitimate.

Two things sit on the other side of that line and are out of scope here:

1. **Source code — permission granted, architecture still governs.** As of decision
   [#63](16-decision-log.md) the author has given express written permission to use the complete
   upstream repository for this portfolio, so source may be read and ported. It is still not copied
   in wholesale, because the upstream stack (shadcn/Radix, a JSON content file, Vercel) conflicts
   with decisions #1, #37/#38 and the Base UI choice. Ported code is expected to read like our
   stack. Note separately that scraping only ever yields compiled output, so the repository — not
   the rendered site — is the source of any implementation detail worth reusing.
2. **Content.** Aditya's biography, roles, essays, publication and client recommendations are his
   personal information and his prose. None of it enters this project in any form, including as
   placeholder or fixture data. Fixtures are the `[Fixture]`-prefixed set defined in
   [02-content-model.md](02-content-model.md) §2.1.1, and real content is Kat's, entered through
   Payload.
