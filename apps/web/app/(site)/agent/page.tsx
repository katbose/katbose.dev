import { JsonLd } from "@/components/common/json-ld";
import { generateAgentMarkdown } from "@/lib/agent-outputs";
import { createPageMetadata } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site-url";

export const metadata = createPageMetadata("/agent");

export default function AgentPage() {
  const markdown = generateAgentMarkdown();
  return (
    <main className="agent-view" id="content">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            {
              "@type": "ListItem",
              position: 2,
              name: "Agent view",
              item: `${SITE_URL}/agent`,
            },
          ],
        }}
      />
      <h1 className="visually-hidden">Agent view</h1>
      <pre>{markdown}</pre>
    </main>
  );
}
