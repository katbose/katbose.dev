import { expect, test } from "@playwright/test";

test("skip link is first and the bottom bar follows", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }),
  ).toBeFocused();
});

test("mobile menu traps focus, closes on Escape, and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Menu" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
