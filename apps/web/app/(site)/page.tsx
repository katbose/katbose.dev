import { SITE_IDENTITY } from "@katbose/shared";
import { JsonLd } from "@/components/common/json-ld";
import { HOME_SECTIONS } from "@/features/home/home.config";
import { SectionRenderer } from "@/features/home/section-renderer";
import { createPageMetadata } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site-url";

export const metadata = createPageMetadata("/");

export default function HomePage() {
  return (
    <main id="content">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: SITE_IDENTITY.name,
          jobTitle: SITE_IDENTITY.role,
          email: SITE_IDENTITY.email,
          url: SITE_URL,
          image: `${SITE_URL}/profile-fallback.svg`,
          sameAs: [SITE_IDENTITY.githubUrl, SITE_IDENTITY.linkedInUrl],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE_URL }],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_IDENTITY.name,
          url: SITE_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}/ask-ai?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />
      {HOME_SECTIONS.filter((section) => section.enabled).map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </main>
  );
}
