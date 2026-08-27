import Link from "next/link";
import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/ask-ai");
export default function AskAiPage() {
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/ask-ai"
        eyebrow="Portfolio search"
        title="Ask AI"
        description="Ask about my public work and receive answers grounded in cited portfolio sources."
      />
      <section>
        <h2>Ask a question</h2>
        <label>
          Question
          <input disabled name="question" placeholder="What has Kat built with Cloudflare?" />
        </label>
        <p role="status">
          Ask AI is visible but not active until the Phase 3 search binding is validated.
        </p>
        <p>
          Meanwhile, browse <Link href="/projects">projects</Link>,{" "}
          <Link href="/blog">writing</Link>, or <Link href="/experience">experience</Link>.
        </p>
        <p>
          AI-generated answers may be imperfect. Check cited sources. Queries are logged when the
          service is active.
        </p>
      </section>
    </main>
  );
}
