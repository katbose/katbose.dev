import { SITE_IDENTITY } from "@katbose/shared";
import Link from "next/link";
import { JsonLd } from "@/components/common/json-ld";
import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site-url";
export const metadata = createPageMetadata("/resume");
export default function ResumePage() {
  return (
    <main className="content-page" id="content">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: SITE_IDENTITY.name,
          jobTitle: SITE_IDENTITY.role,
          url: `${SITE_URL}/resume`,
        }}
      />
      <PageIntro
        path="/resume"
        eyebrow="Recruiter view"
        title="Resume"
        description="A concise overview of my engineering focus, with graceful access while private downloads are being provisioned."
      />
      <section>
        <h2>Engineering focus</h2>
        <ul>
          <li>Type-safe web platforms</li>
          <li>Security and data boundaries</li>
          <li>Accessibility and performance</li>
        </ul>
        <div className="action-row">
          <Link href="/experience">View experience</Link>
          <Link href="/resume-unavailable">Download resume</Link>
        </div>
      </section>
    </main>
  );
}
