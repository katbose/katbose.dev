"use client";
export default function ErrorPage({
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="content-page" id="content">
      <h1>Something went wrong</h1>
      <p>The page could not be completed. Your other routes remain available.</p>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
