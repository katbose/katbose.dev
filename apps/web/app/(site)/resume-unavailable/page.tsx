import Link from "next/link";
import { PageIntro } from "@/components/common/page-intro";
import { createPageMetadata } from "@/lib/metadata";
export const metadata = createPageMetadata("/resume-unavailable");
export default function ResumeUnavailablePage() {
  return (
    <main className="content-page" id="content">
      <PageIntro
        path="/resume-unavailable"
        title="Resume download unavailable"
        description="The private download is temporarily unavailable, but you can still review my experience or contact me."
      />
      <div className="action-row">
        <Link href="/resume">View resume online</Link>
        <Link href="/contact">Contact me</Link>
      </div>
    </main>
  );
}
