import { expect, test } from "@playwright/test";

const routes = [
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
  "/humans.txt",
  "/llms.txt",
  "/rss.xml",
  "/robots.txt",
  "/sitemap.xml",
];
for (const path of routes) {
  test(`${path} returns a successful response`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
  });
}
test("unknown routes use the project 404", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
