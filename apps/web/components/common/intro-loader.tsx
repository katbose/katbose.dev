const INTRO_SESSION_SCRIPT = `(()=>{try{const root=document.documentElement;const key="katbose-intro-seen";if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&!sessionStorage.getItem(key)){sessionStorage.setItem(key,"true");root.dataset.intro="show"}}catch{}})();`;

const GREETINGS = ["Hello", "నమస్కారం", "नमस्ते", "Bonjour"] as const;

/** Runs before paint so the CSS-only intro can honor once-per-session semantics. */
export function IntroSessionScript() {
  return <script dangerouslySetInnerHTML={{ __html: INTRO_SESSION_SCRIPT }} />;
}

/**
 * The greeting sequence is CSS-driven so it never waits for React hydration.
 * Without JavaScript (or when storage is unavailable) it remains hidden and
 * the complete server-rendered page is visible immediately.
 */
export function IntroLoader() {
  return (
    <div aria-hidden="true" className="intro-loader">
      {GREETINGS.map((greeting) => (
        <span key={greeting}>{greeting}</span>
      ))}
    </div>
  );
}
