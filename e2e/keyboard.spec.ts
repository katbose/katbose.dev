import { expect, test, type Locator, type Page } from "@playwright/test";

/** True while focus is inside the given container. */
function focusIsInside(container: Locator): Promise<boolean> {
  return container.evaluate((node) => node.contains(document.activeElement));
}

/** Focus ring specification from `:focus-visible` in `globals.css`. */
async function focusIndicator(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const styles = getComputedStyle(active);
    return {
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      outlineColor: styles.outlineColor,
    };
  });
}

test("skip link is first and the bottom bar follows", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }),
  ).toBeFocused();
});

test("every control reached by keyboard has a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  // Walk the first controls in the document rather than a single one, so a rule
  // that removes the ring from one component is still caught.
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Tab");
    const indicator = await focusIndicator(page);
    expect(indicator, "nothing is focused").not.toBeNull();
    expect(indicator?.outlineStyle).toBe("solid");
    expect(Number.parseFloat(indicator?.outlineWidth ?? "0")).toBeGreaterThanOrEqual(2);
    expect(indicator?.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
  }
});

test("mobile menu traps focus in both directions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const controlCount = await dialog.locator("a, button").count();
  expect(controlCount).toBeGreaterThan(1);

  // Cycling past the last control must wrap to the first, never escape to the
  // page behind the dialog.
  for (let step = 0; step < controlCount + 2; step += 1) {
    await page.keyboard.press("Tab");
    expect(await focusIsInside(dialog), `focus left the dialog after ${step + 1} Tabs`).toBe(true);
  }
  for (let step = 0; step < controlCount + 2; step += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusIsInside(dialog), `focus left the dialog after ${step + 1} Shift+Tabs`).toBe(
      true,
    );
  }
});

test("mobile menu closes on Escape and restores focus to its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Menu" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("disclosure and accordion triggers operate from the keyboard", async ({ page }) => {
  await page.goto("/");

  const disclosure = page.getByRole("button", { name: "View more" });
  await disclosure.focus();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Show less" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  const accordion = page.getByRole("button", { name: "Current focus" });
  await accordion.focus();
  await page.keyboard.press("Space");
  await expect(accordion).toHaveAttribute("aria-expanded", "true");
});
