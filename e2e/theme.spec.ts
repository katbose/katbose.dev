import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`clean visit follows ${colorScheme} system theme and persists override`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await page
      .getByRole("button", { name: `Switch to ${colorScheme === "dark" ? "light" : "dark"} theme` })
      .click();
    const opposite = colorScheme === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", opposite);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", opposite);
    await context.close();
  });
}
