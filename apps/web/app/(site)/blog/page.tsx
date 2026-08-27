import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/blog");
export default function BlogPage() {
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/blog"
        eyebrow="Writing"
        title="Blog"
        description="Long-form notes on architecture, security, and building dependable software."
      />
      <section>
        <h2>Articles</h2>
        <p>Published articles will appear here when the Phase 2 content platform is active.</p>
      </section>
    </main>
  );
}
