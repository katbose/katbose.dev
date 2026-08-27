import { SITE_IDENTITY } from "@katbose/shared";
import { PageIntro } from "@/components/common/page-intro";
import { ContactForm } from "@/features/contact/contact-form";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/contact");
export default function ContactPage() {
  const fallbackEmail = process.env["CONTACT_FALLBACK_EMAIL"] ?? SITE_IDENTITY.email;
  const calLink = process.env["NEXT_PUBLIC_CAL_LINK"] ?? SITE_IDENTITY.calUrl;
  const turnstileSiteKey = process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] ?? "";
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/contact"
        eyebrow="Start a conversation"
        title="Contact"
        description="Send a written message or book a focused call."
      />
      <section>
        <h2>Message</h2>
        <ContactForm fallbackEmail={fallbackEmail} turnstileSiteKey={turnstileSiteKey} />
      </section>
      <section>
        <h2>Other ways to connect</h2>
        <div className="action-row">
          <a href={`mailto:${fallbackEmail}`}>Email directly</a>
          <a href={calLink}>Book a call</a>
        </div>
      </section>
    </main>
  );
}
