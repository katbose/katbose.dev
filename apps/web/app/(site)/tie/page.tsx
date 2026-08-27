import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/tie");
export default function TiePage() {
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/tie"
        eyebrow="Things I Explore"
        title="TIE"
        description="Short engineering notes, experiments, and useful details worth remembering."
      />
      <section>
        <h2>Notes</h2>
        <p>Notes will appear here when the Phase 2 content platform is active.</p>
      </section>
    </main>
  );
}
