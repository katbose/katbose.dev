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
3. **Reference precedence and no copying.** Express permission is recorded in decision #63, but
   the project rule is inspiration only: observed facts inform anatomy; project tokens, Base UI,
   WCAG 2.2 AA, performance budgets and architecture are normative. No upstream file, code, prose
   or personal content is copied, and deliberate differences are documented.
4. **Payload remains the content source of truth.** The section manifest orders sections and holds
   section type, stable ID, source selectors, limits and display flags only. It contains no prose.
5. **Every visual decision has an accessibility consequence.** Contrast, focus, motion and zoom
   requirements from [12-accessibility.md](12-accessibility.md) are constraints on this system, not
   a later review step.

---

## 20.3 Token architecture

Two tiers, deliberately. A flat semantic-only set makes theming easy but hides palette
inconsistency; a primitive-only set pushes colour decisions into components.

```text
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
| `--color-bg` | `--gray-0` | — | `--gray-1000` | — | ✔ both measured |
| `--color-surface` | `--gray-0` | — | `--gray-1000` | — | ✔ borders define, not fills |
| `--color-bg-subtle` | `--gray-50` | — | `--gray-950` | — | ours — see below |
| `--color-text` | `--gray-1000` | **21.00** | `--gray-0` | **21.00** | ≥ 4.5 ✔ |
| `--color-text-secondary` | `--gray-600` | **7.56** | `--gray-300` | **14.25** | ≥ 4.5 ✔ |
| `--color-text-tertiary` | `--gray-500` | **4.84** | `--gray-400` | **8.27** | ≥ 4.5 ✔ |
| `--color-link` | `--gray-600` + underline | **7.56** | `--gray-300` + underline | **14.25** | ≥ 4.5 ✔ |
| `--color-focus` | `--gray-1000` | **21.00** | `--gray-0` | **21.00** | ≥ 3 ✔ |
| `--color-border` | `--gray-200` | 1.24 | `--gray-800` | 1.43 | decorative only |
| `--color-border-strong` | `--gray-500` | **4.84** | `--gray-500` | **4.34** | ≥ 3 ✔ |

**The two themes are the same ramp with its endpoints swapped** — white on black becomes black on
white. That is exactly what the reference does: it defines only a background and a foreground
variable and flips them, with per-element greys coming from utilities rather than tokens. Decision
[#66](16-decision-log.md) records the parity and the tradeoff (pure black maximises contrast but can
halate for astigmatic readers; softening to `--gray-950`/`--gray-50` is a two-token change worth
20.10:1 if review says it reads badly).

`--color-bg-subtle` in dark is **ours, not parity**. The reference has no dark surface fill at all —
cards are transparent with a border, the same way its light cards are white-on-white with a border.
We keep one subtle step for the few places a border is the wrong affordance, chiefly code blocks.

Two cautions came out of the measurement:

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
  `next/font/google` with `display: optional` (13 §13.2). Fast loads use DM Sans; constrained
  loads retain the metric-compatible fallback rather than triggering a late text swap and a
  second LCP candidate.
- **The reference has no monospace family.** Its pronunciation line and live clock are DM Sans. We
  match that, and keep `--font-mono` scoped strictly to syntax-highlighted code and the terminal
  card — surfaces the reference does not have and where a mono face is functional, not decorative.
- Tabular numerals come from `font-variant-numeric`, not from switching family, so the clock and
  count-ups stay in DM Sans without width jitter.

Decision #57 is closed.

### 20.5.2 Scale

Measured from the reference at desktop width, converted to `rem` at a 16px root. Line heights are
unitless so they survive zoom to 200% (12 §12.3).

| Token | Size | Line height | Weight | Tracking | Role | Measured |
| --- | --- | --- | --- | --- | --- | --- |
| `--text-xs` | 0.75rem / 12px | 1.5 | 400–500 | `0` | controls, meta, tags | ✔ |
| `--text-sm` | 0.875rem / 14px | 1.625 | 400 | `0` | body and Home section headings | ✔ |
| `--text-base` | 1rem / 16px | 1.6 | 400 | `0` | long-form prose; intro below 640px | project norm |
| `--text-lg` | 1.125rem / 18px | 1.5 | 400 | `0` | intro from 640px | ✔ responsive |
| `--text-xl` | 1.25rem / 20px | 1.5 | 400 | `0` | intro from 1024px | ✔ responsive |
| `--text-2xl` | 2rem / 32px | 1.19 | 600 | `0` | internal page subheadings | project norm |
| `--text-hero` | 3rem / 48px → 4.5rem / 72px at 640px | 1.0 | 700 | `-0.025em` | hero name | ✔ responsive |

Home section headings are 14px, weight 700, uppercase through CSS, with deliberate tracking; they
are not 48px display headings. Hero and intro are the only responsive type steps pinned from the
source: hero 48→72px at 640px, intro 16→18px at 640px→20px at 1024px.

One deliberate departure and one Home heading rule:

- **Body stays 14px for parity, but long-form prose gets `--text-base` (16px).** The reference is a
  single page of short blocks, where 14px reads fine. Payload Lexical is the Blog's canonical
  authoring source; its derived long-form rendering still benefits from 16px
  ([02-content-model.md](02-content-model.md) §2.2), because 14px over several thousand words fights
  the "excellent typography" principle. Chrome and cards match the reference at 14px; article bodies
  step up.
- **Home section headings use `--text-sm` (14px), weight 700 and deliberate positive tracking.**
  Uppercase is applied through CSS; the heading token is not a display-size step and is not reused
  for lowercase prose.

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
| `--measure` | 42rem / 672px | Home and prose maximum width |
| `--container` | 42rem / 672px | Home section width |
| `--gutter` | 12px below 640px → 16px at 640px+ | horizontal page padding |
| `--section-gap` | 64px at every viewport | fixed vertical rhythm between Home sections |
| `--bottombar-inset` | 24px + `env(safe-area-inset-bottom)` | gap from viewport edge |

The bottom bar has **no fixed height token**; its content and minimum touch targets determine height.
The page reserves the measured bar height at runtime plus the 24px inset and safe area so it never
covers content at 200% zoom. Cards use 24px padding below 640px and 32px at 640px+.

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

Component metrics, preserving measured geometry while applying the project accessibility boundary rule:

| Surface | Spec |
| --- | --- |
| Pill button | `--radius-pill`, `1px` border `--color-border-strong`, `8px 12px` padding, `--text-xs` at weight 500, min `139 × 34px`, `--shadow-sm`, transparent background |
| Card | `--radius-md`, `1px` decorative border `--color-border`, 24px padding below 640px → 32px at 640px+, no shadow; any focusable card/control boundary uses `--color-border-strong` |
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
| `--dur-base` | 180ms | hover/underline state change |
| `--dur-crossfade` | 350ms | human ↔ agent content crossfade |
| `--dur-intro` | 800ms | complete four-greeting intro sequence, including exit |
| `--dur-count` | 1800ms | count-up completion |
| `--dur-reveal` | 900–1100ms | source-observed scroll reveal range |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | entrances, expansion |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | reversible transitions |
| `--reveal-shift` | 32px | reveal translate distance |
| `--reveal-scale` | 0.985 | reveal initial scale |
| `--reveal-blur` | 12px | reveal initial blur |
| `--reveal-amount` | 0.15 | viewport intersection amount |
| `--dur-marquee` | 30s | tech-stack marquee, one full cycle, `linear infinite` |
| `--dur-shine` | 1.5s | bottom-bar edge shine, `ease-in-out`, once |
| `--delay-shine` | 450ms | shine start delay |

The intro sequence—including exit—uses one 800ms compositor-driven opacity timeline. JavaScript
only mounts it once per session and removes the completed overlay; the CSS final frame reveals the
page even if main-thread cleanup is delayed. The total remains within the inherited ≤2-second
budget from 19 §19.3 and 13 §13.2.

Budget rules, inherited from 19 §19.3 and 13 §13.2:

- Only `transform`, `opacity` and `filter` animate. Never a layout property. The one exception is
  the `<Collapsible>` height animation, which is measured and runs on a contained element.
- Motion (`motion`, formerly Framer Motion) is imported through `LazyMotion` + `domAnimation`; the full library never ships.
- Reveals run once (`viewport: { once: true }`). Nothing is scroll-linked.
- Nothing animates during initial paint except the intro loader; its total sequence, including
  exit, is ≤2s.

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

The reference confirms this approach for the shine specifically: its own stylesheet disables that
animation and zeroes its opacity under `prefers-reduced-motion`, exactly as 19 §19.3 row 8
predicted. Worth noting as the one place upstream already meets our bar.

**Not adopted: hiding scrollbars.** Upstream carries a scrollbar-hiding utility. Applied to the
decorative marquee track that is harmless, and we do the same. Applied to genuinely scrollable
content it removes the only visual cue that more content exists, which conflicts with 12 §12.3's
requirement that code blocks stay keyboard-scrollable *and* discoverable. Scoped to the marquee
only.

---

## 20.9 Focus and interactive states

| State | Treatment |
| --- | --- |
| `:focus-visible` | `outline: 2px solid var(--color-focus); outline-offset: 2px` |
| `:focus` (mouse) | no ring — `:focus-visible` only |
| Hover, cards/links | `translateY(-2px)` plus shadow or underline slide; `--dur-base` |
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
| `sm` | 640px | gutter, cards and hero/intro type step here |
| `md` | 768px | no Home width or section-gap change |
| `lg` | 1024px | intro reaches 20px |
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

`simple-icons` is approved by closed decision #58; its data is inlined at build time.

### 20.11.1 Site identity assets

Decision #87 adds two Payload-managed identity surfaces without treating either as a UI primitive:

| Asset | Source | Presentation contract |
| --- | --- | --- |
| Homepage portrait | `Profile.profileImage` + `profileImageAlt` | `<ProfilePortrait>` renders a 1:1, `object-fit: cover` image at 80px below 640px and 96px at 640px+, `--radius-pill`, explicit width/height and no motion |
| Favicon | `SiteSettings.favicon` | Root metadata emits immutable same-origin 32/48/180/192/512 PNG variants; it has no visible component or runtime external request |

The live reference establishes the **presence** of a portrait in the hero, not these dimensions.
Sizing, alt behavior, validation and fallback handling are project-owned. Both assets use immutable
media keys. Phase 1's bundled defaults have the same geometry/metadata shape as Phase 2's Payload
values, so activating the CMS changes data rather than component structure and never introduces
CLS. An unavailable or unset CMS relation selects the bundled project-owned asset; it never falls
back to an upstream image.

---

## 20.12 Component inventory

What comes from Base UI (`@base-ui/react`, v1.x), what we build, and what each must satisfy.

| Component | Source | Notes |
| --- | --- | --- |
| Accordion — "Previously" roles, publication abstracts | Base UI `Accordion` | single-open; `<h3>` headers built in |
| Collapsible — "View More" bodies | Base UI `Collapsible` | height measured; instant under reduced motion |
| Switch — human ⇄ agent mode | Base UI `Switch` | links/transitions to canonical `/agent` |
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
| `<ProfilePortrait>` | ours | Payload relation or bundled fallback; fixed 1:1 geometry and meaningful alt text (§20.11.1) |
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
| Essays as TypeScript modules | Payload Blog/TIE with canonical Lexical; Markdown/MDX derived | [02-content-model.md](02-content-model.md) §2.2 |
| `middleware.ts` | route handlers and Server Components | decision #64 — middleware is unvalidated on the OpenNext adapter |
| Theme from a query parameter | `next-themes` only | decision #67—the post-hydration switch flashes; a render-time fix is not worth query-varying output |
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
import { z } from "zod";

export const SectionSpecSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), source: z.literal("profile") }),
  z.object({ type: z.literal("experience"), source: z.literal("experience") }),
  z.object({ type: z.literal("techStack"), source: z.literal("profile.skills") }),
  z.object({ type: z.literal("story"), source: z.literal("profile.story") }),
  z.object({ type: z.literal("projectSpotlight"), source: z.literal("projects"), limit: z.literal(1) }),
  z.object({ type: z.literal("thinking"), source: z.literal("blog"), limit: z.number().int().min(1).max(6) }),
  z.object({ type: z.literal("notes"), source: z.literal("tie"), limit: z.number().int().min(1).max(6) }),
  z.object({ type: z.literal("education"), source: z.literal("profile.education") }),
  z.object({ type: z.literal("contact"), source: z.literal("profile.contact") }),
]);
export type SectionSpec = z.infer<typeof SectionSpecSchema>;

export function assertNever(value: never): never {
  throw new Error(`Unregistered section: ${JSON.stringify(value)}`);
}
```

Contract rules:

1. **Ordering is the manifest's only content-independent job.** It contains section type, stable ID,
   source selector, limits and display flags—never profile, story or education prose.
2. **`source` means Payload.** The `Profile` global owns hero/profile/contact/social/skills, the
   profile portrait/alt, story and education content. `SiteSettings` owns the favicon relation.
   Collections own experience, projects, Blog and TIE. Lexical is canonical for rich text;
   Markdown/MDX are derived.
3. **Compile-time and runtime exhaustiveness are both required.** The registry switch ends in an
   `assertNever`; manifest and CMS payloads pass closed Zod discriminated unions before dispatch.
   Unknown rich-text nodes fail visibly in tests rather than being silently dropped. Strict
   TypeScript applies and application code contains no `any`.
4. **One route manifest, derived outputs.** The route manifest drives navigation, canonical
   `/agent`, sitemap metadata and generated `/llms.txt`. Repository-root `llms.txt` and `robots.txt`
   are checked-in exports verified against the canonical generators (decision #89), never authored
   runtime duplicates.
5. **Every section degrades.** Empty data renders `<EmptyState>`; an uncached failure renders
   `<CmsUnavailableFallback>` without taking down the page.
6. **GitHub is deferred in Phase 1.** If deliberately enabled later, it is fetched server-side with
   an explicit timeout, ISR cache and calm fallback—never by a client-side runtime fetch.

---

## 20.14 Reference section mapping

The live reference currently renders a longer stack than 19 §19.2 records. Mapping each one:

| Reference section | katbose.dev | Rationale |
| --- | --- | --- |
| `hero` | **Adopt** — hero | CMS-managed profile portrait, pronunciation line, live clock and intro lines |
| `experience` | **Adopt** — experience | featured role + "Previously" accordion, from Payload |
| `techStack` | **Adopt** — techStack | self-hosted brand marks (§20.11) |
| `expandableCard` | **Adopt** — story | the "in between these experiences" card |
| `project` | **Adopt** — projectSpotlight | one featured case study + stats grid, links to `/projects` |
| `thinking` (essays) | **Adopt** — thinking | maps to Blog; TIE gets its own `notes` section |
| `education` | **Adopt** — education | |
| `github` | **Deferred in Phase 1** | Include only after a server-side fetch has timeout, ISR cache and calm fallback |
| `recommendations` | **Deferred past Phase 1** | needs a Payload collection and consented real quotes |
| `publications` | **Deferred past Phase 1** | needs a Payload collection and real work to list |
| `youtube` | **Deferred past Phase 1** | runtime embeds/external media are prohibited |
| `podcast` | **Deferred past Phase 1** | runtime embeds/external media are prohibited |
| — | **Add** — notes (TIE) | the Blog/TIE split is load-bearing (02 §2.1) and has no reference equivalent |
| — | **Add** — Ask AI entry point | Ask AI replaces search; the reference has no analogue |

All five deferrals are closed decisions (#59 and #76). The manifest makes later addition cheap,
but Phase 1 does not spend runtime, schema or privacy budget on content that is not required.

---

## 20.15 Visual parity checklist

Parity is graded on measurables, not on "looks the same". Checked once the Home stack is built:

- [ ] Single column; Home and prose max width are 672px
- [ ] Gutters are 12px below 640px and 16px at 640px+; section gap is always 64px
- [ ] Home section headings are 14px, weight 700, uppercase through CSS
- [ ] Hero is 48px below 640px and 72px at 640px+; intro is 16→18→20px
- [ ] Profile portrait is 80px below 640px and 96px at 640px+, circular, 1:1, dimension-reserved,
      CMS-backed with meaningful alt text and visually identical bundled-fallback geometry
- [ ] Cards use 24→32px padding at 640px; controls use `--color-border-strong`
- [ ] Four DM Sans weights (400/500/600/700) load; mono appears only in code and terminal card
- [ ] Live clock shows `Asia/Kolkata`, tabular numerals and no width jitter
- [ ] Bottom bar uses a 24px safe-area-aware inset and has no fixed height
- [ ] Reveal starts at y=32px, scale=.985, blur=12px; 900–1100ms; viewport amount .15
- [ ] Count-up completes in 1800ms; human↔agent crossfade completes in 350ms
- [ ] Hover lift is 2px; intro sequence including exit is ≤2s and runs once per session
- [ ] Both themes resolve semantic tokens; no component references a primitive or raw colour
- [ ] Canonical `/agent` and generated `/llms.txt` come from the typed route manifest

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
- [ ] **CLS 0 with the intro loader mounted**, across a full minute of clock ticks, and when the
      profile portrait switches between bundled fallback and CMS media
- [ ] **Identity assets** — profile and favicon upload schemas reject invalid signature/type/size/
      dimensions; replacements create immutable URLs, favicon variants are complete, and neither
      asset loads from an upstream or runtime third-party origin
- [ ] **Font budget** — four sans weights (400/500/600/700), one mono, required subsets only, self-hosted, `display: swap`
- [ ] **Forced-colours pass** — focus ring and active states survive Windows High Contrast
- [ ] **200% zoom** — no clipping, and the bottom bar never covers content (§20.6)
- [ ] **Keyboard order** — skip link first, bottom-bar `<nav>` second, focus visible throughout
- [ ] **Agent parity** — canonical `/agent` and generated `/llms.txt` derive from the typed route
      manifest; grep proves no handwritten runtime duplicate
- [ ] **Permission/architecture hygiene** — inspiration only; no upstream file or content is copied,
      and Base UI remains the sole primitive library

---

## 20.17 Decisions this document depends on

Every decision this document depends on is closed and recorded in
[16-decision-log.md](16-decision-log.md) §16.14 and §16.19. Nothing here is pending.

| # | Decision | Where it applies |
| --- | --- | --- |
| 57 | DM Sans for every text role; JetBrains Mono for code and the terminal card only | §20.5.1 |
| 58 | `simple-icons` inlined at build time; no runtime icon CDN | §20.11 |
| 59 | `recommendations`, `publications`, `youtube`, `podcast` deferred past Phase 1 | §20.14 |
| ~~60~~ | ~~Dark palette project-defined/not measured~~ — historical, superseded by #66 | §20.4.2, §20.18 |
| ~~61~~ | ~~Upstream source is not used~~ — superseded on licensing by #63 | §20.2.3, §20.18.1 |
| 62 | Reference author's content never enters the repository, fixtures included | §20.18.1 |
| 63 | Permission granted, but scope of use is **inspiration only**; Base UI and our architecture stand | §20.2.3, §20.12, §20.18.1 |
| 64 | No Next.js middleware — route handlers and Server Components instead | §20.13 |
| ~~65~~ | ~~Theme never resolves from a query parameter~~ — conclusion stands, reasoning corrected by #67 | §20.4.3 |
| 66 | Dark palette is exact parity: the ramp's endpoints swapped, pure black and pure white | §20.4.2 |
| 67 | `?theme=` declined because it flashes post-hydration, not because of cache behaviour | §20.4.3 |
| 87 | Payload-managed profile portrait and favicon with immutable media, validation and bundled fallbacks | §20.11.1, §20.12, §20.15–§20.16 |

The historical chain matters: #60 is superseded by #66, and #65's conclusion is retained with
reasoning corrected by #67. Decisions #77–#81 set the current precedence, accessibility and asset
rules; #87 adds the Payload-managed identity assets and their Phase 1/2 boundary.

---

## 20.18 Measurement provenance and its limits

The values marked ✔ throughout this document come from either a computed-style measurement of
justaditya.com (light mode, desktop) run on 2026-08-26 or direct inspection of the upstream source
on that date. The provenance is recorded so observed facts are not confused with project rules.

**Computed-style measurement:** font families and per-role size/weight/line-height/tracking; the
light palette; the five spacing steps; border radii and widths; the pill-button and card metrics;
and the `shadow-sm` value.

**Source-inspected facts:** the dark theme's swapped black/white endpoints; hero portrait presence;
hero and intro responsive type steps; CSS motion values for marquee and shine; and runtime reveal
facts including timing range, viewport amount and run-once behavior. These responsive, motion and
runtime facts are acknowledged as observations even though they were not available from the
desktop computed-style capture alone.

**Project-normative rules:** semantic token mapping, `--color-border-strong` for control boundaries,
WCAG 2.2 AA contrast/focus/zoom requirements, reduced-motion behavior, the ≤2s total intro budget,
performance budgets and every deliberate departure documented here. Observing an upstream value
does not let it override project tokens, accessibility or architecture.

| Remaining project-owned area | Consequence |
| --- | --- |
| Long-form typography and internal-page steps | `--text-base` prose and `--text-2xl` subheadings remain project norms. |
| Adopted source-observed layout geometry | The 672px maximum width, 12→16px gutters at 640px, fixed 64px section gap, 24→32px card padding, 24px bottom inset and lack of a fixed bar height are observed upstream facts expressed through project tokens. |
| Project-owned responsive safeguards | Safe-area reservation, runtime bar-height reservation, 200% zoom behavior, collision handling and accessibility boundaries are normative project additions. |
| Portrait implementation | The reference establishes hero portrait presence only; 80→96px sizing, crop, alt text, immutable delivery and bundled fallback behavior are project-owned. |
| Unobserved motion | Collapse, human/agent crossfade and the intro's internal distribution remain project-defined within the normative motion/accessibility budgets. |
| Focus treatment | §20.9 is project-owned and intentionally stricter than the reference. |

### 20.18.1 The boundary this document holds

Measuring how a page renders yields **facts** — a typeface name, a hex value, a pixel metric. Facts
are not authorship, and reproducing them is how any design system gets built against a visual
reference. That is the whole basis on which §20.4–§20.7 are legitimate.

Two things sit on the other side of that line and are out of scope here:

1. **Source reference—permission recorded, project rules still govern.** Decision #63 records
   express permission for this portfolio. The stricter implementation rule is inspiration only:
   inspect layout, anatomy, behavior and observed facts, but copy no upstream file, code, prose or
   personal content. Base UI remains the sole primitive library; Payload, OpenNext Workers and the
   project design/accessibility/performance rules are normative.
2. **Content.** Aditya's biography, roles, essays, publication and client recommendations are his
   personal information and his prose. None of it enters this project in any form, including as
   placeholder or fixture data. Fixtures are the `[Fixture]`-prefixed set defined in
   [02-content-model.md](02-content-model.md) §2.1.1, and real content is KatBose's, entered through
   Payload.
