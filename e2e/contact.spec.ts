import { expect, test } from "@playwright/test";

test("contact form validates locally and announces success", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/contact", async (route) => {
    submitted = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"accepted":true}',
    });
  });
  await page.goto("/contact");
  await page.getByLabel("Name").fill("Test Name");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Message").fill("Hello, this is a test message.");
  await page.getByRole("button", { name: "Send message" }).press("Enter");
  await expect(page.getByText("Complete the bot check.")).toBeVisible();

  await page.locator("form").evaluate((form) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "cf-turnstile-response";
    input.value = "test-token";
    form.append(input);
  });
  await page.getByRole("button", { name: "Send message" }).press("Enter");

  await expect(page.getByText("Thank you — your message was received.")).toBeVisible();
  expect(submitted).toMatchObject({
    name: "Test Name",
    email: "test@example.com",
    message: "Hello, this is a test message.",
    website: "",
    turnstileToken: "test-token",
  });
});
