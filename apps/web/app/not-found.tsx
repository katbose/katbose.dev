import Link from "next/link";
export default function NotFound() {
  return (
    <main className="content-page" id="content">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The address may have changed or never existed.</p>
      <div className="action-row">
        <Link href="/">Home</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/ask-ai">Ask AI</Link>
      </div>
    </main>
  );
}
