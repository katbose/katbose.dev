/**
 * Spike A contract — executed against the built OpenNext Worker in `workerd`.
 *
 * These are the integration guarantees the Phase 1 gate depends on and that no
 * unit test can establish: the R2 incremental cache, Draft Mode cookies, and
 * `node:crypto` availability under `nodejs_compat`. The original proof came from
 * a throwaway scaffold, so a regression in any of them would previously have
 * gone unnoticed until Phase 2 broke.
 *
 * Run with `pnpm --filter web test:spike:workers`.
 */

import { expect, test, type APIRequestContext } from "@playwright/test";

const ISR_PROBE_PATH = "/probe/isr";
const DRAFT_PROBE_PATH = "/api/probe/draft";
const CONSTANT_TIME_PROBE_PATH = "/api/probe/constant-time";

/** Matches the generation timestamp the ISR probe page renders. */
const ISR_VALUE_PATTERN = /data-probe="isr"[^>]*>(\d+)</;

/** `revalidate = 2` on the probe page, with headroom for a slow CI runner. */
const ISR_STALE_AFTER_MS = 2_600;
const ISR_POLL_INTERVAL_MS = 400;
const ISR_POLL_ATTEMPTS = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readIsrValue(request: APIRequestContext): Promise<number> {
  const response = await request.get(ISR_PROBE_PATH);
  expect(response.ok()).toBe(true);
  const match = ISR_VALUE_PATTERN.exec(await response.text());
  expect(match, "ISR probe page did not render a generation timestamp").not.toBeNull();
  return Number(match?.[1]);
}

test("@spike runtime serves agent output and the committed Open Graph PNG", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.ok()).toBe(true);
  expect(await llms.text()).toContain("Generated from the typed public route manifest");

  // Served as a committed static asset rather than generated per request, so
  // the @vercel/og WASM runtime stays out of the 3 MiB Worker script limit.
  // Phase 1 asserts the static asset deliberately; per-post dynamic images are
  // Phase 2 work with their own script-budget decision.
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

test("@spike ISR serves from cache, goes stale, then revalidates via the R2 cache", async ({
  request,
}) => {
  test.slow();

  const first = await readIsrValue(request);
  expect(Number.isFinite(first)).toBe(true);

  // A second read inside the revalidation window must be the same cache entry.
  expect(await readIsrValue(request)).toBe(first);

  await sleep(ISR_STALE_AFTER_MS);

  // Stale-while-revalidate: the expired entry is still served immediately and
  // the rebuild happens in the background.
  expect(await readIsrValue(request)).toBe(first);

  let latest = first;
  for (let attempt = 0; attempt < ISR_POLL_ATTEMPTS && latest === first; attempt += 1) {
    await sleep(ISR_POLL_INTERVAL_MS);
    latest = await readIsrValue(request);
  }
  expect(latest, "background revalidation never produced a new cache entry").toBeGreaterThan(first);

  // The refreshed entry is itself cached, not regenerated per request.
  expect(await readIsrValue(request)).toBe(latest);
});

test("@spike Draft Mode issues, round-trips and revokes the bypass cookie", async ({ request }) => {
  const enabled = await request.get(`${DRAFT_PROBE_PATH}?action=enable`);
  expect(enabled.ok()).toBe(true);
  expect(await enabled.json()).toEqual({ enabled: true });

  const setCookie = enabled.headers()["set-cookie"] ?? "";
  expect(setCookie).toContain("__prerender_bypass");
  // The bypass cookie must not be readable by scripts.
  expect(setCookie.toLowerCase()).toContain("httponly");

  // The API context persists cookies, so this proves the round trip.
  expect(await (await request.get(DRAFT_PROBE_PATH)).json()).toEqual({ enabled: true });

  const disabled = await request.get(`${DRAFT_PROBE_PATH}?action=disable`);
  expect(await disabled.json()).toEqual({ enabled: false });

  // Revocation must survive the following request, which is the expiry path
  // Phase 2's 15-minute preview scope relies on.
  expect(await (await request.get(DRAFT_PROBE_PATH)).json()).toEqual({ enabled: false });
});

test("@spike a forged bypass cookie does not enable Draft Mode", async ({ request }) => {
  const response = await request.get(DRAFT_PROBE_PATH, {
    headers: { cookie: "__prerender_bypass=forged-value" },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ enabled: false });
});

test("@spike timingSafeEqual from node:crypto works under nodejs_compat", async ({ request }) => {
  const secret = "0123456789abcdef0123456789abcdef";
  const compare = async (expected: string, provided: string) => {
    const response = await request.post(CONSTANT_TIME_PROBE_PATH, { data: { expected, provided } });
    expect(response.ok()).toBe(true);
    return (await response.json()) as { equal: boolean; threw: boolean };
  };

  expect(await compare(secret, secret)).toEqual({ equal: true, threw: false });

  // Equal length, different content: the case that must be constant time.
  expect(await compare(secret, `${secret.slice(0, -1)}0`)).toEqual({ equal: false, threw: false });

  // Unequal length: `timingSafeEqual` throws on its own, so a clean `false`
  // here is what proves the shared helper guards it.
  expect(await compare(secret, "short")).toEqual({ equal: false, threw: false });
  expect(await compare(secret, "")).toEqual({ equal: false, threw: false });
});
