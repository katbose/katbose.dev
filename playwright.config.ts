import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "https://127.0.0.1:8788",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env["SKIP_PLAYWRIGHT_WEBSERVER"]
    ? undefined
    : {
        command:
          "pnpm --filter web build && pnpm --filter web exec opennextjs-cloudflare preview --port 8788 --local-protocol https",
        url: "https://127.0.0.1:8788",
        ignoreHTTPSErrors: true,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
