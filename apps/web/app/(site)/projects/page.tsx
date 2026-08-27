import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/projects");
export default function ProjectsPage() {
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/projects"
        eyebrow="Work"
        title="Projects"
        description="Selected systems, the constraints behind them, and what each build taught me."
      />
      <section>
        <h2>katbose.dev</h2>
        <p>
          An accessible, agent-readable portfolio built with Next.js, OpenNext, and Cloudflare
          Workers.
        </p>
        <ul>
          <li>Typed route and Home manifests</li>
          <li>Deny-by-default data boundaries</li>
          <li>Human and canonical agent views</li>
        </ul>
      </section>
    </main>
  );
}
