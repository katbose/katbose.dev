import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/experience");
export default function ExperiencePage() {
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/experience"
        eyebrow="Background"
        title="Experience"
        description="The engineering responsibilities and outcomes I focus on."
      />
      <section>
        <h2>How I work</h2>
        <ul>
          <li>Turn ambiguous requirements into explicit, testable contracts.</li>
          <li>Keep security-sensitive operations on server boundaries.</li>
          <li>Build accessible interfaces with measured performance budgets.</li>
        </ul>
      </section>
    </main>
  );
}
