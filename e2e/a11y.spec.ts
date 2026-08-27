import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  "/",
  "/projects",
  "/experience",
  "/blog",
  "/tie",
  "/resume",
  "/ask-ai",
  "/contact",
  "/privacy",
  "/agent",
  "/resume-unavailable",
];
for (const path of pages) {
  test(`a11y: ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
