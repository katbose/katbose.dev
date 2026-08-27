import { expect, test } from "@playwright/test";

test("@spike runtime serves agent output and dynamic OG PNG", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.ok()).toBe(true);
  expect(await llms.text()).toContain("Generated from the typed public route manifest");
  // Served as a committed static asset rather than generated per request, so
  // the @vercel/og WASM runtime stays out of the 3 MiB Worker script limit.
  const image = await request.get("/opengraph-image.png");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/png");

  // Serving the image is not enough — it has to be advertised, which it was
  // not until the metadata helper referenced it explicitly.
  const home = await request.get("/");
  const html = await home.text();
  expect(html).toContain('property="og:image"');
  expect(html).toContain("/opengraph-image.png");
});
