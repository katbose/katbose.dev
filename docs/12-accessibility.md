# 12 — Accessibility

[← Back to PLAN.md](../PLAN.md)

---

## 12.1 Target

**WCAG 2.2 Level AA, fully keyboard operable, enforced in CI.**

Stating a target without a mechanism is how accessibility regresses. Every rule below is either
automatically checked or is a concrete build-time requirement.

---

## 12.2 Automated enforcement

### axe-core across every page

```ts
// e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/projects", "/experience", "/blog", "/tie", "/resume", "/ask-ai", "/contact", "/privacy"];

for (const path of PAGES) {
  test(`a11y: ${path} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
```

Zero violations is the pass condition. If a rule genuinely cannot be satisfied, it is disabled
explicitly with a comment explaining why — never by dropping the whole scan.

### Keyboard operability

```ts
// e2e/keyboard.spec.ts
import { test, expect } from "@playwright/test";

test("skip link is the first focusable element", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText(/skip to content/i);
});

test("navigation is reachable and focus stays visible", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  }
});

test("contact form can be completed with the keyboard only", async ({ page }) => {
  await page.goto("/contact");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Test Name");
  await page.keyboard.press("Tab");
  await page.keyboard.type("test@example.com");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Hello, this is a test message.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/thank you|received/i)).toBeVisible();
});

test("mobile menu traps focus and closes on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /menu/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /menu/i })).toBeFocused();
});
```

### Optional

Lighthouse CI asserting an accessibility score ≥ 95 on every PR, alongside performance and SEO
budgets ([13-seo-and-agent-readability.md](13-seo-and-agent-readability.md)).

---

## 12.3 Build-time rules

Applied to every component, checked in review:

- **Skip-to-content link** is the first element in the layout and becomes visible on focus
- **Visible focus styles** — `:focus-visible` is always styled; `outline: none` is never used
  without a replacement of equal or better clarity
- **Semantic elements only** — real `<button>` and `<a>`; never a `div` with an onClick.
  Base UI provides accessible primitives, which is a large part of why it was chosen
- **Landmarks** — `header`, `nav`, `main`, `footer`, with a single `h1` per page and no skipped
  heading levels
- **Ask AI results** render inside an `aria-live="polite"` region so answers are announced
- **Loading states** are announced, not conveyed by a spinner alone
- **Mobile menu** traps focus while open, closes on `Escape`, and returns focus to the trigger
- **Form fields** have associated `<label>` elements; errors are linked via `aria-describedby`
  and announced
- **Colour contrast** meets WCAG 2.2 AA (4.5:1 body text, 3:1 large text); focus is not
  obscured, pointer targets and drag alternatives meet applicable 2.2 criteria
- **Control boundaries** use the contrast-verified strong-border token; decorative hairlines never
  provide the only control/state boundary
- **Colour is never the only signal** for state or meaning
- **Images** have meaningful `alt` text; decorative images use `alt=""`. The homepage portrait
  has fixed width/height, a reserved 1:1 box and the Payload-provided identity description; its
  bundled fallback uses the same accessible name and geometry
- **`prefers-reduced-motion`** disables or reduces every Motion animation
- **Zoom to 200%** does not break layout or hide content
- **Code blocks** are keyboard-scrollable and copy buttons are reachable and labelled

---

## 12.4 Content-authoring rules

Accessibility is not only a code concern — the CMS can introduce violations:

- Alt text is a **required field** on media uploads
- `Profile.profileImageAlt` must identify the portrait meaningfully (for example, “Portrait of Kat
  Bose”), not repeat “image”, a filename or surrounding hero text. Favicon media has no DOM alt
  attribute, but its Payload record retains an administrative label.
- Headings inside articles follow a logical order; the editor does not skip levels for styling
- Link text is descriptive — never "click here" or a bare URL
- Tables include header cells

---

## 12.5 Manual checks per phase

Automation catches roughly half of real accessibility problems. Once per phase:

- [ ] Navigate the entire site with the keyboard only, no mouse
- [ ] Screen-reader pass over Home, a blog post, Resume and Ask AI (NVDA or VoiceOver); confirm the
      portrait is announced once with its Payload alt text and the fallback does not duplicate it
- [ ] Zoom to 200% and confirm nothing is clipped or unreachable
- [ ] Force `prefers-reduced-motion` and confirm animations stop
- [ ] Check contrast in both the light and dark (system-preference) palette — light grey on white or dark is the most likely failure
