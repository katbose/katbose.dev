import { SITE_IDENTITY } from "@katbose/shared";
import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/privacy");
export default function PrivacyPage() {
  return (
    <main className="content-page prose" id="content">
      <PageIntro
        path="/privacy"
        eyebrow="Last updated 27 August 2026"
        title="Privacy"
        description="A short account of what this site collects, why, and how to request changes."
      />
      <section>
        <h2>Who</h2>
        <p>
          This site is operated by {SITE_IDENTITY.name}. Contact{" "}
          <a href={`mailto:${SITE_IDENTITY.email}`}>{SITE_IDENTITY.email}</a>.
        </p>
      </section>
      <section>
        <h2>What and why</h2>
        <p>
          Contact details are stored so I can reply. When protected features are active, short-lived
          pseudonymous technical logs help prevent abuse and understand reliability. Raw IP
          addresses are never stored.
        </p>
      </section>
      <section>
        <h2>Retention</h2>
        <p>
          Technical logs are removed after 90 days. Contact messages are kept until manually
          cleared.
        </p>
      </section>
      <section>
        <h2>Cookies and storage</h2>
        <p>
          No tracking cookies or session replay are used. A manual theme choice uses local storage.
          Necessary preview, Access, and Turnstile data may be used for security.
        </p>
      </section>
      <section>
        <h2>Processors</h2>
        <p>
          Cloudflare, Render, Supabase, Upstash, PostHog, Sentry, and Slack support hosting,
          storage, abuse prevention, analytics, monitoring, and message delivery.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          Email to request access, correction, or deletion. Material policy changes will update the
          date above.
        </p>
      </section>
    </main>
  );
}
