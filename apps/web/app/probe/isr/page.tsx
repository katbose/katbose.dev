import type { Metadata } from "next";

/**
 * Incremental Static Regeneration probe — part of the committed Spike A
 * contract.
 *
 * The Spike A gate requires proof that stale-while-revalidate works against the
 * R2 incremental cache binding (`NEXT_INC_CACHE_R2_BUCKET`). That cannot be
 * asserted from a unit test: it needs a real page, a real cache entry and a real
 * revalidation window inside `workerd`.
 *
 * Unlike the two API probes this page carries no capability and exposes no data
 * beyond a generation timestamp, so it is safe to serve. It is excluded from the
 * typed public route manifest, so it never reaches the sitemap, `/llms.txt` or
 * any agent output, and it is marked `noindex` here.
 */

/** Short window so the probe can observe a full serve → stale → refresh cycle. */
export const revalidate = 2;

export const metadata: Metadata = {
  title: "ISR probe",
  robots: { index: false, follow: false },
};

export default function IsrProbePage() {
  // Captured when the page is generated, so a changed value proves the cache
  // entry was rebuilt rather than replayed.
  const generatedAt = Date.now();
  return (
    <main id="content">
      <h1>ISR probe</h1>
      <p data-probe="isr">{generatedAt}</p>
    </main>
  );
}
